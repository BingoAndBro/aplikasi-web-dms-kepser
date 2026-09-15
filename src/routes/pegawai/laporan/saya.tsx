import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { DokumenDetailDialog } from '#/components/dokumen/DokumenDetailDialog'
import { LampiranDibersihkanBadge } from '#/components/dokumen/LampiranDibersihkanBadge'
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
import { HierarchicalFilter, type HierarchicalFilterValue } from '#/components/laporan/HierarchicalFilter'
import { ExportZipDialog } from '#/components/laporan/ExportZipDialog'
import type { DokumenLaporanRow } from '#/lib/dokumen-helpers'
import { downloadZipBlob, extractContentDispositionFilename } from '#/lib/file-helpers'
import { formatDate } from '#/lib/utils/format'
import {
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Filter,
  Inbox,
  Search,
  UserCheck,
} from 'lucide-react'

export const Route = createFileRoute('/pegawai/laporan/saya')({
  component: LaporanSayaPage,
})

type LaporanSayaResponse = {
  dokumen?: DokumenLaporanRow[]
  error?: string
}

type SortMode = 'newest' | 'oldest' | 'title_asc' | 'activity_asc'

const TABLE_HEAD_CLASS = 'px-6 py-4 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500'
const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'newest', label: 'Tanggal terbaru' },
  { value: 'oldest', label: 'Tanggal terlama' },
  { value: 'title_asc', label: 'Judul A-Z' },
  { value: 'activity_asc', label: 'Kegiatan A-Z' },
]

