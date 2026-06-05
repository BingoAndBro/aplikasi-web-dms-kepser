import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import {
  DocumentListStatusBadge,
  WorkflowActionButton,
  WorkflowDateCell,
  WorkflowMobileCard,
  WorkflowMobileList,
  WorkflowPageHeader,
  WorkflowSearchPanel,
  WorkflowTableShell,
  WORKFLOW_TABLE_HEAD_CLASS,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import {
  FileText, ChevronRight, Banknote,
} from 'lucide-react'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/bendahara/inbox')({ component: BendaharaInboxPage })

type InboxItem = {
  id: string; judul: string; fungsi_nama: string; kegiatan_nama: string
  created_by: string; tahun: number; tanggal: string; created_at: string
  ppk_user_id: string | null; ppk_validated_at: string | null
}

type FungsiOption = { id: string; nama: string }

function BendaharaInboxPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fungsiList, setFungsiList] = useState<{ id: string; nama: string }[]>([])
  const [fungsiFilter, setFungsiFilter] = useState('')

  useEffect(() => {
    apiFetch<FungsiOption[]>('/master-fungsi')
      .then(data => { setFungsiList(data) })
      .catch(() => { setFungsiList([]) })
  }, [])

  async function fetchData() {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (fungsiFilter) params.set('fungsi_id', fungsiFilter)
      const json = await apiFetch<{ dokumen?: InboxItem[]; error?: string }>('/bendahara/inbox', { query: params })
      setItems(json.dokumen ?? [])
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        return
      }

      setError('Terjadi kesalahan')
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [fungsiFilter])

  function openDocument(dok: InboxItem) {
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
          title="Persetujuan Dokumen"
          description={`${items.length} dokumen Material sudah divalidasi PPK dan menunggu persetujuan PPSPM.`}
        />

        <WorkflowSearchPanel resultLabel={`${items.length} dokumen ditemukan`}>
          <select
            value={fungsiFilter}
            onChange={e => setFungsiFilter(e.target.value)}
            className="h-12 rounded-2xl border border-zinc-200 bg-[#FFFDF9] px-4 text-sm font-semibold text-zinc-700 outline-none transition hover:bg-white focus:border-orange-200 focus:ring-4 focus:ring-orange-100/60"
          >
            <option value="">Semua Fungsi</option>
            {fungsiList.map(f => <option key={f.id} value={f.id}>{f.nama}</option>)}
          </select>
          {fungsiFilter && <Button variant="ghost" size="sm" onClick={() => setFungsiFilter('')}>Reset</Button>}
        </WorkflowSearchPanel>

        {loading ? (
          <LoadingState variant="list" rows={4} />
        ) : error ? (
          <ErrorState
            title="Gagal memuat data"
            description={error}
            variant="page"
            action={<Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="Tidak ada dokumen"
            description="Dokumen yang menunggu persetujuan PPSPM akan muncul di sini."
            icon={<FileText size={20} />}
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
                    <TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Tanggal</TableHead>
                    <TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Divalidasi Oleh</TableHead>
                    <TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Tanggal Validasi</TableHead>
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
                      <TableCell className="max-w-[320px] px-6 py-5"><p className="line-clamp-1 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-[#FF4D00]">{d.judul}</p></TableCell>
                      <TableCell className="max-w-[180px] px-6 py-5"><span className="block truncate text-sm font-normal text-zinc-900">{d.fungsi_nama ?? '-'}</span></TableCell>
                      <TableCell className="max-w-[220px] px-6 py-5"><span className="block truncate text-sm font-normal text-zinc-900">{d.kegiatan_nama ?? '-'}</span></TableCell>
                      <TableCell className="px-6 py-5"><WorkflowDateCell value={formatDate(d.tanggal)} /></TableCell>
                      <TableCell className="px-6 py-5"><span className="text-sm font-medium text-zinc-500">{d.ppk_validated_at ? 'PPK' : '-'}</span></TableCell>
                      <TableCell className="px-6 py-5">{d.ppk_validated_at ? <WorkflowDateCell value={formatDate(d.ppk_validated_at)} /> : <span className="text-sm font-medium text-zinc-500">-</span>}</TableCell>
                      <TableCell className="px-6 py-5"><DocumentListStatusBadge status="IN_BENDAHARA_APPROVAL" /></TableCell>
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
                  status={<DocumentListStatusBadge status="IN_BENDAHARA_APPROVAL" />}
                  meta={[
                    { label: 'Kegiatan', value: d.kegiatan_nama ?? '-', wide: true },
                    { label: 'Tanggal', value: <WorkflowDateCell value={formatDate(d.tanggal)} className="mt-1" /> },
                    { label: 'Tanggal Validasi PPK', value: d.ppk_validated_at ? <WorkflowDateCell value={formatDate(d.ppk_validated_at)} className="mt-1" /> : '-' },
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
