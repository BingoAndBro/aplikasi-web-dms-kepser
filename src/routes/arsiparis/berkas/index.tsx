import { createFileRoute, Link } from '@tanstack/react-router'
import {
  AlertCircle,
  ChevronRight,
  FolderOpen,
  Loader2,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  formatBerkasArchiveStatusLabel,
  formatBerkasStatusLabel,
  formatKlasifikasiLabel,
  formatNominalRupiah,
  formatNullableDateLabel,
} from '#/lib/archive/berkas-arsip-page-format'
import { ApiError, apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/arsiparis/berkas/')({ component: BerkasArsipAktifPage })

type BerkasFolder = {
  berkas_id: string
  klasifikasi_id: string
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string
  status_berkas: string
  status_arsip: string | null
  nomor_spm: string | null
  retensi_aktif: string | null
  retensi_inaktif: string | null
  masa_aktif_berakhir: string | null
  masa_inaktif_berakhir: string | null
  closed_at: string | null
  item_count: number
  workflow_item_count: number
  manual_item_count: number
  total_nominal_realisasi: number | null
  created_at: string | null
  updated_at: string | null
}

type BerkasFolderListResponse = {
  berkas?: BerkasFolder[]
  summary?: {
    total_rows_returned: number
    item_count_total: number
    workflow_item_count_total: number
    manual_item_count_total: number
    total_nominal_realisasi: number | null
  }
  error?: string
}

function BerkasArsipAktifPage() {
  const [openFolders, setOpenFolders] = useState<BerkasFolder[]>([])
  const [activeFolders, setActiveFolders] = useState<BerkasFolder[]>([])
  const [openSummary, setOpenSummary] = useState<BerkasFolderListResponse['summary'] | null>(null)
  const [activeSummary, setActiveSummary] = useState<BerkasFolderListResponse['summary'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const [openJson, activeJson] = await Promise.all([
        apiFetch<BerkasFolderListResponse>('/arsiparis/berkas', {
          query: {
            status_berkas: 'OPEN',
            status_arsip: 'null',
          },
        }),
        apiFetch<BerkasFolderListResponse>('/arsiparis/berkas', {
          query: {
            status_berkas: 'CLOSED',
            status_arsip: 'AKTIF',
          },
        }),
      ])
      setOpenFolders(openJson.berkas ?? [])
      setActiveFolders(activeJson.berkas ?? [])
      setOpenSummary(openJson.summary ?? null)
      setActiveSummary(activeJson.summary ?? null)
    } catch (error) {
      setError(resolveErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-outline">
              <Link to="/arsiparis" className="hover:text-primary">Kepala Sub Bagian Umum</Link>
              <ChevronRight size={10} />
              <span className="text-primary">Pemberkasan Arsip Aktif</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Pemberkasan Arsip Aktif</h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              Daftar berkas terbuka untuk pemberkasan berjalan dan berkas aktif yang sudah final.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
            Read-only dari model berkas. Aksi tutup berkas dan lifecycle tidak tersedia di fase ini.
          </div>
        </div>

        {(openSummary || activeSummary) && (
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryCard label="Berkas Terbuka" value={openSummary?.total_rows_returned ?? 0} />
            <SummaryCard label="Berkas Aktif" value={activeSummary?.total_rows_returned ?? 0} />
            <SummaryCard
              label="Dokumen Berjalan"
              value={openSummary?.item_count_total ?? 0}
            />
            <SummaryCard
              label="Dokumen Final Aktif"
              value={activeSummary?.item_count_total ?? 0}
            />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-error/20 bg-error/5 py-20">
            <AlertCircle size={32} className="text-error" />
            <p className="text-sm text-on-surface-variant">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>
          </div>
        ) : (
          <div className="space-y-6">
            <BerkasSection
              title="Berkas Terbuka"
              description="Pemberkasan berjalan untuk Jenis Pembayaran yang masih dapat menerima dokumen."
              emptyTitle="Belum ada berkas terbuka"
              emptyDescription="Berkas terbuka akan muncul setelah dokumen workflow atau manual pertama memilih Jenis Pembayaran yang belum final."
              folders={openFolders}
              mode="open"
            />
            <BerkasSection
              title="Pemberkasan Arsip Aktif"
              description="Berkas yang sudah ditutup dan memiliki status arsip Aktif."
              emptyTitle="Belum ada berkas arsip aktif"
              emptyDescription="Berkas yang sudah ditutup dengan status arsip Aktif akan muncul di sini."
              folders={activeFolders}
              mode="active"
            />
          </div>
        )}
      </div>
    </PageLayout>
  )
}

function BerkasSection({
  title,
  description,
  emptyTitle,
  emptyDescription,
  folders,
  mode,
}: {
  title: string
  description: string
  emptyTitle: string
  emptyDescription: string
  folders: BerkasFolder[]
  mode: 'open' | 'active'
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-headline text-lg font-extrabold text-on-surface">{title}</h3>
        <p className="text-xs text-on-surface-variant">{description}</p>
      </div>

      {folders.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 py-12">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/10">
            <FolderOpen size={24} className="text-emerald-600" />
          </div>
          <p className="font-headline text-lg font-bold text-on-surface">{emptyTitle}</p>
          <p className="max-w-md text-center text-xs text-on-surface-variant">{emptyDescription}</p>
        </div>
      ) : (
        <BerkasTable folders={folders} mode={mode} />
      )}
    </section>
  )
}

function BerkasTable({ folders, mode }: { folders: BerkasFolder[]; mode: 'open' | 'active' }) {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-container-low/30 text-left">
              <th className="w-10 px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">No</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-outline">Jenis Pembayaran</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-outline">Status Berkas</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-outline">Status Arsip</th>
              {mode === 'active' && (
                <th className="px-4 py-3 font-semibold uppercase tracking-wider text-outline">Nomor SPM</th>
              )}
              <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">Jumlah Dokumen</th>
              <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">Dokumen Workflow</th>
              <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">Dokumen Manual</th>
              <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-outline">Total Nominal</th>
              <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">
                {mode === 'open' ? 'Terakhir Diperbarui' : 'Tanggal Ditutup'}
              </th>
              <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {folders.map((folder, index) => (
              <tr key={folder.berkas_id} className="border-t border-outline-variant/20 transition-colors hover:bg-primary/5">
                <td className="px-4 py-3 text-center text-outline">{index + 1}</td>
                <td className="px-4 py-3 text-on-surface">
                  <p className="font-semibold">
                    {formatKlasifikasiLabel(folder.klasifikasi_kode_snapshot, folder.klasifikasi_nama_snapshot)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <StatusBerkasBadge status={folder.status_berkas} />
                </td>
                <td className="px-4 py-3">
                  <StatusArsipBadge statusArsip={folder.status_arsip} statusBerkas={folder.status_berkas} />
                </td>
                {mode === 'active' && (
                  <td className="px-4 py-3 font-semibold text-on-surface">{folder.nomor_spm ?? '-'}</td>
                )}
                <td className="px-4 py-3 text-center text-on-surface">{folder.item_count}</td>
                <td className="px-4 py-3 text-center text-on-surface">{folder.workflow_item_count}</td>
                <td className="px-4 py-3 text-center text-on-surface">{folder.manual_item_count}</td>
                <td className="px-4 py-3 text-right text-on-surface">{formatNominalRupiah(folder.total_nominal_realisasi)}</td>
                <td className="px-4 py-3 text-center text-on-surface-variant">
                  {formatNullableDateLabel(mode === 'open' ? folder.updated_at : folder.closed_at)}
                </td>
                <td className="px-4 py-3 text-center">
                  <Link
                    to="/arsiparis/berkas/$id"
                    params={{ id: folder.berkas_id }}
                    className="inline-flex h-7 items-center rounded-lg border border-outline-variant/40 px-2.5 text-[11px] font-semibold text-primary hover:bg-primary/5"
                  >
                    Detail
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-widest text-outline">{label}</p>
      <p className="mt-2 font-headline text-2xl font-extrabold text-on-surface">{value}</p>
    </div>
  )
}

function StatusBerkasBadge({ status }: { status: string }) {
  const className = status === 'CLOSED'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : status === 'OPEN'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : 'border-slate-200 bg-slate-50 text-slate-700'

  return <Badge className={className}>{formatBerkasStatusLabel(status)}</Badge>
}

function StatusArsipBadge({ statusArsip, statusBerkas }: { statusArsip: string | null; statusBerkas: string }) {
  const className = statusArsip === 'AKTIF'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : statusArsip === 'INAKTIF'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : statusArsip === 'USUL_MUSNAH'
        ? 'border-orange-200 bg-orange-50 text-orange-700'
        : statusArsip === 'DIMUSNAHKAN'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-slate-200 bg-slate-50 text-slate-700'

  return <Badge className={className}>{formatBerkasArchiveStatusLabel(statusArsip, statusBerkas)}</Badge>
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const payload = error.payload
    if (payload && typeof payload === 'object' && 'error' in payload) {
      const message = payload.error
      if (typeof message === 'string') return message
    }
    return 'Gagal mengambil data'
  }

  return 'Terjadi kesalahan'
}
