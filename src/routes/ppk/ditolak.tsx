import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#/components/ui/table'
import {
  DocumentListStatusBadge,
  WorkflowMobileCard,
  WorkflowMobileList,
  WorkflowPageHeader,
  WorkflowTableShell,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import { FileText, ChevronRight, FileX } from 'lucide-react'
import { ApiError, apiFetch } from '#/lib/api-client'
import { formatDate } from '#/lib/utils/format'

type Item = {
  id: string; judul: string; fungsi_nama: string; kegiatan_nama: string
  tahun: number; tanggal: string; created_at: string; updated_at: string; revision_notes: string | null
}
type PpkDitolakResponse = { dokumen?: Item[]; error?: string }

export const Route = createFileRoute('/ppk/ditolak')({ component: PpkDitolakPage })

function truncate(str: string | null, len = 50): string {
  if (!str) return '-'
  return str.length > len ? str.slice(0, len) + '...' : str
}

function RejectedBadge() {
  return <DocumentListStatusBadge status="NEED_REVISION" label="Ditolak PPK" />
}

function PpkDitolakPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<PpkDitolakResponse>('/ppk/ditolak')
      .then(d => { setItems(d.dokumen ?? []); setLoading(false) })
      .catch((error) => {
        if (!(error instanceof ApiError)) {
          setError('Gagal memuat data')
        }
        setLoading(false)
      })
  }, [])

  function openDocument(dok: Item) {
    navigate({ to: '/ppk/dokumen/$id', params: { id: dok.id } })
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <WorkflowPageHeader
          eyebrow={
            <>
              <FileX size={12} />
              <Link to="/ppk" className="hover:text-orange-900">PPK</Link>
              <ChevronRight size={10} />
              <span>Dokumen Tidak Valid</span>
            </>
          }
          title="Dokumen Tidak Valid"
          description={`${items.length} dokumen pernah ditolak PPK dan dikembalikan ke Pegawai untuk revisi.`}
        />

        {loading ? (
          <LoadingState variant="list" rows={4} />
        ) : error ? (
          <ErrorState title="Gagal memuat data" description={error} variant="page" />
        ) : items.length === 0 ? (
          <EmptyState
            title="Tidak ada dokumen"
            description="Dokumen yang Anda tolak akan muncul di sini."
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
                    <TableHead>Fungsi</TableHead>
                    <TableHead>Kegiatan</TableHead>
                    <TableHead className="text-center">Tanggal Penolakan</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Catatan</TableHead>
                    <TableHead className="text-center w-20">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((d, i) => (
                    <TableRow
                      key={d.id}
                      className="group cursor-pointer hover:bg-orange-50/60 transition-colors"
                      onClick={() => openDocument(d)}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openDocument(d)
                        }
                      }}
                      aria-label={`Buka dokumen ${d.judul}`}
                    >
                      <TableCell className="text-center text-xs text-outline">{i + 1}</TableCell>
                      <TableCell><p className="font-semibold text-sm text-on-surface line-clamp-1">{d.judul}</p></TableCell>
                      <TableCell><span className="text-xs text-on-surface">{d.fungsi_nama ?? '-'}</span></TableCell>
                      <TableCell><span className="text-xs text-on-surface">{d.kegiatan_nama ?? '-'}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs text-on-surface-variant">{formatDate(d.updated_at)}</span></TableCell>
                      <TableCell className="text-center"><RejectedBadge /></TableCell>
                      <TableCell><span className="text-xs text-on-surface-variant" title={d.revision_notes ?? undefined}>{truncate(d.revision_notes)}</span></TableCell>
                      <TableCell className="text-center">
                        <Button size="icon-xs" variant="ghost" aria-label={`Buka dokumen ${d.judul}`}><ChevronRight size={14} /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </WorkflowTableShell>

            <WorkflowMobileList>
              {items.map((d) => (
                <WorkflowMobileCard
                  key={d.id}
                  title={d.judul}
                  subtitle={d.fungsi_nama ?? '-'}
                  status={<RejectedBadge />}
                  meta={[
                    { label: 'Kegiatan', value: d.kegiatan_nama ?? '-', wide: true },
                    { label: 'Tanggal Penolakan', value: formatDate(d.updated_at) },
                    { label: 'Catatan', value: truncate(d.revision_notes, 80), wide: true },
                  ]}
                  action={
                    <Link to="/ppk/dokumen/$id" params={{ id: d.id }}>
                      <Button variant="outline" size="sm" className="w-full gap-1.5">
                        <ChevronRight size={14} />
                        Buka Dokumen
                      </Button>
                    </Link>
                  }
                />
              ))}
            </WorkflowMobileList>
          </>
        )}
      </div>
    </PageLayout>
  )
}
