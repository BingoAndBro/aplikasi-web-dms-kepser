import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { PageLayout } from '#/components/dashboard/PageLayout'
import {
  PegawaiPagination,
  PegawaiPanel,
} from '#/components/pegawai/PegawaiPagePrimitives'
import {
  WorkflowSearchPanel,
  WorkflowStatusSelect,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import {
  Plus,
  FileText,
  ChevronRight,
  Clock3,
} from 'lucide-react'
import type { DokumenRow } from '#/lib/dokumen-helpers'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/pegawai/dokumen/')({
  validateSearch: z.object({
    status: z.string().optional(),
  }),
  component: DokumenSayaPage,
})

const PAGE_SIZE = 10
const TABLE_HEAD_CLASS = 'px-6 py-4 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500'
const WORKFLOW_SEARCH_PLACEHOLDER = 'Cari judul, fungsi, atau kegiatan...'
const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Semua Status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'IN_PPK_VALIDATION', label: 'Validasi PPK' },
  { value: 'IN_BENDAHARA_APPROVAL', label: 'Menunggu Persetujuan' },
  { value: 'NEED_REVISION', label: 'Perlu Revisi' },
  { value: 'COMPLETED', label: 'Selesai' },
  { value: 'TERSIMPAN', label: 'Tersimpan' },
  { value: 'ARCHIVED', label: 'Diarsipkan' },
]

type AuthSessionResponse = {
  session: { userId: string; email: string; userName?: string | null } | null
  roles: string[]
  activeRole: string | null
}

