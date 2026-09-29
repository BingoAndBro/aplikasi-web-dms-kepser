import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { DokumenDetailDialog } from '#/components/dokumen/DokumenDetailDialog'
import { LampiranDibersihkanBadge } from '#/components/dokumen/LampiranDibersihkanBadge'
import { ExportZipDialog } from '#/components/laporan/ExportZipDialog'
import { FilterToolbar, PembuatFilterSelect, ToolbarSelectField, buildPersonOptions } from '#/components/laporan/FilterToolbar'
import { SummaryCard } from '#/components/kinerja/MonitoringRealisasiView'
import { PegawaiPanel } from '#/components/pegawai/PegawaiPagePrimitives'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { DatePicker } from '#/components/ui/date-picker'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { ApiError, apiFetch } from '#/lib/api-client'
import type { DokumenLaporanRow } from '#/lib/dokumen-helpers'
import { startZipDownload } from '#/lib/file-helpers'
import {
  getPosisiDokumen,
  POSISI_DOKUMEN_LABEL,
  type PosisiDokumen,
} from '#/lib/laporan/kegiatan-scope'
import { toneClasses, type Tone } from '#/lib/tone'
import { formatDate } from '#/lib/utils/format'
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileEdit,
  Filter,
  ListChecks,
  ShieldX,
} from 'lucide-react'

export const Route = createFileRoute('/pegawai/monitoring-dokumen-tim')({
  component: MonitoringDokumenTimPage,
})

type CurrentUserResponse = {
  user: { id: string }
}

type KetuaTimKegiatanResponse = {
  is_ketua_tim?: boolean
  kegiatan?: { id: string; nama: string }[]
}

type LaporanKegiatanResponse = {
  dokumen?: DokumenLaporanRow[]
  error?: string
}

/** Filter kartu ringkasan: dua jenis revisi digabung jadi satu "Perlu Revisi". */
type PosisiFilter = PosisiDokumen | 'REVISI'

type MonitoringFilterValue = {
  kegiatanId?: string
  posisi?: PosisiFilter
  pembuatId?: string
  tertahanHari?: string
  tanggalMulai?: string
  tanggalAkhir?: string
}

// Sengaja tanpa "tanggal dokumen": di halaman monitoring yang relevan adalah kapan
// dokumen terakhir bergerak (updated_at), bukan tanggal yang diisi pengaju.
type SortMode = 'activity_desc' | 'stale_first' | 'title_asc' | 'submitter_asc'

const TABLE_HEAD_CLASS = 'px-6 py-4 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500'

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'activity_desc', label: 'Aktivitas terbaru' },
  { value: 'stale_first', label: 'Paling lama tertahan' },
  { value: 'title_asc', label: 'Judul A-Z' },
  { value: 'submitter_asc', label: 'Pembuat A-Z' },
]

const POSISI_OPTIONS: { id: PosisiFilter; nama: string }[] = [
  { id: 'DI_PPK', nama: POSISI_DOKUMEN_LABEL.DI_PPK },
  { id: 'DI_PPSPM', nama: POSISI_DOKUMEN_LABEL.DI_PPSPM },
  { id: 'REVISI', nama: 'Perlu Revisi (semua)' },
  { id: 'REVISI_PENGAJU', nama: POSISI_DOKUMEN_LABEL.REVISI_PENGAJU },
  { id: 'REVISI_PPK', nama: POSISI_DOKUMEN_LABEL.REVISI_PPK },
  { id: 'SELESAI', nama: POSISI_DOKUMEN_LABEL.SELESAI },
]

const TERTAHAN_OPTIONS = [
  { id: '3', nama: 'Lebih dari 3 hari' },
  { id: '7', nama: 'Lebih dari 7 hari' },
  { id: '14', nama: 'Lebih dari 14 hari' },
]

const POSISI_TONE: Record<PosisiDokumen, Tone> = {
  DI_PPK: 'info',
  DI_PPSPM: 'brand-fixed',
  REVISI_PENGAJU: 'warning',
  REVISI_PPK: 'danger',
  SELESAI: 'success',
}

// Dokumen yang belum selesai dan tidak bergerak selama ini ditandai di tabel.
const STALE_WARNING_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

