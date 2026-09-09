import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Banknote,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ClipboardList,
  FileText,
  Filter,
  FolderOpen,
  Inbox,
  Search,
  Users,
} from 'lucide-react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { PegawaiPanel } from '#/components/pegawai/PegawaiPagePrimitives'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { DatePicker } from '#/components/ui/date-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { StatusBadge } from '#/components/ui/StatusBadge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import type { MonitoringRealisasiGroupBy } from '#/components/kinerja/monitoringRealisasiNavigation'
import { ApiError, apiFetch } from '#/lib/api-client'

type LaporanKinerjaRow = {
  id: string
  judul: string
  status: 'COMPLETED' | 'TERSIMPAN' | 'ARCHIVED'
  is_non_material: boolean
  fungsi_nama: string | null
  kegiatan_nama: string | null
  tahun: number
  tanggal: string
  pengaju_id: string | null
  pengaju_nama: string
  created_at: string
  updated_at: string
  nominal_realisasi: number | null
}

type LaporanKinerjaResponse = {
  dokumen?: LaporanKinerjaRow[]
  meta?: {
    limit: number
    final_statuses: Array<'COMPLETED' | 'TERSIMPAN' | 'ARCHIVED'>
  }
  error?: string
}

type SortMode = 'updated_desc' | 'nominal_desc' | 'documents_desc' | 'name_asc'
type DetailSortMode = 'newest' | 'oldest' | 'title_asc' | 'submitter_asc' | 'nominal_desc'
type StatusFilter = 'ALL' | LaporanKinerjaRow['status']
type JenisFilter = 'ALL' | 'MATERIAL' | 'NON_MATERIAL'

type FungsiRow = {
  id: string
  nama: string
  dokumen: LaporanKinerjaRow[]
  kegiatan: KegiatanRow[]
  totalNominal: number
  latestDate: string | null
}

type PegawaiRow = {
  id: string
  nama: string
  dokumen: LaporanKinerjaRow[]
  fungsi: FungsiRow[]
  totalNominal: number
  latestDate: string | null
}

type KegiatanRow = {
  id: string
  fungsiId: string
  nama: string
  fungsiNama: string
  dokumen: LaporanKinerjaRow[]
  totalNominal: number
  latestDate: string | null
}

type DetailFilterValue = {
  status: StatusFilter
  jenis: JenisFilter
  tanggalMulai?: string
  tanggalAkhir?: string
}

export type MonitoringRealisasiViewProps = {
  fungsiId?: string
  kegiatanId?: string
  pegawaiId?: string
  groupBy?: MonitoringRealisasiGroupBy
  onSelectFungsi: (fungsiId: string | null) => void
  onSelectKegiatan: (fungsiId: string, kegiatanId: string | null) => void
  onSelectPegawai?: (pegawaiId: string | null) => void
  onSelectGroupBy?: (mode: MonitoringRealisasiGroupBy) => void
  title?: string
  description?: string
  forbiddenTitle?: string
  forbiddenDescription?: string
  loadingLabel?: string
}

const DEFAULT_TITLE = 'Laporan Kinerja'
const DEFAULT_DESCRIPTION = 'Pantau dokumen final berdasarkan kegiatan atau berdasarkan pegawai.'
const DEFAULT_FORBIDDEN_TITLE = 'Akses Ditolak'
const DEFAULT_FORBIDDEN_DESCRIPTION =
  'Laporan Kinerja hanya dapat diakses oleh Penanggung Jawab Kinerja yang ditetapkan melalui otorisasi server.'
const DEFAULT_LOADING_LABEL = 'Memuat Laporan Kinerja'

const TABLE_HEAD_CLASS = 'px-6 py-4 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500'

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'updated_desc', label: 'Terakhir diperbarui' },
  { value: 'nominal_desc', label: 'Nominal terbesar' },
  { value: 'documents_desc', label: 'Dokumen terbanyak' },
  { value: 'name_asc', label: 'Nama A-Z' },
]

const DETAIL_SORT_OPTIONS: { value: DetailSortMode; label: string }[] = [
  { value: 'newest', label: 'Tanggal terbaru' },
  { value: 'oldest', label: 'Tanggal terlama' },
  { value: 'title_asc', label: 'Judul A-Z' },
  { value: 'submitter_asc', label: 'Pembuat A-Z' },
  { value: 'nominal_desc', label: 'Nominal terbesar' },
]

const EMPTY_DETAIL_FILTER: DetailFilterValue = {
  status: 'ALL',
  jenis: 'ALL',
}

const GROUP_BY_OPTIONS: { value: MonitoringRealisasiGroupBy; label: string }[] = [
  { value: 'kegiatan', label: 'Fungsi' },
  { value: 'pegawai', label: 'Pegawai' },
]

