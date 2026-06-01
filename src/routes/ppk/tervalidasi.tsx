import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import {
  WorkflowMobileCard,
  WorkflowMobileList,
  WorkflowPageHeader,
  WorkflowTableShell,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import { FileText, ChevronRight, Eye, CheckCircle2, ClipboardCheck } from 'lucide-react'
import { ApiError, apiFetch } from '#/lib/api-client'
import { formatDate } from '#/lib/utils/format'

type Item = {
  id: string; judul: string; fungsi_nama: string; kegiatan_nama: string
  tahun: number; tanggal: string; created_at: string; status: string
}
type PpkTervalidasiResponse = { dokumen?: Item[]; error?: string }

export const Route = createFileRoute('/ppk/tervalidasi')({ component: PpkTervalidasiPage })

function PpkTervalidasiPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<PpkTervalidasiResponse>('/ppk/tervalidasi')
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
          eyebrow={
            <>
              <ClipboardCheck size={12} />
              <Link to="/ppk" className="hover:text-orange-900">PPK</Link>
              <ChevronRight size={10} />
              <span>Dokumen Tervalidasi</span>
            </>
          }
          title="Dokumen Tervalidasi"
          description={`${items.length} dokumen sudah divalidasi PPK dan diteruskan sesuai alur Material.`}
        />

        {loading ? (
          <LoadingState variant="list" rows={4} />
        ) : error ? (
          <ErrorState title="Gagal memuat data" description={error} variant="page" />
        ) : items.length === 0 ? (
          <EmptyState
            title="Belum ada dokumen"
            description="Dokumen yang sudah Anda validasi akan muncul di sini."
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
                    <TableHead className="text-center">Tahun</TableHead>
                    <TableHead className="text-center">Tanggal</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center w-20">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((d, i) => (
                    <TableRow key={d.id} className="group hover:bg-orange-50/60 transition-colors">
                      <TableCell className="text-center text-xs text-outline">{i + 1}</TableCell>
                      <TableCell>
                        <p className="font-semibold text-sm text-on-surface line-clamp-1">{d.judul}</p>
                      </TableCell>
                      <TableCell><span className="text-xs text-on-surface">{d.fungsi_nama ?? '-'}</span></TableCell>
                      <TableCell><span className="text-xs text-on-surface">{d.kegiatan_nama ?? '-'}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs font-semibold text-on-surface">{d.tahun}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs text-on-surface-variant">{formatDate(d.tanggal)}</span></TableCell>
                      <TableCell className="text-center"><StatusBadge status={d.status} className="text-[10px] font-semibold" /></TableCell>
                      <TableCell className="text-center">
                        <Link to="/ppk/dokumen/$id" params={{ id: d.id }}>
                          <Button size="icon-xs" variant="ghost" aria-label={`Lihat detail dokumen ${d.judul}`}><Eye size={14} /></Button>
                        </Link>
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
                  status={<StatusBadge status={d.status} className="text-[10px] font-semibold" />}
                  meta={[
                    { label: 'Kegiatan', value: d.kegiatan_nama ?? '-' },
                    { label: 'Tahun', value: d.tahun },
                    { label: 'Tanggal', value: formatDate(d.tanggal) },
                  ]}
                  action={
                    <Link to="/ppk/dokumen/$id" params={{ id: d.id }}>
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
