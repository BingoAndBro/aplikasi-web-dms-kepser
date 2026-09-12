import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { PegawaiPanel } from '#/components/pegawai/PegawaiPagePrimitives'
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
import { Checkbox } from '#/components/ui/checkbox'
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
import { ConfirmDialog } from '#/components/ui/ConfirmDialog'
import { useAppToast } from '#/components/ui/AppToast'
import { ApiError, apiFetch } from '#/lib/api-client'
import { formatDate } from '#/lib/utils/format'
import { PEMBERSIHAN_DOKUMEN_CONFIRMATION_PHRASE } from '#/lib/dokumen/pembersihan'
import {
  AlertTriangle,
  Clock3,
  Filter,
  FolderOpen,
  Search,
  ShieldX,
  Trash2,
  Users,
} from 'lucide-react'

export const Route = createFileRoute('/pegawai/pembersihan-dokumen')({
  ssr: false,
  component: PembersihanDokumenPage,
})

// -----------------------------------------------------------------------------
// Types (matches GET/POST /api/pembersihan-dokumen response shapes)
// -----------------------------------------------------------------------------

type PembersihanDokumenRow = {
  id: string
  judul: string
  nama_dokumen: string | null
  tanggal: string
  tahun: number
  created_by: string
  pengaju_nama: string
  kegiatan_jenis_id: string
  kegiatan_nama?: string
  jumlah_lampiran: number
  umur_hari: number | null
  is_stale: boolean
}

type PembersihanDokumenResponse = {
  dokumen?: PembersihanDokumenRow[]
  is_ketua_tim?: boolean
  stale_count?: number
  stale_days?: number
  error?: string
}

type PembersihanReportItem = {
  dokumen_id: string
  outcome: 'cleaned' | 'skipped' | 'failed'
  reason?: string
}

type PembersihanReport = {
  requested_count: number
  cleaned_count: number
  skipped_count: number
  failed_count: number
  items: PembersihanReportItem[]
}

type PembersihanBersihkanResponse = {
  success?: boolean
  report?: PembersihanReport
  error?: string
}

type FilterValue = {
  kegiatanId?: string
  tanggalMulai?: string
  tanggalAkhir?: string
  onlyStale?: boolean
}

type SortMode = 'newest' | 'oldest' | 'umur_desc'

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'newest', label: 'Tanggal terbaru' },
  { value: 'oldest', label: 'Tanggal terlama' },
  { value: 'umur_desc', label: 'Umur terlama' },
]

const TABLE_HEAD_CLASS = 'px-4 py-4 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500'

function displayDocumentName(row: PembersihanDokumenRow): string {
  return row.nama_dokumen?.trim() || row.judul
}

function countActiveFilters(filter: FilterValue): number {
  return [filter.kegiatanId, filter.tanggalMulai, filter.tanggalAkhir, filter.onlyStale || undefined]
    .filter(Boolean).length
}

function matchesFilter(row: PembersihanDokumenRow, filter: FilterValue): boolean {
  if (filter.kegiatanId && row.kegiatan_jenis_id !== filter.kegiatanId) return false
  if (filter.tanggalMulai && row.tanggal < filter.tanggalMulai) return false
  if (filter.tanggalAkhir && row.tanggal > filter.tanggalAkhir) return false
  if (filter.onlyStale && !row.is_stale) return false
  return true
}

function compareRows(a: PembersihanDokumenRow, b: PembersihanDokumenRow, sortBy: SortMode): number {
  if (sortBy === 'oldest') return a.tanggal.localeCompare(b.tanggal)
  if (sortBy === 'umur_desc') return (b.umur_hari ?? 0) - (a.umur_hari ?? 0)
  return b.tanggal.localeCompare(a.tanggal)
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const payload = error.payload
    if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
      return payload.error
    }
  }
  return fallback
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

