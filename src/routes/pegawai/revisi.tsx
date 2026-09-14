import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import {
  PegawaiPagination,
  PegawaiPanel,
} from '#/components/pegawai/PegawaiPagePrimitives'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import {
  DocumentListStatusBadge,
  WorkflowActionButton,
  WorkflowDateCell,
  WorkflowSearchPanel,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import {
  FileText,
  ChevronRight,
} from 'lucide-react'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiFetch } from '#/lib/api-client'

type Item = {
  id: string
  judul: string
  fungsi_nama: string
  kegiatan_nama: string
  status: string
  current_step: string | null
  revision_target: string | null
  tahun: number
  tanggal: string
  created_at: string
  updated_at: string
  revision_notes: string | null
}

export const Route = createFileRoute('/pegawai/revisi')({
  preload: false,
  component: PegawaiRevisiPage,
})

const PAGE_SIZE = 10
const TABLE_HEAD_CLASS = 'px-6 py-4 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500'
const WORKFLOW_SEARCH_PLACEHOLDER = 'Cari judul, fungsi, kegiatan, atau catatan...'

function PegawaiRevisiPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    apiFetch<{ dokumen?: Item[] }>('/pegawai/revisi')
      .then(d => { setItems(d.dokumen ?? []); setLoading(false) })
      .catch((err) => {
        if (err instanceof ApiError) {
          const payload = err.payload
          setItems(payload && typeof payload === 'object' && 'dokumen' in payload
            ? (payload as { dokumen?: Item[] }).dokumen ?? []
            : [])
          setLoading(false)
          return
        }

        setError('Gagal memuat data')
        setLoading(false)
      })
  }, [])

  const filtered = items.filter(d => {
    const query = search.toLowerCase()
    return !query
      || d.judul.toLowerCase().includes(query)
      || (d.fungsi_nama ?? '').toLowerCase().includes(query)
      || (d.kegiatan_nama ?? '').toLowerCase().includes(query)
      || (d.revision_notes ?? '').toLowerCase().includes(query)
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function openRevision(dok: Item) {
    navigate({ to: '/pegawai/dokumen/$id/revisi', params: { id: dok.id } })
  }

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-7 px-7 pt-6 sm:px-8 lg:px-10">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-5">
            <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-orange-100 bg-bg-surface text-orange-600 shadow-[0_2px_8px_rgba(251,146,60,0.14)]">
              <FileText size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[30px]">
                Revisi Dokumen
              </h1>
              <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-zinc-700">
                Tinjau catatan revisi, perbarui dokumen yang diminta, lalu ajukan ulang.
              </p>
            </div>
          </div>
        </section>

        <WorkflowSearchPanel
          search={search}
          onSearchChange={(value) => { setSearch(value); setPage(0) }}
          placeholder={WORKFLOW_SEARCH_PLACEHOLDER}
          resultLabel={`Total ${filtered.length} Dokumen`}
        />

        {loading ? (
          <LoadingState variant="list" rows={4} label="Memuat revisi dokumen" />
        ) : error ? (
          <ErrorState title="Gagal memuat revisi" description={error} variant="page" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? 'Tidak ada revisi yang cocok' : 'Tidak ada dokumen revisi'}
            description={search
              ? 'Ubah kata kunci pencarian untuk melihat revisi lain.'
              : 'Dokumen yang dikembalikan oleh PPK atau PPSPM akan muncul di halaman ini.'}
            icon={<FileText size={20} />}
          />
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-bg-surface shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block">
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
                        className="group cursor-pointer border-zinc-100 bg-bg-surface transition-colors hover:bg-brand-surface/70"
                        onClick={() => openRevision(dok)}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openRevision(dok)
                          }
                        }}
                        aria-label={`Buka dokumen revisi ${dok.judul}`}
                      >
                        <TableCell className="px-6 py-5 text-center text-sm font-normal text-zinc-950">
                          {page * PAGE_SIZE + i + 1}
                        </TableCell>
                        <TableCell className="max-w-[420px] px-6 py-5">
                          <div>
                            <p className="line-clamp-1 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-brand-text">{dok.judul}</p>
                            <p className="mt-1 line-clamp-1 text-xs font-medium text-zinc-500">{dok.fungsi_nama ?? '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[260px] px-6 py-5">
                          <span className="block truncate text-sm font-normal text-zinc-900">{dok.kegiatan_nama ?? '-'}</span>
                        </TableCell>
                        <TableCell className="px-6 py-5">
                          <DocumentListStatusBadge status={dok.status} />
                        </TableCell>
                        <TableCell className="px-6 py-5">
                          <WorkflowDateCell value={formatDate(dok.tanggal)} />
                        </TableCell>
                        <TableCell className="px-6 py-5 text-right">
                          <WorkflowActionButton label={`Buka dokumen revisi ${dok.judul}`} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
            </div>

            <div className="space-y-3 md:hidden">
              {paginated.map((dok, i) => (
                <PegawaiPanel key={dok.id} className="group space-y-3 border-zinc-200/80 p-4 shadow-[0_2px_10px_rgba(15,23,42,0.06)] transition hover:border-orange-100 hover:bg-bg-surface">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700/70">
                        Revisi #{page * PAGE_SIZE + i + 1}
                      </p>
                      <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-950 transition-colors group-hover:text-brand-text">{dok.judul}</h2>
                    </div>
                    <DocumentListStatusBadge status={dok.status} className="shrink-0" />
                  </div>
                    <div className="space-y-2 rounded-xl border border-amber-200/70 bg-amber-50/70 p-3 text-xs text-amber-900">
                    <p className="font-semibold text-zinc-950">Catatan revisi</p>
                    <p className="line-clamp-3">{dok.revision_notes ?? 'Tidak ada catatan tambahan.'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
                    <div className="rounded-xl border border-zinc-200/80 bg-bg-surface p-2.5">
                      <p className="font-semibold text-zinc-500">Fungsi</p>
                      <p className="mt-0.5 text-zinc-900">{dok.fungsi_nama ?? '-'}</p>
                    </div>
                    <div className="rounded-xl border border-zinc-200/80 bg-bg-surface p-2.5">
                      <p className="font-semibold text-zinc-500">Tanggal</p>
                      <WorkflowDateCell value={formatDate(dok.tanggal)} className="mt-1" />
                    </div>
                    <div className="col-span-2 rounded-xl border border-zinc-200/80 bg-bg-surface p-2.5">
                      <p className="font-semibold text-zinc-500">Kegiatan</p>
                      <p className="mt-0.5 text-zinc-900">{dok.kegiatan_nama ?? '-'}</p>
                    </div>
                  </div>
                  <div className="space-y-3 border-t border-zinc-100 pt-3">
                    <RevisionActionLink dok={dok} mobile />
                  </div>
                </PegawaiPanel>
              ))}
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

function RevisionActionLink({ dok, mobile = false }: { dok: Item; mobile?: boolean }) {
  return (
    <Link to="/pegawai/dokumen/$id/revisi" params={{ id: dok.id }} className={mobile ? 'block w-full' : undefined}>
      <Button
        size={mobile ? 'sm' : 'icon-xs'}
        variant={mobile ? 'default' : 'ghost'}
        className={mobile ? 'w-full gap-1.5' : undefined}
        aria-label={`Revisi dokumen ${dok.judul}`}
      >
        <ChevronRight size={14} />
        {mobile ? 'Buka Dokumen' : null}
      </Button>
    </Link>
  )
}
