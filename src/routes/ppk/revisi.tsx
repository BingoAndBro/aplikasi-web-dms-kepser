import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import {
  WorkflowMobileCard,
  WorkflowMobileList,
  WorkflowPageHeader,
  WorkflowPagination,
  WorkflowSearchPanel,
  WorkflowTableShell,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import {
  FileText,
  ChevronRight,
  FileEdit,
} from 'lucide-react'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiFetch } from '#/lib/api-client'

type Item = {
  id: string; judul: string; fungsi_nama: string; kegiatan_nama: string
  status?: string; current_step?: string | null; revision_target?: string | null
  tahun: number; tanggal: string; created_at: string; updated_at: string; revision_notes: string | null
}

export const Route = createFileRoute('/ppk/revisi')({ component: PpkRevisiPage })

function StepBadge({ step }: { step: string | null }) {
  if (!step) return null
  const label = step === 'PPK' ? 'Step PPK' : 'Step PPSPM'
  return (
    <span className="rounded-full border border-orange-100 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-800">
      {label}
    </span>
  )
}

const PAGE_SIZE = 10

function PpkRevisiPage() {
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

  return (
    <PageLayout>
      <div className="space-y-6">
        <WorkflowPageHeader
          eyebrow={
            <>
              <FileText size={12} />
              <Link to="/ppk" className="hover:text-orange-900">PPK</Link>
              <ChevronRight size={10} />
              <span>Revisi Dokumen</span>
            </>
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
            <WorkflowTableShell>
              <Table>
                <TableHeader>
                  <TableRow className="bg-orange-50/50">
                    <TableHead className="w-12 text-center">No</TableHead>
                    <TableHead>Judul</TableHead>
                    <TableHead>Kegiatan</TableHead>
                    <TableHead className="text-center">Tahun</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Tanggal</TableHead>
                    <TableHead className="text-center w-20">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((dok, i) => (
                    <TableRow key={dok.id} className="group hover:bg-orange-50/60 transition-colors">
                      <TableCell className="text-center text-xs text-outline">
                        {page * PAGE_SIZE + i + 1}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-semibold text-sm text-on-surface line-clamp-1">{dok.judul}</p>
                          <p className="text-[10px] text-on-surface-variant mt-0.5">{dok.fungsi_nama ?? '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell><span className="text-xs text-on-surface">{dok.kegiatan_nama ?? '-'}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs font-semibold text-on-surface">{dok.tahun}</span></TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <StatusBadge status={dok.status ?? 'NEED_REVISION'} className="text-[10px] font-semibold" />
                          <StepBadge step={dok.current_step ?? 'PPK'} />
                        </div>
                      </TableCell>
                      <TableCell className="text-center"><span className="text-xs text-on-surface-variant">{formatDate(dok.tanggal)}</span></TableCell>
                      <TableCell className="text-center">
                        <Link to="/ppk/dokumen/$id/resubmit" params={{ id: dok.id }}>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Revisi dokumen ${dok.judul}`}
                            title={dok.revision_notes ?? undefined}
                          >
                            <FileEdit size={14} className="text-amber-600" />
                          </Button>
                        </Link>
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
                  status={<StatusBadge status={dok.status ?? 'NEED_REVISION'} className="text-[10px] font-semibold" />}
                  meta={[
                    { label: 'Kegiatan', value: dok.kegiatan_nama ?? '-' },
                    { label: 'Step', value: dok.current_step === 'BENDAHARA' ? 'PPSPM' : dok.current_step ?? 'PPK' },
                    { label: 'Tahun', value: dok.tahun },
                    { label: 'Tanggal', value: formatDate(dok.tanggal) },
                    { label: 'Catatan', value: dok.revision_notes ?? '-' },
                  ]}
                  action={
                    <Link to="/ppk/dokumen/$id/resubmit" params={{ id: dok.id }}>
                      <Button variant="outline" size="sm" className="w-full gap-1.5">
                        <FileEdit size={14} />
                        Perbaiki Dokumen
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
