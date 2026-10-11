import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { Clock3, Download, FileText, Link2, Search, Unlink } from 'lucide-react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { StreamedAttachmentViewer } from '#/components/dokumen/StreamedAttachmentViewer'
import { DIALOG_PRIMARY_BUTTON_CLASS } from '#/components/laporan/actionButtonStyles'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { ApiError, apiFetch } from '#/lib/api-client'
import { ROUTES } from '#/lib/constants/routes'
import { laporanStatusLabel } from '#/lib/laporan/status-laporan'
import {
  TAUTAN_AKSES_LABEL,
  TAUTAN_LOGIN_REQUIRED_CODE,
  TAUTAN_SUMBER_LABEL,
  buildLoginHref,
  buildTautanDokumenFileUrl,
  buildTautanExportZipEndpoint,
  buildTautanManualFileUrl,
  type TautanDetailResponse,
  type TautanDokumenItem,
} from '#/lib/laporan/tautan-shared'
import { formatDate, formatDateTime } from '#/lib/utils/format'

// Halaman pembuka Tautan Laporan (lihat src/lib/laporan/tautan.ts). Tidak
// terikat role: siapa pun yang login boleh membuka, isinya snapshot dokumen
// yang dibagikan pembuat tautan. Bila belum login, AppLayout mengarahkan ke
// /login?next=/tautan/... lalu kembali ke sini setelah login.
export const Route = createFileRoute('/tautan/$token')({
  component: TautanLaporanPage,
})

type LoadError = { status: number; message: string }

function isLoginRequired(payload: unknown): boolean {
  return typeof payload === 'object'
    && payload !== null
    && 'code' in payload
    && payload.code === TAUTAN_LOGIN_REQUIRED_CODE
}

