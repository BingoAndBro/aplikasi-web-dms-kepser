import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ChevronRight,
  FolderOpen,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  ARCHIVE_PAGE_CONTAINER_CLASS,
  ARCHIVE_TABLE_HEAD_CLASS,
  ARCHIVE_TABLE_ROW_CLASS,
  ArchiveMobileCard,
  ArchiveMobileList,
  ArchiveExportButton,
  ArchiveSearchPanel,
  ArchiveTableShell,
} from '#/components/archive/ArchivePagePrimitives'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { WorkflowStatusSelect } from '#/components/workflow/PpkPpspmPagePrimitives'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import {
  formatBerkasArchiveStatusLabel,
  formatBerkasStatusLabel,
  formatKlasifikasiLabel,
  formatNominalRupiah,
  formatNullableDateLabel,
} from '#/lib/archive/berkas-arsip-page-format'
import {
  BERKAS_FOLDER_LIST_CSV_FILENAME,
  createBerkasFolderListCsv,
  downloadCsvFile,
} from '#/lib/archive/berkas-arsip-csv'
import { ApiError, apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/kasubag/berkas/')({ component: BerkasArsipAktifPage })

type BerkasFolder = {
  berkas_id: string
  klasifikasi_id: string
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string
  status_berkas: string
  status_arsip: string | null
  nomor_spm: string | null
  retensi_aktif: string | null
  masa_aktif_berakhir: string | null
  closed_at: string | null
  item_count: number
  workflow_item_count: number
  manual_item_count: number
  total_nominal_realisasi: number | null
  created_at: string | null
  updated_at: string | null
}

type BerkasFolderListResponse = {
  berkas?: BerkasFolder[]
  summary?: {
    total_rows_returned: number
    item_count_total: number
    workflow_item_count_total: number
    manual_item_count_total: number
    total_nominal_realisasi: number | null
  }
  error?: string
}

type BerkasSortOrder = 'updated_desc' | 'updated_asc' | 'nominal_desc'

const LOCAL_NO_MATCH_MESSAGE = 'Tidak ada data yang cocok dengan pencarian.'
const SORT_OPTIONS: Array<{ value: BerkasSortOrder; label: string }> = [
  { value: 'updated_desc', label: 'Terbaru' },
  { value: 'updated_asc', label: 'Terlama' },
  { value: 'nominal_desc', label: 'Nominal Tertinggi' },
]

function BerkasArsipAktifPage() {
  const navigate = useNavigate()
  const [openFolders, setOpenFolders] = useState<BerkasFolder[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<BerkasSortOrder>('updated_desc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      // RP-01: halaman ini hanya menampilkan berkas OPEN. Daftar berkas tertutup
      // (status_arsip=AKTIF) pindah ke /kasubag/berkas/tertutup.
      const openJson = await apiFetch<BerkasFolderListResponse>('/kasubag/berkas', {
        query: {
          status_berkas: 'OPEN',
          status_arsip: 'null',
        },
      })
      setOpenFolders(openJson.berkas ?? [])
    } catch (error) {
      setError(resolveErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  function exportCsv() {
    const csv = createBerkasFolderListCsv([
      { label: 'Berkas Terbuka', folders: filteredFolders },
    ])

    downloadCsvFile(BERKAS_FOLDER_LIST_CSV_FILENAME, csv)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filteredFolders = sortBerkasFolders(filterBerkasFolders(openFolders, searchQuery), sortOrder)
  const hasSearchQuery = searchQuery.trim().length > 0
  const exportRowCount = filteredFolders.length
  const canExport = exportRowCount > 0 && !loading && !error

  return (
    <PageLayout>
      <div className={ARCHIVE_PAGE_CONTAINER_CLASS}>
        <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[30px]">
              Berkas Terbuka
            </h1>
            <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-zinc-700">
              Daftar berkas yang masih menerima dokumen. Berkas tertutup ada di halaman Berkas Tertutup.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <ArchiveExportButton
              disabled={!canExport}
              title={canExport ? 'Ekspor CSV' : 'Tidak ada data untuk diekspor'}
              onClick={exportCsv}
            />
            {!canExport && !loading && !error && (
              <p className="text-xs text-on-surface-variant">Tidak ada data untuk diekspor.</p>
            )}
          </div>
        </section>

        <ArchiveSearchPanel
          id="berkas-page-local-search"
          label="Pencarian lokal halaman"
          value={searchQuery}
          placeholder="Cari Cara Pembayaran..."
          resultText={`Hasil: ${exportRowCount} berkas`}
          onChange={setSearchQuery}
        >
          <div className="flex flex-wrap items-center gap-2">
            <WorkflowStatusSelect
              value={sortOrder}
              onChange={(nextValue) => setSortOrder((nextValue || 'updated_desc') as BerkasSortOrder)}
              options={SORT_OPTIONS}
              ariaLabel="Urutan berkas"
              className="min-w-[148px]"
            />
          </div>
        </ArchiveSearchPanel>

        {loading ? (
          <LoadingState variant="list" label="Memuat daftar berkas" />
        ) : error ? (
          <ErrorState
            title="Gagal memuat daftar berkas"
            description={error}
            action={<Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>}
            variant="page"
          />
        ) : (
          <BerkasUnifiedSection
            folders={filteredFolders}
            hasSearchQuery={hasSearchQuery}
            onOpen={(folder) => navigate({ to: '/kasubag/berkas/$id', params: { id: folder.berkas_id } })}
          />
        )}
      </div>
    </PageLayout>
  )
}

function BerkasUnifiedSection({
  folders,
  hasSearchQuery,
  onOpen,
}: {
  folders: BerkasFolder[]
  hasSearchQuery: boolean
  onOpen: (folder: BerkasFolder) => void
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-headline text-lg font-extrabold text-on-surface">Daftar Berkas Terbuka</h3>
        <p className="text-xs text-on-surface-variant">Berkas yang masih menerima dokumen untuk cara pembayaran terkait.</p>
      </div>

      {folders.length === 0 ? (
        <EmptyState
          title={hasSearchQuery ? LOCAL_NO_MATCH_MESSAGE : 'Belum ada berkas terbuka'}
          description={hasSearchQuery
            ? 'Ubah kata kunci untuk melihat berkas lain di halaman ini.'
            : 'Berkas terbuka muncul setelah dokumen persetujuan atau manual pertama memilih cara pembayaran yang belum final.'}
          icon={<FolderOpen size={22} />}
        />
      ) : (
        <BerkasTable
          folders={folders}
          onOpen={onOpen}
        />
      )}
    </section>
  )
}

function BerkasTable({
  folders,
  onOpen,
}: {
  folders: BerkasFolder[]
  onOpen: (folder: BerkasFolder) => void
}) {
  return (
    <>
      <ArchiveTableShell>
        <table className="w-full text-left">
          <thead>
            <tr className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
              <th className={`w-16 text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>No</th>
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Cara Pembayaran</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Jumlah Dokumen</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Nominal Realisasi</th>
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Status Berkas</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Terakhir Diperbarui</th>
              <th className={`w-20 text-right ${ARCHIVE_TABLE_HEAD_CLASS}`}>Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 text-[13px]">
            {folders.map((folder, index) => (
              <tr
                key={folder.berkas_id}
                className={`${ARCHIVE_TABLE_ROW_CLASS} cursor-pointer`}
                onClick={() => onOpen(folder)}
              >
                <td className="px-6 py-5 text-center text-sm font-normal text-zinc-950">{index + 1}</td>
                <td className="max-w-[440px] px-6 py-5 text-zinc-950">
                  <p className="line-clamp-2 text-[15px] font-semibold tracking-tight transition-colors group-hover:text-brand-text">
                    {formatKlasifikasiLabel(folder.klasifikasi_kode_snapshot, folder.klasifikasi_nama_snapshot)}
                  </p>
                  <p className="mt-1 text-xs font-medium text-zinc-500">
                    Persetujuan {folder.workflow_item_count} / Manual {folder.manual_item_count}
                  </p>
                </td>
                <td className="px-6 py-5 text-center text-sm font-semibold text-zinc-900">{folder.item_count} dokumen</td>
                <td className="px-6 py-5 text-center font-mono text-sm font-bold text-zinc-950">{formatNominalRupiah(folder.total_nominal_realisasi)}</td>
                <td className="px-6 py-5">
                  <div className="flex flex-col items-start gap-1">
                    <StatusBerkasBadge status={folder.status_berkas} />
                    {!isOpenFolder(folder) && (
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                        {formatBerkasArchiveStatusLabel(folder.status_arsip, folder.status_berkas)}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-5 text-center text-sm font-semibold text-zinc-500">
                  {formatNullableDateLabel(folder.updated_at)}
                </td>
                <td className="px-6 py-5 text-right">
                  <Link
                    to="/kasubag/berkas/$id"
                    params={{ id: folder.berkas_id }}
                    aria-label={`Buka detail ${formatKlasifikasiLabel(folder.klasifikasi_kode_snapshot, folder.klasifikasi_nama_snapshot)}`}
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex size-10 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-600 shadow-sm transition hover:border-brand-border-strong hover:bg-brand-surface hover:text-brand-solid hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] group-hover:border-brand-border-strong group-hover:bg-brand-surface group-hover:text-brand-solid group-hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)]"
                  >
                    <ChevronRight size={20} strokeWidth={2.35} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ArchiveTableShell>
      <ArchiveMobileList>
        {folders.map((folder) => (
          <ArchiveMobileCard
            key={folder.berkas_id}
            title={formatKlasifikasiLabel(folder.klasifikasi_kode_snapshot, folder.klasifikasi_nama_snapshot)}
            subtitle={isOpenFolder(folder) ? 'Berkas terbuka' : `Nomor SPM: ${folder.nomor_spm ?? '-'}`}
            status={<StatusArsipBadge statusArsip={folder.status_arsip} statusBerkas={folder.status_berkas} />}
            meta={[
              { label: 'Status berkas', value: <StatusBerkasBadge status={folder.status_berkas} /> },
              { label: 'Jumlah dokumen', value: folder.item_count },
              { label: 'Persetujuan', value: folder.workflow_item_count },
              { label: 'Manual', value: folder.manual_item_count },
              {
                label: 'Total nominal',
                value: <span className="font-mono font-bold text-zinc-950">{formatNominalRupiah(folder.total_nominal_realisasi)}</span>,
              },
              { label: 'Diperbarui', value: formatNullableDateLabel(folder.updated_at) },
            ]}
            action={
              <Link
                to="/kasubag/berkas/$id"
                params={{ id: folder.berkas_id }}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200/80 bg-bg-surface text-xs font-bold text-zinc-700 transition hover:border-brand-border-strong hover:bg-brand-surface hover:text-brand-solid-active"
              >
                <ChevronRight size={14} />
                Buka Detail
              </Link>
            }
          />
        ))}
      </ArchiveMobileList>
    </>
  )
}

function StatusBerkasBadge({ status }: { status: string }) {
  const isOpen = status === 'OPEN'
  return (
    <span className={`inline-flex w-fit items-center rounded-md border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-nowrap ${
      isOpen
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-amber-200 bg-amber-50 text-amber-700'
    }`}
    >
      {isOpen ? 'Terbuka' : 'Ditutup'}
    </span>
  )
}

function StatusArsipBadge({ statusArsip, statusBerkas }: { statusArsip: string | null; statusBerkas: string }) {
  return (
    <StatusBadge
      kind="archive"
      status={statusArsip}
      fallbackLabel={formatBerkasArchiveStatusLabel(statusArsip, statusBerkas)}
    />
  )
}

function isOpenFolder(folder: Pick<BerkasFolder, 'status_berkas' | 'status_arsip'>): boolean {
  return folder.status_berkas === 'OPEN' && folder.status_arsip === null
}

function filterBerkasFolders(folders: BerkasFolder[], query: string): BerkasFolder[] {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) return folders

  return folders.filter((folder) => buildBerkasFolderSearchText(folder).includes(normalizedQuery))
}

function sortBerkasFolders(folders: BerkasFolder[], sortOrder: BerkasSortOrder): BerkasFolder[] {
  return [...folders].sort((left, right) => {
    if (sortOrder === 'nominal_desc') {
      return (right.total_nominal_realisasi ?? 0) - (left.total_nominal_realisasi ?? 0)
    }

    const leftTime = getDateSortTime(left.updated_at)
    const rightTime = getDateSortTime(right.updated_at)
    return sortOrder === 'updated_asc' ? leftTime - rightTime : rightTime - leftTime
  })
}

function getDateSortTime(value: string | null | undefined): number {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function buildBerkasFolderSearchText(folder: BerkasFolder): string {
  return [
    folder.klasifikasi_kode_snapshot,
    folder.klasifikasi_nama_snapshot,
    formatKlasifikasiLabel(folder.klasifikasi_kode_snapshot, folder.klasifikasi_nama_snapshot),
    folder.nomor_spm,
    folder.status_berkas,
    formatBerkasStatusLabel(folder.status_berkas),
    folder.status_arsip,
    formatBerkasArchiveStatusLabel(folder.status_arsip, folder.status_berkas),
    String(folder.item_count),
    String(folder.workflow_item_count),
    String(folder.manual_item_count),
    formatNominalRupiah(folder.total_nominal_realisasi),
    formatNullableDateLabel(folder.closed_at),
    formatNullableDateLabel(folder.updated_at),
  ].map(normalizeSearchValue).filter(Boolean).join(' ')
}

function normalizeSearchValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const payload = error.payload
    if (payload && typeof payload === 'object' && 'error' in payload) {
      const message = payload.error
      if (typeof message === 'string') return message
    }
    return 'Gagal mengambil data'
  }

  return 'Terjadi kesalahan'
}
