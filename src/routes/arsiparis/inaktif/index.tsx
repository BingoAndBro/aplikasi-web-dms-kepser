import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ArchiveX,
  ArrowRightCircle,
  ChevronRight,
  Download,
  Loader2,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  ARCHIVE_INLINE_ACTION_CLASS,
  ARCHIVE_PAGE_CONTAINER_CLASS,
  ARCHIVE_TABLE_HEAD_CLASS,
  ARCHIVE_TABLE_ROW_CLASS,
  ArchiveMobileCard,
  ArchiveMobileList,
  ArchiveNotice,
  ArchivePageHeader,
  ArchiveSearchPanel,
  ArchiveSummaryCard,
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
  formatBerkasStatusLabel,
  formatKlasifikasiLabel,
  formatNominalRupiah,
  formatNullableDateLabel,
  resolveBerkasLifecycleAction,
} from '#/lib/archive/berkas-arsip-page-format'
import {
  BERKAS_INAKTIF_LIST_CSV_FILENAME,
  createBerkasFolderListCsv,
  downloadCsvFile,
} from '#/lib/archive/berkas-arsip-csv'
import { ApiError, apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/arsiparis/inaktif/')({ component: ArsipInaktifPage })

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

function ArsipInaktifPage() {
  const navigate = useNavigate()
  const [folders, setFolders] = useState<BerkasFolder[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [summary, setSummary] = useState<BerkasFolderListResponse['summary'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [pendingBerkasId, setPendingBerkasId] = useState<string | null>(null)

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const json = await apiFetch<BerkasFolderListResponse>('/arsiparis/berkas', {
        query: {
          status_berkas: 'CLOSED',
          status_arsip: 'INAKTIF',
        },
      })
      setFolders(json.berkas ?? [])
      setSummary(json.summary ?? null)
    } catch (error) {
      setError(resolveErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function proposeDestruction(folder: BerkasFolder) {
    const lifecycleAction = resolveBerkasLifecycleAction(folder.status_berkas, folder.status_arsip)
    if (lifecycleAction?.action !== 'propose_destruction') return
    if (!window.confirm(lifecycleAction.confirmation)) return

    setPendingBerkasId(folder.berkas_id)
    setActionError(null)
    setActionSuccess(null)

    try {
      await apiFetch(`/arsiparis/berkas/${encodeURIComponent(folder.berkas_id)}/lifecycle`, {
        method: 'POST',
        body: JSON.stringify({ action: 'propose_destruction' }),
      })
      setActionSuccess(lifecycleAction.successMessage)
      await navigate({ to: '/arsiparis/usul-musnah' })
    } catch (error) {
      setActionError(resolveErrorMessage(error))
    } finally {
      setPendingBerkasId(null)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filteredFolders = filterBerkasFolders(folders, searchQuery)
  const hasSearchQuery = searchQuery.trim().length > 0
  const canExport = filteredFolders.length > 0 && !loading && !error

  function exportCsv() {
    const csv = createBerkasFolderListCsv([
      { label: 'Daftar Arsip Inaktif', folders: filteredFolders },
    ])

    downloadCsvFile(BERKAS_INAKTIF_LIST_CSV_FILENAME, csv)
  }

  return (
    <PageLayout>
      <div className={ARCHIVE_PAGE_CONTAINER_CLASS}>
        <ArchivePageHeader
          eyebrow={
            <>
              <Link to="/arsiparis" className="hover:text-orange-900">Kepala Sub Bagian Umum</Link>
              <ChevronRight size={10} />
              Arsip Inaktif
            </>
          }
          title="Daftar Arsip Inaktif"
          description="Folder-first untuk berkas yang sudah ditutup dan berstatus arsip Inaktif. Metadata bersifat baca saja pada halaman ini."
          actions={
            <div className="flex flex-col gap-2 sm:items-end">
              <ArchiveNotice tone="warning">
                Usulkan Musnah hanya memindahkan lifecycle ke Usul Musnah melalui API berkas. File fisik tidak dihapus. Preview/download tetap mengikuti status berkas saat ini.
              </ArchiveNotice>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit gap-1.5"
              disabled={!canExport}
              title={canExport ? 'Export daftar arsip inaktif yang sedang terlihat' : 'Tidak ada data untuk diekspor'}
              onClick={exportCsv}
            >
              <Download size={14} />
              Export CSV
            </Button>
            {!canExport && !loading && !error && (
              <p className="text-xs text-on-surface-variant">Tidak ada data untuk diekspor.</p>
            )}
            </div>
          }
        />

        {summary && (
          <div className="grid gap-3 md:grid-cols-4">
            <ArchiveSummaryCard label="Berkas Inaktif" value={summary.total_rows_returned} />
            <ArchiveSummaryCard label="Jumlah Dokumen" value={summary.item_count_total} />
            <ArchiveSummaryCard label="Dokumen Workflow" value={summary.workflow_item_count_total} />
            <ArchiveSummaryCard label="Dokumen Manual" value={summary.manual_item_count_total} />
          </div>
        )}

        <ArchiveSearchPanel
          id="inaktif-page-local-search"
          label="Pencarian lokal halaman"
          value={searchQuery}
          placeholder="Cari berkas inaktif di halaman ini..."
          helperText="Filter lokal berdasarkan Jenis Pembayaran, Nomor SPM, tanggal tutup, dan jumlah dokumen."
          resultText={`${filteredFolders.length} dari ${folders.length} berkas ditampilkan`}
          onChange={setSearchQuery}
        />

        {(actionError || actionSuccess) && (
          <div className={`rounded-xl border px-4 py-3 text-xs font-semibold ${
            actionError
              ? 'border-error/20 bg-error/5 text-error'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
          >
            {actionError ?? actionSuccess}
          </div>
        )}

        {loading ? (
          <LoadingState variant="list" label="Memuat arsip inaktif" />
        ) : error ? (
          <ErrorState
            title="Gagal memuat arsip inaktif"
            description={error}
            action={<Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>}
            variant="page"
          />
        ) : filteredFolders.length === 0 ? (
          <EmptyState
            title={hasSearchQuery ? LOCAL_NO_MATCH_MESSAGE : 'Belum ada berkas inaktif'}
            description={hasSearchQuery
              ? 'Ubah kata kunci untuk melihat berkas inaktif lain di halaman ini.'
              : 'Berkas yang sudah ditutup dan dipindahkan ke status Inaktif akan muncul di halaman ini.'}
            icon={<ArchiveX size={22} />}
          />
        ) : (
          <BerkasLifecycleTable
            folders={filteredFolders}
            pendingBerkasId={pendingBerkasId}
            onProposeDestruction={proposeDestruction}
          />
        )}
      </div>
    </PageLayout>
  )
}

function BerkasLifecycleTable({
  folders,
  pendingBerkasId,
  onProposeDestruction,
}: {
  folders: BerkasFolder[]
  pendingBerkasId: string | null
  onProposeDestruction: (folder: BerkasFolder) => void
}) {
  return (
    <>
      <ArchiveTableShell>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-orange-50/60 text-left">
              <th className={`w-10 text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>No</th>
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Jenis Pembayaran</th>
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Status Berkas</th>
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Status Arsip</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Jumlah Dokumen</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Dokumen Workflow</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Dokumen Manual</th>
              <th className={`text-right ${ARCHIVE_TABLE_HEAD_CLASS}`}>Total Nominal</th>
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Nomor SPM</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Tanggal Ditutup</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {folders.map((folder, index) => (
              <tr key={folder.berkas_id} className={ARCHIVE_TABLE_ROW_CLASS}>
                <td className="px-5 py-4 text-center text-sm font-normal text-zinc-950">{index + 1}</td>
                <td className="px-5 py-4 text-zinc-950">
                  <p className="line-clamp-2 text-sm font-semibold tracking-tight transition-colors group-hover:text-[#FF4D00]">
                    {formatKlasifikasiLabel(folder.klasifikasi_kode_snapshot, folder.klasifikasi_nama_snapshot)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <StatusBerkasBadge status={folder.status_berkas} />
                </td>
                <td className="px-4 py-3">
                  <StatusArsipBadge statusArsip={folder.status_arsip} statusBerkas={folder.status_berkas} />
                </td>
                <td className="px-4 py-3 text-center text-on-surface">{folder.item_count}</td>
                <td className="px-4 py-3 text-center text-on-surface">{folder.workflow_item_count}</td>
                <td className="px-4 py-3 text-center text-on-surface">{folder.manual_item_count}</td>
                <td className="px-4 py-3 text-right text-on-surface">{formatNominalRupiah(folder.total_nominal_realisasi)}</td>
                <td className="px-4 py-3 font-semibold text-on-surface">{folder.nomor_spm ?? '-'}</td>
                <td className="px-4 py-3 text-center text-on-surface-variant">{formatNullableDateLabel(folder.closed_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link
                      to="/arsiparis/berkas/$id"
                      params={{ id: folder.berkas_id }}
                      className={ARCHIVE_INLINE_ACTION_CLASS}
                    >
                      Detail
                    </Link>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 gap-1.5 px-2.5 text-[11px]"
                      disabled={pendingBerkasId === folder.berkas_id}
                      onClick={() => onProposeDestruction(folder)}
                    >
                      {pendingBerkasId === folder.berkas_id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <ArrowRightCircle size={14} />}
                      {pendingBerkasId === folder.berkas_id ? 'Memproses...' : 'Usulkan Musnah'}
                    </Button>
                  </div>
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
              { label: 'Workflow', value: folder.workflow_item_count },
              { label: 'Manual', value: folder.manual_item_count },
              { label: 'Total nominal', value: formatNominalRupiah(folder.total_nominal_realisasi) },
              { label: 'Tanggal tutup', value: formatNullableDateLabel(folder.closed_at) },
            ]}
            action={
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/arsiparis/berkas/$id"
                  params={{ id: folder.berkas_id }}
                  className="inline-flex h-8 items-center rounded-lg border border-orange-200 px-3 text-xs font-semibold text-orange-800 hover:bg-orange-50"
                >
                  Detail
                </Link>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 px-3 text-xs"
                  disabled={pendingBerkasId === folder.berkas_id}
                  onClick={() => onProposeDestruction(folder)}
                >
                  {pendingBerkasId === folder.berkas_id
                    ? <Loader2 size={14} className="animate-spin" />
                    : <ArrowRightCircle size={14} />}
                  {pendingBerkasId === folder.berkas_id ? 'Memproses...' : 'Usulkan Musnah'}
                </Button>
              </div>
            }
          />
        ))}
      </ArchiveMobileList>
    </>
  )
}

function StatusBerkasBadge({ status }: { status: string }) {
  return <StatusBadge kind="folder" status={status} fallbackLabel={formatBerkasStatusLabel(status)} />
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
    return 'Gagal mengambil daftar berkas inaktif'
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
    String(folder.item_count),
    String(folder.workflow_item_count),
    String(folder.manual_item_count),
    formatNominalRupiah(folder.total_nominal_realisasi),
  ].map(normalizeSearchValue).filter(Boolean).join(' ')
}

function normalizeSearchValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}