export function MonitoringRealisasiView({
  fungsiId,
  kegiatanId,
  pegawaiId,
  groupBy = 'kegiatan',
  onSelectFungsi,
  onSelectKegiatan,
  onSelectPegawai,
  onSelectGroupBy,
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  forbiddenTitle = DEFAULT_FORBIDDEN_TITLE,
  forbiddenDescription = DEFAULT_FORBIDDEN_DESCRIPTION,
  loadingLabel = DEFAULT_LOADING_LABEL,
}: MonitoringRealisasiViewProps) {
  const pegawaiModeEnabled = typeof onSelectPegawai === 'function' && typeof onSelectGroupBy === 'function'
  const activeGroupBy: MonitoringRealisasiGroupBy = pegawaiModeEnabled ? groupBy : 'kegiatan'
  const [dokumen, setDokumen] = useState<LaporanKinerjaRow[]>([])
  const [limit, setLimit] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortMode>('updated_desc')
  const [detailSearch, setDetailSearch] = useState('')
  const [detailSortBy, setDetailSortBy] = useState<DetailSortMode>('newest')
  const [detailFilter, setDetailFilter] = useState<DetailFilterValue>(EMPTY_DETAIL_FILTER)
  const [detailFilterOpen, setDetailFilterOpen] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<LaporanKinerjaRow | null>(null)

  useEffect(() => {
    apiFetch<LaporanKinerjaResponse>('/laporan/kinerja')
      .then((data) => {
        if (data.error) {
          setError(data.error)
          return
        }

        setDokumen(data.dokumen ?? [])
        setLimit(data.meta?.limit ?? null)
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          if (err.status === 403) {
            setForbidden(true)
            return
          }

          const payload = err.payload
          if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
            setError(payload.error)
            return
          }
        }

        setError('Gagal memuat data. Coba muat ulang halaman.')
      })
      .finally(() => setLoading(false))
  }, [])

  const fungsiRows = useMemo(() => buildFungsiRows(dokumen), [dokumen])
  const pegawaiRows = useMemo(() => buildPegawaiRows(dokumen), [dokumen])

  const satkerSummary = useMemo(
    () => ({
      totalRealisasi: totalNominal(dokumen),
      dokumenCount: dokumen.length,
      fungsiCount: fungsiRows.length,
      pegawaiCount: pegawaiRows.length,
      periode: satkerPeriodeLabel(dokumen),
    }),
    [dokumen, fungsiRows, pegawaiRows],
  )

  const selectedPegawai = useMemo(() => {
    if (activeGroupBy !== 'pegawai' || !pegawaiId) return null
    return pegawaiRows.find(row => row.id === pegawaiId) ?? null
  }, [activeGroupBy, pegawaiId, pegawaiRows])

  const activeFungsiRows = useMemo(() => {
    return activeGroupBy === 'pegawai' ? selectedPegawai?.fungsi ?? [] : fungsiRows
  }, [activeGroupBy, fungsiRows, selectedPegawai])

  const selectedFungsi = useMemo(() => {
    return activeFungsiRows.find(row => row.id === fungsiId) ?? null
  }, [activeFungsiRows, fungsiId])

  const selectedKegiatan = useMemo(() => {
    if (!selectedFungsi) return null
    return selectedFungsi.kegiatan.find(row => row.id === kegiatanId) ?? null
  }, [kegiatanId, selectedFungsi])

  const filteredPegawaiRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return pegawaiRows
      .filter(row => {
        if (!query) return true
        return [
          row.nama,
          ...row.fungsi.map(fungsi => fungsi.nama),
          ...row.dokumen.map(item => item.judul),
          ...row.dokumen.map(item => item.kegiatan_nama ?? ''),
        ].some(value => value.toLowerCase().includes(query))
      })
      .sort((a, b) => compareNamedRows(a, b, sortBy))
  }, [pegawaiRows, search, sortBy])

  const filteredFungsiRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return activeFungsiRows
      .filter(row => {
        if (!query) return true
        return [
          row.nama,
          ...row.kegiatan.map(kegiatan => kegiatan.nama),
          ...row.dokumen.map(item => item.judul),
          ...row.dokumen.map(item => item.pengaju_nama),
        ].some(value => value.toLowerCase().includes(query))
      })
      .sort((a, b) => compareNamedRows(a, b, sortBy))
  }, [activeFungsiRows, search, sortBy])

  const filteredKegiatanRows = useMemo(() => {
    if (!selectedFungsi) return []
    const query = search.trim().toLowerCase()
    return selectedFungsi.kegiatan
      .filter(row => {
        if (!query) return true
        return [
          row.nama,
          row.fungsiNama,
          ...row.dokumen.map(item => item.judul),
          ...row.dokumen.map(item => item.pengaju_nama),
        ].some(value => value.toLowerCase().includes(query))
      })
      .sort((a, b) => compareNamedRows(a, b, sortBy))
  }, [search, selectedFungsi, sortBy])

  const selectedDocuments = useMemo(() => {
    if (!selectedKegiatan) return []
    const query = detailSearch.trim().toLowerCase()
    return selectedKegiatan.dokumen
      .filter(row => {
        if (detailFilter.status !== 'ALL' && row.status !== detailFilter.status) return false
        if (detailFilter.jenis === 'MATERIAL' && row.is_non_material) return false
        if (detailFilter.jenis === 'NON_MATERIAL' && !row.is_non_material) return false
        if (detailFilter.tanggalMulai && row.tanggal < detailFilter.tanggalMulai) return false
        if (detailFilter.tanggalAkhir && row.tanggal > detailFilter.tanggalAkhir) return false
        if (!query) return true

        return [
          row.judul,
          row.fungsi_nama ?? '',
          row.kegiatan_nama ?? '',
          row.pengaju_nama,
          String(row.tahun),
          formatJenis(row),
          formatStatusLabel(row.status),
        ].some(value => value.toLowerCase().includes(query))
      })
      .sort((a, b) => compareDocuments(a, b, detailSortBy))
  }, [detailFilter, detailSearch, detailSortBy, selectedKegiatan])

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-7 px-7 pt-6 sm:px-8 lg:px-10">
        {loading && <LoadingState label={loadingLabel} rows={5} />}

        {!loading && forbidden && (
          <ErrorState
            title={forbiddenTitle}
            description={forbiddenDescription}
            variant="page"
            action={
              <Button onClick={() => { window.location.href = '/' }}>
                Kembali ke Dashboard
              </Button>
            }
          />
        )}

        {!loading && !forbidden && error && (
          <ErrorState
            title={`Gagal memuat ${title}`}
            description={error}
            variant="destructive"
          />
        )}

        {!loading && !forbidden && !error && dokumen.length === 0 && (
          <>
            <KinerjaHeader title={title} description={description} />
            <EmptyState
              icon={<Inbox className="h-5 w-5" />}
              title="Belum ada dokumen final"
              description="Dokumen final dengan status Selesai, Tersimpan, dan Diarsipkan akan muncul di sini sebagai metadata Laporan Kinerja."
            />
          </>
        )}

        {!loading && !forbidden && !error && dokumen.length > 0 && !selectedFungsi && !selectedPegawai && (
          <>
            <div className="space-y-4">
              <KinerjaHeader title={title} description={description} />
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                {pegawaiModeEnabled && onSelectGroupBy ? (
                  <GroupByToggle value={activeGroupBy} onChange={onSelectGroupBy} />
                ) : (
                  <span />
                )}
                <SatkerSummaryBand
                  totalRealisasi={satkerSummary.totalRealisasi}
                  dokumenCount={satkerSummary.dokumenCount}
                  primaryCountLabel={activeGroupBy === 'pegawai' ? 'Pegawai' : 'Fungsi'}
                  primaryCountValue={activeGroupBy === 'pegawai' ? satkerSummary.pegawaiCount : satkerSummary.fungsiCount}
                  periode={satkerSummary.periode}
                />
              </div>
            </div>

            {activeGroupBy === 'pegawai' ? (
              <>
                <SimpleReportToolbar
                  search={search}
                  onSearchChange={setSearch}
                  searchLabel={`Cari pegawai ${title}`}
                  placeholder="Cari pegawai, fungsi, atau kegiatan..."
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  resultLabel={`${filteredPegawaiRows.length} pegawai ditampilkan`}
                />

                {filteredPegawaiRows.length === 0 ? (
                  <EmptyState
                    icon={<Search className="h-5 w-5" />}
                    title="Tidak ada pegawai yang cocok"
                    description="Ubah kata kunci atau urutan untuk melihat pegawai lain."
                    compact
                  />
                ) : (
                  <PegawaiList rows={filteredPegawaiRows} onSelect={(id) => onSelectPegawai?.(id)} />
                )}
              </>
            ) : (
              <>
                <SimpleReportToolbar
                  search={search}
                  onSearchChange={setSearch}
                  searchLabel={`Cari fungsi ${title}`}
                  placeholder="Cari fungsi, kegiatan, atau dokumen..."
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  resultLabel={`${filteredFungsiRows.length} fungsi ditampilkan`}
                />

                {filteredFungsiRows.length === 0 ? (
                  <EmptyState
                    icon={<Search className="h-5 w-5" />}
                    title="Tidak ada fungsi yang cocok"
                    description="Ubah kata kunci atau urutan untuk melihat fungsi lain."
                    compact
                  />
                ) : (
                  <FungsiList rows={filteredFungsiRows} onSelect={onSelectFungsi} />
                )}
              </>
            )}
          </>
        )}

        {!loading && !forbidden && !error && activeGroupBy === 'pegawai' && selectedPegawai && !selectedFungsi && (
          <PegawaiDetailView
            pegawai={selectedPegawai}
            rows={filteredFungsiRows}
            title={title}
            search={search}
            onSearchChange={setSearch}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onBack={() => onSelectPegawai?.(null)}
            onSelectFungsi={onSelectFungsi}
          />
        )}

        {!loading && !forbidden && !error && selectedFungsi && !selectedKegiatan && (
          <FungsiDetailView
            fungsi={selectedFungsi}
            rows={filteredKegiatanRows}
            title={title}
            search={search}
            onSearchChange={setSearch}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onBack={() => onSelectFungsi(null)}
            onSelectKegiatan={(id) => onSelectKegiatan(selectedFungsi.id, id)}
          />
        )}

        {!loading && !forbidden && !error && selectedFungsi && selectedKegiatan && (
          <KegiatanDocumentView
            fungsi={selectedFungsi}
            kegiatan={selectedKegiatan}
            dokumen={selectedDocuments}
            totalDokumen={selectedKegiatan.dokumen.length}
            limit={limit}
            search={detailSearch}
            onSearchChange={setDetailSearch}
            filter={detailFilter}
            onFilterChange={setDetailFilter}
            filterOpen={detailFilterOpen}
            onFilterOpenChange={setDetailFilterOpen}
            sortBy={detailSortBy}
            onSortChange={setDetailSortBy}
            onBack={() => onSelectKegiatan(selectedFungsi.id, null)}
            onOpenDocument={setSelectedDocument}
          />
        )}

        {selectedDocument && (
          <KinerjaDocumentMetadataDialog
            dokumen={selectedDocument}
            title={title}
            onClose={() => setSelectedDocument(null)}
          />
        )}
      </div>
    </PageLayout>
  )
}

