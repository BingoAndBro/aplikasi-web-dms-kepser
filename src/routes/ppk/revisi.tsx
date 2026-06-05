import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import {
  DocumentListStatusBadge,
  WorkflowActionButton,
  WorkflowDateCell,
  WorkflowMobileCard,
  WorkflowMobileList,
  WorkflowPageHeader,
  WorkflowPagination,
  WorkflowSearchPanel,
  WorkflowTableShell,
  WORKFLOW_TABLE_HEAD_CLASS,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import {
  FileText,
  ChevronRight,
} from 'lucide-react'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiFetch } from '#/lib/api-client'

type Item = {
  id: string; judul: string; fungsi_nama: string; kegiatan_nama: string
  status?: string; current_step?: string | null; revision_target?: string | null
  tahun: number; tanggal: string; created_at: string; updated_at: string; revision_notes: string | null
}

export const Route = createFileRoute('/ppk/revisi')({ component: PpkRevisiPage })

const PAGE_SIZE = 10

function PpkRevisiPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    apiFetch<{ dokumen?: Item[] }>('/ppk/revisi')
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

        setError('Gagal memuat data'); setLoading(false)
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
    navigate({ to: '/ppk/dokumen/$id/resubmit', params: { id: dok.id } })
  }

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-7 px-7 pt-6 sm:px-8 lg:px-10">
        <WorkflowPageHeader
          variant="list"
          eyebrow={
            <FileText size={22} />
          }
          title="Revisi dari PPSPM"
          description={`${filtered.length} dokumen dikembalikan PPSPM ke PPK. Perbaiki lampiran atau gunakan Kembalikan ke Pegawai jika perlu.`}
        />

        <WorkflowSearchPanel
          search={search}
          onSearchChange={(value) => { setSearch(value); setPage(0) }}
          placeholder="Cari judul, fungsi, kegiatan, atau catatan..."
          resultLabel={`${filtered.length} dokumen ditemukan`}
        />

        {loading ? (
          <LoadingState variant="list" rows={4} />
        ) : error ? (
          <ErrorState title="Gagal memuat data" description={error} variant="page" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Tidak ada dokumen"
            description={search ? 'Tidak ada dokumen yang cocok dengan pencarian Anda.' : 'Dokumen yang dikembalikan PPSPM akan muncul di sini.'}
            icon={<FileText size={20} />}
          />
        ) : (
          <>
            <p className="px-1 text-sm font-bold text-zinc-950">
              {filtered.length} Dokumen Ditemukan
            </p>

            <WorkflowTableShell>
              <Table className="text-left">
                <TableHeader>
                  <TableRow className="border-zinc-100 bg-[#FFFCF8] hover:bg-[#FFFCF8]">
                    <TableHead className={`w-16 text-center ${WORKFLOW_TABLE_HEAD_CLASS}`}>No</TableHead>
                    <TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Judul Dokumen</TableHead>
                    <TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Kegiatan</TableHead>
                    <TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Status</TableHead>
                    <TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Tanggal</TableHead>
                    <TableHead className={`w-20 text-right ${WORKFLOW_TABLE_HEAD_CLASS}`}>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-zinc-100 text-[13px]">
                  {paginated.map((dok, i) => (
                    <TableRow
                      key={dok.id}
                      className="group cursor-pointer border-zinc-100 transition-colors hover:bg-[#FFF8F1]/70"
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
                          <p className="line-clamp-1 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-[#FF4D00]">{dok.judul}</p>
                          <p className="mt-1 line-clamp-1 text-xs font-medium text-zinc-500">{dok.fungsi_nama ?? '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[260px] px-6 py-5"><span className="block truncate text-sm font-normal text-zinc-900">{dok.kegiatan_nama ?? '-'}</span></TableCell>
                      <TableCell className="px-6 py-5">
                        <DocumentListStatusBadge status={dok.status ?? 'NEED_REVISION'} />
                      </TableCell>
                      <TableCell className="px-6 py-5"><WorkflowDateCell value={formatDate(dok.tanggal)} /></TableCell>
                      <TableCell className="px-6 py-5 text-right" title={dok.revision_notes ?? undefined}>
                        <WorkflowActionButton label={`Buka dokumen revisi ${dok.judul}`} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </WorkflowTableShell>

            <WorkflowMobileList>
              {paginated.map((dok) => (
                <WorkflowMobileCard
                  key={dok.id}
                  title={dok.judul}
                  subtitle={dok.fungsi_nama ?? '-'}
                  status={<DocumentListStatusBadge status={dok.status ?? 'NEED_REVISION'} />}
                  meta={[
                    { label: 'Kegiatan', value: dok.kegiatan_nama ?? '-', wide: true },
                    { label: 'Tanggal', value: <WorkflowDateCell value={formatDate(dok.tanggal)} className="mt-1" /> },
                    { label: 'Catatan', value: dok.revision_notes ?? '-', wide: true },
                  ]}
                  action={
                    <Link to="/ppk/dokumen/$id/resubmit" params={{ id: dok.id }}>
                      <Button variant="outline" size="sm" className="w-full gap-1.5">
                        <ChevronRight size={14} />
                        Buka Dokumen
                      </Button>
                    </Link>
                  }
                />
              ))}
            </WorkflowMobileList>

            <WorkflowPagination
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
