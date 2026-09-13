import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  ArchiveMobileCard,
  ArchiveMobileList,
  ArchiveTableShell,
} from '#/components/archive/ArchivePagePrimitives'
import {
  WorkflowActionButton,
  WorkflowDateCell,
  WorkflowPageHeader,
  WorkflowSearchPanel,
  WorkflowStatusSelect,
  WORKFLOW_TABLE_HEAD_CLASS,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { ApiError, apiFetch } from '#/lib/api-client'
import {
  ChevronRight,
  ClipboardList,
  Clock,
} from 'lucide-react'
import { formatDate } from '#/lib/utils/format'

export const Route = createFileRoute('/arsiparis/inbox')({ component: ArsiparisInboxPage })

type InboxItem = {
  id: string
  judul: string
  fungsi_id: string
  fungsi_nama: string
  kegiatan_jenis_id: string
  kegiatan_nama: string
  nama_pegawai: string
  tahun: number
  tanggal: string
  nominal_realisasi: string | number | null
  source_type: 'WORKFLOW' | 'MANUAL'
  created_at: string
  bendahara_approve_at: string | null
}

type ArsiparisInboxResponse = {
  inbox?: InboxItem[]
  error?: string
}

type SourceFilter = '' | 'WORKFLOW' | 'MANUAL'
type SortOrder = 'newest' | 'oldest' | 'nominal_desc' | 'nominal_asc'

const SOURCE_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Semua Sumber' },
  { value: 'WORKFLOW', label: 'Persetujuan' },
  { value: 'MANUAL', label: 'Manual' },
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'Terbaru Selesai' },
  { value: 'oldest', label: 'Terlama Selesai' },
  { value: 'nominal_desc', label: 'Nominal Tertinggi' },
  { value: 'nominal_asc', label: 'Nominal Terendah' },
]

function ArsiparisInboxPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const json = await apiFetch<ArsiparisInboxResponse>('/arsiparis/inbox')
      setItems(json.inbox ?? [])
    } catch (error) {
      if (error instanceof ApiError) {
        const payload = error.payload
        if (payload && typeof payload === 'object' && 'error' in payload) {
          setError(typeof payload.error === 'string' ? payload.error : 'Gagal memuat dokumen')
        } else {
          setError('Gagal memuat dokumen')
        }
      } else {
        setError('Terjadi kesalahan')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const displayedItems = items
    .filter((item) => {
      const query = search.trim().toLowerCase()
      const matchesSearch = !query
        || item.judul.toLowerCase().includes(query)
        || (item.kegiatan_nama ?? '').toLowerCase().includes(query)
        || (item.fungsi_nama ?? '').toLowerCase().includes(query)
      const matchesSource = !sourceFilter || item.source_type === sourceFilter
      return matchesSearch && matchesSource
    })
    .sort((left, right) => compareInboxItems(left, right, sortOrder))

  function openDocument(dokumen: InboxItem) {
    navigate({ to: '/arsiparis/dokumen/$id', params: { id: dokumen.id } })
  }

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-7 px-7 pt-6 sm:px-8 lg:px-10">
        <WorkflowPageHeader
          variant="list"
          eyebrow={
            <ClipboardList size={22} />
          }
          title="Pengklasifikasian Dokumen"
          description={`${items.length} dokumen selesai PPSPM menunggu pemilihan Cara Pembayaran. Metadata final seperti Nomor SPM dan retensi tetap diisi saat Tutup Berkas.`}
        />

        <WorkflowSearchPanel
          search={search}
          onSearchChange={setSearch}
          placeholder="Cari judul, fungsi, atau kegiatan..."
          resultLabel={`${displayedItems.length} dokumen ditampilkan`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <WorkflowStatusSelect
              value={sourceFilter}
              onChange={(value) => setSourceFilter(value as SourceFilter)}
              options={SOURCE_FILTER_OPTIONS}
              ariaLabel="Filter sumber dokumen"
            />
            <WorkflowStatusSelect
              value={sortOrder}
              onChange={(value) => setSortOrder((value || 'newest') as SortOrder)}
              options={SORT_OPTIONS}
              ariaLabel="Urutan dokumen"
            />
          </div>
          {(sourceFilter || search) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setSourceFilter('')
              }}
              className="rounded-xl"
            >
              Reset
            </Button>
          )}
        </WorkflowSearchPanel>

        {loading ? (
          <LoadingState variant="list" label="Memuat dokumen pengklasifikasian" />
        ) : error ? (
          <ErrorState
            title="Gagal memuat dokumen"
            description={error}
            action={<Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>}
            variant="page"
          />
        ) : displayedItems.length === 0 ? (
          <EmptyState
            title="Tidak ada dokumen"
            description="Dokumen yang telah disetujui PPSPM dan belum diklasifikasikan akan muncul di sini."
            icon={<Clock size={22} />}
          />
        ) : (
          <>
            <ArchiveTableShell>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
                    <th className={`w-16 text-center ${WORKFLOW_TABLE_HEAD_CLASS}`}>No</th>
                    <th className={WORKFLOW_TABLE_HEAD_CLASS}>Judul Dokumen</th>
                    <th className={WORKFLOW_TABLE_HEAD_CLASS}>Kegiatan</th>
                    <th className={`text-center ${WORKFLOW_TABLE_HEAD_CLASS}`}>Nominal Realisasi</th>
                    <th className={WORKFLOW_TABLE_HEAD_CLASS}>Tanggal Selesai</th>
                    <th className={`w-20 text-right ${WORKFLOW_TABLE_HEAD_CLASS}`}>Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-[13px]">
                  {displayedItems.map((dokumen, index) => (
                    <tr
                      key={dokumen.id}
                      className="group cursor-pointer border-zinc-100 bg-[#FFFDF9] transition-colors hover:bg-[#FFF8F1]/70"
                      onClick={() => openDocument(dokumen)}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openDocument(dokumen)
                        }
                      }}
                      aria-label={`Buka pengklasifikasian ${dokumen.judul}`}
                    >
                      <td className="px-6 py-5 text-center text-sm font-normal text-zinc-950">{index + 1}</td>
                      <td className="max-w-[460px] px-6 py-5">
                        <p className="line-clamp-1 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-[#FF4D00]">
                          {dokumen.judul}
                        </p>
                        <p className="mt-1 line-clamp-1 text-xs font-medium text-zinc-500">
                          Persetujuan - {dokumen.fungsi_nama ?? '-'}
                        </p>
                      </td>
                      <td className="max-w-[320px] px-6 py-5">
                        <span className="block truncate text-sm font-normal text-zinc-900">{dokumen.kegiatan_nama ?? '-'}</span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <NominalRealisasiText value={dokumen.nominal_realisasi} />
                      </td>
                      <td className="px-6 py-5">
                        <WorkflowDateCell value={formatInboxFinishedDate(dokumen)} />
                      </td>
                      <td className="px-6 py-5 text-right">
                        <WorkflowActionButton label={`Klasifikasikan ${dokumen.judul}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ArchiveTableShell>
            <ArchiveMobileList>
              {displayedItems.map((dokumen, index) => (
                <ArchiveMobileCard
                  key={dokumen.id}
                  title={dokumen.judul}
                  subtitle={`Persetujuan - ${dokumen.fungsi_nama ?? '-'}`}
                  meta={[
                    { label: 'No', value: index + 1 },
                    { label: 'Kegiatan', value: dokumen.kegiatan_nama ?? '-' },
                    { label: 'Nominal', value: <span className="font-mono font-bold text-zinc-950">{formatInboxNominal(dokumen.nominal_realisasi)}</span> },
                    { label: 'Tanggal selesai', value: formatInboxFinishedDate(dokumen) },
                  ]}
                  action={
                    <Link to="/arsiparis/dokumen/$id" params={{ id: dokumen.id }}>
                      <Button size="sm" variant="outline" className="w-full gap-1.5">
                        <ChevronRight size={14} />
                        Klasifikasikan
                      </Button>
                    </Link>
                  }
                />
              ))}
            </ArchiveMobileList>
          </>
        )}
      </div>
    </PageLayout>
  )
}

function NominalRealisasiText({ value }: { value: string | number | null }) {
  return (
    <span className="inline-flex justify-center font-mono text-sm font-bold text-zinc-950">
      {formatInboxNominal(value)}
    </span>
  )
}

function formatInboxNominal(value: string | number | null): string {
  const numeric = normalizeNominal(value)
  if (numeric === null) return '-'

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(numeric)
}

function normalizeNominal(value: string | number | null): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function formatInboxFinishedDate(item: InboxItem): string {
  return item.bendahara_approve_at ? formatDate(item.bendahara_approve_at) : formatDate(item.tanggal)
}

function compareInboxItems(left: InboxItem, right: InboxItem, sortOrder: SortOrder): number {
  if (sortOrder === 'nominal_desc' || sortOrder === 'nominal_asc') {
    const leftNominal = normalizeNominal(left.nominal_realisasi) ?? 0
    const rightNominal = normalizeNominal(right.nominal_realisasi) ?? 0
    return sortOrder === 'nominal_desc' ? rightNominal - leftNominal : leftNominal - rightNominal
  }

  const leftDate = new Date(left.bendahara_approve_at ?? left.created_at ?? left.tanggal).getTime()
  const rightDate = new Date(right.bendahara_approve_at ?? right.created_at ?? right.tanggal).getTime()
  return sortOrder === 'oldest' ? leftDate - rightDate : rightDate - leftDate
}