function MonitoringDokumenTimPage() {
  const [dokumen, setDokumen] = useState<DokumenLaporanRow[]>([])
  const [kegiatanOptions, setKegiatanOptions] = useState<{ id: string; nama: string }[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<MonitoringFilterValue>({})
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortBy, setSortBy] = useState<SortMode>('activity_desc')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportPending, setExportPending] = useState(false)
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    async function load() {
      setCheckingAuth(true)
      try {
        const meData = await apiFetch<CurrentUserResponse>('/users/me')
        setCurrentUserId(meData.user.id)

        const ketuaTim = await apiFetch<KetuaTimKegiatanResponse>('/users/me/ketua-tim')
        if (!ketuaTim.is_ketua_tim || !ketuaTim.kegiatan || ketuaTim.kegiatan.length === 0) {
          setIsAuthorized(false)
          return
        }

        setIsAuthorized(true)
        setKegiatanOptions(ketuaTim.kegiatan)

        const data = await apiFetch<LaporanKegiatanResponse>('/laporan/kegiatan', { query: { scope: 'monitoring' } })
        if (data.error) {
          setError(data.error)
          return
        }
        setDokumen(data.dokumen ?? [])
      } catch (err) {
        if (err instanceof ApiError && err.payload && typeof err.payload === 'object' && 'error' in err.payload
          && typeof err.payload.error === 'string') {
          setError(err.payload.error)
          return
        }
        console.error('Monitoring dokumen tim load failed:', err)
        setIsAuthorized(false)
      } finally {
        setCheckingAuth(false)
        setLoading(false)
      }
    }

    load()
  }, [])

  // Acuan "tertahan N hari" dibekukan saat halaman dibuka agar hasil filter stabil.
  const [now] = useState(() => Date.now())

  // Kartu ringkasan mengikuti semua filter KECUALI posisi, supaya angka tiap
  // kartu tetap terlihat saat salah satu kartu sedang dipilih.
  const documentsBeforePosisi = useMemo(() => {
    const query = search.trim().toLowerCase()
    return dokumen.filter(dok => matchesMonitoringFilter(dok, { ...filter, posisi: undefined }, now)
      && matchesSearch(dok, query))
  }, [dokumen, filter, now, search])

  const posisiCounts = useMemo(() => countByPosisi(documentsBeforePosisi), [documentsBeforePosisi])

  const visibleDocuments = useMemo(() => {
    return documentsBeforePosisi
      .filter(dok => matchesPosisi(dok, filter.posisi))
      .sort((a, b) => compareDocuments(a, b, sortBy, now))
  }, [documentsBeforePosisi, filter.posisi, now, sortBy])

  const pembuatOptions = useMemo(
    () => buildPersonOptions(dokumen, dok => dok.pengaju_id ?? dok.created_by, getSubmitterName),
    [dokumen],
  )

  function togglePosisi(posisi: PosisiFilter) {
    setFilter(current => ({ ...current, posisi: current.posisi === posisi ? undefined : posisi }))
  }

  async function handleExportZip() {
    if (visibleDocuments.length === 0 || visibleDocuments.length > 500) return

    setExportPending(true)
    setExportError('')

    try {
      await startZipDownload('/api/laporan/kegiatan/export-zip', {
        dokumen_ids: visibleDocuments.map(dok => dok.id),
        scope: 'monitoring',
      })
      setExportDialogOpen(false)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Gagal membuat ekspor ZIP')
    } finally {
      setExportPending(false)
    }
  }

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[1280px] space-y-7 px-7 pt-6 sm:px-8 lg:px-10">
        {checkingAuth && <LoadingState variant="page" label="Memeriksa akses monitoring dokumen tim" />}

        {!checkingAuth && !isAuthorized && (
          <EmptyState
            title="Akses ditolak"
            description="Halaman Monitoring Dokumen Tim hanya dapat diakses oleh Pegawai yang ditunjuk sebagai Ketua Tim pada suatu kegiatan."
            icon={<ShieldX size={20} />}
            action={<Button onClick={() => { window.location.href = '/' }}>Kembali ke Dashboard</Button>}
          />
        )}

        {!checkingAuth && isAuthorized && (
          <>
            <section className="flex min-w-0 items-start gap-5">
              <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brand-border bg-bg-surface text-brand-solid shadow-[0_2px_8px_rgba(251,146,60,0.14)]">
                <ListChecks size={22} />
              </div>
              <div className="min-w-0">
                <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[30px]">
                  Monitoring Dokumen Tim
                </h1>
                <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-zinc-700">
                  Lihat posisi setiap dokumen yang diajukan anggota tim pada kegiatan yang Anda pimpin,
                  dari validasi PPK sampai selesai. Dokumen final untuk arsip tetap ada di Laporan Kegiatan.
                </p>
              </div>
            </section>

            <section className="space-y-3" aria-label="Ringkasan posisi dokumen">
              <p className="text-xs font-semibold text-zinc-600">
                Klik salah satu kartu untuk menampilkan hanya dokumen pada posisi tersebut.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  label="Validasi PPK"
                  value={posisiCounts.DI_PPK.toLocaleString('id-ID')}
                  detail="Menunggu diperiksa PPK"
                  icon={<Clock3 size={16} />}
                  tone="neutral"
                  onClick={() => togglePosisi('DI_PPK')}
                  active={filter.posisi === 'DI_PPK'}
                  actionHint="Lihat dokumen di PPK"
                />
                <SummaryCard
                  label="Persetujuan PPSPM"
                  value={posisiCounts.DI_PPSPM.toLocaleString('id-ID')}
                  detail="Sudah lolos validasi PPK"
                  icon={<Banknote size={16} />}
                  tone="orange"
                  onClick={() => togglePosisi('DI_PPSPM')}
                  active={filter.posisi === 'DI_PPSPM'}
                  actionHint="Lihat dokumen di PPSPM"
                />
                <SummaryCard
                  label="Perlu Revisi"
                  value={(posisiCounts.REVISI_PENGAJU + posisiCounts.REVISI_PPK).toLocaleString('id-ID')}
                  detail={`${posisiCounts.REVISI_PENGAJU} di pengaju · ${posisiCounts.REVISI_PPK} di PPK`}
                  icon={<FileEdit size={16} />}
                  tone="gold"
                  onClick={() => togglePosisi('REVISI')}
                  active={filter.posisi === 'REVISI'}
                  actionHint="Lihat dokumen revisi"
                />
                <SummaryCard
                  label="Selesai"
                  value={posisiCounts.SELESAI.toLocaleString('id-ID')}
                  detail="Disetujui / tersimpan"
                  icon={<CheckCircle2 size={16} />}
                  tone="money"
                  onClick={() => togglePosisi('SELESAI')}
                  active={filter.posisi === 'SELESAI'}
                  actionHint="Lihat dokumen selesai"
                />
              </div>
            </section>

            <MonitoringToolbar
              search={search}
              onSearchChange={setSearch}
              filter={filter}
              onFilterChange={setFilter}
              filterOpen={filterOpen}
              onFilterOpenChange={setFilterOpen}
              sortBy={sortBy}
              onSortChange={setSortBy}
              kegiatanOptions={kegiatanOptions}
              pembuatOptions={pembuatOptions}
              resultLabel={`${visibleDocuments.length} dari ${dokumen.length} dokumen ditampilkan`}
              exportCount={visibleDocuments.length}
              onExportClick={() => setExportDialogOpen(true)}
            />

            <ExportZipDialog
              open={exportDialogOpen}
              onOpenChange={setExportDialogOpen}
              documentCount={visibleDocuments.length}
              description="Mengikuti dokumen yang sedang ditampilkan. Dokumen yang masih diproses ikut disertakan dan ditandai BELUM FINAL di daftar isi ZIP."
              pending={exportPending}
              error={exportError}
              onConfirm={handleExportZip}
            />

            {loading && <LoadingState variant="list" rows={4} label="Memuat dokumen tim" />}

            {!loading && error && (
              <ErrorState title="Gagal memuat dokumen tim" description={error} variant="page" />
            )}

            {!loading && !error && dokumen.length === 0 && (
              <EmptyState
                title="Belum ada dokumen yang diajukan"
                description="Dokumen yang diajukan anggota tim pada kegiatan Anda akan muncul di sini sejak masuk validasi PPK."
                icon={<ListChecks size={20} />}
              />
            )}

            {!loading && !error && dokumen.length > 0 && visibleDocuments.length === 0 && (
              <EmptyState
                title="Tidak ada dokumen yang cocok"
                description="Reset filter atau ubah kata kunci untuk melihat dokumen lain."
                icon={<Filter size={20} />}
                action={<Button variant="outline" size="sm" onClick={() => { setFilter({}); setSearch('') }}>Reset Filter</Button>}
              />
            )}

            {!loading && !error && visibleDocuments.length > 0 && (
              <MonitoringDocumentTable
                dokumen={visibleDocuments}
                now={now}
                currentUserId={currentUserId}
                onOpenDocument={setDetailId}
              />
            )}
          </>
        )}

        <DokumenDetailDialog
          dokumenId={detailId}
          open={detailId !== null}
          onOpenChange={(open) => { if (!open) setDetailId(null) }}
          showRiwayat
        />
      </div>
    </PageLayout>
  )
}

