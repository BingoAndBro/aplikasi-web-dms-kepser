import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  ChevronRight,
  Clock3,
  ClipboardList,
  FileText,
  FolderOpen,
  Inbox,
  Search,
  Users,
  X,
} from 'lucide-react'
import {
  FilterToolbar,
  PembuatFilterSelect,
  ToolbarFilterField,
  ToolbarSelectField,
  buildPersonOptions,
} from '#/components/laporan/FilterToolbar'
import { PeriodeSelector } from '#/components/laporan/PeriodeSelector'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { ManualArsipDetailDialog } from '#/components/arsip/ManualArsipDetailDialog'
import { DokumenDetailDialog } from '#/components/dokumen/DokumenDetailDialog'
import { PegawaiPanel } from '#/components/pegawai/PegawaiPagePrimitives'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
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
import {
  periodeLabel,
  resolvePeriodeRange,
  shiftPeriode,
  type PeriodeValue,
} from '#/lib/laporan/periode'
import {
  buildFungsiRows,
  buildKegiatanRows,
  buildPegawaiRows,
  compareNamedRows,
  countKegiatan,
  dateValue,
  totalNominal,
  type FungsiRow,
  type KegiatanRow,
  type KomponenRow,
  type LaporanKinerjaRow,
  type PegawaiRow,
  type SortMode,
} from '#/lib/laporan/monitoring-rows'

type LaporanKinerjaResponse = {
  dokumen?: LaporanKinerjaRow[]
  meta?: {
    limit: number
    count: number
    truncated: boolean
    final_statuses: Array<'COMPLETED' | 'TERSIMPAN'>
    tahun_tersedia: number[]
  }
  error?: string
}

type DetailSortMode = 'newest' | 'oldest' | 'title_asc' | 'submitter_asc' | 'nominal_desc'
type StatusFilter = 'ALL' | LaporanKinerjaRow['status']

type DetailFilterValue = {
  status: StatusFilter
  pengajuId?: string
}

export type MonitoringRealisasiViewProps = {
  fungsiId?: string
  kegiatanId?: string
  komponenId?: string
  pegawaiId?: string
  groupBy?: MonitoringRealisasiGroupBy
  periode: PeriodeValue
  onSelectFungsi: (fungsiId: string | null) => void
  onSelectKegiatan: (fungsiId: string, kegiatanId: string | null) => void
  onSelectKomponen: (fungsiId: string, kegiatanId: string, komponenId: string | null) => void
  onSelectPeriode: (next: PeriodeValue) => void
  onSelectPegawai?: (pegawaiId: string | null) => void
  onSelectGroupBy?: (mode: MonitoringRealisasiGroupBy) => void
  scope?: 'laporan_kinerja'
  title?: string
  description?: string
  forbiddenTitle?: string
  forbiddenDescription?: string
  loadingLabel?: string
}

// Catatan cakupan di header (D-27): isi halaman berbeda per scope, lihat
// filter di src/routes/api/laporan/kinerja.ts.
const MONITORING_SCOPE_NOTE =
  'Dokumen material berstatus Selesai dan dokumen tambahan KSBU, kecuali yang berkasnya sudah dimusnahkan.'
const LAPORAN_KINERJA_SCOPE_NOTE =
  'Dokumen final: material Selesai, non-material Tersimpan, dan dokumen tambahan KSBU. Tidak termasuk berkas yang sudah dimusnahkan atau lampiran yang sudah dibersihkan.'
const ScopeNoteContext = createContext(MONITORING_SCOPE_NOTE)

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

const STATUS_FILTER_OPTIONS = [
  { id: 'COMPLETED', nama: 'Selesai' },
  { id: 'TERSIMPAN', nama: 'Tersimpan' },
]

const EMPTY_DETAIL_FILTER: DetailFilterValue = {
  status: 'ALL',
}

const GROUP_BY_OPTIONS: { value: MonitoringRealisasiGroupBy; label: string }[] = [
  { value: 'kegiatan', label: 'Fungsi' },
  { value: 'pegawai', label: 'Pegawai' },
]