function PembersihanDokumenPage() {
  const { showToast } = useAppToast()

  const [checkingAuth, setCheckingAuth] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dokumen, setDokumen] = useState<PembersihanDokumenRow[]>([])
  const [staleCount, setStaleCount] = useState(0)
  const [staleDays, setStaleDays] = useState(90)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterValue>({})
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortBy, setSortBy] = useState<SortMode>('newest')

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmPending, setConfirmPending] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    setCheckingAuth(true)
    setError('')
    try {
      const data = await apiFetch<PembersihanDokumenResponse>('/pembersihan-dokumen')

      if (!data.is_ketua_tim) {
        setIsAuthorized(false)
        return
      }

      setIsAuthorized(true)
      setDokumen(data.dokumen ?? [])
      setStaleCount(data.stale_count ?? 0)
      setStaleDays(data.stale_days ?? 90)
    } catch (err) {
      setIsAuthorized(false)
      setError(resolveErrorMessage(err, 'Gagal memuat daftar dokumen non-material'))
    } finally {
      setCheckingAuth(false)
      setLoading(false)
    }
  }

  const kegiatanOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const row of dokumen) {
      if (!byId.has(row.kegiatan_jenis_id)) {
        byId.set(row.kegiatan_jenis_id, row.kegiatan_nama ?? 'Kegiatan')
      }
    }
    return [...byId.entries()].map(([id, nama]) => ({ id, nama }))
  }, [dokumen])

  const activeFilters = countActiveFilters(filter)

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return dokumen
      .filter(row => matchesFilter(row, filter))
      .filter(row => {
        if (!query) return true
        return [displayDocumentName(row), row.pengaju_nama, row.kegiatan_nama]
          .some(value => value?.toLowerCase().includes(query))
      })
      .sort((a, b) => compareRows(a, b, sortBy))
  }, [dokumen, filter, search, sortBy])

  // Selection can only ever contain ids that are currently visible; narrow it
  // whenever the filtered set changes so a row hidden by a filter never
  // silently stays "selected".
  useEffect(() => {
    const selectableIds = new Set(filteredRows.map(row => row.id))
    setSelectedIds(prev => {
      const next = new Set([...prev].filter(id => selectableIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [filteredRows])

  const allSelected = filteredRows.length > 0 && filteredRows.every(row => selectedIds.has(row.id))
  const someSelected = selectedIds.size > 0 && !allSelected

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(filteredRows.map(row => row.id)) : new Set())
  }

  const selectedRows = useMemo(
    () => dokumen.filter(row => selectedIds.has(row.id)),
    [dokumen, selectedIds],
  )

  // Informational only -- per pemilik proyek, umur dokumen TIDAK pernah
  // membatasi penghapusan. Ketua tim tetap bebas membersihkan dokumen yang
  // masih baru; ini semata memberi tahu supaya keputusannya sadar.
  const youngSelectedCount = useMemo(
    () => selectedRows.filter(row => !row.is_stale).length,
    [selectedRows],
  )

  async function handleConfirmBersihkan() {
    setConfirmPending(true)
    try {
      const response = await apiFetch<PembersihanBersihkanResponse>('/pembersihan-dokumen/bersihkan', {
        method: 'POST',
        body: JSON.stringify({
          dokumen_ids: [...selectedIds],
          confirmation: PEMBERSIHAN_DOKUMEN_CONFIRMATION_PHRASE,
        }),
      })

      const report = response.report
      if (report) {
        const parts = [`${report.cleaned_count} berhasil dibersihkan`]
        if (report.skipped_count > 0) parts.push(`${report.skipped_count} dilewati`)
        if (report.failed_count > 0) parts.push(`${report.failed_count} gagal`)

        showToast({
          title: report.failed_count > 0 ? 'Selesai sebagian' : 'Berhasil',
          description: parts.join(', '),
          variant: report.failed_count > 0 ? 'warning' : 'success',
        })
      }

      setConfirmOpen(false)
      setSelectedIds(new Set())
      await fetchData()
    } catch (err) {
      showToast({
        title: 'Gagal',
        description: resolveErrorMessage(err, 'Gagal membersihkan dokumen'),
        variant: 'error',
      })
    } finally {
      setConfirmPending(false)
    }
  }

  const resultLabel = `${filteredRows.length} Dokumen Ditemukan`

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-7 px-7 pt-6 pb-28 sm:px-8 lg:px-10">
        {checkingAuth && (
          <LoadingState variant="page" label="Memeriksa akses pembersihan dokumen" />
        )}

        {!checkingAuth && !isAuthorized && (
          <EmptyState
            title="Akses ditolak"
            description="Halaman Pembersihan Dokumen hanya dapat diakses oleh Pegawai yang ditunjuk sebagai Ketua Tim pada suatu kegiatan."
            icon={<ShieldX size={20} />}
            action={<Button onClick={() => { window.location.href = '/' }}>Kembali ke Dashboard</Button>}
          />
        )}

        {!checkingAuth && isAuthorized && (
          <>
            <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-5">
                <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-orange-100 bg-[#FFF6EA] text-orange-600 shadow-[0_2px_8px_rgba(251,146,60,0.14)]">
                  <Trash2 size={22} />
                </div>
                <div className="min-w-0">
                  <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[30px]">
                    Pembersihan Dokumen
                  </h1>
                  <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-zinc-700">
                    Bersihkan lampiran fisik dokumen non-material dari kegiatan yang Anda pimpin. Metadata
                    dokumen tetap tersimpan — hanya file yang dihapus, dan tindakan ini tidak dapat dibatalkan.
                  </p>
                </div>
              </div>
            </section>

            {staleCount > 0 && (
              <div className="flex flex-col gap-3 rounded-[22px] border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" />
                  <p className="text-sm font-semibold text-amber-900">
                    Ada {staleCount} dokumen non-material yang sudah berumur lebih dari {staleDays} hari.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-amber-300 bg-white font-bold text-amber-800 hover:bg-amber-100"
                  onClick={() => setFilter(prev => ({ ...prev, onlyStale: true }))}
                >
                  Tinjau
                </Button>
              </div>
            )}

            <ReportToolbar
              search={search}
              onSearchChange={setSearch}
              filterOpen={filterOpen}
              onFilterOpenChange={setFilterOpen}
              activeFilters={activeFilters}
              sortBy={sortBy}
              onSortChange={setSortBy}
              resultLabel={resultLabel}
              filter={filter}
              onFilterChange={setFilter}
              kegiatanOptions={kegiatanOptions}
              staleDays={staleDays}
              selectableCount={filteredRows.length}
              allSelected={allSelected}
              someSelected={someSelected}
              onToggleAll={toggleAll}
            />

            {loading && <LoadingState variant="list" rows={4} label="Memuat dokumen non-material" />}

            {!loading && error && (
              <ErrorState title="Gagal memuat dokumen" description={error} variant="page" />
            )}

            {!loading && !error && filteredRows.length === 0 && dokumen.length > 0 && (
              <EmptyState
                title="Tidak ada dokumen yang cocok"
                description="Reset filter atau ubah kata kunci untuk melihat dokumen lain."
                icon={<Filter size={20} />}
                action={<Button variant="outline" size="sm" onClick={() => { setFilter({}); setSearch('') }}>Reset Filter</Button>}
              />
            )}

            {!loading && !error && dokumen.length === 0 && (
              <EmptyState
                title="Belum ada dokumen non-material"
                description="Dokumen non-material dari kegiatan yang Anda pimpin akan muncul di sini."
                icon={<Users size={20} />}
              />
            )}

            {!loading && !error && filteredRows.length > 0 && (
              <DocumentTable
                rows={filteredRows}
                selectedIds={selectedIds}
                onToggleRow={toggleRow}
                allSelected={allSelected}
                someSelected={someSelected}
                onToggleAll={toggleAll}
                selectableCount={filteredRows.length}
              />
            )}
          </>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-[#FFFDF9]/95 px-6 py-4 shadow-[0_-6px_20px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-zinc-950">{selectedIds.size} dokumen terpilih</p>
              {youngSelectedCount > 0 && (
                <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                  <AlertTriangle size={13} className="shrink-0" />
                  {youngSelectedCount} di antaranya berumur kurang dari {staleDays} hari
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="font-bold" onClick={() => setSelectedIds(new Set())}>
                Batal
              </Button>
              <Button
                type="button"
                className="gap-2 bg-rose-600 font-bold text-white hover:bg-rose-700"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 size={16} />
                Bersihkan Lampiran
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => { if (!confirmPending) setConfirmOpen(open) }}
        tone="destructive"
        title="Bersihkan Lampiran Dokumen"
        description="File fisik dihapus permanen. Metadata dokumen tetap tersimpan dan ditandai 'File Dibersihkan'."
        confirmLabel="Bersihkan"
        pending={confirmPending}
        requireTyped={PEMBERSIHAN_DOKUMEN_CONFIRMATION_PHRASE}
        onConfirm={handleConfirmBersihkan}
        size="lg"
      >
        <BersihkanSummary rows={selectedRows} staleDays={staleDays} />
      </ConfirmDialog>
    </PageLayout>
  )
}

// -----------------------------------------------------------------------------
// Toolbar + filter
// -----------------------------------------------------------------------------

function ReportToolbar({
  search,
  onSearchChange,
  filterOpen,
  onFilterOpenChange,
  activeFilters,
  sortBy,
  onSortChange,
  resultLabel,
  filter,
  onFilterChange,
  kegiatanOptions,
  staleDays,
  selectableCount,
  allSelected,
  someSelected,
  onToggleAll,
}: {
  search: string
  onSearchChange: (value: string) => void
  filterOpen: boolean
  onFilterOpenChange: (value: boolean) => void
  activeFilters: number
  sortBy: SortMode
  onSortChange: (value: SortMode) => void
  resultLabel: string
  filter: FilterValue
  onFilterChange: (value: FilterValue) => void
  kegiatanOptions: { id: string; nama: string }[]
  staleDays: number
  selectableCount: number
  allSelected: boolean
  someSelected: boolean
  onToggleAll: (checked: boolean) => void
}) {
  return (
    <div className="overflow-hidden rounded-[26px] border border-zinc-200/80 bg-[#FFFDF9] shadow-[0_3px_14px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative min-w-0 flex-1 lg:max-w-xl">
          <span className="sr-only">Cari dokumen</span>
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            type="search"
            placeholder="Cari nama dokumen, pembuat, atau kegiatan..."
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
            <span className="sr-only">Urutkan dokumen</span>
            <Select value={sortBy} onValueChange={(value) => onSortChange(value as SortMode)}>
              <SelectTrigger className="min-h-10 w-full rounded-xl border-[#F0E1D5] bg-[#FFFAF6] px-4 text-sm font-semibold hover:border-[#FFBC80] sm:w-fit">
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
        <div className="border-b border-zinc-100 bg-[#FFFDF9] p-4 sm:p-5">
          <div className="rounded-[22px] border border-zinc-200/80 bg-[#FFF8F1]/35 p-4 shadow-none">
            <div className="grid gap-4 lg:grid-cols-4">
              <label className="space-y-2 lg:col-span-2">
                <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Kegiatan</span>
                <Select
                  value={filter.kegiatanId || '_all'}
                  onValueChange={(kegiatanId) => onFilterChange({ ...filter, kegiatanId: kegiatanId === '_all' ? undefined : kegiatanId })}
                >
                  <SelectTrigger className="min-h-10 w-full rounded-xl border-[#F0E1D5] bg-[#FFFAF6] px-4 text-sm font-semibold hover:border-[#FFBC80]">
                    <SelectValue placeholder="Semua Kegiatan">
                      {selected => selected && selected !== '_all'
                        ? kegiatanOptions.find(option => option.id === selected)?.nama ?? 'Semua Kegiatan'
                        : 'Semua Kegiatan'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Semua Kegiatan</SelectItem>
                    {kegiatanOptions.map(option => (
                      <SelectItem key={option.id} value={option.id}>{option.nama}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-2">
                <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Tanggal Dari</span>
                <DatePicker
                  value={filter.tanggalMulai ?? ''}
                  onChange={(tanggal) => onFilterChange({ ...filter, tanggalMulai: tanggal || undefined })}
                  placeholder="Pilih tanggal mulai"
                />
              </label>
              <label className="space-y-2">
                <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Tanggal Sampai</span>
                <DatePicker
                  value={filter.tanggalAkhir ?? ''}
                  onChange={(tanggal) => onFilterChange({ ...filter, tanggalAkhir: tanggal || undefined })}
                  placeholder="Pilih tanggal selesai"
                />
              </label>
            </div>
            <label className="mt-4 flex w-fit items-center gap-2">
              <Checkbox
                checked={filter.onlyStale ?? false}
                onCheckedChange={(checked) => onFilterChange({ ...filter, onlyStale: checked === true ? true : undefined })}
              />
              <span className="text-sm font-semibold text-zinc-700">Hanya tampilkan yang berumur lebih dari {staleDays} hari</span>
            </label>
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
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-zinc-950">
        <span>{resultLabel}</span>
        {selectableCount > 0 && (
          <label className="flex items-center gap-2 text-sm font-bold text-zinc-700">
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onCheckedChange={(checked) => onToggleAll(checked === true)}
              aria-label="Pilih semua dokumen pada tabel ini"
            />
            Pilih Semua ({selectableCount})
          </label>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Table + rows
// -----------------------------------------------------------------------------

function DocumentTable({
  rows,
  selectedIds,
  onToggleRow,
  allSelected,
  someSelected,
  onToggleAll,
  selectableCount,
}: {
  rows: PembersihanDokumenRow[]
  selectedIds: Set<string>
  onToggleRow: (id: string, checked: boolean) => void
  allSelected: boolean
  someSelected: boolean
  onToggleAll: (checked: boolean) => void
  selectableCount: number
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-[#FFFDF9] shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block">
        <Table className="text-left">
          <TableHeader>
            <TableRow className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
              <TableHead className={`w-12 ${TABLE_HEAD_CLASS}`}>
                {selectableCount > 0 && (
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onCheckedChange={(checked) => onToggleAll(checked === true)}
                    aria-label="Pilih semua dokumen"
                  />
                )}
              </TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Nama Dokumen</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Kegiatan</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Tanggal</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Umur</TableHead>
              <TableHead className={`text-center ${TABLE_HEAD_CLASS}`}>Lampiran</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-zinc-100 text-[13px]">
            {rows.map(row => (
              <DesktopRow
                key={row.id}
                row={row}
                checked={selectedIds.has(row.id)}
                onToggle={onToggleRow}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map((row, idx) => (
          <MobileCard
            key={row.id}
            row={row}
            index={idx}
            checked={selectedIds.has(row.id)}
            onToggle={onToggleRow}
          />
        ))}
      </div>
    </>
  )
}

function DesktopRow({
  row,
  checked,
  onToggle,
}: {
  row: PembersihanDokumenRow
  checked: boolean
  onToggle: (id: string, checked: boolean) => void
}) {
  return (
    <TableRow className="border-zinc-100 bg-[#FFFDF9] transition-colors hover:bg-[#FFF8F1]/70">
      <TableCell className="px-4 py-5">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onToggle(row.id, value === true)}
          aria-label={`Pilih ${displayDocumentName(row)}`}
        />
      </TableCell>
      <TableCell className="max-w-[380px] px-4 py-5">
        <p className="line-clamp-2 text-[15px] font-semibold tracking-tight text-zinc-950">
          {displayDocumentName(row)}
        </p>
        <p className="mt-1 text-xs font-medium text-zinc-500">Pembuat: {row.pengaju_nama}</p>
      </TableCell>
      <TableCell className="px-4 py-5 text-sm font-medium text-zinc-700">
        {row.kegiatan_nama ?? '-'}
      </TableCell>
      <TableCell className="px-4 py-5">
        <DateCell value={row.tanggal} />
      </TableCell>
      <TableCell className="px-4 py-5">
        <UmurBadge row={row} />
      </TableCell>
      <TableCell className="px-4 py-5 text-center text-sm font-semibold text-zinc-700">
        {row.jumlah_lampiran}
      </TableCell>
    </TableRow>
  )
}

function MobileCard({
  row,
  index,
  checked,
  onToggle,
}: {
  row: PembersihanDokumenRow
  index: number
  checked: boolean
  onToggle: (id: string, checked: boolean) => void
}) {
  return (
    <PegawaiPanel className="space-y-3 border-zinc-200/80 p-4 shadow-[0_2px_10px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Checkbox
            checked={checked}
            onCheckedChange={(value) => onToggle(row.id, value === true)}
            aria-label={`Pilih ${displayDocumentName(row)}`}
            className="mt-1"
          />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700/70">Dokumen #{index + 1}</p>
            <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-950">{displayDocumentName(row)}</h2>
          </div>
        </div>
        <UmurBadge row={row} className="shrink-0" />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
        <InfoTile label="Kegiatan" value={row.kegiatan_nama ?? '-'} className="col-span-2" />
        <InfoTile label="Tanggal" value={<DateCell value={row.tanggal} className="mt-1" />} />
        <InfoTile label="Lampiran" value={`${row.jumlah_lampiran} file`} />
        <InfoTile label="Pembuat" value={row.pengaju_nama} className="col-span-2" />
      </div>
    </PegawaiPanel>
  )
}

function UmurBadge({ row, className }: { row: PembersihanDokumenRow; className?: string }) {
  return (
    <Badge
      variant={row.is_stale ? 'destructive' : 'outline'}
      className={className}
    >
      {row.umur_hari !== null ? `${row.umur_hari} hari` : '-'}
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

function InfoTile({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={['rounded-xl border border-zinc-200/80 bg-[#FFFDF9] p-2.5', className ?? ''].join(' ')}>
      <p className="font-semibold text-zinc-500">{label}</p>
      <div className="mt-0.5 text-zinc-900">{value}</div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Confirm dialog summary
// -----------------------------------------------------------------------------

function BersihkanSummary({ rows, staleDays }: { rows: PembersihanDokumenRow[]; staleDays: number }) {
  const [showAllYoung, setShowAllYoung] = useState(false)
  const pengajuCount = new Set(rows.map(row => row.created_by)).size
  const dates = rows.map(row => row.tanggal).filter(Boolean).sort()
  const rangeLabel = dates.length > 0
    ? `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`
    : '-'
  const preview = rows.slice(0, 3)
  const remaining = rows.length - preview.length
  const youngRows = rows.filter(row => !row.is_stale)
  // Dibatasi 3 dulu -- kalau banyak dokumen yang belum lama diusulkan
  // dihapus, daftarnya jangan sampai membanjiri dialog konfirmasi.
  const youngPreview = showAllYoung ? youngRows : youngRows.slice(0, 3)
  const youngHiddenCount = youngRows.length - youngPreview.length

  return (
    <div className="w-full space-y-3 rounded-2xl border border-zinc-200 bg-[#FFFDF9] p-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-semibold text-zinc-800">
        <span>{rows.length} dokumen</span>
        <span aria-hidden="true">·</span>
        <span>{pengajuCount} pegawai</span>
        <span aria-hidden="true">·</span>
        <span>{rangeLabel}</span>
      </div>
      {youngRows.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">
              {youngRows.length} dari {rows.length} dokumen terpilih masih berumur kurang dari {staleDays} hari.
              Pastikan Anda sudah tidak memerlukannya.
            </p>
            <ul
              className={[
                'mt-1.5 space-y-0.5 text-xs text-amber-800',
                // Saat dibuka penuh, daftar dibatasi tingginya + scroll supaya
                // dialog tidak memanjang lagi.
                showAllYoung ? 'max-h-32 overflow-y-auto pr-1' : '',
              ].join(' ')}
            >
              {youngPreview.map(row => (
                <li key={row.id} className="truncate">• {displayDocumentName(row)}</li>
              ))}
              {youngHiddenCount > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => setShowAllYoung(true)}
                    className="font-bold underline hover:text-amber-950"
                  >
                    +{youngHiddenCount} selengkapnya
                  </button>
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
      <ul className="space-y-0.5 text-xs text-zinc-600">
        {preview.map(row => (
          <li key={row.id} className="truncate">• {displayDocumentName(row)} — {row.pengaju_nama}</li>
        ))}
        {remaining > 0 && <li>…dan {remaining} lainnya</li>}
      </ul>
    </div>
  )
}
