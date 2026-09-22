import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { DokumenDetailDialog } from '#/components/dokumen/DokumenDetailDialog'
import { LampiranDibersihkanBadge } from '#/components/dokumen/LampiranDibersihkanBadge'
import { PegawaiPanel } from '#/components/pegawai/PegawaiPagePrimitives'
import { SummaryCard } from '#/components/kinerja/MonitoringRealisasiView'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { DatePicker } from '#/components/ui/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { ApiError, apiFetch } from '#/lib/api-client'
import { ExportZipDialog } from '#/components/laporan/ExportZipDialog'
import type { DokumenLaporanRow } from '#/lib/dokumen-helpers'
import { downloadZipBlob, extractContentDispositionFilename } from '#/lib/file-helpers'
import { formatDate } from '#/lib/utils/format'
import {
  ArrowLeft,
  Banknote,
  ChevronRight,
  Clock3,
  ClipboardList,
  Download,
  FileText,
  Filter,
  FolderOpen,
  Search,
  ShieldX,
  Users,
} from 'lucide-react'

export const Route = createFileRoute('/pegawai/laporan/kegiatan')({
  validateSearch: z.object({
    kegiatanId: z.string().optional(),
  }),
  component: LaporanKegiatanPage,
})

type CurrentUserResponse = {
  user: {
    id: string
    email?: string
    metadata?: {
      nama_lengkap?: string
    }
  }
}

type KetuaTimKegiatanResponse = {
  is_ketua_tim?: boolean
  kegiatan?: { id: string; nama: string }[]
}

type LaporanKegiatanResponse = {
  dokumen?: DokumenLaporanRow[]
  error?: string
}

type KegiatanFilterValue = {
  fungsiId?: string
  tanggalMulai?: string
  tanggalAkhir?: string
}

type DetailFilterValue = {
  pembuatId?: string
  komponenId?: string
  jenisId?: string
  kategoriId?: string
  detailId?: string
  tanggalMulai?: string
  tanggalAkhir?: string
}

type FungsiOption = {
  id: string
  nama: string
}

type MasterOption = {
  id: string
  nama: string
}

type SortMode = 'newest' | 'oldest' | 'name_asc' | 'documents_desc' | 'nominal_desc'
type DetailSortMode = 'newest' | 'oldest' | 'title_asc' | 'submitter_asc' | 'nominal_desc'

type KegiatanRow = {
  id: string
  nama: string
  ketuaTimName: string
  fungsiNama: string
  dokumen: DokumenLaporanRow[]
  materialCount: number
  nonMaterialCount: number
  totalNominal: number
  latestDate: string | null
  pengajuCount: number
}

const TABLE_HEAD_CLASS = 'px-6 py-4 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500'
const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'newest', label: 'Tanggal terbaru' },
  { value: 'oldest', label: 'Tanggal terlama' },
  { value: 'name_asc', label: 'Nama kegiatan A-Z' },
  { value: 'documents_desc', label: 'Dokumen terbanyak' },
  { value: 'nominal_desc', label: 'Nominal terbesar' },
]
const DETAIL_SORT_OPTIONS: { value: DetailSortMode; label: string }[] = [
  { value: 'newest', label: 'Tanggal terbaru' },
  { value: 'oldest', label: 'Tanggal terlama' },
  { value: 'title_asc', label: 'Judul A-Z' },
  { value: 'submitter_asc', label: 'Pembuat A-Z' },
  { value: 'nominal_desc', label: 'Nominal terbesar' },
]

