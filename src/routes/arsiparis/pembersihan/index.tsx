import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ChevronRight,
  Trash2,
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
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import {
  formatBerkasArchiveStatusLabel,
  formatKlasifikasiLabel,
  formatNominalRupiah,
  formatNullableDateLabel,
} from '#/lib/archive/berkas-arsip-page-format'
import {
  BERKAS_USUL_MUSNAH_LIST_CSV_FILENAME,
  createBerkasFolderListCsv,
  downloadCsvFile,
} from '#/lib/archive/berkas-arsip-csv'
import { ApiError, apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/arsiparis/usul-musnah/')({ component: UsulMusnahPage })

type BerkasFolder = {
  berkas_id: string
  klasifikasi_id: string
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string
  status_berkas: string
  status_arsip: string | null
  nomor_spm: string | null
  retensi_aktif: string | null
  retensi_inaktif: string | null
  masa_aktif_berakhir: string | null
  masa_inaktif_berakhir: string | null
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

const LOCAL_NO_MATCH_MESSAGE = 'Tidak ada data yang cocok dengan pencarian.'
type FinalArchiveFilter = 'USUL_MUSNAH' | 'DIMUSNAHKAN'

const FINAL_ARCHIVE_FILTER_OPTIONS: Array<{ value: FinalArchiveFilter; label: string }> = [
  { value: 'USUL_MUSNAH', label: 'Usul Musnah' },
  { value: 'DIMUSNAHKAN', label: 'Arsip Dimusnahkan' },
]

function UsulMusnahPage() {
  const navigate = useNavigate()
  const [proposedFolders, setProposedFolders] = useState<BerkasFolder[]>([])
  const [destroyedFolders, setDestroyedFolders] = useState<BerkasFolder[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<FinalArchiveFilter>('USUL_MUSNAH')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const [proposedJson, destroyedJson] = await Promise.all([
        apiFetch<BerkasFolderListResponse>('/arsiparis/berkas', {
          query: {
            status_berkas: 'CLOSED',
            status_arsip: 'USUL_MUSNAH',
          },
        }),
        apiFetch<BerkasFolderListResponse>('/arsiparis/berkas', {
          query: {
            status_berkas: 'CLOSED',
            status_arsip: 'DIMUSNAHKAN',
          },
        }),
      ])
      setProposedFolders(proposedJson.berkas ?? [])
      setDestroyedFolders(destroyedJson.berkas ?? [])
    } catch (error) {
      setError(resolveErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const folders = statusFilter === 'DIMUSNAHKAN' ? destroyedFolders : proposedFolders
  const filteredFolders = filterBerkasFolders(folders, searchQuery)
  const hasSearchQuery = searchQuery.trim().length > 0
  const canExport = filteredFolders.length > 0 && !loading && !error

  function exportCsv() {
    const csv = createBerkasFolderListCsv([
      { label: statusFilter === 'DIMUSNAHKAN' ? 'Arsip Dimusnahkan' : 'Usul Musnah', folders: filteredFolders },
    ])

    downloadCsvFile(BERKAS_USUL_MUSNAH_LIST_CSV_FILENAME, csv)
  }

  return (
    <PageLayout>
      <div className={ARCHIVE_PAGE_CONTAINER_CLASS}>
        <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-headline text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-[30px]">
              Usul Musnah
            </h1>
            <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-zinc-700">
              Berkas yang menunggu pemusnahan dan metadata akhir untuk arsip yang sudah Dimusnahkan.
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
          id="usul-musnah-page-local-search"
          label="Pencarian lokal halaman"
          value={searchQuery}
          placeholder={statusFilter === 'DIMUSNAHKAN'
            ? 'Cari metadata arsip dimusnahkan di halaman ini...'
            : 'Cari berkas usul musnah di halaman ini...'}
          resultText={`${filteredFolders.length} dari ${folders.length} berkas ditampilkan`}
          onChange={setSearchQuery}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-zinc-700">Status:</span>
            <div className="flex flex-wrap gap-1 rounded-xl border border-[#F0E1D5] bg-[#FFF8F1] p-1">
              {FINAL_ARCHIVE_FILTER_OPTIONS.map((option) => {
                const selected = statusFilter === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`h-8 rounded-lg px-3 text-xs font-bold transition ${
                      selected
                        ? 'border border-orange-200 bg-orange-50 text-[#FF4D00] shadow-sm'
                        : 'border border-transparent text-zinc-600 hover:bg-[#FFFDF9] hover:text-zinc-950'
                    }`}
                    aria-pressed={selected}
                    onClick={() => setStatusFilter(option.value)}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        </ArchiveSearchPanel>

        {loading ? (
          <LoadingState variant="list" label="Memuat usul musnah" />
        ) : error ? (
          <ErrorState
            title="Gagal memuat usul musnah"
            description={error}
            action={<Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>}
            variant="page"
          />
        ) : filteredFolders.length === 0 ? (
          <EmptyState
            title={hasSearchQuery ? LOCAL_NO_MATCH_MESSAGE : getEmptyTitle(statusFilter)}
            description={hasSearchQuery
              ? 'Ubah kata kunci untuk melihat berkas lain di halaman ini.'
              : getEmptyDescription(statusFilter)}
            icon={<Trash2 size={22} />}
          />
        ) : (
          <BerkasLifecycleTable
            folders={filteredFolders}
            onOpen={(folder) => navigate({ to: '/arsiparis/berkas/$id', params: { id: folder.berkas_id } })}
          />
        )}
      </div>
    </PageLayout>
  )
}

function BerkasLifecycleTable({
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
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Klasifikasi Arsip</th>
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Nomor SPM</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Jumlah Dokumen</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Nominal Realisasi</th>
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Status Arsip</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Tanggal Ditutup</th>
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
                <td className="max-w-[440px] px-6 py-5 text-zinc-950">
                  <p className="line-clamp-2 text-[15px] font-semibold tracking-tight transition-colors group-hover:text-[#FF4D00]">
                    {formatKlasifikasiLabel(folder.klasifikasi_kode_snapshot, folder.klasifikasi_nama_snapshot)}
                  </p>
                </td>
                <td className="px-6 py-5 text-sm font-semibold text-zinc-900">{folder.nomor_spm ?? '-'}</td>
                <td className="px-6 py-5 text-center text-sm font-semibold text-zinc-900">{folder.item_count}</td>
                <td className="px-6 py-5 text-center font-mono text-sm font-bold text-zinc-950">{formatNominalRupiah(folder.total_nominal_realisasi)}</td>
                <td className="px-6 py-5">
                  <StatusArsipBadge statusArsip={folder.status_arsip} statusBerkas={folder.status_berkas} />
                </td>
                <td className="px-6 py-5 text-center text-sm font-semibold text-zinc-500">{formatNullableDateLabel(folder.closed_at)}</td>
                <td className="px-6 py-5 text-center text-sm font-semibold text-zinc-500">{formatNullableDateLabel(folder.updated_at)}</td>
                <td className="px-6 py-5 text-right">
                  <Link
                    to="/arsiparis/berkas/$id"
                    params={{ id: folder.berkas_id }}
                    aria-label={`Buka detail ${formatKlasifikasiLabel(folder.klasifikasi_kode_snapshot, folder.klasifikasi_nama_snapshot)}`}
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex size-10 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-600 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] group-hover:border-orange-200 group-hover:bg-orange-50 group-hover:text-orange-600 group-hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)]"
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
            subtitle={`Nomor SPM: ${folder.nomor_spm ?? '-'}`}
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
              { label: 'Tanggal tutup', value: formatNullableDateLabel(folder.closed_at) },
              { label: 'Terakhir diperbarui', value: formatNullableDateLabel(folder.updated_at) },
            ]}
            action={
              <Link
                to="/arsiparis/berkas/$id"
                params={{ id: folder.berkas_id }}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200/80 bg-[#FFFDF9] text-xs font-bold text-zinc-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
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

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const payload = error.payload
    if (payload && typeof payload === 'object' && 'error' in payload) {
      const message = payload.error
      if (typeof message === 'string') return message
    }
    return 'Gagal mengambil daftar berkas usul musnah'
  }

  return 'Terjadi kesalahan'
}

function filterBerkasFolders(folders: BerkasFolder[], query: string): BerkasFolder[] {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) return folders

  return folders.filter((folder) => buildBerkasFolderSearchText(folder).includes(normalizedQuery))
}

function buildBerkasFolderSearchText(folder: BerkasFolder): string {
  return [
    folder.klasifikasi_kode_snapshot,
    folder.klasifikasi_nama_snapshot,
    formatKlasifikasiLabel(folder.klasifikasi_kode_snapshot, folder.klasifikasi_nama_snapshot),
    folder.nomor_spm,
    formatNullableDateLabel(folder.closed_at),
    formatNullableDateLabel(folder.updated_at),
    folder.status_arsip,
    formatBerkasArchiveStatusLabel(folder.status_arsip, folder.status_berkas),
    String(folder.item_count),
    String(folder.workflow_item_count),
    String(folder.manual_item_count),
    formatNominalRupiah(folder.total_nominal_realisasi),
  ].map(normalizeSearchValue).filter(Boolean).join(' ')
}

function getEmptyTitle(filter: FinalArchiveFilter): string {
  return filter === 'DIMUSNAHKAN'
    ? 'Belum ada arsip dimusnahkan'
    : 'Belum ada berkas usul musnah'
}

function getEmptyDescription(filter: FinalArchiveFilter): string {
  return filter === 'DIMUSNAHKAN'
    ? 'Metadata arsip yang sudah Dimusnahkan akan tetap tampil di sini ketika tersedia.'
    : 'Berkas Inaktif yang diusulkan musnah akan muncul di halaman ini sampai statusnya menjadi Dimusnahkan.'
}

function normalizeSearchValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}