function KinerjaHeader({ title, description }: { title: string; description: string }) {
  return (
    <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-5">
        <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-orange-100 bg-[#FFF6EA] text-orange-600 shadow-[0_2px_8px_rgba(251,146,60,0.14)]">
          <ClipboardList size={22} />
        </div>
        <div className="min-w-0">
          <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[30px]">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-zinc-700">
            {description}
          </p>
        </div>
      </div>
      <div className="rounded-[18px] border border-orange-100 bg-[#FFFDF9] px-4 py-3 text-xs font-bold text-orange-800 shadow-sm">
        Metadata dokumen final saja.
      </div>
    </section>
  )
}

function GroupByToggle({
  value,
  onChange,
}: {
  value: MonitoringRealisasiGroupBy
  onChange: (value: MonitoringRealisasiGroupBy) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400 sm:inline">
        Berdasarkan
      </span>
      <div
        role="group"
        aria-label="Tampilkan monitoring berdasarkan"
        className="inline-flex rounded-[10px] border border-zinc-200/80 bg-zinc-50 p-0.5"
      >
        {GROUP_BY_OPTIONS.map(option => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={[
                'rounded-[7px] px-3 py-1 text-[13px] font-semibold transition',
                active
                  ? 'bg-white text-[#FF4D00] shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800',
              ].join(' ')}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SatkerSummaryBand({
  totalRealisasi,
  dokumenCount,
  primaryCountLabel,
  primaryCountValue,
  periode,
}: {
  totalRealisasi: number
  dokumenCount: number
  primaryCountLabel: 'Fungsi' | 'Pegawai'
  primaryCountValue: number
  periode: string | null
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[#7DD7A9] bg-[#EAFBF2] px-3.5 py-2.5 shadow-[0_2px_0_rgba(16,185,129,0.18)]">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#62C995] bg-white/70 text-[#16A35D] shadow-sm shadow-emerald-900/5">
          <Banknote size={17} />
        </span>
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase tracking-[0.13em] text-[#00713A]">
            Total Realisasi Satker{periode ? ` · ${periode}` : ''}
          </span>
          <span className="font-mono text-[19px] font-extrabold leading-tight tracking-tight text-[#02170B] sm:text-[21px]">
            {formatCurrency(totalRealisasi)}
          </span>
        </div>
      </div>
      <span className="hidden h-9 w-px shrink-0 bg-[#7DD7A9]/70 sm:block" />
      <div className="flex items-center gap-5">
        <MiniStat label="Dokumen Final" value={dokumenCount.toLocaleString('id-ID')} />
        <MiniStat label={primaryCountLabel} value={primaryCountValue.toLocaleString('id-ID')} />
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-black uppercase tracking-[0.12em] text-[#0B6B3D]/75">{label}</span>
      <span className="font-headline text-[15px] font-bold tracking-tight text-[#02170B]">{value}</span>
    </div>
  )
}

function SimpleReportToolbar({
  search,
  onSearchChange,
  searchLabel,
  placeholder,
  sortBy,
  onSortChange,
  resultLabel,
}: {
  search: string
  onSearchChange: (value: string) => void
  searchLabel: string
  placeholder: string
  sortBy: SortMode
  onSortChange: (value: SortMode) => void
  resultLabel: string
}) {
  return (
    <div className="overflow-hidden rounded-[26px] border border-zinc-200/80 bg-[#FFFDF9] shadow-[0_3px_14px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative min-w-0 flex-1 lg:max-w-xl">
          <span className="sr-only">{searchLabel}</span>
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            type="search"
            placeholder={placeholder}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-11 w-full rounded-[20px] border border-zinc-200 bg-[#FFFDF9] pl-11 pr-4 text-sm font-medium text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-orange-200 focus:ring-4 focus:ring-orange-100/60"
          />
        </label>
        <label>
          <span className="sr-only">Urutkan daftar</span>
          <Select value={sortBy} onValueChange={(value) => onSortChange(value as SortMode)}>
            <SelectTrigger className="min-h-10 w-full rounded-xl border-[#F0E1D5] bg-[#FFFAF6] px-4 text-sm font-semibold hover:border-[#FFBC80] sm:w-fit">
              <SelectValue placeholder="Terakhir diperbarui">
                {selected => SORT_OPTIONS.find(option => option.value === selected)?.label ?? 'Terakhir diperbarui'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <div className="px-5 py-4 text-sm font-bold text-zinc-950">
        {resultLabel}
      </div>
    </div>
  )
}

function PegawaiList({ rows, onSelect }: { rows: PegawaiRow[]; onSelect: (id: string) => void }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-[#FFFDF9] shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block">
        <Table className="text-left">
          <TableHeader>
            <TableRow className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
              <TableHead className={TABLE_HEAD_CLASS}>Pegawai</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Jumlah Fungsi</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Jumlah Kegiatan</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Jumlah Dokumen</TableHead>
              <TableHead className={`text-center ${TABLE_HEAD_CLASS}`}>Total Nominal Realisasi</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Terakhir Diperbarui</TableHead>
              <TableHead className={`w-20 text-right ${TABLE_HEAD_CLASS}`}>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-zinc-100 text-[13px]">
            {rows.map(row => (
              <TableRow
                key={row.id}
                className="group cursor-pointer border-zinc-100 bg-[#FFFDF9] transition-colors hover:bg-[#FFF8F1]/70"
                onClick={() => onSelect(row.id)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(row.id)
                  }
                }}
              >
                <TableCell className="max-w-[420px] px-6 py-5">
                  <p className="line-clamp-2 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-[#FF4D00]">{row.nama}</p>
                  <p className="mt-1 text-xs font-medium text-zinc-500">Pengaju Dokumen</p>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <CountPill>{row.fungsi.length} fungsi</CountPill>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <CountPill>{countKegiatan(row.fungsi)} kegiatan</CountPill>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <CountPill>{row.dokumen.length} dokumen</CountPill>
                </TableCell>
                <TableCell className="px-6 py-5 text-center font-mono text-sm font-bold text-[#FF4D00]">
                  {formatCurrency(row.totalNominal)}
                </TableCell>
                <TableCell className="px-6 py-5">
                  {row.latestDate ? <DateCell value={row.latestDate} /> : <span className="text-sm font-semibold text-zinc-500">-</span>}
                </TableCell>
                <TableCell className="px-6 py-5 text-right">
                  <ChevronActionButton label={`Detail pegawai ${row.nama}`} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map(row => (
          <PegawaiPanel key={row.id} className="group space-y-3 border-zinc-200/80 p-4 shadow-[0_2px_10px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700/70">Pegawai</p>
                <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-950">{row.nama}</h2>
              </div>
              <CountPill>{row.dokumen.length}</CountPill>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
              <InfoTile label="Fungsi" value={`${row.fungsi.length} fungsi`} />
              <InfoTile label="Kegiatan" value={`${countKegiatan(row.fungsi)} kegiatan`} />
              <InfoTile label="Diperbarui" value={row.latestDate ? <DateCell value={row.latestDate} className="mt-1" /> : '-'} />
              <InfoTile
                label="Nominal"
                value={<span className="font-mono font-bold text-zinc-950">{formatCurrency(row.totalNominal)}</span>}
              />
            </div>
            <div className="border-t border-zinc-100 pt-3">
              <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => onSelect(row.id)}>
                Detail Pegawai
                <ChevronRight size={14} />
              </Button>
            </div>
          </PegawaiPanel>
        ))}
      </div>
    </>
  )
}

function PegawaiDetailView({
  pegawai,
  rows,
  title,
  search,
  onSearchChange,
  sortBy,
  onSortChange,
  onBack,
  onSelectFungsi,
}: {
  pegawai: PegawaiRow
  rows: FungsiRow[]
  title: string
  search: string
  onSearchChange: (value: string) => void
  sortBy: SortMode
  onSortChange: (value: SortMode) => void
  onBack: () => void
  onSelectFungsi: (id: string) => void
}) {
  return (
    <>
      <ReportBackHeader
        title={pegawai.nama}
        subtitle={`${title} / Pegawai`}
        description="Daftar fungsi dan kegiatan dari dokumen final yang diajukan pegawai ini."
        onBack={onBack}
        backLabel="Kembali ke daftar pegawai"
      />
      <PegawaiDetailCards pegawai={pegawai} />
      <SimpleReportToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchLabel={`Cari fungsi pegawai ${title}`}
        placeholder="Cari fungsi, kegiatan, atau dokumen..."
        sortBy={sortBy}
        onSortChange={onSortChange}
        resultLabel={`${rows.length} dari ${pegawai.fungsi.length} fungsi ditampilkan`}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="Tidak ada fungsi yang cocok"
          description="Ubah kata kunci atau urutan untuk melihat fungsi lain."
          compact
        />
      ) : (
        <FungsiList rows={rows} onSelect={onSelectFungsi} />
      )}
    </>
  )
}

function PegawaiDetailCards({ pegawai }: { pegawai: PegawaiRow }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        label="Nama Pegawai"
        value={pegawai.nama}
        detail="Pengaju Dokumen Final"
        icon={<Users size={16} />}
        className="border-[#E1D7CB] bg-[#FFFDF9]"
        labelClassName="text-[#5F3B22]"
        iconClassName="border-[#D8CDC1] text-[#6D6258]"
      />
      <SummaryCard
        label="Jumlah Fungsi"
        value={pegawai.fungsi.length.toLocaleString('id-ID')}
        detail={`${countKegiatan(pegawai.fungsi).toLocaleString('id-ID')} Kegiatan Terkait`}
        icon={<FolderOpen size={16} />}
        className="border-[#F1D38A] bg-[#FFF8E6]"
        labelClassName="text-[#7A4A00]"
        iconClassName="border-[#E5BD55] text-[#B77900]"
      />
      <SummaryCard
        label="Total Dokumen Final"
        value={pegawai.dokumen.length.toLocaleString('id-ID')}
        detail="Dokumen Terverifikasi"
        icon={<FileText size={16} />}
        className="border-[#FDBA91] bg-[#FFF1E8]"
        labelClassName="text-[#B83200]"
        iconClassName="border-[#FF8A4C] text-[#FF5A14]"
      />
      <SummaryCard
        label="Total Nominal Realisasi"
        value={formatCurrency(pegawai.totalNominal)}
        detail="Hanya Belanja Material"
        icon={<Banknote size={16} />}
        className="border-[#7DD7A9] bg-[#EAFBF2] shadow-[0_2px_0_rgba(16,185,129,0.18)]"
        labelClassName="text-[#006B35]"
        valueClassName="font-mono text-[24px] text-[#02170B]"
        detailClassName="text-[#006B35]"
        iconClassName="border-[#62C995] text-[#16A35D]"
      />
    </div>
  )
}

function FungsiList({ rows, onSelect }: { rows: FungsiRow[]; onSelect: (id: string) => void }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-[#FFFDF9] shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block">
        <Table className="text-left">
          <TableHeader>
            <TableRow className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
              <TableHead className={TABLE_HEAD_CLASS}>Fungsi</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Jumlah Kegiatan</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Jumlah Dokumen</TableHead>
              <TableHead className={`text-center ${TABLE_HEAD_CLASS}`}>Total Nominal Realisasi</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Terakhir Diperbarui</TableHead>
              <TableHead className={`w-20 text-right ${TABLE_HEAD_CLASS}`}>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-zinc-100 text-[13px]">
            {rows.map(row => (
              <TableRow
                key={row.id}
                className="group cursor-pointer border-zinc-100 bg-[#FFFDF9] transition-colors hover:bg-[#FFF8F1]/70"
                onClick={() => onSelect(row.id)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(row.id)
                  }
                }}
              >
                <TableCell className="max-w-[420px] px-6 py-5">
                  <p className="line-clamp-2 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-[#FF4D00]">{row.nama}</p>
                  <p className="mt-1 text-xs font-medium text-zinc-500">BPS Kabupaten / Kota</p>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <CountPill>{row.kegiatan.length} kegiatan</CountPill>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <CountPill>{row.dokumen.length} dokumen</CountPill>
                </TableCell>
                <TableCell className="px-6 py-5 text-center font-mono text-sm font-bold text-[#FF4D00]">
                  {formatCurrency(row.totalNominal)}
                </TableCell>
                <TableCell className="px-6 py-5">
                  {row.latestDate ? <DateCell value={row.latestDate} /> : <span className="text-sm font-semibold text-zinc-500">-</span>}
                </TableCell>
                <TableCell className="px-6 py-5 text-right">
                  <ChevronActionButton label={`Detail fungsi ${row.nama}`} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map(row => (
          <PegawaiPanel key={row.id} className="group space-y-3 border-zinc-200/80 p-4 shadow-[0_2px_10px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700/70">Fungsi</p>
                <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-950">{row.nama}</h2>
              </div>
              <CountPill>{row.dokumen.length}</CountPill>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
              <InfoTile label="Kegiatan" value={`${row.kegiatan.length} kegiatan`} />
              <InfoTile label="Diperbarui" value={row.latestDate ? <DateCell value={row.latestDate} className="mt-1" /> : '-'} />
              <InfoTile
                label="Nominal"
                value={<span className="font-mono font-bold text-zinc-950">{formatCurrency(row.totalNominal)}</span>}
                className="col-span-2"
              />
            </div>
            <div className="border-t border-zinc-100 pt-3">
              <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => onSelect(row.id)}>
                Detail Fungsi
                <ChevronRight size={14} />
              </Button>
            </div>
          </PegawaiPanel>
        ))}
      </div>
    </>
  )
}

function FungsiDetailView({
  fungsi,
  rows,
  title,
  search,
  onSearchChange,
  sortBy,
  onSortChange,
  onBack,
  onSelectKegiatan,
}: {
  fungsi: FungsiRow
  rows: KegiatanRow[]
  title: string
  search: string
  onSearchChange: (value: string) => void
  sortBy: SortMode
  onSortChange: (value: SortMode) => void
  onBack: () => void
  onSelectKegiatan: (id: string) => void
}) {
  return (
    <>
      <ReportBackHeader
        title={fungsi.nama}
        subtitle={`${title} / Fungsi`}
        description="Daftar kegiatan dan dokumen final pada fungsi terpilih."
        onBack={onBack}
        backLabel="Kembali ke daftar fungsi"
      />
      <FungsiDetailCards fungsi={fungsi} />
      <SimpleReportToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchLabel={`Cari kegiatan ${title}`}
        placeholder="Cari kegiatan atau dokumen..."
        sortBy={sortBy}
        onSortChange={onSortChange}
        resultLabel={`${rows.length} dari ${fungsi.kegiatan.length} kegiatan ditampilkan`}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="Tidak ada kegiatan yang cocok"
          description="Ubah kata kunci atau urutan untuk melihat kegiatan lain."
          compact
        />
      ) : (
        <KegiatanList rows={rows} onSelect={onSelectKegiatan} />
      )}
    </>
  )
}

function FungsiDetailCards({ fungsi }: { fungsi: FungsiRow }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        label="Nama Fungsi"
        value={fungsi.nama}
        detail="BPS Kabupaten / Kota"
        icon={<FolderOpen size={16} />}
        className="border-[#E1D7CB] bg-[#FFFDF9]"
        labelClassName="text-[#5F3B22]"
        iconClassName="border-[#D8CDC1] text-[#6D6258]"
      />
      <SummaryCard
        label="Jumlah Kegiatan"
        value={fungsi.kegiatan.length.toLocaleString('id-ID')}
        detail="Kegiatan Terdaftar"
        icon={<ClipboardList size={16} />}
        className="border-[#F1D38A] bg-[#FFF8E6]"
        labelClassName="text-[#7A4A00]"
        iconClassName="border-[#E5BD55] text-[#B77900]"
      />
      <SummaryCard
        label="Total Dokumen Final"
        value={fungsi.dokumen.length.toLocaleString('id-ID')}
        detail="Dokumen Terverifikasi"
        icon={<FileText size={16} />}
        className="border-[#FDBA91] bg-[#FFF1E8]"
        labelClassName="text-[#B83200]"
        iconClassName="border-[#FF8A4C] text-[#FF5A14]"
      />
      <SummaryCard
        label="Total Nominal Realisasi"
        value={formatCurrency(fungsi.totalNominal)}
        detail="Hanya Belanja Material"
        icon={<Banknote size={16} />}
        className="border-[#7DD7A9] bg-[#EAFBF2] shadow-[0_2px_0_rgba(16,185,129,0.18)]"
        labelClassName="text-[#006B35]"
        valueClassName="font-mono text-[24px] text-[#02170B]"
        detailClassName="text-[#006B35]"
        iconClassName="border-[#62C995] text-[#16A35D]"
      />
    </div>
  )
}

function KegiatanList({ rows, onSelect }: { rows: KegiatanRow[]; onSelect: (id: string) => void }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-[#FFFDF9] shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block">
        <Table className="text-left">
          <TableHeader>
            <TableRow className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
              <TableHead className={TABLE_HEAD_CLASS}>Nama Kegiatan</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Jumlah Dokumen</TableHead>
              <TableHead className={`text-center ${TABLE_HEAD_CLASS}`}>Total Nominal Realisasi</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Status Ringkas</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Terakhir Diperbarui</TableHead>
              <TableHead className={`w-20 text-right ${TABLE_HEAD_CLASS}`}>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-zinc-100 text-[13px]">
            {rows.map(row => (
              <TableRow
                key={row.id}
                className="group cursor-pointer border-zinc-100 bg-[#FFFDF9] transition-colors hover:bg-[#FFF8F1]/70"
                onClick={() => onSelect(row.id)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelect(row.id)
                  }
                }}
              >
                <TableCell className="max-w-[460px] px-6 py-5">
                  <p className="line-clamp-2 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-[#FF4D00]">{row.nama}</p>
                  <p className="mt-1 text-xs font-medium text-zinc-500">{row.fungsiNama}</p>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <CountPill>{row.dokumen.length} dokumen</CountPill>
                </TableCell>
                <TableCell className="px-6 py-5 text-center font-mono text-sm font-bold text-zinc-950">
                  {formatCurrency(row.totalNominal)}
                </TableCell>
                <TableCell className="px-6 py-5">
                  <StatusSummary dokumen={row.dokumen} />
                </TableCell>
                <TableCell className="px-6 py-5">
                  {row.latestDate ? <DateCell value={row.latestDate} /> : <span className="text-sm font-semibold text-zinc-500">-</span>}
                </TableCell>
                <TableCell className="px-6 py-5 text-right">
                  <ChevronActionButton label={`Detail kegiatan ${row.nama}`} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map(row => (
          <PegawaiPanel key={row.id} className="group space-y-3 border-zinc-200/80 p-4 shadow-[0_2px_10px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700/70">Kegiatan</p>
                <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-950">{row.nama}</h2>
              </div>
              <CountPill>{row.dokumen.length}</CountPill>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
              <InfoTile label="Diperbarui" value={row.latestDate ? <DateCell value={row.latestDate} className="mt-1" /> : '-'} />
              <InfoTile label="Status" value={<StatusSummary dokumen={row.dokumen} />} />
              <InfoTile
                label="Nominal"
                value={<span className="font-mono font-bold text-zinc-950">{formatCurrency(row.totalNominal)}</span>}
                className="col-span-2"
              />
            </div>
            <div className="border-t border-zinc-100 pt-3">
              <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => onSelect(row.id)}>
                Detail Kegiatan
                <ChevronRight size={14} />
              </Button>
            </div>
          </PegawaiPanel>
        ))}
      </div>
    </>
  )
}

function KegiatanDocumentView({
  fungsi,
  kegiatan,
  dokumen,
  totalDokumen,
  limit,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  filterOpen,
  onFilterOpenChange,
  sortBy,
  onSortChange,
  onBack,
  onOpenDocument,
}: {
  fungsi: FungsiRow
  kegiatan: KegiatanRow
  dokumen: LaporanKinerjaRow[]
  totalDokumen: number
  limit: number | null
  search: string
  onSearchChange: (value: string) => void
  filter: DetailFilterValue
  onFilterChange: (value: DetailFilterValue) => void
  filterOpen: boolean
  onFilterOpenChange: (value: boolean) => void
  sortBy: DetailSortMode
  onSortChange: (value: DetailSortMode) => void
  onBack: () => void
  onOpenDocument: (dokumen: LaporanKinerjaRow) => void
}) {
  const activeFilters = countActiveDetailFilters(filter)

  return (
    <>
      <ReportBackHeader
        title={kegiatan.nama}
        subtitle={`${fungsi.nama} / Detail Kegiatan`}
        description="Daftar dokumen final dalam kegiatan terpilih."
        onBack={onBack}
        backLabel="Kembali ke detail fungsi"
      />
      <KegiatanDetailCards kegiatan={kegiatan} />
      <KegiatanDetailToolbar
        search={search}
        onSearchChange={onSearchChange}
        filter={filter}
        onFilterChange={onFilterChange}
        filterOpen={filterOpen}
        onFilterOpenChange={onFilterOpenChange}
        activeFilters={activeFilters}
        sortBy={sortBy}
        onSortChange={onSortChange}
        resultLabel={`${dokumen.length} dari ${totalDokumen} dokumen ditampilkan`}
      />
      {dokumen.length === 0 ? (
        <EmptyState
          title="Tidak ada dokumen yang cocok"
          description="Ubah kata kunci atau filter untuk melihat dokumen lain dalam kegiatan ini."
          icon={<Search size={20} />}
        />
      ) : (
        <DocumentTable
          dokumen={dokumen}
          totalLimit={limit}
          onOpenDocument={onOpenDocument}
        />
      )}
    </>
  )
}

function ReportBackHeader({
  title,
  subtitle,
  description,
  onBack,
  backLabel,
}: {
  title: string
  subtitle: string
  description: string
  onBack: () => void
  backLabel: string
}) {
  return (
    <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <Button
          type="button"
          size="icon-lg"
          variant="ghost"
          className="mt-1 size-10 shrink-0 rounded-xl border border-zinc-200 bg-[#FFFDF9] text-zinc-600 shadow-sm hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
          onClick={onBack}
          aria-label={backLabel}
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="min-w-0">
          <p className="mb-1 text-xs font-semibold text-zinc-600">{subtitle}</p>
          <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[30px]">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-zinc-700">
            {description}
          </p>
        </div>
      </div>
      <div className="rounded-[18px] border border-orange-100 bg-[#FFFDF9] px-4 py-3 text-xs font-bold text-orange-800 shadow-sm">
        Metadata dokumen final saja.
      </div>
    </section>
  )
}

function KegiatanDetailCards({ kegiatan }: { kegiatan: KegiatanRow }) {
  const materialCount = kegiatan.dokumen.filter(row => !row.is_non_material).length
  const nonMaterialCount = kegiatan.dokumen.filter(row => row.is_non_material).length

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        label="Nama Kegiatan"
        value={kegiatan.nama}
        detail={kegiatan.fungsiNama}
        icon={<FolderOpen size={16} />}
        className="border-[#E1D7CB] bg-[#FFFDF9]"
        labelClassName="text-[#5F3B22]"
        iconClassName="border-[#D8CDC1] text-[#6D6258]"
      />
      <SummaryCard
        label="Dokumen Material"
        value={materialCount.toLocaleString('id-ID')}
        detail="Total Dokumen Belanja"
        icon={<ClipboardList size={16} />}
        className="border-[#F1D38A] bg-[#FFF8E6]"
        labelClassName="text-[#7A4A00]"
        iconClassName="border-[#E5BD55] text-[#B77900]"
      />
      <SummaryCard
        label="Dokumen Non-Material"
        value={nonMaterialCount.toLocaleString('id-ID')}
        detail="Total Dokumen Non-Belanja"
        icon={<FileText size={16} />}
        className="border-[#FDBA91] bg-[#FFF1E8]"
        labelClassName="text-[#B83200]"
        iconClassName="border-[#FF8A4C] text-[#FF5A14]"
      />
      <SummaryCard
        label="Total Nominal Realisasi"
        value={formatCurrency(kegiatan.totalNominal)}
        detail="Hanya Belanja Material"
        icon={<Banknote size={16} />}
        className="border-[#7DD7A9] bg-[#EAFBF2] shadow-[0_2px_0_rgba(16,185,129,0.18)]"
        labelClassName="text-[#006B35]"
        valueClassName="font-mono text-[24px] text-[#02170B]"
        detailClassName="text-[#006B35]"
        iconClassName="border-[#62C995] text-[#16A35D]"
      />
    </div>
  )
}

