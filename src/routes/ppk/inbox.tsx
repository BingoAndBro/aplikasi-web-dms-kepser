import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '#/components/ui/table'
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
  ClipboardList,
} from 'lucide-react'
import { ApiError, apiFetch } from '#/lib/api-client'
import { formatDate } from '#/lib/utils/format'

type InboxItem = {
  id: string
  judul: string
  fungsi_id: string
  fungsi_nama: string
  kegiatan_jenis_id: string
  kegiatan_nama: string
  created_by: string
  tahun: number
  tanggal: string
  created_at: string
}

type PpkInboxResponse = {
  dokumen?: InboxItem[]
  error?: string
}

export const Route = createFileRoute('/ppk/inbox')({
  component: PpkInboxPage,
})

const PAGE_SIZE = 10
const WORKFLOW_SEARCH_PLACEHOLDER = 'Cari judul, fungsi, atau kegiatan...'


function PpkInboxPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  // Fetch inbox data
  async function fetchData() {
    setLoading(true)
    setFetchError(null)
    try {
      const json = await apiFetch<PpkInboxResponse>('/ppk/inbox')
      setItems(json.dokumen ?? [])
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        if (payload && typeof payload === 'object' && 'error' in payload) {
          setFetchError(typeof payload.error === 'string' ? payload.error : `HTTP ${err.status}`)
        } else {
          setFetchError(`HTTP ${err.status}`)
        }
      } else {
        setFetchError(err instanceof Error ? err.message : 'Terjadi kesalahan')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  // Client-side search filter
  const filtered = items.filter(d =>
    !search ||
    d.judul.toLowerCase().includes(search.toLowerCase()) ||
    (d.fungsi_nama ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (d.kegiatan_nama ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function openDocument(dok: InboxItem) {
    navigate({ to: '/ppk/dokumen/$id', params: { id: dok.id } })
  }

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-7 px-7 pt-6 sm:px-8 lg:px-10">
        <WorkflowPageHeader
          variant="list"
          eyebrow={
            <ClipboardList size={22} />
          }
          title="Dokumen Menunggu Validasi"
          description={`${items.length} dokumen Material menunggu validasi PPK. Validasi akan meneruskan dokumen ke PPSPM.`}
        />

        <WorkflowSearchPanel
          search={search}
          onSearchChange={(value) => { setSearch(value); setPage(0) }}
          placeholder={WORKFLOW_SEARCH_PLACEHOLDER}
          resultLabel={`Total ${filtered.length} Dokumen`}
        >
          {search && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setPage(0)
              }}
              className="text-xs"
            >
              Reset
            </Button>
          )}
        </WorkflowSearchPanel>

        {/* Table */}
        {loading ? (
          <LoadingState variant="list" rows={4} />
        ) : fetchError ? (
          <ErrorState
            title="Gagal memuat data"
            description={fetchError}
            variant="page"
            action={<Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Tidak ada dokumen"
            description={search
              ? 'Tidak ada dokumen yang cocok dengan filter Anda.'
              : 'Belum ada dokumen yang menunggu validasi PPK.'}
            icon={<FileText size={20} />}
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
                    {paginated.map((dok, i) => (
                      <TableRow
                        key={dok.id}
                        className="group cursor-pointer border-zinc-100 bg-bg-surface transition-colors hover:bg-brand-surface/70"
                        onClick={() => openDocument(dok)}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openDocument(dok)
                          }
                        }}
                        aria-label={`Buka dokumen ${dok.judul}`}
                      >
                        <TableCell className="px-6 py-5 text-center text-sm font-normal text-zinc-950">
                          {page * PAGE_SIZE + i + 1}
                        </TableCell>
                        <TableCell className="max-w-[360px] px-6 py-5">
                          <div>
                            <p className="line-clamp-1 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-brand-text">{dok.judul}</p>
                            <p className="mt-1 line-clamp-1 text-xs font-medium text-zinc-500">
                              Diajukan: {formatDate(dok.created_at)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[260px] px-6 py-5">
                          <span className="block truncate text-sm font-normal text-zinc-900">{dok.kegiatan_nama ?? '-'}</span>
                        </TableCell>
                        <TableCell className="px-6 py-5">
                          <DocumentListStatusBadge status="IN_PPK_VALIDATION" />
                        </TableCell>
                        <TableCell className="px-6 py-5">
                          <WorkflowDateCell value={formatDate(dok.tanggal)} />
                        </TableCell>
                        <TableCell className="px-6 py-5 text-right">
                          <WorkflowActionButton label={`Buka dokumen ${dok.judul}`} />
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
                  subtitle={`Diajukan ${formatDate(dok.created_at)}`}
                  status={<DocumentListStatusBadge status="IN_PPK_VALIDATION" />}
                  meta={[
                    { label: 'Fungsi', value: dok.fungsi_nama ?? '-' },
                    { label: 'Kegiatan', value: dok.kegiatan_nama ?? '-', wide: true },
                    { label: 'Tanggal Ajuan', value: <WorkflowDateCell value={formatDate(dok.tanggal)} className="mt-1" /> },
                  ]}
                  action={
                    <Link to="/ppk/dokumen/$id" params={{ id: dok.id }}>
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