function LaporanSayaPage() {
  const [detailId, setDetailId] = useState<string | null>(null)
  const [dokumen, setDokumen] = useState<DokumenLaporanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<HierarchicalFilterValue>({})
  const [sortBy, setSortBy] = useState<SortMode>('newest')
  const [filterOpen, setFilterOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportPending, setExportPending] = useState(false)
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    apiFetch<LaporanSayaResponse>('/laporan/saya')
      .then(d => {
        if (d.error) { setError(d.error); return }
        setDokumen(d.dokumen ?? [])
      })
      .catch((error) => {
        if (error instanceof ApiError) {
          const payload = error.payload
          if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
            setError(payload.error)
            return
          }
        }
        setError('Gagal memuat data. Coba muat ulang halaman.')
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()

    return dokumen
      .filter(d => {
        if (filter.fungsiId && d.fungsi_id !== filter.fungsiId) return false
        if (filter.kegiatanId && d.kegiatan_jenis_id !== filter.kegiatanId) return false
        if (filter.komponenId && d.komponen_id !== filter.komponenId) return false
        if (filter.jenisId && d.jenis_permintaan_id !== filter.jenisId) return false
        if (filter.kategoriId && d.kategori_permintaan_id !== filter.kategoriId) return false
        if (filter.detailId && d.detail_permintaan_id !== filter.detailId) return false
        if (filter.tanggalMulai && d.tanggal < filter.tanggalMulai) return false
        if (filter.tanggalAkhir && d.tanggal > filter.tanggalAkhir) return false
        if (!query) return true

        return [
          d.judul,
          d.fungsi_nama,
          d.kegiatan_nama,
          d.komponen_nama,
          d.nama_dokumen,
          d.leaf_node_nama,
          d.jenis_permintaan_nama,
          d.kategori_permintaan_nama,
          d.detail_permintaan_nama,
        ].some(value => value?.toLowerCase().includes(query))
      })
      .sort((a, b) => compareDocuments(a, b, sortBy))
  }, [dokumen, filter, search, sortBy])

  const activeFilters = countActiveFilters(filter)

  async function handleExportZip() {
    if (filtered.length === 0 || filtered.length > 500) return

    setExportPending(true)
    setExportError('')

    try {
      const response = await fetch('/api/laporan/saya/export-zip', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dokumen_ids: filtered.map((dok) => dok.id) }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Gagal membuat ekspor ZIP')
      }

      const blob = await response.blob()
      const filename = extractContentDispositionFilename(
        response.headers.get('Content-Disposition'),
        'Laporan_Saya.zip',
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
        <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-5">
            <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-700 shadow-[0_2px_8px_rgba(16,185,129,0.14)]">
              <UserCheck size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[30px]">
                Laporan Saya
              </h1>
              <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-zinc-700">
                Dokumen final milik Anda yang sudah selesai disetujui atau tersimpan.
              </p>
            </div>
          </div>
        </section>

        <ReportToolbar
          search={search}
          onSearchChange={setSearch}
          searchLabel="Cari dokumen laporan saya"
          placeholder="Cari nama dokumen atau kegiatan..."
          filterOpen={filterOpen}
          onFilterOpenChange={setFilterOpen}
          activeFilters={activeFilters}
          sortBy={sortBy}
          onSortChange={setSortBy}
          resultLabel={`${filtered.length} Dokumen Ditemukan`}
          filter={filter}
          onFilterChange={setFilter}
          exportCount={filtered.length}
          onExportClick={() => setExportDialogOpen(true)}
        />

        <ExportZipDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          documentCount={filtered.length}
          description="Mengikuti filter aktif saat ini."
          pending={exportPending}
          error={exportError}
          onConfirm={handleExportZip}
        />

        {loading && <LoadingState variant="list" rows={4} label="Memuat laporan saya" />}

        {!loading && error && (
          <ErrorState title="Gagal memuat laporan" description={error} variant="page" />
        )}

        {!loading && !error && dokumen.length === 0 && (
          <EmptyState
            title="Belum ada dokumen selesai"
            description="Dokumen yang telah disetujui PPSPM atau tersimpan sebagai Non-Material akan muncul di sini."
            icon={<Inbox size={20} />}
          />
        )}

        {!loading && !error && dokumen.length > 0 && filtered.length === 0 && (
          <EmptyState
            title="Tidak ada dokumen yang cocok"
            description="Reset filter atau ubah kata kunci untuk melihat dokumen lain."
            icon={<Filter size={20} />}
            action={<Button variant="outline" size="sm" onClick={() => { setFilter({}); setSearch('') }}>Reset Filter</Button>}
          />
        )}

        {!loading && !error && filtered.length > 0 && (
          <ReportDocumentList
            dokumen={filtered}
            total={dokumen.length}
            onOpenDocument={(id) => setDetailId(id)}
          />
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
  exportCount,
  onExportClick,
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
  filter: HierarchicalFilterValue
  onFilterChange: (value: HierarchicalFilterValue) => void
  exportCount: number
  onExportClick: () => void
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
          <div className="w-full sm:w-fit">
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
          </div>
        </div>
      </div>

      {filterOpen && (
        <div className="border-b border-zinc-100 bg-bg-surface p-4 sm:p-5">
          <div className="[&>div]:border-zinc-200/80 [&>div]:bg-brand-surface/35 [&>div]:shadow-none [&_label]:text-[11px] [&_label]:font-black [&_label]:uppercase [&_label]:tracking-[0.14em] [&_label]:text-zinc-500 [&_input]:h-11 [&_input]:rounded-xl [&_input]:border-zinc-200 [&_input]:bg-bg-surface">
            <HierarchicalFilter value={filter} onChange={onFilterChange} />
          </div>
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

function ReportDocumentList({
  dokumen,
  total,
  onOpenDocument,
}: {
  dokumen: DokumenLaporanRow[]
  total: number
  onOpenDocument: (id: string) => void
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[26px] border border-zinc-200/80 bg-bg-surface shadow-[0_3px_14px_rgba(15,23,42,0.07)] md:block">
        <Table className="text-left">
          <TableHeader>
            <TableRow className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
              <TableHead className={TABLE_HEAD_CLASS}>Judul Dokumen</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Kegiatan</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Status</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Tanggal</TableHead>
              <TableHead className={`w-20 text-right ${TABLE_HEAD_CLASS}`}>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-zinc-100 text-[13px]">
            {dokumen.map((dok) => (
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
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-brand-text">
                      {dok.judul}
                    </p>
                    <p className="mt-1 line-clamp-1 text-xs font-medium text-zinc-500">{dok.fungsi_nama ?? '-'}</p>
                  </div>
                </TableCell>
                <TableCell className="max-w-[280px] px-6 py-5">
                  <span className="block truncate text-sm font-normal text-zinc-900">{dok.kegiatan_nama ?? '-'}</span>
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
                <TableCell className="px-6 py-5">
                  <DateCell value={dok.tanggal} />
                </TableCell>
                <TableCell className="px-6 py-5 text-right">
                  <ReportDetailButton dok={dok} onOpenDocument={onOpenDocument} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t border-zinc-100 px-6 py-3 text-xs font-medium text-zinc-500">
          Menampilkan {dokumen.length} dari {total} dokumen
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {dokumen.map((dok, idx) => (
          <PegawaiPanel
            key={dok.id}
            className="group space-y-3 border-zinc-200/80 p-4 shadow-[0_2px_10px_rgba(15,23,42,0.06)] transition hover:border-brand-border hover:bg-bg-surface"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand-solid-active/70">
                  Dokumen #{idx + 1}
                </p>
                <h2 className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-950 transition-colors group-hover:text-brand-text">{dok.judul}</h2>
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
              <InfoTile label="Fungsi" value={dok.fungsi_nama ?? '-'} />
              <InfoTile label="Tanggal" value={<DateCell value={dok.tanggal} className="mt-1" />} />
              <InfoTile label="Kegiatan" value={dok.kegiatan_nama ?? '-'} className="col-span-2" />
            </div>
            <div className="space-y-3 border-t border-zinc-100 pt-3">
              <ReportDetailButton dok={dok} onOpenDocument={onOpenDocument} mobile />
            </div>
          </PegawaiPanel>
        ))}
      </div>
    </>
  )
}

function ReportDetailButton({
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

function compareDocuments(a: DokumenLaporanRow, b: DokumenLaporanRow, sortBy: SortMode) {
  if (sortBy === 'oldest') return dateValue(a.tanggal) - dateValue(b.tanggal)
  if (sortBy === 'title_asc') return a.judul.localeCompare(b.judul, 'id-ID')
  if (sortBy === 'activity_asc') return (a.kegiatan_nama ?? '').localeCompare(b.kegiatan_nama ?? '', 'id-ID')
  return dateValue(b.tanggal) - dateValue(a.tanggal)
}

function dateValue(value?: string | null) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function countActiveFilters(filter: HierarchicalFilterValue) {
  return [
    filter.fungsiId,
    filter.kegiatanId,
    filter.komponenId,
    filter.jenisId,
    filter.kategoriId,
    filter.detailId,
    filter.tanggalMulai,
    filter.tanggalAkhir,
  ].filter(Boolean).length
}