export function MonitoringRealisasiView({
  fungsiId,
  kegiatanId,
  komponenId,
  pegawaiId,
  groupBy = 'kegiatan',
  periode,
  onSelectFungsi,
  onSelectKegiatan,
  onSelectKomponen,
  onSelectPeriode,
  onSelectPegawai,
  onSelectGroupBy,
  scope,
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
  const [truncated, setTruncated] = useState(false)
  const [tahunTersedia, setTahunTersedia] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortMode>('updated_desc')
  const [detailSearch, setDetailSearch] = useState('')
  const [detailSortBy, setDetailSortBy] = useState<DetailSortMode>('newest')
  const [detailFilter, setDetailFilter] = useState<DetailFilterValue>(EMPTY_DETAIL_FILTER)
  const [selectedDocument, setSelectedDocument] = useState<LaporanKinerjaRow | null>(null)

  const periodeRange = useMemo(() => resolvePeriodeRange(periode), [periode])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)

    apiFetch<LaporanKinerjaResponse>('/laporan/kinerja', {
      query: { start_date: periodeRange.dari, end_date: periodeRange.sampai, scope },
      signal: controller.signal,
    })
      .then((data) => {
        if (data.error) {
          setError(data.error)
          return
        }

        setDokumen(data.dokumen ?? [])
        setLimit(data.meta?.limit ?? null)
        setTruncated(data.meta?.truncated ?? false)
        setTahunTersedia(data.meta?.tahun_tersedia ?? [])
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return

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
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [periodeRange.dari, periodeRange.sampai, scope])

  const fungsiRows = useMemo(() => buildFungsiRows(dokumen), [dokumen])
  const pegawaiRows = useMemo(() => buildPegawaiRows(dokumen), [dokumen])

  const satkerSummary = useMemo(
    () => ({
      totalRealisasi: totalNominal(dokumen),
      dokumenCount: dokumen.length,
      fungsiCount: fungsiRows.length,
      pegawaiCount: pegawaiRows.length,
      periode: periodeLabel(periode),
    }),
    [dokumen, fungsiRows, pegawaiRows, periode],
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

  const selectedKomponen = useMemo(() => {
    if (!selectedKegiatan) return null
    return selectedKegiatan.komponen.find(row => row.id === komponenId) ?? null
  }, [komponenId, selectedKegiatan])

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

  const filteredKomponenRows = useMemo(() => {
    if (!selectedKegiatan) return []
    const query = search.trim().toLowerCase()
    return selectedKegiatan.komponen
      .filter(row => {
        if (!query) return true
        return [
          row.nama,
          row.kegiatanNama,
          ...row.dokumen.map(item => item.judul),
          ...row.dokumen.map(item => item.pengaju_nama),
        ].some(value => value.toLowerCase().includes(query))
      })
      .sort((a, b) => compareNamedRows(a, b, sortBy))
  }, [search, selectedKegiatan, sortBy])

  const selectedDocuments = useMemo(() => {
    if (!selectedKomponen) return []
    const query = detailSearch.trim().toLowerCase()
    return selectedKomponen.dokumen
      .filter(row => {
        if (detailFilter.status !== 'ALL' && row.status !== detailFilter.status) return false
        if (detailFilter.pengajuId && row.pengaju_id !== detailFilter.pengajuId) return false
        if (!query) return true

        return [
          row.judul,
          row.fungsi_nama ?? '',
          row.kegiatan_nama ?? '',
          row.pengaju_nama,
          String(row.tahun),
          formatStatusLabel(row.status),
        ].some(value => value.toLowerCase().includes(query))
      })
      .sort((a, b) => compareDocuments(a, b, detailSortBy))
  }, [detailFilter, detailSearch, detailSortBy, selectedKomponen])

  return (
    <ScopeNoteContext.Provider value={scope === 'laporan_kinerja' ? LAPORAN_KINERJA_SCOPE_NOTE : MONITORING_SCOPE_NOTE}>
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

        {!loading && !forbidden && !error && (
          <div className="space-y-3">
            <PeriodeSelector value={periode} tahunTersedia={tahunTersedia} onChange={onSelectPeriode} />
            {truncated && (
              <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                Menampilkan {limit ?? 0} dokumen terbaru pada periode ini. Total di halaman ini belum lengkap
                — persempit periode agar angkanya akurat.
              </div>
            )}
          </div>
        )}

        {!loading && !forbidden && !error && dokumen.length === 0 && (
          <>
            <KinerjaHeader title={title} description={description} />
            {periode.mode === 'SEMUA' ? (
              <EmptyState
                icon={<Inbox className="h-5 w-5" />}
                title="Belum ada dokumen final"
                description="Dokumen final (status Selesai atau Tersimpan) akan muncul di sini sebagai metadata Laporan Kinerja."
              />
            ) : (
              <EmptyState
                icon={<Inbox className="h-5 w-5" />}
                title={`Belum ada realisasi pada ${periodeLabel(periode)}`}
                description="Coba lihat periode sebelumnya atau tampilkan seluruh periode."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    {(periode.mode === 'TRIWULAN' || periode.mode === 'BULANAN') && (
                      <Button variant="outline" onClick={() => onSelectPeriode(shiftPeriode(periode, -1))}>
                        Lihat {periodeLabel(shiftPeriode(periode, -1))}
                      </Button>
                    )}
                    <Button onClick={() => onSelectPeriode({ mode: 'SEMUA' })}>
                      Seluruh Periode
                    </Button>
                  </div>
                }
              />
            )}
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

        {!loading && !forbidden && !error && selectedFungsi && selectedKegiatan && !selectedKomponen && (
          <KomponenDetailView
            fungsi={selectedFungsi}
            kegiatan={selectedKegiatan}
            rows={filteredKomponenRows}
            title={title}
            search={search}
            onSearchChange={setSearch}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onBack={() => onSelectKegiatan(selectedFungsi.id, null)}
            onSelectKomponen={(id) => onSelectKomponen(selectedFungsi.id, selectedKegiatan.id, id)}
          />
        )}

        {!loading && !forbidden && !error && selectedFungsi && selectedKegiatan && selectedKomponen && (
          <KegiatanDocumentView
            fungsi={selectedFungsi}
            kegiatan={selectedKegiatan}
            komponen={selectedKomponen}
            dokumen={selectedDocuments}
            totalDokumen={selectedKomponen.dokumen.length}
            limit={limit}
            search={detailSearch}
            onSearchChange={setDetailSearch}
            filter={detailFilter}
            onFilterChange={setDetailFilter}
            sortBy={detailSortBy}
            onSortChange={setDetailSortBy}
            onBack={() => onSelectKomponen(selectedFungsi.id, selectedKegiatan.id, null)}
            onOpenDocument={setSelectedDocument}
          />
        )}

        {/* Workflow rows open the full document detail (metadata + lampiran);
            manual KSBU rows (T-5/D-26) have no /api/dokumen/$id, so they use
            the read-only /api/laporan/manual-arsip detail instead. */}
        <DokumenDetailDialog
          dokumenId={selectedDocument?.sumber === 'WORKFLOW' ? selectedDocument.id : null}
          open={selectedDocument?.sumber === 'WORKFLOW'}
          onOpenChange={(open) => { if (!open) setSelectedDocument(null) }}
        />
        <ManualArsipDetailDialog
          dokumen={selectedDocument?.sumber === 'MANUAL' ? selectedDocument : null}
          onClose={() => setSelectedDocument(null)}
        />
      </div>
    </PageLayout>
    </ScopeNoteContext.Provider>
  )
}

function KinerjaHeader({ title, description }: { title: string; description: string }) {
  const scopeNote = useContext(ScopeNoteContext)
  return (
    <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-5">
        <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brand-border bg-bg-surface text-brand-solid shadow-[0_2px_8px_rgba(251,146,60,0.14)]">
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
      <div className="max-w-xs rounded-[18px] border border-brand-border bg-bg-surface px-4 py-3 text-xs font-bold text-brand-text shadow-sm">
        {scopeNote}
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
                  ? 'bg-white text-brand-text shadow-sm'
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
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-money-border bg-money-surface px-3.5 py-2.5 shadow-[0_2px_0_rgba(16,185,129,0.18)]">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-money-icon-border bg-white/70 text-money-icon shadow-sm shadow-emerald-900/5">
          <Banknote size={17} />
        </span>
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase tracking-[0.13em] text-money-text">
            Total Realisasi Satker{periode ? ` · ${periode}` : ''}
          </span>
          <span className="font-mono text-[19px] font-extrabold leading-tight tracking-tight text-money-value sm:text-[21px]">
            {formatCurrency(totalRealisasi)}
          </span>
        </div>
      </div>
      <span className="hidden h-9 w-px shrink-0 bg-money-border/70 sm:block" />
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
      <span className="text-[9px] font-black uppercase tracking-[0.12em] text-money-text/75">{label}</span>
      <span className="font-headline text-[15px] font-bold tracking-tight text-money-value">{value}</span>
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
    <FilterToolbar
      search={{ value: search, onChange: onSearchChange, placeholder, label: searchLabel }}
      fields={(
        <ToolbarSelectField
          label="Urutkan"
          srLabel="daftar"
          value={sortBy}
          options={SORT_OPTIONS.map(option => ({ id: option.value, nama: option.label }))}
          onChange={(value) => onSortChange(value as SortMode)}
        />
      )}
      resultLabel={resultLabel}
    />
  )
}

function PegawaiList({ rows, onSelect }: { rows: PegawaiRow[]; onSelect: (id: string) => void }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-bg-surface shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block">
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
                className="group cursor-pointer border-zinc-100 bg-bg-surface transition-colors hover:bg-brand-surface/70"
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
                  <p className="line-clamp-2 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-brand-text">{row.nama}</p>
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
                <TableCell className="px-6 py-5 text-center font-mono text-sm font-bold text-nominal-table">
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
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand-solid-active/70">Pegawai</p>
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
        tone="neutral"
      />
      <SummaryCard
        label="Jumlah Fungsi"
        value={pegawai.fungsi.length.toLocaleString('id-ID')}
        detail={`${countKegiatan(pegawai.fungsi).toLocaleString('id-ID')} Kegiatan Terkait`}
        icon={<FolderOpen size={16} />}
        tone="gold"
      />
      <SummaryCard
        label="Total Dokumen Final"
        value={pegawai.dokumen.length.toLocaleString('id-ID')}
        detail="Dokumen Terverifikasi"
        icon={<FileText size={16} />}
        tone="orange"
      />
      <SummaryCard
        label="Total Nominal Realisasi"
        value={formatCurrency(pegawai.totalNominal)}
        detail="Akumulasi Seluruh Dokumen"
        icon={<Banknote size={16} />}
        tone="money"
      />
    </div>
  )
}

function FungsiList({ rows, onSelect }: { rows: FungsiRow[]; onSelect: (id: string) => void }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-bg-surface shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block">
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
                className="group cursor-pointer border-zinc-100 bg-bg-surface transition-colors hover:bg-brand-surface/70"
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
                  <p className="line-clamp-2 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-brand-text">{row.nama}</p>
                  <p className="mt-1 text-xs font-medium text-zinc-500">BPS Kabupaten / Kota</p>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <CountPill>{row.kegiatan.length} kegiatan</CountPill>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <CountPill>{row.dokumen.length} dokumen</CountPill>
                </TableCell>
                <TableCell className="px-6 py-5 text-center font-mono text-sm font-bold text-nominal-table">
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
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand-solid-active/70">Fungsi</p>
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
        tone="neutral"
      />
      <SummaryCard
        label="Jumlah Kegiatan"
        value={fungsi.kegiatan.length.toLocaleString('id-ID')}
        detail="Kegiatan Terdaftar"
        icon={<ClipboardList size={16} />}
        tone="gold"
      />
      <SummaryCard
        label="Total Dokumen Final"
        value={fungsi.dokumen.length.toLocaleString('id-ID')}
        detail="Dokumen Terverifikasi"
        icon={<FileText size={16} />}
        tone="orange"
      />
      <SummaryCard
        label="Total Nominal Realisasi"
        value={formatCurrency(fungsi.totalNominal)}
        detail="Akumulasi Seluruh Dokumen"
        icon={<Banknote size={16} />}
        tone="money"
      />
    </div>
  )
}

function KomponenDetailView({
  fungsi,
  kegiatan,
  rows,
  title,
  search,
  onSearchChange,
  sortBy,
  onSortChange,
  onBack,
  onSelectKomponen,
}: {
  fungsi: FungsiRow
  kegiatan: KegiatanRow
  rows: KomponenRow[]
  title: string
  search: string
  onSearchChange: (value: string) => void
  sortBy: SortMode
  onSortChange: (value: SortMode) => void
  onBack: () => void
  onSelectKomponen: (id: string) => void
}) {
  return (
    <>
      <ReportBackHeader
        title={kegiatan.nama}
        subtitle={`${fungsi.nama} / Detail Kegiatan`}
        description="Daftar komponen dan dokumen final pada kegiatan terpilih."
        onBack={onBack}
        backLabel="Kembali ke detail fungsi"
      />
      <KegiatanDetailCards kegiatan={kegiatan} />
      <SimpleReportToolbar
        search={search}
        onSearchChange={onSearchChange}
        searchLabel={`Cari komponen ${title}`}
        placeholder="Cari komponen atau dokumen..."
        sortBy={sortBy}
        onSortChange={onSortChange}
        resultLabel={`${rows.length} dari ${kegiatan.komponen.length} komponen ditampilkan`}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="Tidak ada komponen yang cocok"
          description="Ubah kata kunci atau urutan untuk melihat komponen lain."
          compact
        />
      ) : (
        <KomponenList rows={rows} onSelect={onSelectKomponen} />
      )}
    </>
  )
}