function TautanLaporanPage() {
  const { token } = Route.useParams()
  const [detail, setDetail] = useState<TautanDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<LoadError | null>(null)
  const [redirectingToLogin, setRedirectingToLogin] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)

    apiFetch<TautanDetailResponse>(`/tautan/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(setDetail)
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (error instanceof ApiError) {
          // Tautan terbatas dibuka tanpa login: ke halaman login, lalu kembali ke sini.
          if (error.status === 401 && isLoginRequired(error.payload)) {
            setRedirectingToLogin(true)
            window.location.href = buildLoginHref(ROUTES.LOGIN, window.location.pathname)
            return
          }
          setLoadError({ status: error.status, message: error.message })
          return
        }
        setLoadError({ status: 500, message: 'Gagal memuat isi tautan. Coba muat ulang halaman.' })
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [token])

  const filtered = useMemo(() => {
    if (!detail) return []
    const query = search.trim().toLowerCase()
    if (!query) return detail.dokumen
    return detail.dokumen.filter(dok => [
      dok.judul,
      dok.kegiatan_nama ?? '',
      dok.fungsi_nama ?? '',
      dok.pengaju_nama ?? '',
      ...dok.lampiran.map(lampiran => lampiran.nama),
    ].some(value => value.toLowerCase().includes(query)))
  }, [detail, search])

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[1100px] space-y-6 px-4 pt-6 sm:px-8 lg:px-10">
        {(loading || redirectingToLogin) && (
          <LoadingState
            variant="list"
            rows={4}
            label={redirectingToLogin ? 'Mengalihkan ke login' : 'Memuat isi tautan'}
          />
        )}

        {!loading && loadError && (
          loadError.status === 404 || loadError.status === 410 ? (
            <EmptyState
              icon={<Unlink size={20} />}
              title={loadError.status === 410 ? 'Tautan sudah dicabut' : 'Tautan tidak ditemukan'}
              description={loadError.message}
            />
          ) : (
            <ErrorState title="Gagal memuat tautan" description={loadError.message} variant="page" />
          )
        )}

        {!loading && !loadError && detail && (
          <>
            <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brand-border bg-brand-surface text-brand-solid">
                  <Link2 size={22} />
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-semibold text-zinc-600">
                    Tautan {TAUTAN_SUMBER_LABEL[detail.sumber]} · {TAUTAN_AKSES_LABEL[detail.akses]}
                  </p>
                  <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[28px]">
                    {detail.judul}
                  </h1>
                  <p className="mt-1 text-sm font-medium text-zinc-700">
                    Dibagikan oleh {detail.dibuat_oleh} · {formatDateTime(detail.created_at)}
                  </p>
                  {detail.keterangan && (
                    <p className="mt-2 max-w-2xl rounded-xl border border-brand-border bg-bg-surface px-3 py-2 text-xs font-semibold text-zinc-700">
                      {detail.keterangan}
                    </p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                className={`shrink-0 ${DIALOG_PRIMARY_BUTTON_CLASS}`}
                disabled={detail.dokumen.length === 0}
                onClick={() => window.location.assign(buildTautanExportZipEndpoint(token))}
              >
                <Download size={15} />
                Unduh Semua (ZIP)
              </Button>
            </section>

            {detail.jumlah_tidak_tersedia > 0 && (
              <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                {detail.jumlah_tidak_tersedia} dokumen dalam tautan ini sudah tidak tersedia di aplikasi.
              </div>
            )}

            {detail.dokumen.length === 0 ? (
              <EmptyState
                icon={<FileText size={20} />}
                title="Tidak ada dokumen"
                description="Dokumen dalam tautan ini sudah tidak tersedia."
              />
            ) : (
              <>
                <div className="flex flex-col gap-3 rounded-[22px] border border-zinc-200/80 bg-bg-surface p-4 shadow-[0_3px_14px_rgba(15,23,42,0.07)] sm:flex-row sm:items-center sm:justify-between">
                  <label className="relative min-w-0 flex-1 sm:max-w-md">
                    <span className="sr-only">Cari dokumen dalam tautan</span>
                    <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                    <input
                      type="search"
                      placeholder="Cari judul, kegiatan, atau lampiran..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="h-11 w-full rounded-[20px] border border-zinc-200 bg-bg-surface pl-11 pr-4 text-sm font-medium text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-brand-border-strong focus:ring-4 focus:ring-brand-border/60"
                    />
                  </label>
                  <span className="text-sm font-bold text-zinc-950">
                    {filtered.length} dari {detail.dokumen.length} dokumen
                  </span>
                </div>

                {filtered.length === 0 ? (
                  <EmptyState
                    icon={<Search size={20} />}
                    title="Tidak ada dokumen yang cocok"
                    description="Ubah kata kunci untuk melihat dokumen lain dalam tautan ini."
                    compact
                  />
                ) : (
                  <div className="space-y-4">
                    {filtered.map(dok => (
                      <TautanDokumenCard key={`${dok.sumber}:${dok.id}`} token={token} dokumen={dok} />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </PageLayout>
  )
}

function TautanDokumenCard({ token, dokumen }: { token: string; dokumen: TautanDokumenItem }) {
  const isManual = dokumen.sumber === 'MANUAL'
  const meta = [dokumen.kegiatan_nama, dokumen.fungsi_nama, dokumen.pengaju_nama].filter(Boolean).join(' · ')

  return (
    <article className="space-y-3 rounded-[22px] border border-zinc-200/80 bg-bg-surface p-4 shadow-[0_2px_10px_rgba(15,23,42,0.06)] sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-zinc-950">{dokumen.judul}</h2>
          {meta && <p className="mt-1 text-xs font-medium text-zinc-500">{meta}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-zinc-600">
            {isManual ? 'Dokumen Tambahan KSBU' : laporanStatusLabel(dokumen.status ?? '')}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
            <Clock3 size={14} aria-hidden="true" />
            {dokumen.tanggal ? formatDate(dokumen.tanggal) : '-'}
          </span>
        </div>
      </div>

      <StreamedAttachmentViewer
        unavailableMessage={dokumen.lampiran_tidak_tersedia}
        items={dokumen.lampiran.map(lampiran => ({
          key: lampiran.ref,
          nama: lampiran.nama,
          meta: lampiran.is_pdf ? 'PDF' : 'File',
          isPdf: lampiran.is_pdf,
          previewUrl: isManual
            ? buildTautanManualFileUrl(token, dokumen.id, lampiran.ref, 'preview')
            : buildTautanDokumenFileUrl(token, dokumen.id, Number(lampiran.ref), 'preview'),
          downloadUrl: isManual
            ? buildTautanManualFileUrl(token, dokumen.id, lampiran.ref, 'download')
            : buildTautanDokumenFileUrl(token, dokumen.id, Number(lampiran.ref), 'download'),
          fallbackFilename: lampiran.nama || 'lampiran',
          linkHref: lampiran.link_path,
        }))}
      />
    </article>
  )
}