function MonitoringToolbar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  filterOpen,
  onFilterOpenChange,
  sortBy,
  onSortChange,
  kegiatanOptions,
  pembuatOptions,
  resultLabel,
  exportCount,
  onExportClick,
}: {
  search: string
  onSearchChange: (value: string) => void
  filter: MonitoringFilterValue
  onFilterChange: (value: MonitoringFilterValue) => void
  filterOpen: boolean
  onFilterOpenChange: (value: boolean) => void
  sortBy: SortMode
  onSortChange: (value: SortMode) => void
  kegiatanOptions: { id: string; nama: string }[]
  pembuatOptions: { id: string; nama: string }[]
  resultLabel: string
  exportCount: number
  onExportClick: () => void
}) {
  return (
    <FilterToolbar
      search={{
        value: search,
        onChange: onSearchChange,
        placeholder: 'Cari judul dokumen, pembuat, atau kegiatan...',
        label: 'Cari dokumen tim',
      }}
      fields={(
        <>
          <PembuatFilterSelect
            value={filter.pembuatId}
            options={pembuatOptions}
            onChange={(pembuatId) => onFilterChange({ ...filter, pembuatId })}
          />
          <ToolbarSelectField
            label="Urutkan"
            srLabel="dokumen tim"
            value={sortBy}
            options={SORT_OPTIONS.map(option => ({ id: option.value, nama: option.label }))}
            onChange={(value) => onSortChange(value as SortMode)}
          />
        </>
      )}
      advanced={{
        open: filterOpen,
        onOpenChange: onFilterOpenChange,
        activeCount: countAdvancedFilters(filter),
        onReset: () => onFilterChange({ pembuatId: filter.pembuatId }),
        children: (
          <div className="grid gap-4 lg:grid-cols-3">
            <FilterSelect
              label="Kegiatan"
              value={filter.kegiatanId}
              allLabel="Semua Kegiatan"
              options={kegiatanOptions}
              onChange={(kegiatanId) => onFilterChange({ ...filter, kegiatanId })}
            />
            <FilterSelect
              label="Posisi Dokumen"
              value={filter.posisi}
              allLabel="Semua Posisi"
              options={POSISI_OPTIONS}
              onChange={(posisi) => onFilterChange({ ...filter, posisi: posisi as PosisiFilter | undefined })}
            />
            <FilterSelect
              label="Tertahan (belum selesai)"
              value={filter.tertahanHari}
              allLabel="Semua"
              options={TERTAHAN_OPTIONS}
              onChange={(tertahanHari) => onFilterChange({ ...filter, tertahanHari })}
            />
            <label className="space-y-2">
              <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Tanggal Dokumen Dari</span>
              <DatePicker
                value={filter.tanggalMulai ?? ''}
                onChange={(tanggal) => onFilterChange({ ...filter, tanggalMulai: tanggal || undefined })}
                placeholder="Pilih tanggal mulai"
              />
            </label>
            <label className="space-y-2">
              <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Tanggal Dokumen Sampai</span>
              <DatePicker
                value={filter.tanggalAkhir ?? ''}
                onChange={(tanggal) => onFilterChange({ ...filter, tanggalAkhir: tanggal || undefined })}
                placeholder="Pilih tanggal selesai"
              />
            </label>
          </div>
        ),
      }}
      resultLabel={resultLabel}
      actions={(
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 border-brand-border bg-bg-surface font-bold"
          disabled={exportCount === 0}
          onClick={onExportClick}
        >
          <Download size={14} />
          Ekspor File (ZIP)
        </Button>
      )}
    />
  )
}