function KomponenList({ rows, onSelect }: { rows: KomponenRow[]; onSelect: (id: string) => void }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-bg-surface shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block">
        <Table className="text-left">
          <TableHeader>
            <TableRow className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
              <TableHead className={TABLE_HEAD_CLASS}>Nama Komponen</TableHead>
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
                className="group cursor-pointer border-zinc-100 bg-bg-surface transition-colors hover:bg-brand-surface/70"
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
                  <p className="line-clamp-2 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-brand-text">{row.nama}</p>
                  <p className="mt-1 text-xs font-medium text-zinc-500">{row.kegiatanNama}</p>
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
                  <ChevronActionButton label={`Detail komponen ${row.nama}`} />
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
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand-solid-active/70">Komponen</p>
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
                Detail Komponen
                <ChevronRight size={14} />
              </Button>
            </div>
          </PegawaiPanel>
        ))}
      </div>
    </>
  )
}

function KegiatanList({ rows, onSelect }: { rows: KegiatanRow[]; onSelect: (id: string) => void }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-bg-surface shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block">
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
                className="group cursor-pointer border-zinc-100 bg-bg-surface transition-colors hover:bg-brand-surface/70"
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
                  <p className="line-clamp-2 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-brand-text">{row.nama}</p>
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
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand-solid-active/70">Kegiatan</p>
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
  komponen,
  dokumen,
  totalDokumen,
  limit,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  sortBy,
  onSortChange,
  onBack,
  onOpenDocument,
}: {
  fungsi: FungsiRow
  kegiatan: KegiatanRow
  komponen: KomponenRow
  dokumen: LaporanKinerjaRow[]
  totalDokumen: number
  limit: number | null
  search: string
  onSearchChange: (value: string) => void
  filter: DetailFilterValue
  onFilterChange: (value: DetailFilterValue) => void
  sortBy: DetailSortMode
  onSortChange: (value: DetailSortMode) => void
  onBack: () => void
  onOpenDocument: (dokumen: LaporanKinerjaRow) => void
}) {
  const pembuatOptions = useMemo(
    () => buildPersonOptions(komponen.dokumen, row => row.pengaju_id, row => row.pengaju_nama || 'Tidak diketahui'),
    [komponen.dokumen],
  )

  return (
    <>
      <ReportBackHeader
        title={komponen.nama}
        subtitle={`${fungsi.nama} / ${kegiatan.nama} / Detail Komponen`}
        description="Daftar dokumen final dalam komponen terpilih."
        onBack={onBack}
        backLabel="Kembali ke detail komponen"
      />
      <KomponenDetailCards komponen={komponen} />
      <KegiatanDetailToolbar
        search={search}
        onSearchChange={onSearchChange}
        filter={filter}
        onFilterChange={onFilterChange}
        pembuatOptions={pembuatOptions}
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
  const scopeNote = useContext(ScopeNoteContext)
  return (
    <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <Button
          type="button"
          size="icon-lg"
          variant="ghost"
          className="mt-1 size-10 shrink-0 rounded-xl border border-zinc-200 bg-bg-surface text-zinc-600 shadow-sm hover:border-brand-border-strong hover:bg-brand-surface hover:text-brand-solid"
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
      <div className="max-w-xs rounded-[18px] border border-brand-border bg-bg-surface px-4 py-3 text-xs font-bold text-brand-text shadow-sm">
        {scopeNote}
      </div>
    </section>
  )
}

function KegiatanDetailCards({ kegiatan }: { kegiatan: KegiatanRow }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        label="Nama Kegiatan"
        value={kegiatan.nama}
        detail={kegiatan.fungsiNama}
        icon={<FolderOpen size={16} />}
        tone="neutral"
      />
      <SummaryCard
        label="Jumlah Komponen"
        value={kegiatan.komponen.length.toLocaleString('id-ID')}
        detail="Komponen Terdaftar"
        icon={<ClipboardList size={16} />}
        tone="gold"
      />
      <SummaryCard
        label="Total Dokumen Final"
        value={kegiatan.dokumen.length.toLocaleString('id-ID')}
        detail="Dokumen Terverifikasi"
        icon={<FileText size={16} />}
        tone="orange"
      />
      <SummaryCard
        label="Total Nominal Realisasi"
        value={formatCurrency(kegiatan.totalNominal)}
        detail="Akumulasi Seluruh Dokumen"
        icon={<Banknote size={16} />}
        tone="money"
      />
    </div>
  )
}

