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
  WorkflowMobileCard,
  WorkflowMobileList,
  WorkflowPageHeader,
  WorkflowTableShell,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import { ChevronRight, CheckCircle2, Banknote } from 'lucide-react'
import { ApiError, apiFetch } from '#/lib/api-client'
import { formatDate } from '#/lib/utils/format'

type Item = { id: string; judul: string; fungsi_nama: string; kegiatan_nama: string; tahun: number; updated_at: string }
type BendaharaSelesaiResponse = { dokumen?: Item[]; error?: string }

export const Route = createFileRoute('/bendahara/selesai')({ component: BendaharaSelesaiPage })

function BendaharaSelesaiPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<BendaharaSelesaiResponse>('/bendahara/selesai')
      .then(d => { setItems(d.dokumen ?? []); setLoading(false) })
      .catch((error) => {
        if (!(error instanceof ApiError)) {
          setError('Gagal memuat data')
        }
        setLoading(false)
      })
  }, [])

  function openDocument(dok: Item) {
    navigate({ to: '/bendahara/dokumen/$id', params: { id: dok.id } })
  }

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
              <span>Dokumen Selesai</span>
            </>
          }
          title="Dokumen Selesai"
          description={`${items.length} dokumen telah disetujui PPSPM dan berstatus selesai.`}
        />
        {loading ? (
          <LoadingState variant="list" rows={4} />
        ) : error ? (
          <ErrorState title="Gagal memuat data" description={error} variant="page" />
        ) : items.length === 0 ? (
          <EmptyState
            title="Belum ada dokumen"
            description="Dokumen yang telah Anda setujui akan muncul di sini."
            icon={<CheckCircle2 size={20} />}
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
                    <TableHead className="text-center">Tanggal Selesai</TableHead>
                    <TableHead className="text-center">Status</TableHead>
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
                      <TableCell className="text-center"><DocumentListStatusBadge status="COMPLETED" /></TableCell>
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
                  status={<DocumentListStatusBadge status="COMPLETED" />}
                  meta={[
                    { label: 'Kegiatan', value: d.kegiatan_nama ?? '-', wide: true },
                    { label: 'Tanggal Selesai', value: formatDate(d.updated_at) },
                  ]}
                  action={
                    <Link to="/bendahara/dokumen/$id" params={{ id: d.id }}>
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
