import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import {
  WorkflowMobileCard,
  WorkflowMobileList,
  WorkflowPageHeader,
  WorkflowTableShell,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import { FileText, ChevronRight, Eye, Banknote } from 'lucide-react'
import { ApiError, apiFetch } from '#/lib/api-client'
import { formatDate } from '#/lib/utils/format'

type Item = { id: string; judul: string; fungsi_nama: string; kegiatan_nama: string; tahun: number; updated_at: string; revision_notes: string | null }
type BendaharaDitolakResponse = { dokumen?: Item[]; error?: string }

function truncate(str: string | null, len = 50): string { if (!str) return '-'; return str.length > len ? str.slice(0, len) + '...' : str }

export const Route = createFileRoute('/bendahara/ditolak')({ component: BendaharaDitolakPage })

function BendaharaDitolakPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<BendaharaDitolakResponse>('/bendahara/ditolak')
      .then(d => { setItems(d.dokumen ?? []); setLoading(false) })
      .catch((error) => {
        if (!(error instanceof ApiError)) {
          setError('Gagal memuat data')
        }
        setLoading(false)
      })
  }, [])

  return (
    <PageLayout>
      <div className="space-y-6">
        <WorkflowPageHeader
          tone="ppspm"
          eyebrow={
            <>
              <Banknote size={12} />
              <Link to="/bendahara" className="hover:text-orange-900">PPSPM</Link>
              <ChevronRight size={10} />
              <span>Dokumen Ditolak</span>
            </>
          }
          title="Dokumen Ditolak"
          description={`${items.length} dokumen ditolak PPSPM dan dikembalikan ke PPK untuk perbaikan.`}
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
                    <TableHead className="text-center">Tahun</TableHead>
                    <TableHead className="text-center">Tanggal Penolakan</TableHead>
                    <TableHead>Catatan</TableHead>
                    <TableHead className="text-center w-20">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((d, i) => (
                    <TableRow key={d.id} className="group hover:bg-orange-50/60 transition-colors">
                      <TableCell className="text-center text-xs text-outline">{i + 1}</TableCell>
                      <TableCell><p className="font-semibold text-sm text-on-surface line-clamp-1">{d.judul}</p></TableCell>
                      <TableCell><span className="text-xs text-on-surface">{d.fungsi_nama ?? '-'}</span></TableCell>
                      <TableCell><span className="text-xs text-on-surface">{d.kegiatan_nama ?? '-'}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs font-semibold text-on-surface">{d.tahun}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs text-on-surface-variant">{formatDate(d.updated_at)}</span></TableCell>
                      <TableCell><span className="text-xs text-on-surface-variant" title={d.revision_notes ?? undefined}>{truncate(d.revision_notes, 50)}</span></TableCell>
                      <TableCell className="text-center">
                        <Link to="/bendahara/dokumen/$id" params={{ id: d.id }}><Button size="icon-xs" variant="ghost" aria-label={`Lihat detail dokumen ${d.judul}`}><Eye size={14} /></Button></Link>
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
                  meta={[
                    { label: 'Kegiatan', value: d.kegiatan_nama ?? '-' },
                    { label: 'Tahun', value: d.tahun },
                    { label: 'Tanggal Penolakan', value: formatDate(d.updated_at) },
                    { label: 'Catatan', value: truncate(d.revision_notes, 80) },
                  ]}
                  action={
                    <Link to="/bendahara/dokumen/$id" params={{ id: d.id }}>
                      <Button variant="outline" size="sm" className="w-full gap-1.5">
                        <Eye size={14} />
                        Lihat Detail
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
