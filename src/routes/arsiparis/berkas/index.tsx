import { createFileRoute, Link } from '@tanstack/react-router'
import {
  AlertCircle,
  ArrowRightCircle,
  ChevronRight,
  Download,
  FolderOpen,
  Loader2,
  Save,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
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

type BerkasSectionMode = 'open' | 'active'

const LOCAL_NO_MATCH_MESSAGE = 'Tidak ada data yang cocok dengan pencarian.'

function BerkasArsipAktifPage() {
  const [openFolders, setOpenFolders] = useState<BerkasFolder[]>([])
  const [activeFolders, setActiveFolders] = useState<BerkasFolder[]>([])
  const [searchQuery, setSearchQuery] = useState('')
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
      { label: 'Berkas Terbuka', folders: filteredOpenFolders },
      { label: 'Pemberkasan Arsip Aktif', folders: filteredActiveFolders },
    ])

    downloadCsvFile(BERKAS_FOLDER_LIST_CSV_FILENAME, csv)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filteredOpenFolders = filterBerkasFolders(openFolders, searchQuery)
  const filteredActiveFolders = filterBerkasFolders(activeFolders, searchQuery)
  const hasSearchQuery = searchQuery.trim().length > 0
  const exportRowCount = filteredOpenFolders.length + filteredActiveFolders.length
  const canExport = exportRowCount > 0 && !loading && !error

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-outline">
              <Link to="/arsiparis" className="hover:text-primary">Kepala Sub Bagian Umum</Link>
              <ChevronRight size={10} />
              <span className="text-primary">Pemberkasan Arsip Aktif</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Pemberkasan Arsip Aktif</h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              Daftar berkas terbuka untuk pemberkasan berjalan dan berkas aktif yang sudah final.
            </p>
          </div>
          <div className="flex flex-col gap-2 md:items-end">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
              Lifecycle berkas bersifat status-only. Dokumen tidak dihapus oleh aksi fase ini.
            </div>
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
        </div>

        {(openSummary || activeSummary) && (
          <div className="grid gap-3 md:grid-cols-2">
            <SummaryCard label="Berkas Terbuka" value={openSummary?.total_rows_returned ?? 0} />
            <SummaryCard label="Berkas Aktif" value={activeSummary?.total_rows_returned ?? 0} />
          </div>
        )}

        <LocalSearchField
          value={searchQuery}
          placeholder="Cari berkas di halaman ini..."
          helperText="Filter lokal untuk Berkas Terbuka dan Pemberkasan Arsip Aktif."
          resultText={`${exportRowCount} dari ${openFolders.length + activeFolders.length} berkas ditampilkan`}
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
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-error/20 bg-error/5 py-20">
            <AlertCircle size={32} className="text-error" />
            <p className="text-sm text-on-surface-variant">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>
          </div>
        ) : (
          <div className="space-y-6">
            <BerkasSection
              title="Berkas Terbuka"
              description="Pemberkasan berjalan untuk Jenis Pembayaran yang masih dapat menerima dokumen."
              emptyTitle="Belum ada berkas terbuka"
              emptyDescription="Berkas terbuka akan muncul setelah dokumen workflow atau manual pertama memilih Jenis Pembayaran yang belum final."
              folders={filteredOpenFolders}
              hasSearchQuery={hasSearchQuery}
              mode="open"
              pendingLifecycleBerkasId={pendingLifecycleBerkasId}
              pendingCloseBerkasId={pendingCloseBerkasId}
              onLifecycleAction={submitLifecycleAction}
              onOpenCloseDialog={openCloseDialog}
            />
            <BerkasSection
              title="Pemberkasan Arsip Aktif"
              description="Berkas yang sudah ditutup dan memiliki status arsip Aktif."
              emptyTitle="Belum ada berkas arsip aktif"
              emptyDescription="Berkas yang sudah ditutup dengan status arsip Aktif akan muncul di sini."
              folders={filteredActiveFolders}
              hasSearchQuery={hasSearchQuery}
              mode="active"
              pendingLifecycleBerkasId={pendingLifecycleBerkasId}
              pendingCloseBerkasId={pendingCloseBerkasId}
              onLifecycleAction={submitLifecycleAction}
              onOpenCloseDialog={openCloseDialog}
            />
          </div>
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

function BerkasSection({
  title,
  description,
  emptyTitle,
  emptyDescription,
  folders,
  hasSearchQuery,
  mode,
  pendingLifecycleBerkasId,
  pendingCloseBerkasId,
  onLifecycleAction,
  onOpenCloseDialog,
}: {
  title: string
  description: string
  emptyTitle: string
  emptyDescription: string
  folders: BerkasFolder[]
  hasSearchQuery: boolean
  mode: BerkasSectionMode
  pendingLifecycleBerkasId: string | null
  pendingCloseBerkasId: string | null
  onLifecycleAction: (folder: BerkasFolder) => void
  onOpenCloseDialog: (folder: BerkasFolder) => void
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-headline text-lg font-extrabold text-on-surface">{title}</h3>
        <p className="text-xs text-on-surface-variant">{description}</p>
      </div>

      {folders.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 py-12">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/10">
            <FolderOpen size={24} className="text-emerald-600" />
          </div>
          <p className="font-headline text-lg font-bold text-on-surface">
            {hasSearchQuery ? LOCAL_NO_MATCH_MESSAGE : emptyTitle}
          </p>
          <p className="max-w-md text-center text-xs text-on-surface-variant">
            {hasSearchQuery ? 'Ubah kata kunci untuk melihat berkas lain di halaman ini.' : emptyDescription}
          </p>
        </div>
      ) : (
        <BerkasTable
          folders={folders}
          mode={mode}
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
  mode,
  pendingLifecycleBerkasId,
  pendingCloseBerkasId,
  onLifecycleAction,
  onOpenCloseDialog,
}: {
  folders: BerkasFolder[]
  mode: BerkasSectionMode
  pendingLifecycleBerkasId: string | null
  pendingCloseBerkasId: string | null
  onLifecycleAction: (folder: BerkasFolder) => void
  onOpenCloseDialog: (folder: BerkasFolder) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-container-low/30 text-left">
              <th className="w-10 px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">No</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-outline">Jenis Pembayaran</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-outline">Status Berkas</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-outline">Status Arsip</th>
              {mode !== 'open' && (
                <th className="px-4 py-3 font-semibold uppercase tracking-wider text-outline">Nomor SPM</th>
              )}
              <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">Jumlah Dokumen</th>
              <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">Dokumen Workflow</th>
              <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">Dokumen Manual</th>
              <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-outline">Total Nominal</th>
              <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">
                {mode === 'open' ? 'Terakhir Diperbarui' : 'Tanggal Ditutup'}
              </th>
              <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider text-outline">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {folders.map((folder, index) => (
              <tr key={folder.berkas_id} className="border-t border-outline-variant/20 transition-colors hover:bg-primary/5">
                <td className="px-4 py-3 text-center text-outline">{index + 1}</td>
                <td className="px-4 py-3 text-on-surface">
                  <p className="font-semibold">
                    {formatKlasifikasiLabel(folder.klasifikasi_kode_snapshot, folder.klasifikasi_nama_snapshot)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <StatusBerkasBadge status={folder.status_berkas} />
                </td>
                <td className="px-4 py-3">
                  <StatusArsipBadge statusArsip={folder.status_arsip} statusBerkas={folder.status_berkas} />
                </td>
                {mode !== 'open' && (
                  <td className="px-4 py-3 font-semibold text-on-surface">{folder.nomor_spm ?? '-'}</td>
                )}
                <td className="px-4 py-3 text-center text-on-surface">{folder.item_count}</td>
                <td className="px-4 py-3 text-center text-on-surface">{folder.workflow_item_count}</td>
                <td className="px-4 py-3 text-center text-on-surface">{folder.manual_item_count}</td>
                <td className="px-4 py-3 text-right text-on-surface">{formatNominalRupiah(folder.total_nominal_realisasi)}</td>
                <td className="px-4 py-3 text-center text-on-surface-variant">
                  {formatNullableDateLabel(mode === 'open' ? folder.updated_at : folder.closed_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link
                      to="/arsiparis/berkas/$id"
                      params={{ id: folder.berkas_id }}
                      className="inline-flex h-7 items-center rounded-lg border border-outline-variant/40 px-2.5 text-[11px] font-semibold text-primary hover:bg-primary/5"
                    >
                      Detail
                    </Link>
                    <LifecycleActionButton
                      folder={folder}
                      pending={pendingLifecycleBerkasId === folder.berkas_id}
                      onLifecycleAction={onLifecycleAction}
                    />
                    {mode === 'open' && (
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
      </div>
    </div>
  )
}

function LocalSearchField({
  value,
  placeholder,
  helperText,
  resultText,
  onChange,
}: {
  value: string
  placeholder: string
  helperText: string
  resultText: string
  onChange: (value: string) => void
}) {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-white p-4 shadow-sm">
      <label className="block text-xs font-bold text-on-surface" htmlFor="berkas-page-local-search">
        Pencarian lokal halaman
        <input
          id="berkas-page-local-search"
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 w-full rounded-lg border border-outline-variant/60 bg-white px-3 py-2 text-sm font-semibold text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          placeholder={placeholder}
          autoComplete="off"
        />
      </label>
      <div className="mt-2 flex flex-col gap-1 text-xs text-on-surface-variant md:flex-row md:items-center md:justify-between">
        <p>{helperText}</p>
        <p className="font-semibold text-outline">{resultText}</p>
      </div>
    </div>
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

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-widest text-outline">{label}</p>
      <p className="mt-2 font-headline text-2xl font-extrabold text-on-surface">{value}</p>
    </div>
  )
}

function StatusBerkasBadge({ status }: { status: string }) {
  const className = status === 'CLOSED'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : status === 'OPEN'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : 'border-slate-200 bg-slate-50 text-slate-700'

  return <Badge className={className}>{formatBerkasStatusLabel(status)}</Badge>
}

function StatusArsipBadge({ statusArsip, statusBerkas }: { statusArsip: string | null; statusBerkas: string }) {
  const className = statusArsip === 'AKTIF'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : statusArsip === 'INAKTIF'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : statusArsip === 'USUL_MUSNAH'
        ? 'border-orange-200 bg-orange-50 text-orange-700'
        : statusArsip === 'DIMUSNAHKAN'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-slate-200 bg-slate-50 text-slate-700'

  return <Badge className={className}>{formatBerkasArchiveStatusLabel(statusArsip, statusBerkas)}</Badge>
}

function isBerkasEmptyForClose(folder: Pick<BerkasFolder, 'item_count'>): boolean {
  return folder.item_count < 1
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