function LaporanKegiatanPage() {
  const navigate = useNavigate()
  const [detailId, setDetailId] = useState<string | null>(null)
  const { kegiatanId } = Route.useSearch()
  const [dokumen, setDokumen] = useState<DokumenLaporanRow[]>([])
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [allowedKegiatan, setAllowedKegiatan] = useState<{ id: string; nama: string }[]>([])
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<KegiatanFilterValue>({})
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserName, setCurrentUserName] = useState('Ketua Tim')
  const [search, setSearch] = useState('')
  const [detailSearch, setDetailSearch] = useState('')
  const [detailFilter, setDetailFilter] = useState<DetailFilterValue>({})
  const [detailSortBy, setDetailSortBy] = useState<DetailSortMode>('newest')
  const [detailFilterOpen, setDetailFilterOpen] = useState(false)
  const [sortBy, setSortBy] = useState<SortMode>('newest')
  const [filterOpen, setFilterOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportPending, setExportPending] = useState(false)
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    async function checkPermission() {
      setCheckingAuth(true)
      try {
        const meData = await apiFetch<CurrentUserResponse>('/users/me')
        setCurrentUserId(meData.user.id)
        setCurrentUserName(displayCurrentUserName(meData))

        let data: KetuaTimKegiatanResponse
        try {
          data = await apiFetch<KetuaTimKegiatanResponse>('/users/me/ketua-tim')
        } catch {
          setIsAuthorized(false)
          setLoading(false)
          return
        }

        if (!data.is_ketua_tim || !data.kegiatan || data.kegiatan.length === 0) {
          setIsAuthorized(false)
          setLoading(false)
          return
        }

        setIsAuthorized(true)
        setAllowedKegiatan(data.kegiatan)

        try {
          const d = await apiFetch<LaporanKegiatanResponse>('/laporan/kegiatan')
          if (d.error) { setError(d.error); return }
          setDokumen(d.dokumen ?? [])
        } catch (err) {
          if (err instanceof ApiError) {
            const payload = err.payload
            if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
              setError(payload.error)
              return
            }
          }
          throw err
        }
      } catch (err) {
        console.error('Permission check failed:', err)
        setIsAuthorized(false)
      } finally {
        setCheckingAuth(false)
        setLoading(false)
      }
    }

    checkPermission()
  }, [])

  const filteredDocuments = useMemo(() => {
    return dokumen.filter(d => matchesKegiatanListFilter(d, filter))
  }, [dokumen, filter])

  const kegiatanRows = useMemo(() => {
    return buildKegiatanRows(allowedKegiatan, filteredDocuments, currentUserName)
  }, [allowedKegiatan, currentUserName, filteredDocuments])

  const activeFilters = countActiveFilters(filter)

  const filteredKegiatanRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return kegiatanRows
      .filter(row => {
        if (activeFilters > 0 && row.dokumen.length === 0) return false
        if (!query) return true
        return [
          row.nama,
          row.fungsiNama,
          ...row.dokumen.map(d => d.judul),
          ...row.dokumen.map(d => d.pengaju_nama),
        ].some(value => value?.toLowerCase().includes(query))
      })
      .sort((a, b) => compareKegiatanRows(a, b, sortBy))
  }, [activeFilters, kegiatanRows, search, sortBy])

  const selectedKegiatan = useMemo(() => {
    return kegiatanRows.find(row => row.id === kegiatanId) ?? null
  }, [kegiatanRows, kegiatanId])

  const selectedDocuments = useMemo(() => {
    if (!selectedKegiatan) return []
    const query = detailSearch.trim().toLowerCase()
    return selectedKegiatan.dokumen
      .filter(d => {
        if (detailFilter.pembuatId && (d.pengaju_id ?? d.created_by) !== detailFilter.pembuatId) return false
        if (detailFilter.komponenId && d.komponen_id !== detailFilter.komponenId) return false
        if (detailFilter.jenisId && d.jenis_permintaan_id !== detailFilter.jenisId) return false
        if (detailFilter.kategoriId && d.kategori_permintaan_id !== detailFilter.kategoriId) return false
        if (detailFilter.detailId && d.detail_permintaan_id !== detailFilter.detailId) return false
        if (detailFilter.tanggalMulai && d.tanggal < detailFilter.tanggalMulai) return false
        if (detailFilter.tanggalAkhir && d.tanggal > detailFilter.tanggalAkhir) return false
        if (!query) return true
        return [
          d.judul,
          d.fungsi_nama,
          d.kegiatan_nama,
          d.leaf_node_nama,
          d.jenis_permintaan_nama,
          d.kategori_permintaan_nama,
          d.detail_permintaan_nama,
          d.pengaju_nama,
        ].some(value => value?.toLowerCase().includes(query))
      })
      .sort((a, b) => compareDetailDocuments(a, b, detailSortBy))
  }, [detailFilter, detailSearch, detailSortBy, selectedKegiatan])

  const isCurrentUser = (dok: DokumenLaporanRow) => dok.pengaju_id === currentUserId

  async function handleExportZip() {
    if (selectedDocuments.length === 0 || selectedDocuments.length > 500) return

    setExportPending(true)
    setExportError('')

    try {
      const response = await fetch('/api/laporan/kegiatan/export-zip', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dokumen_ids: selectedDocuments.map((dok) => dok.id) }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Gagal membuat ekspor ZIP')
      }

      const blob = await response.blob()
      const filename = extractContentDispositionFilename(
        response.headers.get('Content-Disposition'),
        'Laporan_Kegiatan.zip',
      )
      downloadZipBlob(blob, filename)
      setExportDialogOpen(false)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Gagal membuat ekspor ZIP')
    } finally {
      setExportPending(false)
    }
  }

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-7 px-7 pt-6 sm:px-8 lg:px-10">
        {checkingAuth && (
          <LoadingState variant="page" label="Memeriksa akses laporan kegiatan" />
        )}

        {!checkingAuth && !isAuthorized && (
          <EmptyState
            title="Akses ditolak"
            description="Halaman Laporan Kegiatan hanya dapat diakses oleh Pegawai yang ditunjuk sebagai Ketua Tim pada suatu kegiatan."
            icon={<ShieldX size={20} />}
            action={<Button onClick={() => { window.location.href = '/' }}>Kembali ke Dashboard</Button>}
          />
        )}

        {!checkingAuth && isAuthorized && selectedKegiatan ? (
          <KegiatanDetailView
            kegiatan={selectedKegiatan}
            dokumen={selectedDocuments}
            totalDokumen={selectedKegiatan.dokumen.length}
            search={detailSearch}
            onSearchChange={setDetailSearch}
            filter={detailFilter}
            onFilterChange={setDetailFilter}
            filterOpen={detailFilterOpen}
            onFilterOpenChange={setDetailFilterOpen}
            sortBy={detailSortBy}
            onSortChange={setDetailSortBy}
            onBack={() => selectKegiatan(null, navigate)}
            onOpenDocument={(documentId) => setDetailId(documentId)}
            isCurrentUser={isCurrentUser}
            exportDialogOpen={exportDialogOpen}
            onExportDialogOpenChange={setExportDialogOpen}
            exportPending={exportPending}
            exportError={exportError}
            onExportConfirm={handleExportZip}
          />
        ) : null}

        {!checkingAuth && isAuthorized && !selectedKegiatan && (
          <>
            <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-5">
                <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brand-border bg-bg-surface text-brand-solid shadow-[0_2px_8px_rgba(251,146,60,0.14)]">
                  <Users size={22} />
                </div>
                <div className="min-w-0">
                  <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[30px]">
                    Laporan Kegiatan
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-zinc-700">
                    Pantau dokumen berdasarkan kegiatan yang Anda pimpin sebagai Ketua Tim.
                  </p>
                </div>
              </div>
            </section>

            <ReportToolbar
              search={search}
              onSearchChange={setSearch}
              searchLabel="Cari laporan kegiatan"
              placeholder="Cari nama kegiatan, fungsi, atau dokumen..."
              filterOpen={filterOpen}
              onFilterOpenChange={setFilterOpen}
              activeFilters={activeFilters}
              sortBy={sortBy}
              onSortChange={setSortBy}
              resultLabel={`${filteredKegiatanRows.length} Kegiatan Ditemukan`}
              filter={filter}
              onFilterChange={setFilter}
            />

            {loading && <LoadingState variant="list" rows={4} label="Memuat laporan kegiatan" />}

            {!loading && error && (
              <ErrorState title="Gagal memuat laporan kegiatan" description={error} variant="page" />
            )}

            {!loading && !error && filteredKegiatanRows.length === 0 && kegiatanRows.length > 0 && (
              <EmptyState
                title="Tidak ada kegiatan yang cocok"
                description="Reset filter atau ubah kata kunci untuk melihat kegiatan lain."
                icon={<Filter size={20} />}
                action={<Button variant="outline" size="sm" onClick={() => { setFilter({}); setSearch('') }}>Reset Filter</Button>}
              />
            )}

            {!loading && !error && filteredKegiatanRows.length === 0 && kegiatanRows.length === 0 && (
              <EmptyState
                title="Belum ada kegiatan yang Anda pimpin"
                description="Kegiatan akan muncul di sini jika Anda terdaftar sebagai Ketua Tim."
                icon={<Users size={20} />}
              />
            )}

            {!loading && !error && filteredKegiatanRows.length > 0 && (
              <KegiatanList rows={filteredKegiatanRows} onSelect={(id) => selectKegiatan(id, navigate)} />
            )}
          </>
        )}

        <DokumenDetailDialog
          dokumenId={detailId}
          open={detailId !== null}
          onOpenChange={(open) => { if (!open) setDetailId(null) }}
        />
      </div>
    </PageLayout>
  )
}