function FilterSelect({
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  label: string
  value?: string
  allLabel: string
  options: { id: string; nama: string }[]
  onChange: (value: string | undefined) => void
}) {
  return (
    <label className="space-y-2">
      <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <Select
        value={value || '_all'}
        onValueChange={(selected) => onChange(selected === '_all' ? undefined : selected ?? undefined)}
      >
        <SelectTrigger className="min-h-10 w-full rounded-xl border-brand-border bg-bg-surface px-4 text-sm font-semibold hover:border-brand-border-strong">
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

function MonitoringDocumentTable({
  dokumen,
  now,
  currentUserId,
  onOpenDocument,
}: {
  dokumen: DokumenLaporanRow[]
  now: number
  currentUserId: string | null
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
              <TableHead className={TABLE_HEAD_CLASS}>Posisi Saat Ini</TableHead>
              <TableHead className={TABLE_HEAD_CLASS}>Aktivitas Terakhir</TableHead>
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
                <TableCell className="max-w-[420px] px-6 py-5">
                  <p className="line-clamp-2 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-brand-text">{dok.judul}</p>
                  <p className="mt-1 text-xs font-medium text-zinc-500">
                    Pembuat: {getSubmitterName(dok)}
                    {dok.pengaju_id === currentUserId ? <Badge className="ml-2 border-brand-border-strong bg-brand-surface text-brand-solid-active">Anda</Badge> : null}
                  </p>
                </TableCell>
                <TableCell className="max-w-[240px] px-6 py-5">
                  <span className="line-clamp-2 text-sm text-zinc-900">{dok.kegiatan_nama ?? '-'}</span>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <PosisiBadge dok={dok} />
                    <LampiranDibersihkanBadge
                      lampiranDibersihkanAt={dok.lampiran_dibersihkan_at}
                      lampiranDibersihkanAlasan={dok.lampiran_dibersihkan_alasan}
                    />
                  </div>
                </TableCell>
                <TableCell className="px-6 py-5">
                  <UpdatedCell dok={dok} now={now} />
                </TableCell>
                <TableCell className="px-6 py-5 text-right">
                  <Button
                    type="button"
                    size="icon-lg"
                    variant="ghost"
                    className="size-10 rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-600 shadow-sm transition hover:border-brand-border-strong hover:bg-brand-surface hover:text-brand-solid group-hover:border-brand-border-strong group-hover:bg-brand-surface group-hover:text-brand-solid [&_svg]:!size-5"
                    aria-label={`Detail Dokumen ${dok.judul}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenDocument(dok.id)
                    }}
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
        {dokumen.map(dok => (
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
              <h2 className="line-clamp-2 min-w-0 text-sm font-semibold text-zinc-950">{dok.judul}</h2>
              <PosisiBadge dok={dok} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
              <InfoTile label="Pembuat" value={getSubmitterName(dok)} className="col-span-2" />
              <InfoTile label="Kegiatan" value={dok.kegiatan_nama ?? '-'} className="col-span-2" />
              <InfoTile label="Aktivitas Terakhir" value={<UpdatedCell dok={dok} now={now} />} className="col-span-2" />
            </div>
          </PegawaiPanel>
        ))}
      </div>
    </>
  )
}

function PosisiBadge({ dok }: { dok: DokumenLaporanRow }) {
  const posisi = getPosisiDokumen(dok)
  if (!posisi) return <Badge variant="outline" className={toneClasses('neutral', 'badge')}>{dok.status}</Badge>

  const label = posisi === 'SELESAI' && dok.status === 'TERSIMPAN' ? 'Tersimpan' : POSISI_DOKUMEN_LABEL[posisi]
  return (
    <Badge variant="outline" className={['text-nowrap', toneClasses(POSISI_TONE[posisi], 'badge')].join(' ')} title={label}>
      {label}
    </Badge>
  )
}

function UpdatedCell({ dok, now }: { dok: DokumenLaporanRow; now: number }) {
  const days = daysSinceUpdate(dok, now)
  const isStale = getPosisiDokumen(dok) !== 'SELESAI' && days >= STALE_WARNING_DAYS

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500">
        <Clock3 size={16} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
        {dok.updated_at ? formatDate(dok.updated_at) : '-'}
      </span>
      {isStale && (
        <span className={['inline-flex w-fit items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold', toneClasses('warning', 'badge')].join(' ')}>
          <AlertTriangle size={12} aria-hidden="true" />
          Tertahan {days} hari
        </span>
      )}
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

function matchesSearch(dok: DokumenLaporanRow, query: string) {
  if (!query) return true
  return [
    dok.judul,
    dok.kegiatan_nama,
    dok.leaf_node_nama,
    dok.pengaju_nama,
  ].some(value => value?.toLowerCase().includes(query))
}

function matchesPosisi(dok: DokumenLaporanRow, posisi?: PosisiFilter) {
  if (!posisi) return true
  const current = getPosisiDokumen(dok)
  if (posisi === 'REVISI') return current === 'REVISI_PENGAJU' || current === 'REVISI_PPK'
  return current === posisi
}

function matchesMonitoringFilter(dok: DokumenLaporanRow, filter: MonitoringFilterValue, now: number) {
  if (filter.kegiatanId && dok.kegiatan_jenis_id !== filter.kegiatanId) return false
  if (!matchesPosisi(dok, filter.posisi)) return false
  if (filter.pembuatId && (dok.pengaju_id ?? dok.created_by) !== filter.pembuatId) return false
  if (filter.tertahanHari) {
    if (getPosisiDokumen(dok) === 'SELESAI') return false
    if (daysSinceUpdate(dok, now) <= Number(filter.tertahanHari)) return false
  }
  if (filter.tanggalMulai && dok.tanggal < filter.tanggalMulai) return false
  if (filter.tanggalAkhir && dok.tanggal > filter.tanggalAkhir) return false
  return true
}

function countByPosisi(documents: DokumenLaporanRow[]): Record<PosisiDokumen, number> {
  const counts: Record<PosisiDokumen, number> = {
    DI_PPK: 0,
    DI_PPSPM: 0,
    REVISI_PENGAJU: 0,
    REVISI_PPK: 0,
    SELESAI: 0,
  }
  for (const dok of documents) {
    const posisi = getPosisiDokumen(dok)
    if (posisi) counts[posisi] += 1
  }
  return counts
}

function compareDocuments(a: DokumenLaporanRow, b: DokumenLaporanRow, sortBy: SortMode, now: number) {
  if (sortBy === 'stale_first') return staleSortValue(b, now) - staleSortValue(a, now)
  if (sortBy === 'title_asc') return a.judul.localeCompare(b.judul, 'id-ID')
  if (sortBy === 'submitter_asc') return getSubmitterName(a).localeCompare(getSubmitterName(b), 'id-ID')
  return dateValue(b.updated_at) - dateValue(a.updated_at)
}

/** Dokumen selesai tidak "tertahan", jadi selalu di bawah saat urut paling lama tertahan. */
function staleSortValue(dok: DokumenLaporanRow, now: number) {
  return getPosisiDokumen(dok) === 'SELESAI' ? -1 : daysSinceUpdate(dok, now)
}

function daysSinceUpdate(dok: DokumenLaporanRow, now: number) {
  const updated = dateValue(dok.updated_at)
  if (!updated) return 0
  return Math.max(0, Math.floor((now - updated) / DAY_MS))
}

/** Hanya filter di dalam panel "Filter Lanjutan" (pembuat punya kontrol sendiri di toolbar). */
function countAdvancedFilters(filter: MonitoringFilterValue) {
  return [
    filter.kegiatanId,
    filter.posisi,
    filter.tertahanHari,
    filter.tanggalMulai,
    filter.tanggalAkhir,
  ].filter(Boolean).length
}

function getSubmitterName(dok: DokumenLaporanRow) {
  return dok.pengaju_nama ?? 'Tidak diketahui'
}

function dateValue(value?: string | null) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}