function DokumenSayaPage() {
  const navigate = useNavigate()
  const { status: statusParam } = Route.useSearch()
  const [items, setItems] = useState<DokumenRow[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(statusParam ?? '')
  const [page, setPage] = useState(0)

  useEffect(() => { fetchData() }, [])
  useEffect(() => { setStatusFilter(statusParam ?? '') }, [statusParam])

  async function fetchData() {
    setLoading(true)
    setFetchError(null)
    try {
      const auth = await apiFetch<AuthSessionResponse>('/auth/session')
      if (!auth.session) {
        setFetchError('Sesi tidak ditemukan. Silakan login ulang.')
        setLoading(false)
        return
      }

      const json = await apiFetch<{ dokumen?: DokumenRow[]; error?: string }>('/dokumen')
      if (json.error) {
        setFetchError(json.error)
        setLoading(false)
        return
      }
      setItems(json.dokumen ?? [])
    } catch (err) {
      if (err instanceof ApiError) {
        setFetchError(`Gagal mengambil data (HTTP ${err.status})`)
        return
      }

      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat mengambil data'
      setFetchError(msg)
    } finally {
      setLoading(false)
    }
  }

  const filtered = items.filter(d => {
    const query = search.toLowerCase()
    const matchSearch = !query
      || d.judul.toLowerCase().includes(query)
      || (d.fungsi_nama ?? '').toLowerCase().includes(query)
      || (d.kegiatan_nama ?? '').toLowerCase().includes(query)
    const matchStatus = !statusFilter || d.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function openDocument(dok: DokumenRow) {
    if (dok.status === 'NEED_REVISION' && dok.revision_target === 'USER') {
      navigate({ to: '/pegawai/dokumen/$id/revisi', params: { id: dok.id } })
      return
    }

    navigate({ to: '/pegawai/dokumen/$id', params: { id: dok.id } })
  }

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-7 px-7 pt-6 sm:px-8 lg:px-10">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-5">
            <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-orange-100 bg-[#FFF6EA] text-orange-600 shadow-[0_2px_8px_rgba(251,146,60,0.14)]">
              <FileText size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[30px]">
                Dokumen Diajukan
              </h1>
              <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-zinc-700">
                Pantau status dan progres persetujuan dokumen tiket Anda yang sedang berjalan.
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <Link to="/pegawai/dokumen/aju">
              <Button size="sm" className="gap-1.5 rounded-xl shadow-sm">
                <Plus size={14} />
                Ajukan Dokumen Baru
              </Button>
            </Link>
          </div>
        </section>

        <WorkflowSearchPanel
          search={search}
          onSearchChange={(value) => { setSearch(value); setPage(0) }}
          placeholder={WORKFLOW_SEARCH_PLACEHOLDER}
          resultLabel={`Total ${filtered.length} Dokumen`}
        >
          <WorkflowStatusSelect
            value={statusFilter}
            onChange={(value) => { setStatusFilter(value); setPage(0) }}
            options={STATUS_FILTER_OPTIONS}
          />
        </WorkflowSearchPanel>

        {loading ? (
          <LoadingState variant="list" rows={5} label="Memuat dokumen pegawai" />
        ) : fetchError ? (
          <ErrorState
            title="Gagal memuat dokumen"
            description={fetchError}
            variant="page"
            action={<Button variant="outline" size="sm" onClick={() => fetchData()}>Coba Lagi</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search || statusFilter ? 'Tidak ada dokumen yang cocok' : 'Belum ada dokumen'}
            description={search || statusFilter
              ? 'Ubah kata kunci atau status untuk melihat dokumen lain.'
              : 'Ajukan dokumen pertama Anda untuk memulai alur kerja.'}
            icon={<FileText size={20} />}
            action={!search && !statusFilter && (
              <Link to="/pegawai/dokumen/aju">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Plus size={14} />
                  Ajukan Dokumen Baru
                </Button>
              </Link>
            )}
          />
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-[#FFFDF9] shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block">
              <Table className="text-left">
                <TableHeader>
                  <TableRow className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
                    <TableHead className={`w-16 text-center ${TABLE_HEAD_CLASS}`}>No</TableHead>
                    <TableHead className={TABLE_HEAD_CLASS}>Judul Dokumen</TableHead>
                    <TableHead className={TABLE_HEAD_CLASS}>Kegiatan</TableHead>
                    <TableHead className={TABLE_HEAD_CLASS}>Status</TableHead>
                    <TableHead className={TABLE_HEAD_CLASS}>Tanggal Ajuan</TableHead>
                    <TableHead className={`w-20 text-right ${TABLE_HEAD_CLASS}`}>Aksi</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-zinc-100 text-[13px]">
                  {paginated.map((dok, i) => (
                    <TableRow
                      key={dok.id}
                      className="group cursor-pointer border-zinc-100 bg-[#FFFDF9] transition-colors hover:bg-[#FFF8F1]/70"
                      onClick={() => openDocument(dok)}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openDocument(dok)
                        }
                      }}
                      aria-label={`Buka dokumen ${dok.judul}`}
                    >
                      <TableCell className="px-6 py-5 text-center text-sm font-normal text-zinc-950">
                        {page * PAGE_SIZE + i + 1}
                      </TableCell>
                      <TableCell className="max-w-[420px] px-6 py-5">
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-[#FF4D00]">
                            {dok.judul}
                          </p>
                          <p className="mt-1 line-clamp-1 text-xs font-medium text-zinc-500">{dok.fungsi_nama ?? '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[260px] px-6 py-5">
                        <span className="block truncate text-sm font-normal text-zinc-900">{dok.kegiatan_nama ?? '-'}</span>
                      </TableCell>
                      <TableCell className="px-6 py-5">
                        <PegawaiDocumentStatusBadge dok={dok} />
                      </TableCell>
                      <TableCell className="px-6 py-5">
                        <DateCell value={dok.tanggal} />
                      </TableCell>
                      <TableCell className="px-6 py-5 text-right">
                        <Button
                          size="icon-lg"
                          variant="ghost"
                          className="size-10 rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-600 opacity-100 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] group-hover:border-orange-200 group-hover:bg-orange-50 group-hover:text-orange-600 group-hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] [&_svg]:!size-5"
                          aria-label={`Buka dokumen ${dok.judul}`}
                        >
                          <ChevronRight strokeWidth={2.35} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 md:hidden">
              {paginated.map((dok, i) => {
                return (
                  <PegawaiPanel
                    key={dok.id}
                    className="group space-y-3 border-zinc-200/80 p-4 shadow-[0_2px_10px_rgba(15,23,42,0.06)] transition hover:border-orange-100 hover:bg-[#FFFDF9]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700/70">
                          Dokumen #{page * PAGE_SIZE + i + 1}
                        </p>
                        <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-950 transition-colors group-hover:text-[#FF4D00]">{dok.judul}</h2>
                      </div>
                      <PegawaiDocumentStatusBadge dok={dok} className="shrink-0" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
                      <div className="rounded-xl border border-zinc-200/80 bg-[#FFFDF9] p-2.5">
                        <p className="font-semibold text-zinc-500">Fungsi</p>
                        <p className="mt-0.5 text-zinc-900">{dok.fungsi_nama ?? '-'}</p>
                      </div>
                      <div className="rounded-xl border border-zinc-200/80 bg-[#FFFDF9] p-2.5">
                        <p className="font-semibold text-zinc-500">Tanggal</p>
                        <DateCell value={dok.tanggal} className="mt-1" />
                      </div>
                      <div className="col-span-2 rounded-xl border border-zinc-200/80 bg-[#FFFDF9] p-2.5">
                        <p className="font-semibold text-zinc-500">Kegiatan</p>
                        <p className="mt-0.5 text-zinc-900">{dok.kegiatan_nama ?? '-'}</p>
                      </div>
                    </div>
                    <div className="space-y-3 border-t border-zinc-100 pt-3">
                      <DocumentActionLink dok={dok} mobile />
                    </div>
                  </PegawaiPanel>
                )
              })}
            </div>

            <PegawaiPagination
              page={page}
              totalPages={totalPages}
              onPrevious={() => setPage(p => Math.max(0, p - 1))}
              onNext={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            />
          </>
        )}
      </div>
    </PageLayout>
  )
}

function DateCell({ value, className }: { value: string; className?: string }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-2 text-sm font-semibold text-zinc-500',
        className ?? '',
      ].join(' ')}
    >
      <Clock3 size={16} strokeWidth={1.8} className="shrink-0 text-zinc-500" aria-hidden="true" />
      {formatDate(value)}
    </span>
  )
}

function getPegawaiStatusPresentation(dok: DokumenRow) {
  if (dok.status === 'NEED_REVISION' && dok.revision_target === 'USER') {
    return {
      label: 'Perlu Revisi',
      className: 'border-rose-200/70 bg-rose-50/80 text-rose-700',
    }
  }

  if (dok.status === 'NEED_REVISION' && dok.revision_target === 'PPK') {
    return {
      label: 'Dikembalikan ke PPK',
      className: 'border-orange-200/80 bg-orange-50/80 text-orange-700',
    }
  }

  const statusMap: Record<string, { label: string; className: string }> = {
    DRAFT: { label: 'Draft', className: 'border-zinc-200 bg-zinc-50 text-zinc-600' },
    IN_PPK_VALIDATION: { label: 'Validasi PPK', className: 'border-amber-200/80 bg-amber-50/80 text-amber-700' },
    IN_BENDAHARA_APPROVAL: { label: 'Menunggu Persetujuan', className: 'border-sky-200/80 bg-sky-50/80 text-sky-700' },
    COMPLETED: { label: 'Selesai', className: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700' },
    TERSIMPAN: { label: 'Tersimpan', className: 'border-zinc-200 bg-zinc-50 text-zinc-600' },
    ARCHIVED: { label: 'Diarsipkan', className: 'border-zinc-200 bg-zinc-50 text-zinc-600' },
  }

  return statusMap[dok.status] ?? {
    label: dok.status || 'Status Tidak Diketahui',
    className: 'border-zinc-200 bg-zinc-50 text-zinc-600',
  }
}

function PegawaiDocumentStatusBadge({
  dok,
  className,
}: {
  dok: DokumenRow
  className?: string
}) {
  const presentation = getPegawaiStatusPresentation(dok)

  return (
    <span
      className={[
        'inline-flex w-fit items-center rounded-md border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-nowrap',
        presentation.className,
        className ?? '',
      ].join(' ')}
    >
      {presentation.label}
    </span>
  )
}

function DocumentActionLink({ dok, mobile = false }: { dok: DokumenRow; mobile?: boolean }) {
  const isRevision = dok.status === 'NEED_REVISION' && dok.revision_target === 'USER'
  return (
    <Link
      to={isRevision ? '/pegawai/dokumen/$id/revisi' : '/pegawai/dokumen/$id'}
      params={{ id: dok.id }}
      className={mobile ? 'block w-full' : undefined}
    >
      <Button
        size={mobile ? 'sm' : 'icon-xs'}
        variant={mobile && isRevision ? 'default' : mobile ? 'outline' : 'ghost'}
        className={mobile ? 'w-full gap-1.5' : undefined}
        aria-label={isRevision ? `Revisi dokumen ${dok.judul}` : `Lihat detail dokumen ${dok.judul}`}
      >
        <ChevronRight size={14} />
        {mobile ? 'Buka Dokumen' : null}
      </Button>
    </Link>
  )
}
