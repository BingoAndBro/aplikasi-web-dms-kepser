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

type FungsiOption = {
  id: string
  nama: string
}

export const Route = createFileRoute('/ppk/inbox')({
  component: PpkInboxPage,
})

const PAGE_SIZE = 10


function PpkInboxPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [fungsiList, setFungsiList] = useState<{ id: string; nama: string }[]>([])
  const [fungsiFilter, setFungsiFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(0)

  // Fetch fungsi list for filter dropdown
  useEffect(() => {
    apiFetch<FungsiOption[]>('/master-fungsi')
      .then(data => { setFungsiList(data) })
      .catch(() => { setFungsiList([]) })
  }, [])

  // Fetch inbox data
  async function fetchData() {
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams()
      if (fungsiFilter) params.set('fungsi_id', fungsiFilter)
      if (startDate) params.set('start_date', startDate)
      if (endDate) params.set('end_date', endDate)

      const json = await apiFetch<PpkInboxResponse>('/ppk/inbox', { query: params })
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

  useEffect(() => { fetchData() }, [fungsiFilter, startDate, endDate])

  // Client-side search filter
  const filtered = items.filter(d =>
    !search ||
    d.judul.toLowerCase().includes(search.toLowerCase()) ||
    d.fungsi_nama.toLowerCase().includes(search.toLowerCase()) ||
    d.kegiatan_nama.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function openDocument(dok: InboxItem) {
    navigate({ to: '/ppk/dokumen/$id', params: { id: dok.id } })
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <WorkflowPageHeader
          eyebrow={
            <>
              <ClipboardList size={12} />
              <Link to="/ppk" className="hover:text-orange-900">PPK</Link>
              <ChevronRight size={10} />
              <span>Validasi Dokumen</span>
            </>
          }
          title="Dokumen Menunggu Validasi"
          description={`${items.length} dokumen Material menunggu validasi PPK. Validasi akan meneruskan dokumen ke PPSPM.`}
        />

        <WorkflowSearchPanel
          search={search}
          onSearchChange={(value) => { setSearch(value); setPage(0) }}
          placeholder="Cari judul, fungsi, kegiatan..."
          resultLabel={`${filtered.length} dokumen ditemukan`}
        >
          <select
            value={fungsiFilter}
            onChange={e => { setFungsiFilter(e.target.value); setPage(0) }}
            className="h-10 rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 text-sm text-zinc-900 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70"
          >
            <option value="">Semua Fungsi</option>
            {fungsiList.map(f => (
              <option key={f.id} value={f.id}>{f.nama}</option>
            ))}
          </select>
          <input
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setPage(0) }}
            className="h-10 rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 text-sm text-zinc-900 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70"
            title="Tanggal mulai"
          />
          <input
            type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); setPage(0) }}
            className="h-10 rounded-xl border border-orange-100 bg-[#FFFDF9] px-3 text-sm text-zinc-900 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70"
            title="Tanggal akhir"
          />
          {(fungsiFilter || startDate || endDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFungsiFilter('')
                setStartDate('')
                setEndDate('')
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
            description={search || fungsiFilter || startDate || endDate
              ? 'Tidak ada dokumen yang cocok dengan filter Anda.'
              : 'Belum ada dokumen yang menunggu validasi PPK.'}
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
                      <TableHead className="text-center">Tanggal Ajuan</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center w-20">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map((dok, i) => (
                      <TableRow
                        key={dok.id}
                        className="group cursor-pointer hover:bg-orange-50/60 transition-colors"
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
                        <TableCell className="text-center text-xs text-outline">
                          {page * PAGE_SIZE + i + 1}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-semibold text-sm text-on-surface line-clamp-1">{dok.judul}</p>
                            <p className="text-[10px] text-on-surface-variant mt-0.5">
                              Diajukan: {formatDate(dok.created_at)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-on-surface">{dok.fungsi_nama ?? '—'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-on-surface">{dok.kegiatan_nama ?? '—'}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs text-on-surface-variant">{formatDate(dok.tanggal)}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <DocumentListStatusBadge status="IN_PPK_VALIDATION" />
                        </TableCell>
                        <TableCell className="text-center">
                          <Button size="icon-xs" variant="ghost" aria-label={`Buka dokumen ${dok.judul}`}>
                            <ChevronRight size={14} />
                          </Button>
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
                    { label: 'Tanggal Ajuan', value: formatDate(dok.tanggal) },
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