function KomponenDetailCards({ komponen }: { komponen: KomponenRow }) {
  const materialDokumen = komponen.dokumen.filter(row => row.status === 'COMPLETED')
  const belumDiberkaskan = materialDokumen.filter(row => !row.is_diberkaskan).length
  const sudahDiberkaskan = materialDokumen.filter(row => row.is_diberkaskan).length

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        label="Nama Komponen"
        value={komponen.nama}
        detail={`${komponen.kegiatanNama} · ${komponen.fungsiNama}`}
        icon={<FolderOpen size={16} />}
        tone="neutral"
      />
      <SummaryCard
        label="Belum Diberkaskan"
        value={belumDiberkaskan.toLocaleString('id-ID')}
        detail="Menunggu Pemberkasan"
        icon={<ClipboardList size={16} />}
        tone="gold"
      />
      <SummaryCard
        label="Sudah Diberkaskan"
        value={sudahDiberkaskan.toLocaleString('id-ID')}
        detail="Sudah Masuk Berkas"
        icon={<FileText size={16} />}
        tone="orange"
      />
      <SummaryCard
        label="Total Nominal Realisasi"
        value={formatCurrency(komponen.totalNominal)}
        detail="Akumulasi Seluruh Dokumen"
        icon={<Banknote size={16} />}
        tone="money"
      />
    </div>
  )
}