function ReportToolbar({
  search,
  onSearchChange,
  searchLabel,
  placeholder,
  filterOpen,
  onFilterOpenChange,
  activeFilters,
  sortBy,
  onSortChange,
  resultLabel,
  filter,
  onFilterChange,
}: {
  search: string
  onSearchChange: (value: string) => void
  searchLabel: string
  placeholder: string
  filterOpen: boolean
  onFilterOpenChange: (value: boolean) => void
  activeFilters: number
  sortBy: SortMode
  onSortChange: (value: SortMode) => void
  resultLabel: string
  filter: KegiatanFilterValue
  onFilterChange: (value: KegiatanFilterValue) => void
}) {
  return (
    <div className="overflow-hidden rounded-[26px] border border-zinc-200/80 bg-bg-surface shadow-[0_3px_14px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative min-w-0 flex-1 lg:max-w-xl">
          <span className="sr-only">{searchLabel}</span>
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            type="search"
            placeholder={placeholder}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-11 w-full rounded-[20px] border border-zinc-200 bg-bg-surface pl-11 pr-4 text-sm font-medium text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-brand-border-strong focus:ring-4 focus:ring-brand-border/60"
          />
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant={filterOpen || activeFilters > 0 ? 'outline' : 'ghost'}
            className={[
              'h-11 rounded-[22px] border px-4 text-sm font-extrabold shadow-sm',
              filterOpen || activeFilters > 0
                ? 'border-brand-border-strong bg-brand-surface text-brand-text hover:bg-brand-surface'
                : 'border-zinc-200 bg-bg-surface text-zinc-950 hover:bg-brand-surface',
            ].join(' ')}
            onClick={() => onFilterOpenChange(!filterOpen)}
          >
            <Filter size={16} />
            Filter Lanjutan
            {activeFilters > 0 && (
              <span className="ml-1 rounded-full bg-brand-text px-1.5 py-0.5 text-[10px] leading-none text-white">
                {activeFilters}
              </span>
            )}
          </Button>
          <label>
            <span className="sr-only">Urutkan laporan kegiatan</span>
            <Select
              value={sortBy}
              onValueChange={(value) => onSortChange(value as SortMode)}
            >
              <SelectTrigger className="min-h-10 w-full rounded-xl border-brand-border bg-bg-surface px-4 text-sm font-semibold hover:border-brand-border-strong sm:w-fit">
                <SelectValue placeholder="Tanggal terbaru">
                  {selected => SORT_OPTIONS.find(option => option.value === selected)?.label ?? 'Tanggal terbaru'}
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
      </div>

      {filterOpen && (
        <div className="border-b border-zinc-100 bg-bg-surface p-4 sm:p-5">
          <KegiatanAdvancedFilter value={filter} onChange={onFilterChange} />
          <div className="mt-5 flex flex-col gap-2 border-t border-zinc-100 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" className="font-bold" onClick={() => onFilterChange({})}>
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

function KegiatanAdvancedFilter({
  value,
  onChange,
}: {
  value: KegiatanFilterValue
  onChange: (value: KegiatanFilterValue) => void
}) {
  const [fungsis, setFungsis] = useState<FungsiOption[]>([])

  useEffect(() => {
    let active = true
    apiFetch<FungsiOption[]>('/master-fungsi')
      .then(data => {
        if (active) setFungsis(data)
      })
      .catch(() => {
        if (active) setFungsis([])
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="rounded-[22px] border border-zinc-200/80 bg-brand-surface/35 p-4 shadow-none">
      <div className="grid gap-4 lg:grid-cols-3">
        <label className="space-y-2">
          <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Fungsi</span>
          <Select
            value={value.fungsiId || '_all'}
            onValueChange={(fungsiId) => onChange({ ...value, fungsiId: fungsiId === '_all' ? undefined : fungsiId })}
          >
            <SelectTrigger className="min-h-10 w-full rounded-xl border-brand-border bg-bg-surface px-4 text-sm font-semibold hover:border-brand-border-strong">
              <SelectValue placeholder="Semua Fungsi">
                {selected => selected && selected !== '_all'
                  ? fungsis.find(fungsi => fungsi.id === selected)?.nama ?? 'Semua Fungsi'
                  : 'Semua Fungsi'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Semua Fungsi</SelectItem>
            {fungsis.map(fungsi => (
                <SelectItem key={fungsi.id} value={fungsi.id}>{fungsi.nama}</SelectItem>
            ))}
            </SelectContent>
          </Select>
        </label>
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

function KegiatanList({ rows, onSelect }: { rows: KegiatanRow[]; onSelect: (id: string) => void }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-bg-surface shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block">
        <Table className="text-left">
          <TableHeader>
            <TableRow className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
              <TableHead className={TABLE_HEAD_CLASS}>Kegiatan</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Fungsi</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Jumlah Dokumen</TableHead>
              <TableHead className={`text-center ${TABLE_HEAD_CLASS}`}>Nominal Realisasi</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Tanggal Terakhir</TableHead>
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
                  <p className="mt-1 text-xs font-medium text-zinc-500">{row.pengajuCount} pegawai dalam daftar</p>
                </TableCell>
                <TableCell className="max-w-[220px] px-6 py-5">
                  <span className="block truncate text-sm font-normal text-zinc-900">{row.fungsiNama}</span>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-extrabold text-zinc-700">
                    {row.dokumen.length} Dokumen
                  </span>
                </TableCell>
                <TableCell className="px-6 py-5 text-center font-mono text-sm font-bold text-zinc-950">
                  {row.totalNominal > 0 ? formatRupiah(row.totalNominal) : '-'}
                </TableCell>
                <TableCell className="px-6 py-5">
                  {row.latestDate ? <DateCell value={row.latestDate} /> : <span className="text-sm font-semibold text-zinc-500">-</span>}
                </TableCell>
                <TableCell className="px-6 py-5 text-right">
                  <Button
                    size="icon-lg"
                    variant="ghost"
                    className="size-10 rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-600 opacity-100 shadow-sm transition hover:border-brand-border-strong hover:bg-brand-surface hover:text-brand-solid hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] group-hover:border-brand-border-strong group-hover:bg-brand-surface group-hover:text-brand-solid group-hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] [&_svg]:!size-5"
                    aria-label={`Detail kegiatan ${row.nama}`}
                  >
                    <ChevronRight strokeWidth={2.35} />
                  </Button>
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
              <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-extrabold text-zinc-700">
                {row.dokumen.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
              <InfoTile label="Fungsi" value={row.fungsiNama} className="col-span-2" />
              <InfoTile label="Tanggal" value={row.latestDate ? <DateCell value={row.latestDate} className="mt-1" /> : '-'} />
              <InfoTile
                label="Nominal"
                value={<span className="font-mono font-bold text-zinc-950">{row.totalNominal > 0 ? formatRupiah(row.totalNominal) : '-'}</span>}
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

function KegiatanDetailView({
  kegiatan,
  dokumen,
  totalDokumen,
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
  isCurrentUser,
  exportDialogOpen,
  onExportDialogOpenChange,
  exportPending,
  exportError,
  onExportConfirm,
}: {
  kegiatan: KegiatanRow
  dokumen: DokumenLaporanRow[]
  totalDokumen: number
  search: string
  onSearchChange: (value: string) => void
  filter: DetailFilterValue
  onFilterChange: (value: DetailFilterValue) => void
  filterOpen: boolean
  onFilterOpenChange: (value: boolean) => void
  sortBy: DetailSortMode
  onSortChange: (value: DetailSortMode) => void
  onBack: () => void
  onOpenDocument: (id: string) => void
  isCurrentUser: (dok: DokumenLaporanRow) => boolean
  exportDialogOpen: boolean
  onExportDialogOpenChange: (open: boolean) => void
  exportPending: boolean
  exportError: string
  onExportConfirm: () => void
}) {
  const activeFilters = countActiveDetailFilters(filter)
  const pembuatOptions = useMemo(() => buildPembuatOptions(kegiatan.dokumen), [kegiatan.dokumen])

  return (
    <>
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Button
            type="button"
            size="icon-lg"
            variant="ghost"
            className="mt-1 size-10 shrink-0 rounded-xl border border-zinc-200 bg-bg-surface text-zinc-600 shadow-sm hover:border-brand-border-strong hover:bg-brand-surface hover:text-brand-solid"
            onClick={onBack}
            aria-label="Kembali ke daftar kegiatan"
          >
            <ArrowLeft size={18} />
          </Button>
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold text-zinc-600">Laporan Kegiatan</p>
            <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[30px]">
              {kegiatan.nama}
            </h1>
            <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-zinc-700">
              Daftar dokumen final dalam kegiatan yang Anda pimpin.
            </p>
          </div>
        </div>
        <div className="rounded-[18px] border border-brand-border bg-bg-surface px-4 py-3 text-xs font-bold text-brand-text shadow-sm">
          Halaman ini menampilkan dokumen terkait kegiatan yang Anda pimpin.
        </div>
      </section>

      <KegiatanDetailCards kegiatan={kegiatan} />

      <KegiatanDetailToolbar
        kegiatanId={kegiatan.id}
        search={search}
        onSearchChange={onSearchChange}
        filter={filter}
        onFilterChange={onFilterChange}
        filterOpen={filterOpen}
        onFilterOpenChange={onFilterOpenChange}
        activeFilters={activeFilters}
        sortBy={sortBy}
        onSortChange={onSortChange}
        pembuatOptions={pembuatOptions}
        resultLabel={`${dokumen.length} dari ${totalDokumen} dokumen ditampilkan`}
        exportCount={dokumen.length}
        onExportClick={() => onExportDialogOpenChange(true)}
      />

      <ExportZipDialog
        open={exportDialogOpen}
        onOpenChange={onExportDialogOpenChange}
        documentCount={dokumen.length}
        description={`Mengikuti dokumen yang sedang ditampilkan pada kegiatan "${kegiatan.nama}".`}
        pending={exportPending}
        error={exportError}
        onConfirm={onExportConfirm}
      />

      {dokumen.length === 0 ? (
        <EmptyState
          title="Tidak ada dokumen yang cocok"
          description="Ubah kata kunci untuk melihat dokumen lain dalam kegiatan ini."
          icon={<Search size={20} />}
        />
      ) : (
        <DocumentTable dokumen={dokumen} isCurrentUser={isCurrentUser} onOpenDocument={onOpenDocument} />
      )}
    </>
  )
}

function KegiatanDetailToolbar({
  kegiatanId,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  filterOpen,
  onFilterOpenChange,
  activeFilters,
  sortBy,
  onSortChange,
  pembuatOptions,
  resultLabel,
  exportCount,
  onExportClick,
}: {
  kegiatanId: string
  search: string
  onSearchChange: (value: string) => void
  filter: DetailFilterValue
  onFilterChange: (value: DetailFilterValue) => void
  filterOpen: boolean
  onFilterOpenChange: (value: boolean) => void
  activeFilters: number
  sortBy: DetailSortMode
  onSortChange: (value: DetailSortMode) => void
  pembuatOptions: { id: string; nama: string }[]
  resultLabel: string
  exportCount: number
  onExportClick: () => void
}) {
  return (
    <div className="overflow-hidden rounded-[26px] border border-zinc-200/80 bg-bg-surface shadow-[0_3px_14px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative min-w-0 flex-1 lg:max-w-xl">
          <span className="sr-only">Cari dokumen kegiatan</span>
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            type="search"
            placeholder="Cari berdasarkan judul dokumen, jenis, atau kategori..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-11 w-full rounded-[20px] border border-zinc-200 bg-bg-surface pl-11 pr-4 text-sm font-medium text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-brand-border-strong focus:ring-4 focus:ring-brand-border/60"
          />
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant={filterOpen || activeFilters > 0 ? 'outline' : 'ghost'}
            className={[
              'h-11 rounded-[22px] border px-4 text-sm font-extrabold shadow-sm',
              filterOpen || activeFilters > 0
                ? 'border-brand-border-strong bg-brand-surface text-brand-text hover:bg-brand-surface'
                : 'border-zinc-200 bg-bg-surface text-zinc-950 hover:bg-brand-surface',
            ].join(' ')}
            onClick={() => onFilterOpenChange(!filterOpen)}
          >
            <Filter size={16} />
            Filter Lanjutan
            {activeFilters > 0 && (
              <span className="ml-1 rounded-full bg-brand-text px-1.5 py-0.5 text-[10px] leading-none text-white">
                {activeFilters}
              </span>
            )}
          </Button>
          <label>
            <span className="sr-only">Urutkan dokumen kegiatan</span>
            <Select
              value={sortBy}
              onValueChange={(value) => onSortChange(value as DetailSortMode)}
            >
              <SelectTrigger className="min-h-10 w-full rounded-xl border-brand-border bg-bg-surface px-4 text-sm font-semibold hover:border-brand-border-strong sm:w-fit">
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
        <div className="border-b border-zinc-100 bg-bg-surface p-4 sm:p-5">
          <KegiatanDetailAdvancedFilter
            kegiatanId={kegiatanId}
            value={filter}
            onChange={onFilterChange}
            pembuatOptions={pembuatOptions}
          />
          <div className="mt-5 flex flex-col gap-2 border-t border-zinc-100 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" className="font-bold" onClick={() => onFilterChange({})}>
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

      <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm font-bold text-zinc-950">{resultLabel}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 border-brand-border bg-bg-surface font-bold"
          disabled={exportCount === 0}
          onClick={onExportClick}
        >
          <Download size={14} />
          Ekspor Semua File (ZIP)
        </Button>
      </div>
    </div>
  )
}

function KegiatanDetailAdvancedFilter({
  kegiatanId,
  value,
  onChange,
  pembuatOptions,
}: {
  kegiatanId: string
  value: DetailFilterValue
  onChange: (value: DetailFilterValue) => void
  pembuatOptions: { id: string; nama: string }[]
}) {
  const [komponenOptions, setKomponenOptions] = useState<MasterOption[]>([])
  const [jenisOptions, setJenisOptions] = useState<MasterOption[]>([])
  const [kategoriOptions, setKategoriOptions] = useState<MasterOption[]>([])
  const [detailOptions, setDetailOptions] = useState<MasterOption[]>([])

  useEffect(() => {
    let active = true
    if (!kegiatanId) {
      setKomponenOptions([])
      return () => {
        active = false
      }
    }

    apiFetch<MasterOption[]>('/master-komponen', { query: { kegiatan_id: kegiatanId } })
      .then(data => {
        if (active) setKomponenOptions(data)
      })
      .catch(() => {
        if (active) setKomponenOptions([])
      })
    return () => {
      active = false
    }
  }, [kegiatanId])

  useEffect(() => {
    let active = true
    apiFetch<MasterOption[]>('/master-jenis')
      .then(data => {
        if (active) setJenisOptions(data)
      })
      .catch(() => {
        if (active) setJenisOptions([])
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    if (!value.jenisId) {
      setKategoriOptions([])
      setDetailOptions([])
      return () => {
        active = false
      }
    }

    apiFetch<MasterOption[]>('/master-kategori', { query: { jenis_id: value.jenisId } })
      .then(data => {
        if (active) setKategoriOptions(data)
      })
      .catch(() => {
        if (active) setKategoriOptions([])
      })

    return () => {
      active = false
    }
  }, [value.jenisId])

  useEffect(() => {
    let active = true
    if (!value.kategoriId) {
      setDetailOptions([])
      return () => {
        active = false
      }
    }

    apiFetch<MasterOption[]>('/master-detail', { query: { kategori_id: value.kategoriId } })
      .then(data => {
        if (active) setDetailOptions(data)
      })
      .catch(() => {
        if (active) setDetailOptions([])
      })

    return () => {
      active = false
    }
  }, [value.kategoriId])

  return (
    <div className="rounded-[22px] border border-zinc-200/80 bg-brand-surface/35 p-4 shadow-none">
      <div className="grid gap-4 lg:grid-cols-3">
        <DetailSelect
          label="Pembuat Dokumen"
          value={value.pembuatId}
          allLabel="Semua Pembuat Dokumen"
          options={pembuatOptions}
          onChange={(pembuatId) => onChange({ ...value, pembuatId })}
        />
        <DetailSelect
          label="Komponen"
          value={value.komponenId}
          allLabel="Semua Komponen"
          options={komponenOptions}
          onChange={(komponenId) => onChange({ ...value, komponenId })}
        />
        <DetailSelect
          label="Jenis Permintaan"
          value={value.jenisId}
          allLabel="Semua Jenis"
          options={jenisOptions}
          onChange={(jenisId) => onChange({ ...value, jenisId, kategoriId: undefined, detailId: undefined })}
        />
        <DetailSelect
          label="Kategori Permintaan"
          value={value.kategoriId}
          allLabel="Semua Kategori"
          options={kategoriOptions}
          disabled={!value.jenisId}
          onChange={(kategoriId) => onChange({ ...value, kategoriId, detailId: undefined })}
        />
        <DetailSelect
          label="Detail Permintaan"
          value={value.detailId}
          allLabel="Semua Detail"
          options={detailOptions}
          disabled={!value.kategoriId}
          onChange={(detailId) => onChange({ ...value, detailId })}
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

function DetailSelect({
  label,
  value,
  allLabel,
  options,
  disabled = false,
  onChange,
}: {
  label: string
  value?: string
  allLabel: string
  options: { id: string; nama: string }[]
  disabled?: boolean
  onChange: (value: string | undefined) => void
}) {
  return (
    <label className="space-y-2">
      <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <Select
        value={value || '_all'}
        onValueChange={(selected) => onChange(selected === '_all' ? undefined : selected)}
        disabled={disabled}
      >
        <SelectTrigger className="min-h-10 w-full rounded-xl border-brand-border bg-bg-surface px-4 text-sm font-semibold hover:border-brand-border-strong disabled:opacity-60">
          <SelectValue placeholder={allLabel}>
            {selected => selected && selected !== '_all'
              ? options.find(option => option.id === selected)?.nama ?? allLabel
              : allLabel}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">{allLabel}</SelectItem>
          {options.map(option => (
            <SelectItem key={option.id} value={option.id}>{option.nama}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

function KegiatanDetailCards({
  kegiatan,
}: {
  kegiatan: KegiatanRow
}) {
  const materialCount = kegiatan.dokumen.filter(dok => !dok.is_non_material).length
  const nonMaterialCount = kegiatan.dokumen.filter(dok => dok.is_non_material).length

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        label="Nama Kegiatan"
        value={kegiatan.nama}
        detail={`Ketua Tim: ${kegiatan.ketuaTimName}`}
        icon={<FolderOpen size={16} />}
        tone="neutral"
      />
      <SummaryCard
        label="Dokumen Material"
        value={materialCount.toLocaleString('id-ID')}
        detail="Total Dokumen Belanja"
        icon={<ClipboardIcon />}
        tone="gold"
      />
      <SummaryCard
        label="Dokumen Non-Material"
        value={nonMaterialCount.toLocaleString('id-ID')}
        detail="Total Dokumen Non-Belanja"
        icon={<FileText size={16} />}
        tone="orange"
      />
      <SummaryCard
        label="Total Nominal Realisasi"
        value={formatRupiah(kegiatan.totalNominal)}
        detail="Hanya Belanja Material"
        icon={<Banknote size={16} />}
        tone="money"
      />
    </div>
  )
}

function ClipboardIcon() {
  return <ClipboardList size={16} />
}

function DocumentTable({
  dokumen,
  isCurrentUser,
  onOpenDocument,
}: {
  dokumen: DokumenLaporanRow[]
  isCurrentUser: (dok: DokumenLaporanRow) => boolean
  onOpenDocument: (id: string) => void
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-bg-surface shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block">
        <Table className="text-left">
          <TableHeader>
            <TableRow className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
              <TableHead className={TABLE_HEAD_CLASS}>Judul Dokumen</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Jenis Scope</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Tanggal Pengajuan</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Status</TableHead>
              <TableHead className={`text-center ${TABLE_HEAD_CLASS}`}>Nominal Realisasi</TableHead>
              <TableHead className={`w-20 text-right ${TABLE_HEAD_CLASS}`}>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-zinc-100 text-[13px]">
            {dokumen.map(dok => (
              <TableRow
                key={dok.id}
                className="group cursor-pointer border-zinc-100 bg-bg-surface transition-colors hover:bg-brand-surface/70"
                onClick={() => onOpenDocument(dok.id)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpenDocument(dok.id)
                  }
                }}
                aria-label={`Detail Dokumen ${dok.judul}`}
              >
                <TableCell className="max-w-[460px] px-6 py-5">
                  <p className="line-clamp-2 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-brand-text">{dok.judul}</p>
                  <p className="mt-1 text-xs font-medium text-zinc-500">
                    Pembuat: {(dok as any).pengaju_nama ?? 'Tidak diketahui'}
                    {isCurrentUser(dok) ? <Badge className="ml-2 border-brand-border-strong bg-brand-surface text-brand-solid-active">Anda</Badge> : null}
                  </p>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <ScopeBadge dok={dok} />
                </TableCell>
                <TableCell className="px-6 py-5">
                  <DateCell value={dok.tanggal} />
                </TableCell>
                <TableCell className="px-6 py-5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ReportStatusBadge status={dok.status} />
                    <LampiranDibersihkanBadge
                      lampiranDibersihkanAt={dok.lampiran_dibersihkan_at}
                      lampiranDibersihkanAlasan={dok.lampiran_dibersihkan_alasan}
                    />
                  </div>
                </TableCell>
                <TableCell className="px-6 py-5 text-center font-mono text-sm font-bold text-zinc-950">
                  {dok.is_non_material ? '-' : formatRupiah(dok.nominal_realisasi ?? 0)}
                </TableCell>
                <TableCell className="px-6 py-5 text-right">
                  <DocumentDetailButton dok={dok} onOpenDocument={onOpenDocument} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {dokumen.map((dok, idx) => (
          <PegawaiPanel
            key={dok.id}
            className="group cursor-pointer space-y-3 border-zinc-200/80 p-4 shadow-[0_2px_10px_rgba(15,23,42,0.06)] transition hover:border-brand-border hover:bg-bg-surface"
            onClick={() => onOpenDocument(dok.id)}
            tabIndex={0}
            role="button"
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onOpenDocument(dok.id)
              }
            }}
            aria-label={`Detail Dokumen ${dok.judul}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand-solid-active/70">Dokumen #{idx + 1}</p>
                <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-950">{dok.judul}</h2>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                <ReportStatusBadge status={dok.status} />
                <LampiranDibersihkanBadge
                  lampiranDibersihkanAt={dok.lampiran_dibersihkan_at}
                  lampiranDibersihkanAlasan={dok.lampiran_dibersihkan_alasan}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
              <InfoTile label="Scope" value={dok.is_non_material ? 'Non-Material' : 'Material'} />
              <InfoTile label="Tanggal" value={<DateCell value={dok.tanggal} className="mt-1" />} />
              <InfoTile label="Pembuat" value={(dok as any).pengaju_nama ?? 'Tidak diketahui'} className="col-span-2" />
            </div>
            <div className="border-t border-zinc-100 pt-3">
              <DocumentDetailButton dok={dok} onOpenDocument={onOpenDocument} mobile />
            </div>
          </PegawaiPanel>
        ))}
      </div>
    </>
  )
}

function DocumentDetailButton({
  dok,
  onOpenDocument,
  mobile = false,
}: {
  dok: DokumenLaporanRow
  onOpenDocument: (id: string) => void
  mobile?: boolean
}) {
  return (
    <Button
      type="button"
      size={mobile ? 'sm' : 'icon-lg'}
      variant={mobile ? 'outline' : 'ghost'}
      className={mobile
        ? 'w-full gap-1.5'
        : 'size-10 rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-600 opacity-100 shadow-sm transition hover:border-brand-border-strong hover:bg-brand-surface hover:text-brand-solid hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] group-hover:border-brand-border-strong group-hover:bg-brand-surface group-hover:text-brand-solid group-hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] [&_svg]:!size-5'}
      aria-label={`Detail Dokumen ${dok.judul}`}
      onClick={(event) => {
        event.stopPropagation()
        onOpenDocument(dok.id)
      }}
    >
      <ChevronRight strokeWidth={2.35} />
      {mobile ? 'Detail Dokumen' : null}
    </Button>
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

function InfoTile({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={['rounded-xl border border-zinc-200/80 bg-bg-surface p-2.5', className ?? ''].join(' ')}>
      <p className="font-semibold text-zinc-500">{label}</p>
      <div className="mt-0.5 text-zinc-900">{value}</div>
    </div>
  )
}

function ScopeBadge({ dok }: { dok: DokumenLaporanRow }) {
  return (
    <span className={[
      'inline-flex w-fit items-center rounded-md border px-2.5 py-1 text-[11px] font-extrabold tracking-[0.04em]',
      dok.is_non_material
        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700',
    ].join(' ')}>
      {dok.is_non_material ? 'Non-Material' : 'Material'}
    </span>
  )
}

function ReportStatusBadge({ status, className }: { status: string; className?: string }) {
  const statusMap: Record<string, { label: string; className: string }> = {
    COMPLETED: { label: 'Selesai', className: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700' },
    TERSIMPAN: { label: 'Tersimpan', className: 'border-zinc-200 bg-zinc-50 text-zinc-600' },
  }
  const presentation = statusMap[status] ?? {
    label: status || 'Status Tidak Diketahui',
    className: 'border-zinc-200 bg-zinc-50 text-zinc-600',
  }

  return (
    <span className={[
      'inline-flex w-fit items-center rounded-md border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-nowrap',
      presentation.className,
      className ?? '',
    ].join(' ')}>
      {presentation.label}
    </span>
  )
}

function buildKegiatanRows(allowedKegiatan: { id: string; nama: string }[], documents: DokumenLaporanRow[], ketuaTimName: string): KegiatanRow[] {
  return allowedKegiatan.map(kegiatan => {
    const docs = documents.filter(d => d.kegiatan_jenis_id === kegiatan.id)
    const latestDate = docs.reduce<string | null>((latest, dok) => {
      if (!dok.tanggal) return latest
      if (!latest) return dok.tanggal
      return dateValue(dok.tanggal) > dateValue(latest) ? dok.tanggal : latest
    }, null)

    return {
      id: kegiatan.id,
      nama: docs[0]?.kegiatan_nama ?? kegiatan.nama,
      ketuaTimName,
      fungsiNama: docs[0]?.fungsi_nama ?? '-',
      dokumen: docs,
      materialCount: docs.filter(d => !d.is_non_material).length,
      nonMaterialCount: docs.filter(d => d.is_non_material).length,
      totalNominal: docs.reduce((sum, d) => sum + (d.is_non_material ? 0 : d.nominal_realisasi ?? 0), 0),
      latestDate,
      pengajuCount: new Set(docs.map(d => d.pengaju_id ?? d.created_by).filter(Boolean)).size,
    }
  })
}

function matchesKegiatanListFilter(d: DokumenLaporanRow, filter: KegiatanFilterValue) {
  if (filter.fungsiId && d.fungsi_id !== filter.fungsiId) return false
  if (filter.tanggalMulai && d.tanggal < filter.tanggalMulai) return false
  if (filter.tanggalAkhir && d.tanggal > filter.tanggalAkhir) return false
  return true
}

function compareKegiatanRows(a: KegiatanRow, b: KegiatanRow, sortBy: SortMode) {
  if (sortBy === 'oldest') return dateValue(a.latestDate) - dateValue(b.latestDate)
  if (sortBy === 'name_asc') return a.nama.localeCompare(b.nama, 'id-ID')
  if (sortBy === 'documents_desc') return b.dokumen.length - a.dokumen.length
  if (sortBy === 'nominal_desc') return b.totalNominal - a.totalNominal
  return dateValue(b.latestDate) - dateValue(a.latestDate)
}

function compareDetailDocuments(a: DokumenLaporanRow, b: DokumenLaporanRow, sortBy: DetailSortMode) {
  if (sortBy === 'oldest') return dateValue(a.tanggal) - dateValue(b.tanggal)
  if (sortBy === 'title_asc') return a.judul.localeCompare(b.judul, 'id-ID')
  if (sortBy === 'submitter_asc') return getSubmitterName(a).localeCompare(getSubmitterName(b), 'id-ID')
  if (sortBy === 'nominal_desc') return (b.nominal_realisasi ?? 0) - (a.nominal_realisasi ?? 0)
  return dateValue(b.tanggal) - dateValue(a.tanggal)
}

function buildPembuatOptions(documents: DokumenLaporanRow[]) {
  const options = new Map<string, string>()
  for (const dok of documents) {
    const id = dok.pengaju_id ?? dok.created_by
    if (!id) continue
    options.set(id, getSubmitterName(dok))
  }
  return Array.from(options, ([id, nama]) => ({ id, nama }))
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id-ID'))
}

function getSubmitterName(dok: DokumenLaporanRow) {
  return dok.pengaju_nama ?? 'Tidak diketahui'
}

function displayCurrentUserName(response: CurrentUserResponse) {
  return response.user.metadata?.nama_lengkap
    ?? response.user.email?.split('@')[0]
    ?? 'Ketua Tim'
}

function selectKegiatan(id: string | null, navigate: ReturnType<typeof useNavigate>) {
  navigate({
    to: '/pegawai/laporan/kegiatan',
    search: id ? { kegiatanId: id } : {},
  })
}

function countActiveFilters(filter: KegiatanFilterValue) {
  return [
    filter.fungsiId,
    filter.tanggalMulai,
    filter.tanggalAkhir,
  ].filter(Boolean).length
}

function countActiveDetailFilters(filter: DetailFilterValue) {
  return [
    filter.pembuatId,
    filter.komponenId,
    filter.jenisId,
    filter.kategoriId,
    filter.detailId,
    filter.tanggalMulai,
    filter.tanggalAkhir,
  ].filter(Boolean).length
}

function dateValue(value?: string | null) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function formatRupiah(value: number) {
  if (!value) return '-'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}
