import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowRightCircle,
  ChevronRight,
  Download,
  FolderOpen,
  Loader2,
  Save,
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
  BERKAS_FOLDER_LIST_CSV_FILENAME,
  createBerkasFolderListCsv,
  downloadCsvFile,
} from '#/lib/archive/berkas-arsip-csv'
import {
  buildCloseBerkasRequestBody,
  CloseBerkasDialog,
  EMPTY_BERKAS_CLOSE_MESSAGE,
  EMPTY_CLOSE_BERKAS_FORM,
  isCloseBerkasFormIncomplete,
  type CloseBerkasFormState,
} from './-components/CloseBerkasDialog'
import { ApiError, apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/arsiparis/berkas/')({ component: BerkasArsipAktifPage })

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

type BerkasStatusFilter = 'all' | 'open' | 'active'

const LOCAL_NO_MATCH_MESSAGE = 'Tidak ada data yang cocok dengan pencarian.'
const STATUS_FILTER_OPTIONS: Array<{ value: BerkasStatusFilter; label: string }> = [
  { value: 'all', label: 'Semua' },
  { value: 'open', label: 'Terbuka' },
  { value: 'active', label: 'Arsip Aktif' },
]

function BerkasArsipAktifPage() {
  const [openFolders, setOpenFolders] = useState<BerkasFolder[]>([])
  const [activeFolders, setActiveFolders] = useState<BerkasFolder[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<BerkasStatusFilter>('all')
  const [openSummary, setOpenSummary] = useState<BerkasFolderListResponse['summary'] | null>(null)
  const [activeSummary, setActiveSummary] = useState<BerkasFolderListResponse['summary'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [pendingLifecycleBerkasId, setPendingLifecycleBerkasId] = useState<string | null>(null)
  const [closeDialogFolder, setCloseDialogFolder] = useState<BerkasFolder | null>(null)
  const [pendingCloseBerkasId, setPendingCloseBerkasId] = useState<string | null>(null)
  const [closeForm, setCloseForm] = useState<CloseBerkasFormState>(EMPTY_CLOSE_BERKAS_FORM)

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const [openJson, activeJson] = await Promise.all([
        apiFetch<BerkasFolderListResponse>('/arsiparis/berkas', {
          query: {
            status_berkas: 'OPEN',
            status_arsip: 'null',
          },
        }),
        apiFetch<BerkasFolderListResponse>('/arsiparis/berkas', {
          query: {
            status_berkas: 'CLOSED',
            status_arsip: 'AKTIF',
          },
        }),
      ])
      setOpenFolders(openJson.berkas ?? [])
      setActiveFolders(activeJson.berkas ?? [])
      setOpenSummary(openJson.summary ?? null)
      setActiveSummary(activeJson.summary ?? null)
    } catch (error) {
      setError(resolveErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function submitLifecycleAction(folder: BerkasFolder) {
    const lifecycleAction = resolveBerkasLifecycleAction(folder.status_berkas, folder.status_arsip)
    if (!lifecycleAction) return
    if (!window.confirm(lifecycleAction.confirmation)) return

    setPendingLifecycleBerkasId(folder.berkas_id)
    setActionError(null)
    setActionSuccess(null)

    try {
      await apiFetch(`/arsiparis/berkas/${encodeURIComponent(folder.berkas_id)}/lifecycle`, {
        method: 'POST',
        body: JSON.stringify({ action: lifecycleAction.action }),
      })
      setActionSuccess(lifecycleAction.successMessage)
      await fetchData()
    } catch (error) {
      setActionError(resolveErrorMessage(error))
    } finally {
      setPendingLifecycleBerkasId(null)
    }
  }

  async function submitCloseBerkas() {
    if (!closeDialogFolder) return
    if (isBerkasEmptyForClose(closeDialogFolder) || isCloseBerkasFormIncomplete(closeForm)) {
      setActionError(isBerkasEmptyForClose(closeDialogFolder)
        ? EMPTY_BERKAS_CLOSE_MESSAGE
        : 'Nomor SPM, Retensi Aktif, dan Retensi Inaktif wajib diisi')
      setActionSuccess(null)
      return
    }

    setPendingCloseBerkasId(closeDialogFolder.berkas_id)
    setActionError(null)
    setActionSuccess(null)

    try {
      await apiFetch(`/arsiparis/berkas/${encodeURIComponent(closeDialogFolder.berkas_id)}/close`, {
        method: 'POST',
        body: JSON.stringify(buildCloseBerkasRequestBody(closeForm)),
      })
      setActionSuccess('Berkas berhasil ditutup dan menjadi Arsip Aktif.')
      setCloseDialogFolder(null)
      setCloseForm(EMPTY_CLOSE_BERKAS_FORM)
      await fetchData()
    } catch (error) {
      setActionError(resolveErrorMessage(error))
    } finally {
      setPendingCloseBerkasId(null)
    }
  }

  function openCloseDialog(folder: BerkasFolder) {
    if (isBerkasEmptyForClose(folder)) {
      setActionError(EMPTY_BERKAS_CLOSE_MESSAGE)
      setActionSuccess(null)
      return
    }

    setCloseDialogFolder(folder)
    setActionError(null)
    setActionSuccess(null)
  }

  function exportCsv() {
    const csv = createBerkasFolderListCsv([
      { label: 'Pemberkasan Arsip Aktif', folders: filteredFolders },
    ])

    downloadCsvFile(BERKAS_FOLDER_LIST_CSV_FILENAME, csv)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const allFolders = [...openFolders, ...activeFolders]
  const visibleFolders = allFolders.filter((folder) => matchesStatusFilter(folder, statusFilter))
  const filteredFolders = filterBerkasFolders(visibleFolders, searchQuery)
  const hasSearchQuery = searchQuery.trim().length > 0
  const exportRowCount = filteredFolders.length
  const canExport = exportRowCount > 0 && !loading && !error

  return (
    <PageLayout>
      <div className={ARCHIVE_PAGE_CONTAINER_CLASS}>
        <ArchivePageHeader
          eyebrow={
            <>
              <Link to="/arsiparis" className="hover:text-orange-900">Kepala Sub Bagian Umum</Link>
              <ChevronRight size={10} />
              Pemberkasan Arsip Aktif
            </>
          }
          title="Pemberkasan Arsip Aktif"
          description="Daftar folder/berkas terbuka untuk pemberkasan berjalan dan berkas aktif yang sudah ditutup dengan metadata final."
          actions={
            <div className="flex flex-col gap-2 sm:items-end">
              <ArchiveNotice tone="success">
                Lifecycle berkas mengikuti alur folder-first. Tutup Berkas mengisi Nomor SPM dan retensi final.
              </ArchiveNotice>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit gap-1.5"
              disabled={!canExport}
              title={canExport ? 'Export daftar berkas yang sedang terlihat' : 'Tidak ada data untuk diekspor'}
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

        {(openSummary || activeSummary) && (
          <div className="grid gap-3 md:grid-cols-2">
            <ArchiveSummaryCard label="Berkas Terbuka" value={openSummary?.total_rows_returned ?? 0} icon={<FolderOpen size={20} />} />
            <ArchiveSummaryCard label="Berkas Aktif" value={activeSummary?.total_rows_returned ?? 0} icon={<Save size={20} />} />
          </div>
        )}

        <ArchiveSearchPanel
          id="berkas-page-local-search"
          label="Pencarian lokal halaman"
          value={searchQuery}
          placeholder="Cari Jenis Pembayaran..."
          helperText="Filter lokal untuk satu daftar terpadu Berkas Terbuka dan Arsip Aktif."
          resultText={`Hasil: ${exportRowCount} berkas`}
          onChange={setSearchQuery}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-zinc-700">Status:</span>
            <div className="flex flex-wrap gap-1 rounded-xl border border-[#F0E1D5] bg-[#FFF8F1] p-1">
              {STATUS_FILTER_OPTIONS.map((option) => {
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
            statusFilter={statusFilter}
            pendingLifecycleBerkasId={pendingLifecycleBerkasId}
            pendingCloseBerkasId={pendingCloseBerkasId}
            onLifecycleAction={submitLifecycleAction}
            onOpenCloseDialog={openCloseDialog}
          />
        )}
        <CloseBerkasDialog
          open={Boolean(closeDialogFolder)}
          form={closeForm}
          pending={Boolean(pendingCloseBerkasId)}
          submitDisabled={
            Boolean(pendingCloseBerkasId)
            || !closeDialogFolder
            || isBerkasEmptyForClose(closeDialogFolder)
            || isCloseBerkasFormIncomplete(closeForm)
          }
          onOpenChange={(open) => {
            if (!open && !pendingCloseBerkasId) {
              setCloseDialogFolder(null)
              setCloseForm(EMPTY_CLOSE_BERKAS_FORM)
              setActionError(null)
            }
          }}
          onFormChange={setCloseForm}
          onSubmit={submitCloseBerkas}
        />
      </div>
    </PageLayout>
  )
}

function BerkasUnifiedSection({
  folders,
  hasSearchQuery,
  statusFilter,
  pendingLifecycleBerkasId,
  pendingCloseBerkasId,
  onLifecycleAction,
  onOpenCloseDialog,
}: {
  folders: BerkasFolder[]
  hasSearchQuery: boolean
  statusFilter: BerkasStatusFilter
  pendingLifecycleBerkasId: string | null
  pendingCloseBerkasId: string | null
  onLifecycleAction: (folder: BerkasFolder) => void
  onOpenCloseDialog: (folder: BerkasFolder) => void
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-headline text-lg font-extrabold text-on-surface">Daftar Berkas</h3>
        <p className="text-xs text-on-surface-variant">Berkas Terbuka dan Arsip Aktif ditampilkan dalam satu daftar terpadu.</p>
      </div>

      {folders.length === 0 ? (
        <EmptyState
          title={hasSearchQuery ? LOCAL_NO_MATCH_MESSAGE : getEmptyTitleForFilter(statusFilter)}
          description={hasSearchQuery ? 'Ubah kata kunci untuk melihat berkas lain di halaman ini.' : getEmptyDescriptionForFilter(statusFilter)}
          icon={<FolderOpen size={22} />}
        />
      ) : (
        <BerkasTable
          folders={folders}
          pendingLifecycleBerkasId={pendingLifecycleBerkasId}
          pendingCloseBerkasId={pendingCloseBerkasId}
          onLifecycleAction={onLifecycleAction}
          onOpenCloseDialog={onOpenCloseDialog}
        />
      )}
    </section>
  )
}

function BerkasTable({
  folders,
  pendingLifecycleBerkasId,
  pendingCloseBerkasId,
  onLifecycleAction,
  onOpenCloseDialog,
}: {
  folders: BerkasFolder[]
  pendingLifecycleBerkasId: string | null
  pendingCloseBerkasId: string | null
  onLifecycleAction: (folder: BerkasFolder) => void
  onOpenCloseDialog: (folder: BerkasFolder) => void
}) {
  return (
    <>
      <ArchiveTableShell>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-orange-50/60 text-left">
              <th className={`w-10 text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>No</th>
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Jenis Pembayaran</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Jumlah Dokumen</th>
              <th className={`text-right ${ARCHIVE_TABLE_HEAD_CLASS}`}>Total Nominal Realisasi</th>
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Status Berkas</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Terakhir Diperbarui</th>
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
                  <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                    Workflow {folder.workflow_item_count} / Manual {folder.manual_item_count}
                  </p>
                </td>
                <td className="px-4 py-3 text-center font-semibold text-on-surface">{folder.item_count} dokumen</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-on-surface">{formatNominalRupiah(folder.total_nominal_realisasi)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <StatusBerkasBadge status={folder.status_berkas} />
                    {!isOpenFolder(folder) && (
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                        {formatBerkasArchiveStatusLabel(folder.status_arsip, folder.status_berkas)}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-on-surface-variant">
                  {formatNullableDateLabel(folder.updated_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link
                      to="/arsiparis/berkas/$id"
                      params={{ id: folder.berkas_id }}
                      className={ARCHIVE_INLINE_ACTION_CLASS}
                    >
                      Detail
                    </Link>
                    <LifecycleActionButton
                      folder={folder}
                      pending={pendingLifecycleBerkasId === folder.berkas_id}
                      onLifecycleAction={onLifecycleAction}
                    />
                    {isOpenFolder(folder) && (
                      <CloseBerkasShortcutButton
                        folder={folder}
                        pending={pendingCloseBerkasId === folder.berkas_id}
                        onOpenCloseDialog={onOpenCloseDialog}
                      />
                    )}
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
            subtitle={isOpenFolder(folder) ? 'Berkas terbuka' : `Nomor SPM: ${folder.nomor_spm ?? '-'}`}
            status={<StatusArsipBadge statusArsip={folder.status_arsip} statusBerkas={folder.status_berkas} />}
            meta={[
              { label: 'Status berkas', value: <StatusBerkasBadge status={folder.status_berkas} /> },
              { label: 'Jumlah dokumen', value: folder.item_count },
              { label: 'Workflow', value: folder.workflow_item_count },
              { label: 'Manual', value: folder.manual_item_count },
              { label: 'Total nominal', value: formatNominalRupiah(folder.total_nominal_realisasi) },
              { label: 'Diperbarui', value: formatNullableDateLabel(folder.updated_at) },
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
                <LifecycleActionButton
                  folder={folder}
                  pending={pendingLifecycleBerkasId === folder.berkas_id}
                  onLifecycleAction={onLifecycleAction}
                />
                {isOpenFolder(folder) && (
                  <CloseBerkasShortcutButton
                    folder={folder}
                    pending={pendingCloseBerkasId === folder.berkas_id}
                    onOpenCloseDialog={onOpenCloseDialog}
                  />
                )}
              </div>
            }
          />
        ))}
      </ArchiveMobileList>
    </>
  )
}

function CloseBerkasShortcutButton({
  folder,
  pending,
  onOpenCloseDialog,
}: {
  folder: BerkasFolder
  pending: boolean
  onOpenCloseDialog: (folder: BerkasFolder) => void
}) {
  const disabled = pending || isBerkasEmptyForClose(folder)

  return (
    <Button
      type="button"
      size="sm"
      className="h-7 gap-1.5 px-2.5 text-[11px]"
      disabled={disabled}
      title={isBerkasEmptyForClose(folder) ? EMPTY_BERKAS_CLOSE_MESSAGE : 'Tutup Berkas'}
      onClick={() => onOpenCloseDialog(folder)}
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
      {pending ? 'Memproses...' : 'Tutup Berkas'}
    </Button>
  )
}

function LifecycleActionButton({
  folder,
  pending,
  onLifecycleAction,
}: {
  folder: BerkasFolder
  pending: boolean
  onLifecycleAction: (folder: BerkasFolder) => void
}) {
  const lifecycleAction = resolveBerkasLifecycleAction(folder.status_berkas, folder.status_arsip)
  if (!lifecycleAction) return null

  return (
    <Button
      type="button"
      size="sm"
      variant={lifecycleAction.action === 'approve_destruction' ? 'destructive' : 'default'}
      className={`h-7 gap-1.5 px-2.5 text-[11px] ${
        lifecycleAction.action === 'approve_destruction' ? 'bg-error text-white hover:bg-error/90' : ''
      }`}
      disabled={pending}
      onClick={() => onLifecycleAction(folder)}
    >
      {pending
        ? <Loader2 size={14} className="animate-spin" />
        : <ArrowRightCircle size={14} />}
      {pending ? 'Memproses...' : lifecycleAction.label}
    </Button>
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

function isBerkasEmptyForClose(folder: Pick<BerkasFolder, 'item_count'>): boolean {
  return folder.item_count < 1
}

function isOpenFolder(folder: Pick<BerkasFolder, 'status_berkas' | 'status_arsip'>): boolean {
  return folder.status_berkas === 'OPEN' && folder.status_arsip === null
}

function matchesStatusFilter(folder: BerkasFolder, filter: BerkasStatusFilter): boolean {
  if (filter === 'open') return isOpenFolder(folder)
  if (filter === 'active') return folder.status_berkas === 'CLOSED' && folder.status_arsip === 'AKTIF'
  return true
}

function getEmptyTitleForFilter(filter: BerkasStatusFilter): string {
  if (filter === 'open') return 'Belum ada berkas terbuka'
  if (filter === 'active') return 'Belum ada arsip aktif'
  return 'Belum ada berkas aktif'
}

function getEmptyDescriptionForFilter(filter: BerkasStatusFilter): string {
  if (filter === 'open') {
    return 'Berkas terbuka akan muncul setelah dokumen workflow atau manual pertama memilih Jenis Pembayaran yang belum final.'
  }
  if (filter === 'active') {
    return 'Berkas yang sudah ditutup dengan status arsip Aktif akan muncul di sini.'
  }
  return 'Berkas Terbuka dan Arsip Aktif akan muncul di daftar terpadu ini.'
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