function KegiatanDetailToolbar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  pembuatOptions,
  sortBy,
  onSortChange,
  resultLabel,
}: {
  search: string
  onSearchChange: (value: string) => void
  filter: DetailFilterValue
  onFilterChange: (value: DetailFilterValue) => void
  pembuatOptions: { id: string; nama: string }[]
  sortBy: DetailSortMode
  onSortChange: (value: DetailSortMode) => void
  resultLabel: string
}) {
  return (
    <FilterToolbar
      search={{
        value: search,
        onChange: onSearchChange,
        placeholder: 'Cari berdasarkan judul dokumen, jenis, atau pengaju...',
        label: 'Cari dokumen kegiatan',
      }}
      fields={(
        <>
          <PembuatFilterSelect
            value={filter.pengajuId}
            options={pembuatOptions}
            onChange={(pengajuId) => onFilterChange({ ...filter, pengajuId })}
          />
          <ToolbarFilterField
            label="Status"
            allLabel="Semua Status"
            value={filter.status === 'ALL' ? undefined : filter.status}
            options={STATUS_FILTER_OPTIONS}
            onChange={(status) => onFilterChange({ ...filter, status: (status ?? 'ALL') as StatusFilter })}
          />
          <ToolbarSelectField
            label="Urutkan"
            srLabel="dokumen kegiatan"
            value={sortBy}
            options={DETAIL_SORT_OPTIONS.map(option => ({ id: option.value, nama: option.label }))}
            onChange={(value) => onSortChange(value as DetailSortMode)}
          />
        </>
      )}
      resultLabel={resultLabel}
    />
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
      <div className="hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-bg-surface shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block">
        <Table className="text-left">
          <TableHeader>
            <TableRow className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
              <TableHead className={TABLE_HEAD_CLASS}>Judul Dokumen</TableHead>
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
                className="group cursor-pointer border-zinc-100 bg-bg-surface transition-colors hover:bg-brand-surface/70"
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
                  <p className="line-clamp-2 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-brand-text">{row.judul}</p>
                  <p className="mt-1 text-xs font-medium text-zinc-500">
                    Pembuat: {row.pengaju_nama || 'Tidak diketahui'}
                    {row.sumber === 'MANUAL' ? ' · Penambahan Dokumen (KSBU)' : ''}
                  </p>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <DateCell value={row.tanggal} />
                </TableCell>
                <TableCell className="px-6 py-5">
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell className="px-6 py-5 text-center font-mono text-sm font-bold text-zinc-950">
                  {formatNullableCurrency(row.nominal_realisasi)}
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
            className="group cursor-pointer space-y-3 border-zinc-200/80 p-4 shadow-[0_2px_10px_rgba(15,23,42,0.06)] transition hover:border-brand-border hover:bg-bg-surface"
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
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand-solid-active/70">Dokumen #{idx + 1}</p>
                <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-950">{row.judul}</h2>
              </div>
              <StatusBadge status={row.status} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
              <InfoTile label="Tanggal" value={<DateCell value={row.tanggal} className="mt-1" />} className="col-span-2" />
              <InfoTile
                label="Pembuat"
                value={row.sumber === 'MANUAL' ? `${row.pengaju_nama || 'Tidak diketahui'} · Penambahan Dokumen (KSBU)` : (row.pengaju_nama || 'Tidak diketahui')}
                className="col-span-2"
              />
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

export type SummaryCardTone = 'neutral' | 'gold' | 'orange' | 'money'

/** Fase 5: consolidates 4 palette clusters that PegawaiDetailCards, FungsiDetailCards,
 * KegiatanDetailCards, and KomponenDetailCards each repeated byte-identical via 5 raw
 * className props — see tema-global plan Fase 5. */
const SUMMARY_CARD_TONE_CLASS: Record<SummaryCardTone, {
  card: string
  label: string
  icon: string
  value?: string
  detail?: string
}> = {
  neutral: {
    card: 'border-brand-border bg-bg-surface',
    label: 'text-brand-text-muted',
    icon: 'border-brand-border-strong text-brand-text-muted',
  },
  gold: {
    card: 'border-warning-border bg-warning-surface',
    label: 'text-[#B77900]',
    icon: 'border-warning-border text-[#B77900]',
  },
  orange: {
    card: 'border-brand-border-strong bg-brand-surface',
    label: 'text-brand-solid-active',
    icon: 'border-brand-gradient-to text-brand-solid',
  },
  money: {
    card: 'border-money-border bg-money-surface shadow-[0_2px_0_rgba(16,185,129,0.18)]',
    label: 'text-money-text',
    icon: 'border-money-icon-border text-money-icon',
    value: 'font-mono text-[24px] text-money-value',
    detail: 'text-money-text',
  },
}

/**
 * Kartu ringkasan bersama (Monitoring Realisasi, Laporan Kinerja, Laporan
 * Kegiatan, Monitoring Dokumen Tim). Bila `onClick` diisi, kartu menjadi
 * tombol filter: ada hover, petunjuk aksi di bawah, dan tampilan aktif.
 */
export function SummaryCard({
  label,
  value,
  detail,
  icon,
  tone,
  onClick,
  active = false,
  actionHint = 'Klik untuk menyaring',
}: {
  label: string
  value: ReactNode
  detail: string
  icon: ReactNode
  tone: SummaryCardTone
  onClick?: () => void
  active?: boolean
  actionHint?: string
}) {
  const t = SUMMARY_CARD_TONE_CLASS[tone]
  const isInteractive = Boolean(onClick)
  const Root = isInteractive ? 'button' : 'div'

  return (
    <Root
      {...(isInteractive ? { type: 'button' as const, onClick, 'aria-pressed': active } : {})}
      className={[
        'group flex min-h-[140px] flex-col justify-between rounded-[22px] border p-5 text-left shadow-sm',
        t.card,
        isInteractive
          ? 'cursor-pointer transition duration-200 ease-out hover:-translate-y-1 hover:border-brand-border-strong hover:shadow-[0_12px_28px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-border/70 active:translate-y-0'
          : '',
        active ? '-translate-y-1 border-brand-border-strong ring-4 ring-brand-border/70' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={['text-[10px] font-black uppercase tracking-[0.14em]', t.label].join(' ')}>{label}</p>
        <span className={['flex size-7 items-center justify-center rounded-full border bg-white/65 shadow-sm shadow-zinc-950/5', t.icon].join(' ')}>
          {icon}
        </span>
      </div>
      <div>
        <p className={['line-clamp-2 font-headline text-[18px] font-extrabold leading-tight tracking-tight text-zinc-950', t.value ?? ''].join(' ')}>{value}</p>
        <p className={['mt-3 text-[10px] font-semibold uppercase tracking-[0.04em] text-zinc-500', t.detail ?? ''].join(' ')}>{detail}</p>
        {isInteractive && (
          <span
            className={[
              'mt-3 flex items-center gap-1 border-t border-zinc-950/10 pt-2.5 text-[11px] font-bold transition-colors',
              active ? 'text-brand-text' : 'text-zinc-500 group-hover:text-brand-text',
            ].join(' ')}
          >
            {active ? (
              <>
                <X size={12} aria-hidden="true" />
                Filter aktif · klik untuk lepas
              </>
            ) : (
              <>
                {actionHint}
                <ArrowRight size={12} className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
              </>
            )}
          </span>
        )}
      </div>
    </Root>
  )
}

function ChevronActionButton({ label }: { label: string }) {
  return (
    <Button
      size="icon-lg"
      variant="ghost"
      className="size-10 rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-600 opacity-100 shadow-sm transition hover:border-brand-border-strong hover:bg-brand-surface hover:text-brand-solid hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] group-hover:border-brand-border-strong group-hover:bg-brand-surface group-hover:text-brand-solid group-hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] [&_svg]:!size-5"
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
    { COMPLETED: 0, TERSIMPAN: 0 } satisfies Record<LaporanKinerjaRow['status'], number>,
  )

  return (
    <div className="flex flex-wrap gap-1.5">
      {counts.COMPLETED > 0 && <StatusPill className="border-emerald-200 bg-emerald-50 text-emerald-700">{counts.COMPLETED} Selesai</StatusPill>}
      {counts.TERSIMPAN > 0 && <StatusPill className="border-blue-200 bg-blue-50 text-blue-700">{counts.TERSIMPAN} Tersimpan</StatusPill>}
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
    <div className={['rounded-xl border border-zinc-200/80 bg-bg-surface p-2.5', className ?? ''].join(' ')}>
      <p className="font-semibold text-zinc-500">{label}</p>
      <div className="mt-0.5 text-zinc-900">{value}</div>
    </div>
  )
}

function compareDocuments(a: LaporanKinerjaRow, b: LaporanKinerjaRow, sortBy: DetailSortMode) {
  if (sortBy === 'oldest') return dateValue(a.tanggal) - dateValue(b.tanggal)
  if (sortBy === 'title_asc') return a.judul.localeCompare(b.judul, 'id-ID')
  if (sortBy === 'submitter_asc') return a.pengaju_nama.localeCompare(b.pengaju_nama, 'id-ID')
  if (sortBy === 'nominal_desc') return (b.nominal_realisasi ?? 0) - (a.nominal_realisasi ?? 0)
  return dateValue(b.tanggal) - dateValue(a.tanggal)
}

function formatStatusLabel(status: LaporanKinerjaRow['status']) {
  if (status === 'COMPLETED') return 'Selesai'
  return 'Tersimpan'
}

function formatDate(value: string) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
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