function KegiatanDetailToolbar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  filterOpen,
  onFilterOpenChange,
  activeFilters,
  sortBy,
  onSortChange,
  resultLabel,
}: {
  search: string
  onSearchChange: (value: string) => void
  filter: DetailFilterValue
  onFilterChange: (value: DetailFilterValue) => void
  filterOpen: boolean
  onFilterOpenChange: (value: boolean) => void
  activeFilters: number
  sortBy: DetailSortMode
  onSortChange: (value: DetailSortMode) => void
  resultLabel: string
}) {
  return (
    <div className="overflow-hidden rounded-[26px] border border-zinc-200/80 bg-[#FFFDF9] shadow-[0_3px_14px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative min-w-0 flex-1 lg:max-w-xl">
          <span className="sr-only">Cari dokumen kegiatan</span>
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            type="search"
            placeholder="Cari berdasarkan judul dokumen, jenis, atau pengaju..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-11 w-full rounded-[20px] border border-zinc-200 bg-[#FFFDF9] pl-11 pr-4 text-sm font-medium text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-orange-200 focus:ring-4 focus:ring-orange-100/60"
          />
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant={filterOpen || activeFilters > 0 ? 'outline' : 'ghost'}
            className={[
              'h-11 rounded-[22px] border px-4 text-sm font-extrabold shadow-sm',
              filterOpen || activeFilters > 0
                ? 'border-orange-200 bg-orange-50 text-[#FF4D00] hover:bg-orange-50'
                : 'border-zinc-200 bg-[#FFFDF9] text-zinc-950 hover:bg-[#FFF8F1]',
            ].join(' ')}
            onClick={() => onFilterOpenChange(!filterOpen)}
          >
            <Filter size={16} />
            Filter Lanjutan
            {activeFilters > 0 && (
              <span className="ml-1 rounded-full bg-[#FF4D00] px-1.5 py-0.5 text-[10px] leading-none text-white">
                {activeFilters}
              </span>
            )}
          </Button>
          <label>
            <span className="sr-only">Urutkan dokumen kegiatan</span>
            <Select value={sortBy} onValueChange={(value) => onSortChange(value as DetailSortMode)}>
              <SelectTrigger className="min-h-10 w-full rounded-xl border-[#F0E1D5] bg-[#FFFAF6] px-4 text-sm font-semibold hover:border-[#FFBC80] sm:w-fit">
                <SelectValue placeholder="Tanggal terbaru">
                  {selected => DETAIL_SORT_OPTIONS.find(option => option.value === selected)?.label ?? 'Tanggal terbaru'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DETAIL_SORT_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      </div>

      {filterOpen && (
        <div className="border-b border-zinc-100 bg-[#FFFDF9] p-4 sm:p-5">
          <KinerjaDetailAdvancedFilter
            value={filter}
            onChange={onFilterChange}
          />
          <div className="mt-5 flex flex-col gap-2 border-t border-zinc-100 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" className="font-bold" onClick={() => onFilterChange(EMPTY_DETAIL_FILTER)}>
              Reset
            </Button>
            <Button type="button" variant="ghost" className="font-bold" onClick={() => onFilterOpenChange(false)}>
              Tutup
            </Button>
            <Button type="button" className="font-bold shadow-sm" onClick={() => onFilterOpenChange(false)}>
              Terapkan Filter
            </Button>
          </div>
        </div>
      )}

      <div className="px-5 py-4 text-sm font-bold text-zinc-950">
        {resultLabel}
      </div>
    </div>
  )
}

function KinerjaDetailAdvancedFilter({
  value,
  onChange,
}: {
  value: DetailFilterValue
  onChange: (value: DetailFilterValue) => void
}) {
  return (
    <div className="rounded-[22px] border border-zinc-200/80 bg-[#FFF8F1]/35 p-4 shadow-none">
      <div className="grid gap-4 lg:grid-cols-3">
        <FilterSelect
          label="Status"
          value={value.status}
          onChange={(status) => onChange({ ...value, status: status as StatusFilter })}
          options={[
            { value: 'ALL', label: 'Semua Status' },
            { value: 'COMPLETED', label: 'Selesai' },
            { value: 'TERSIMPAN', label: 'Tersimpan' },
            { value: 'ARCHIVED', label: 'Diarsipkan' },
          ]}
        />
        <FilterSelect
          label="Jenis"
          value={value.jenis}
          onChange={(jenis) => onChange({ ...value, jenis: jenis as JenisFilter })}
          options={[
            { value: 'ALL', label: 'Semua Jenis' },
            { value: 'MATERIAL', label: 'Material' },
            { value: 'NON_MATERIAL', label: 'Non-Material' },
          ]}
        />
        <label className="space-y-2">
          <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Mulai Dari Tanggal</span>
          <DatePicker
            value={value.tanggalMulai ?? ''}
            onChange={(tanggal) => onChange({ ...value, tanggalMulai: tanggal || undefined })}
            placeholder="Pilih tanggal mulai"
          />
        </label>
        <label className="space-y-2">
          <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Sampai Tanggal</span>
          <DatePicker
            value={value.tanggalAkhir ?? ''}
            onChange={(tanggal) => onChange({ ...value, tanggalAkhir: tanggal || undefined })}
            placeholder="Pilih tanggal selesai"
          />
        </label>
      </div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="space-y-2">
      <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <Select value={value} onValueChange={(next) => onChange(next ?? '')}>
        <SelectTrigger className="min-h-10 w-full rounded-xl border-[#F0E1D5] bg-[#FFFAF6] px-4 text-sm font-semibold hover:border-[#FFBC80]">
          <SelectValue placeholder={options[0]?.label}>
            {selected => options.find(option => option.value === selected)?.label ?? options[0]?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

function DocumentTable({
  dokumen,
  totalLimit,
  onOpenDocument,
}: {
  dokumen: LaporanKinerjaRow[]
  totalLimit: number | null
  onOpenDocument: (dokumen: LaporanKinerjaRow) => void
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-[#FFFDF9] shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block">
        <Table className="text-left">
          <TableHeader>
            <TableRow className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
              <TableHead className={TABLE_HEAD_CLASS}>Judul Dokumen</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Jenis Scope</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Tanggal Dokumen</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Status</TableHead>
              <TableHead className={`text-center ${TABLE_HEAD_CLASS}`}>Nominal Realisasi</TableHead>
              <TableHead className={`w-20 text-right ${TABLE_HEAD_CLASS}`}>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-zinc-100 text-[13px]">
            {dokumen.map(row => (
              <TableRow
                key={row.id}
                className="group cursor-pointer border-zinc-100 bg-[#FFFDF9] transition-colors hover:bg-[#FFF8F1]/70"
                onClick={() => onOpenDocument(row)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpenDocument(row)
                  }
                }}
                aria-label={`Metadata dokumen ${row.judul}`}
              >
                <TableCell className="max-w-[460px] px-6 py-5">
                  <p className="line-clamp-2 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-[#FF4D00]">{row.judul}</p>
                  <p className="mt-1 text-xs font-medium text-zinc-500">
                    Pembuat: {row.pengaju_nama || 'Tidak diketahui'}
                  </p>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <ScopeBadge dokumen={row} />
                </TableCell>
                <TableCell className="px-6 py-5">
                  <DateCell value={row.tanggal} />
                </TableCell>
                <TableCell className="px-6 py-5">
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell className="px-6 py-5 text-center font-mono text-sm font-bold text-zinc-950">
                  {row.is_non_material ? '-' : formatNullableCurrency(row.nominal_realisasi)}
                </TableCell>
                <TableCell className="px-6 py-5 text-right">
                  <ChevronActionButton label={`Metadata dokumen ${row.judul}`} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t border-zinc-100 px-6 py-3 text-xs font-medium text-zinc-500">
          Menampilkan {dokumen.length}{totalLimit ? ` dari maksimal ${totalLimit}` : ''} dokumen final.
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {dokumen.map((row, idx) => (
          <PegawaiPanel
            key={row.id}
            className="group cursor-pointer space-y-3 border-zinc-200/80 p-4 shadow-[0_2px_10px_rgba(15,23,42,0.06)] transition hover:border-orange-100 hover:bg-[#FFFDF9]"
            onClick={() => onOpenDocument(row)}
            tabIndex={0}
            role="button"
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onOpenDocument(row)
              }
            }}
            aria-label={`Metadata dokumen ${row.judul}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700/70">Dokumen #{idx + 1}</p>
                <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-950">{row.judul}</h2>
              </div>
              <StatusBadge status={row.status} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
              <InfoTile label="Scope" value={formatJenis(row)} />
              <InfoTile label="Tanggal" value={<DateCell value={row.tanggal} className="mt-1" />} />
              <InfoTile label="Pembuat" value={row.pengaju_nama || 'Tidak diketahui'} className="col-span-2" />
            </div>
            <div className="border-t border-zinc-100 pt-3">
              <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => onOpenDocument(row)}>
                Detail Metadata
                <ChevronRight size={14} />
              </Button>
            </div>
          </PegawaiPanel>
        ))}
      </div>
    </>
  )
}

function KinerjaDocumentMetadataDialog({
  dokumen,
  title,
  onClose,
}: {
  dokumen: LaporanKinerjaRow
  title: string
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-[#F0E1D5] bg-[#FFFAF6] shadow-2xl shadow-zinc-950/10 sm:max-w-3xl sm:rounded-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800"
              onClick={onClose}
              aria-label="Kembali dari detail metadata dokumen"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0">
              <DialogTitle>Detail Metadata Dokumen</DialogTitle>
              <DialogDescription className="line-clamp-1">
                {title} / {dokumen.judul}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="rounded-[1.25rem] border border-[#F1E5DA] bg-[#FFFDF9] p-4 sm:p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <ModalMetadataField label="Judul Dokumen" value={dokumen.judul} className="sm:col-span-2" />
            <ModalMetadataField label="Fungsi" value={dokumen.fungsi_nama ?? '-'} />
            <ModalMetadataField label="Kegiatan" value={dokumen.kegiatan_nama ?? '-'} />
            <ModalMetadataField label="Jenis" value={<ScopeBadge dokumen={dokumen} />} />
            <ModalMetadataField label="Status" value={formatStatusLabel(dokumen.status)} />
            <ModalMetadataField label="Tanggal Dokumen" value={formatDate(dokumen.tanggal)} />
            <ModalMetadataField label="Tahun" value={dokumen.tahun} />
            <ModalMetadataField label="Pengaju / Pembuat" value={dokumen.pengaju_nama || '-'} />
            <ModalMetadataField label="Terakhir Diperbarui" value={formatDate(dokumen.updated_at)} />
            <ModalMetadataField label="Nominal Realisasi" value={dokumen.is_non_material ? '-' : formatNullableCurrency(dokumen.nominal_realisasi)} emphasis />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ModalMetadataField({
  label,
  value,
  emphasis,
  className,
}: {
  label: string
  value: ReactNode
  emphasis?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <div className={`mt-1 text-sm font-semibold leading-relaxed ${emphasis ? 'font-mono font-bold text-zinc-950' : 'text-zinc-950'}`}>
        {value}
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  detail,
  icon,
  className,
  labelClassName,
  valueClassName,
  detailClassName,
  iconClassName,
}: {
  label: string
  value: ReactNode
  detail: string
  icon: ReactNode
  className?: string
  labelClassName?: string
  valueClassName?: string
  detailClassName?: string
  iconClassName?: string
}) {
  return (
    <div className={['flex min-h-[140px] flex-col justify-between rounded-[22px] border p-5 shadow-sm', className ?? ''].join(' ')}>
      <div className="flex items-start justify-between gap-3">
        <p className={['text-[10px] font-black uppercase tracking-[0.14em]', labelClassName ?? 'text-[#5F3B22]'].join(' ')}>{label}</p>
        <span className={['flex size-7 items-center justify-center rounded-full border bg-white/65 shadow-sm shadow-zinc-950/5', iconClassName ?? 'border-current/15 text-zinc-700'].join(' ')}>
          {icon}
        </span>
      </div>
      <div>
        <p className={['line-clamp-2 font-headline text-[18px] font-extrabold leading-tight tracking-tight text-zinc-950', valueClassName ?? ''].join(' ')}>{value}</p>
        <p className={['mt-3 text-[10px] font-semibold uppercase tracking-[0.04em] text-zinc-500', detailClassName ?? ''].join(' ')}>{detail}</p>
      </div>
    </div>
  )
}

function ChevronActionButton({ label }: { label: string }) {
  return (
    <Button
      size="icon-lg"
      variant="ghost"
      className="size-10 rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-600 opacity-100 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] group-hover:border-orange-200 group-hover:bg-orange-50 group-hover:text-orange-600 group-hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] [&_svg]:!size-5"
      aria-label={label}
    >
      <ChevronRight strokeWidth={2.35} />
    </Button>
  )
}

function CountPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex w-fit rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-extrabold text-zinc-700">
      {children}
    </span>
  )
}

function StatusSummary({ dokumen }: { dokumen: LaporanKinerjaRow[] }) {
  const counts = dokumen.reduce(
    (total, row) => {
      total[row.status] += 1
      return total
    },
    { COMPLETED: 0, TERSIMPAN: 0, ARCHIVED: 0 } satisfies Record<LaporanKinerjaRow['status'], number>,
  )

  return (
    <div className="flex flex-wrap gap-1.5">
      {counts.COMPLETED > 0 && <StatusPill className="border-emerald-200 bg-emerald-50 text-emerald-700">{counts.COMPLETED} Selesai</StatusPill>}
      {counts.TERSIMPAN > 0 && <StatusPill className="border-zinc-200 bg-zinc-50 text-zinc-600">{counts.TERSIMPAN} Tersimpan</StatusPill>}
      {counts.ARCHIVED > 0 && <StatusPill className="border-blue-200 bg-blue-50 text-blue-700">{counts.ARCHIVED} Diarsipkan</StatusPill>}
    </div>
  )
}

function StatusPill({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className={['inline-flex rounded-full border px-2.5 py-1 text-[11px] font-extrabold', className].join(' ')}>
      {children}
    </span>
  )
}

function ScopeBadge({ dokumen }: { dokumen: LaporanKinerjaRow }) {
  return (
    <Badge
      className={[
        'border px-2.5 py-1 text-[11px] font-extrabold tracking-[0.04em]',
        dokumen.is_non_material
          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700',
      ].join(' ')}
    >
      {formatJenis(dokumen)}
    </Badge>
  )
}

function DateCell({ value, className }: { value: string; className?: string }) {
  return (
    <span className={['inline-flex items-center gap-2 text-sm font-semibold text-zinc-500', className ?? ''].join(' ')}>
      <Clock3 size={16} strokeWidth={1.8} className="shrink-0 text-zinc-500" aria-hidden="true" />
      {value ? formatDate(value) : '-'}
    </span>
  )
}

function InfoTile({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={['rounded-xl border border-zinc-200/80 bg-[#FFFDF9] p-2.5', className ?? ''].join(' ')}>
      <p className="font-semibold text-zinc-500">{label}</p>
      <div className="mt-0.5 text-zinc-900">{value}</div>
    </div>
  )
}

function buildFungsiRows(documents: LaporanKinerjaRow[], keyPrefix = 'fungsi'): FungsiRow[] {
  const groups = new Map<string, LaporanKinerjaRow[]>()

  for (const row of documents) {
    const fungsiName = displayName(row.fungsi_nama, 'Tanpa Fungsi')
    const key = stableKey(keyPrefix, fungsiName)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  return Array.from(groups, ([id, rows]) => {
    const nama = displayName(rows[0]?.fungsi_nama, 'Tanpa Fungsi')
    const kegiatan = buildKegiatanRows(id, nama, rows)

    return {
      id,
      nama,
      dokumen: rows,
      kegiatan,
      totalNominal: totalNominal(rows),
      latestDate: latestDate(rows),
    }
  })
}

function buildPegawaiRows(documents: LaporanKinerjaRow[]): PegawaiRow[] {
  const groups = new Map<string, LaporanKinerjaRow[]>()

  for (const row of documents) {
    const key = stableKey('pegawai', pegawaiIdentity(row))
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  return Array.from(groups, ([id, rows]) => ({
    id,
    nama: displayName(rows[0]?.pengaju_nama, 'Tanpa Pengaju'),
    dokumen: rows,
    fungsi: buildFungsiRows(rows, `${id}-fungsi`),
    totalNominal: totalNominal(rows),
    latestDate: latestDate(rows),
  }))
}

function pegawaiIdentity(row: LaporanKinerjaRow) {
  return row.pengaju_id?.trim() || row.pengaju_nama.trim() || 'unknown'
}

function countKegiatan(fungsi: FungsiRow[]) {
  return fungsi.reduce((total, row) => total + row.kegiatan.length, 0)
}

function satkerPeriodeLabel(rows: LaporanKinerjaRow[]): string | null {
  const years = rows
    .map(row => row.tahun)
    .filter((year): year is number => Number.isFinite(year))
  if (years.length === 0) return null
  const min = Math.min(...years)
  const max = Math.max(...years)
  return min === max ? `TA ${min}` : `TA ${min}–${max}`
}

function buildKegiatanRows(fungsiId: string, fungsiNama: string, documents: LaporanKinerjaRow[]): KegiatanRow[] {
  const groups = new Map<string, LaporanKinerjaRow[]>()

  for (const row of documents) {
    const kegiatanName = displayName(row.kegiatan_nama, 'Tanpa Kegiatan')
    const key = stableKey(`${fungsiId}-kegiatan`, kegiatanName)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  return Array.from(groups, ([id, rows]) => ({
    id,
    fungsiId,
    nama: displayName(rows[0]?.kegiatan_nama, 'Tanpa Kegiatan'),
    fungsiNama,
    dokumen: rows,
    totalNominal: totalNominal(rows),
    latestDate: latestDate(rows),
  })).sort((a, b) => compareNamedRows(a, b, 'updated_desc'))
}

function compareNamedRows(
  a: { nama: string; dokumen: LaporanKinerjaRow[]; totalNominal: number; latestDate: string | null },
  b: { nama: string; dokumen: LaporanKinerjaRow[]; totalNominal: number; latestDate: string | null },
  sortBy: SortMode,
) {
  if (sortBy === 'name_asc') return a.nama.localeCompare(b.nama, 'id-ID')
  if (sortBy === 'documents_desc') return b.dokumen.length - a.dokumen.length
  if (sortBy === 'nominal_desc') return b.totalNominal - a.totalNominal
  return dateValue(b.latestDate) - dateValue(a.latestDate)
}

function compareDocuments(a: LaporanKinerjaRow, b: LaporanKinerjaRow, sortBy: DetailSortMode) {
  if (sortBy === 'oldest') return dateValue(a.tanggal) - dateValue(b.tanggal)
  if (sortBy === 'title_asc') return a.judul.localeCompare(b.judul, 'id-ID')
  if (sortBy === 'submitter_asc') return a.pengaju_nama.localeCompare(b.pengaju_nama, 'id-ID')
  if (sortBy === 'nominal_desc') return (b.nominal_realisasi ?? 0) - (a.nominal_realisasi ?? 0)
  return dateValue(b.tanggal) - dateValue(a.tanggal)
}

function countActiveDetailFilters(filter: DetailFilterValue) {
  return [
    filter.status !== 'ALL',
    filter.jenis !== 'ALL',
    filter.tanggalMulai,
    filter.tanggalAkhir,
  ].filter(Boolean).length
}

function totalNominal(rows: LaporanKinerjaRow[]) {
  return rows.reduce((total, row) => {
    if (row.is_non_material || row.nominal_realisasi === null) return total
    return total + row.nominal_realisasi
  }, 0)
}

function latestDate(rows: LaporanKinerjaRow[]) {
  return rows.reduce<string | null>((latest, row) => {
    const value = row.updated_at || row.tanggal
    if (!value) return latest
    if (!latest) return value
    return dateValue(value) > dateValue(latest) ? value : latest
  }, null)
}

function stableKey(prefix: string, value: string) {
  return `${prefix}-${value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-') || 'unknown'}`
}

function displayName(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim()
  return trimmed || fallback
}

function formatJenis(row: LaporanKinerjaRow) {
  return row.is_non_material ? 'Non-Material' : 'Material'
}

function formatStatusLabel(status: LaporanKinerjaRow['status']) {
  if (status === 'COMPLETED') return 'Selesai'
  if (status === 'TERSIMPAN') return 'Tersimpan'
  return 'Diarsipkan'
}

function formatDate(value: string) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function dateValue(value?: string | null) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function formatNullableCurrency(value: number | null) {
  if (value === null) return '-'
  return formatCurrency(value)
}

function formatCurrency(value: number) {
  if (!value) return '-'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}
