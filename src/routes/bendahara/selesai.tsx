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
  WorkflowTableShell,
  WORKFLOW_TABLE_HEAD_CLASS,
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
      <div className="mx-auto w-full max-w-[1280px] space-y-7 px-7 pt-6 sm:px-8 lg:px-10">
        <WorkflowPageHeader
          variant="list"
          tone="ppspm"
          eyebrow={
            <Banknote size={22} />
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
            <p className="px-1 text-sm font-bold text-zinc-950">
              {items.length} Dokumen Ditemukan
            </p>

            <WorkflowTableShell>
              <Table className="text-left">
                <TableHeader>
                  <TableRow className="border-zinc-100 bg-[#FFFCF8] hover:bg-[#FFFCF8]">
                    <TableHead className={`w-16 text-center ${WORKFLOW_TABLE_HEAD_CLASS}`}>No</TableHead>
                    <TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Judul Dokumen</TableHead>
                    <TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Fungsi</TableHead>
                    <TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Kegiatan</TableHead>
                    <TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Tanggal Selesai</TableHead>
                    <TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Status</TableHead>
                    <TableHead className={`w-20 text-right ${WORKFLOW_TABLE_HEAD_CLASS}`}>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-zinc-100 text-[13px]">
                  {items.map((d, i) => (
                    <TableRow
                      key={d.id}
                      className="group cursor-pointer border-zinc-100 transition-colors hover:bg-[#FFF8F1]/70"
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
                      <TableCell className="px-6 py-5 text-center text-sm font-normal text-zinc-950">{i + 1}</TableCell>
                      <TableCell className="max-w-[360px] px-6 py-5"><p className="line-clamp-1 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-[#FF4D00]">{d.judul}</p></TableCell>
                      <TableCell className="max-w-[200px] px-6 py-5"><span className="block truncate text-sm font-normal text-zinc-900">{d.fungsi_nama ?? '-'}</span></TableCell>
                      <TableCell className="max-w-[260px] px-6 py-5"><span className="block truncate text-sm font-normal text-zinc-900">{d.kegiatan_nama ?? '-'}</span></TableCell>
                      <TableCell className="px-6 py-5"><WorkflowDateCell value={formatDate(d.updated_at)} /></TableCell>
                      <TableCell className="px-6 py-5"><DocumentListStatusBadge status="COMPLETED" /></TableCell>
                      <TableCell className="px-6 py-5 text-right">
                        <WorkflowActionButton label={`Buka dokumen ${d.judul}`} />
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
                    { label: 'Tanggal Selesai', value: <WorkflowDateCell value={formatDate(d.updated_at)} className="mt-1" /> },
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
