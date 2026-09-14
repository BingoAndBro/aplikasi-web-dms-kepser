import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import {
  DocumentListStatusBadge,
  WorkflowActionButton,
  WorkflowDateCell,
  WorkflowMobileCard,
  WorkflowMobileList,
  WorkflowPageHeader,
  WorkflowSearchPanel,
  WorkflowStatusSelect,
  WorkflowTableShell,
  WORKFLOW_TABLE_HEAD_CLASS,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import { ChevronRight, CheckCircle2, ClipboardCheck } from 'lucide-react'
import { ApiError, apiFetch } from '#/lib/api-client'
import { formatDate } from '#/lib/utils/format'

type Item = {
  id: string; judul: string; fungsi_nama: string; kegiatan_nama: string
  tahun: number; tanggal: string; created_at: string; status: string
}
type PpkTervalidasiResponse = { dokumen?: Item[]; error?: string }

export const Route = createFileRoute('/ppk/tervalidasi')({ component: PpkTervalidasiPage })

const WORKFLOW_SEARCH_PLACEHOLDER = 'Cari judul, fungsi, atau kegiatan...'
const STATUS_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Semua Status' },
  { value: 'IN_PPSPM_APPROVAL', label: 'Menunggu Persetujuan' },
  { value: 'COMPLETED', label: 'Selesai' },
]

function PpkTervalidasiPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

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

  function openDocument(dok: Item) {
    navigate({ to: '/ppk/dokumen/$id', params: { id: dok.id } })
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

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-7 px-7 pt-6 sm:px-8 lg:px-10">
        <WorkflowPageHeader
          variant="list"
          eyebrow={
            <ClipboardCheck size={22} />
          }
          title="Dokumen Tervalidasi"
          description={`${items.length} dokumen sudah divalidasi PPK dan diteruskan sesuai alur Material.`}
        />

        <WorkflowSearchPanel
          search={search}
          onSearchChange={setSearch}
          placeholder={WORKFLOW_SEARCH_PLACEHOLDER}
          resultLabel={`Total ${filtered.length} Dokumen`}
        >
          <WorkflowStatusSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_FILTER_OPTIONS}
          />
        </WorkflowSearchPanel>

        {loading ? (
          <LoadingState variant="list" rows={4} />
        ) : error ? (
          <ErrorState title="Gagal memuat data" description={error} variant="page" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Belum ada dokumen"
            description={search ? 'Tidak ada dokumen yang cocok dengan pencarian Anda.' : 'Dokumen yang sudah Anda validasi akan muncul di sini.'}
            icon={<CheckCircle2 size={20} />}
          />
        ) : (
          <>
            <WorkflowTableShell>
              <Table className="text-left">
                <TableHeader>
                  <TableRow className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
                    <TableHead className={`w-16 text-center ${WORKFLOW_TABLE_HEAD_CLASS}`}>No</TableHead>
                    <TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Judul Dokumen</TableHead>
                    <TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Kegiatan</TableHead>
                    <TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Status</TableHead>
                    <TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Tanggal Ajuan</TableHead>
                    <TableHead className={`w-20 text-right ${WORKFLOW_TABLE_HEAD_CLASS}`}>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-zinc-100 text-[13px]">
                  {filtered.map((d, i) => (
                    <TableRow
                      key={d.id}
                      className="group cursor-pointer border-zinc-100 bg-bg-surface transition-colors hover:bg-brand-surface/70"
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
                      <TableCell className="max-w-[360px] px-6 py-5">
                        <div>
                          <p className="line-clamp-1 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-brand-text">{d.judul}</p>
                          <p className="mt-1 line-clamp-1 text-xs font-medium text-zinc-500">{d.fungsi_nama ?? '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[260px] px-6 py-5"><span className="block truncate text-sm font-normal text-zinc-900">{d.kegiatan_nama ?? '-'}</span></TableCell>
                      <TableCell className="px-6 py-5"><DocumentListStatusBadge status={d.status} /></TableCell>
                      <TableCell className="px-6 py-5"><WorkflowDateCell value={formatDate(d.tanggal)} /></TableCell>
                      <TableCell className="px-6 py-5 text-right">
                        <WorkflowActionButton label={`Buka dokumen ${d.judul}`} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </WorkflowTableShell>

            <WorkflowMobileList>
              {filtered.map((d) => (
                <WorkflowMobileCard
                  key={d.id}
                  title={d.judul}
                  subtitle={d.fungsi_nama ?? '-'}
                  status={<DocumentListStatusBadge status={d.status} />}
                  meta={[
                    { label: 'Kegiatan', value: d.kegiatan_nama ?? '-', wide: true },
                    { label: 'Tanggal', value: <WorkflowDateCell value={formatDate(d.tanggal)} className="mt-1" /> },
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
