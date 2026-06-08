import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowRightCircle,
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileText,
  FolderOpen,
  History,
  Loader2,
  Pencil,
  PlusCircle,
  Save,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import {
  ARCHIVE_DETAIL_CONTAINER_CLASS,
  ARCHIVE_TABLE_HEAD_CLASS,
  ARCHIVE_TABLE_ROW_CLASS,
  ArchiveExportButton,
  ArchivePanel,
  ArchiveTableShell,
  ArchiveTabs,
} from '#/components/archive/ArchivePagePrimitives'
import { PageLayout } from '#/components/dashboard/PageLayout'
import {
  WorkflowSearchPanel,
  WorkflowStatusSelect,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { DatePicker } from '#/components/ui/date-picker'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { StatusBadge } from '#/components/ui/StatusBadge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  BERKAS_DESTRUCTION_CONFIRMATION_PHRASE,
  type BerkasLifecycleActionView,
  formatAttachmentCount,
  formatBerkasArchiveStatusLabel,
  formatBerkasStatusLabel,
  formatFolderWarningLabel,
  formatItemWarningLabel,
  formatKlasifikasiLabel,
  formatNominalRupiah,
  formatNullableDateLabel,
  formatNullableDateTimeLabel,
  formatSourceTypeLabel,
  resolveBerkasLifecycleAction,
  snippet,
} from '#/lib/archive/berkas-arsip-page-format'
import {
  formatBerkasActivityEventLabel,
  type BerkasActivityEventType,
} from '#/lib/archive/berkas-arsip-activity'
import {
  BERKAS_DETAIL_ITEMS_CSV_FILENAME,
  createBerkasDetailItemsCsv,
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
import { MANUAL_ARCHIVE_RETENTION_LABELS } from '#/lib/archive/retention'

export const Route = createFileRoute('/arsiparis/berkas/$id')({ component: BerkasArsipDetailPage })

type BerkasDetailItem = {
  item_key: string
  item_file_key: string
  item_added_at: string | null
  source_type: string
  source_title: string
  source_date: string | null
  source_nominal_realisasi: number | null
  source_created_by_display_name: string | null
  attachment_count: number | null
  attachments: Array<{
    label: string
    previewTitle: string
    downloadFilename: string
  }>
  has_attachments: boolean
  workflow: {
    title: string | null
    status: string | null
    current_step: string | null
    fungsi_nama: string | null
    kegiatan_nama: string | null
  } | null
  manual: {
    nama: string | null
    category_name: string | null
    keterangan: string | null
  } | null
  warnings: string[]
}

type BerkasActivityEvent = {
  activity_key: string
  event_type: BerkasActivityEventType
  source_type: string | null
  message: string | null
  created_at: string
  actor_display_name: string | null
}

type BerkasDetail = {
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
  activity_events: BerkasActivityEvent[]
  warnings: string[]
  items: BerkasDetailItem[]
}

type BerkasDetailResponse = {
  berkas?: BerkasDetail
  error?: string
}

const LOCAL_NO_MATCH_MESSAGE = 'Tidak ada data yang cocok dengan pencarian.'
type DetailTab = 'metadata' | 'documents' | 'history'
type DetailSourceFilter = 'ALL' | 'WORKFLOW' | 'MANUAL'
type DetailSortOrder = 'newest' | 'oldest' | 'nominal_desc' | 'nominal_asc'

const DETAIL_SOURCE_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Semua' },
  { value: 'WORKFLOW', label: 'Persetujuan' },
  { value: 'MANUAL', label: 'Manual' },
]

const DETAIL_SORT_OPTIONS = [
  { value: 'newest', label: 'Terbaru' },
  { value: 'oldest', label: 'Terlama' },
  { value: 'nominal_desc', label: 'Nominal Tertinggi' },
  { value: 'nominal_asc', label: 'Nominal Terendah' },
]

const ARCHIVE_METADATA_FORM_LABEL_CLASS = 'block space-y-1.5 text-[11px] font-bold text-zinc-700'
const ARCHIVE_METADATA_FORM_INPUT_CLASS =
  'w-full rounded-xl border border-[#F0E1D5] bg-[#FFFAF6] px-4 py-2.5 text-sm font-semibold text-zinc-950 outline-none transition hover:border-[#FFBC80] focus:border-orange-300 focus:ring-2 focus:ring-orange-200/70 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500 disabled:opacity-70'
const ARCHIVE_METADATA_FORM_SELECT_TRIGGER_CLASS =
  'min-h-10 w-full rounded-xl border-[#F0E1D5] bg-[#FFFAF6] px-4 text-sm font-semibold text-zinc-950 hover:border-[#FFBC80] focus-visible:border-orange-300 focus-visible:ring-2 focus-visible:ring-orange-200/70'
const ARCHIVE_METADATA_FORM_SELECT_CONTENT_CLASS =
  'rounded-xl border border-[#F0E1D5] bg-[#FFFDF9] text-zinc-950 shadow-xl shadow-zinc-950/10'
const ARCHIVE_METADATA_FORM_SELECT_ITEM_CLASS =
  'rounded-lg px-3 py-2 text-sm font-medium text-zinc-950 focus:bg-orange-50 focus:text-zinc-950'

function BerkasArsipDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<BerkasDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [pendingLifecycleAction, setPendingLifecycleAction] = useState(false)
  const [lifecycleConfirmOpen, setLifecycleConfirmOpen] = useState(false)
  const [destructionDialogOpen, setDestructionDialogOpen] = useState(false)
  const [destructionPhrase, setDestructionPhrase] = useState('')
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [pendingClose, setPendingClose] = useState(false)
  const [closeForm, setCloseForm] = useState<CloseBerkasFormState>(EMPTY_CLOSE_BERKAS_FORM)
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false)
  const [metadataForm, setMetadataForm] = useState<CloseBerkasFormState>(EMPTY_CLOSE_BERKAS_FORM)
  const [pendingMetadataEdit, setPendingMetadataEdit] = useState(false)
  const [activeTab, setActiveTab] = useState<DetailTab>('metadata')

  async function fetchData() {
    setLoading(true)
    setError(null)
    try {
      const json = await apiFetch<BerkasDetailResponse>(`/arsiparis/berkas/${encodeURIComponent(id)}`)
      setDetail(json.berkas ?? null)
    } catch (error) {
      setError(resolveErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function submitLifecycleAction(options: { confirmation?: string; confirmed?: boolean } = {}) {
    if (!detail) return

    const lifecycleAction = resolveBerkasLifecycleAction(detail.status_berkas, detail.status_arsip)
    if (!lifecycleAction) return
    if (lifecycleAction.action === 'approve_destruction') {
      if (options.confirmation !== BERKAS_DESTRUCTION_CONFIRMATION_PHRASE) {
        setDestructionDialogOpen(true)
        setActionError(null)
        setActionSuccess(null)
        return
      }
    } else if (!options.confirmed) {
      setLifecycleConfirmOpen(true)
      setActionError(null)
      setActionSuccess(null)
      return
    }

    setPendingLifecycleAction(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      await apiFetch(`/arsiparis/berkas/${encodeURIComponent(detail.berkas_id)}/lifecycle`, {
        method: 'POST',
        body: JSON.stringify({
          action: lifecycleAction.action,
          ...(lifecycleAction.action === 'approve_destruction'
            ? { confirmation: BERKAS_DESTRUCTION_CONFIRMATION_PHRASE }
            : {}),
        }),
      })
      setActionSuccess(lifecycleAction.successMessage)
      setLifecycleConfirmOpen(false)
      setDestructionDialogOpen(false)
      setDestructionPhrase('')
      if (lifecycleAction.action === 'mark_inactive') {
        await navigate({ to: '/arsiparis/inaktif' })
      } else if (lifecycleAction.action === 'propose_destruction') {
        await navigate({ to: '/arsiparis/usul-musnah' })
      } else {
        await fetchData()
      }
    } catch (error) {
      setActionError(resolveErrorMessage(error))
    } finally {
      setPendingLifecycleAction(false)
    }
  }

  async function submitCloseBerkas() {
    if (!detail) return

    const isEmptyFolder = isBerkasEmptyForClose(detail)
    if (!canShowCloseBerkasForm(detail) || isEmptyFolder) return

    if (isCloseBerkasFormIncomplete(closeForm)) {
      setActionError('Nomor SPM, Retensi Aktif, dan Retensi Inaktif wajib diisi')
      setActionSuccess(null)
      return
    }

    setPendingClose(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      await apiFetch(`/arsiparis/berkas/${encodeURIComponent(detail.berkas_id)}/close`, {
        method: 'POST',
        body: JSON.stringify(buildCloseBerkasRequestBody(closeForm)),
      })
      setActionSuccess('Berkas berhasil ditutup dan menjadi Arsip Aktif.')
      setCloseDialogOpen(false)
      setCloseForm(EMPTY_CLOSE_BERKAS_FORM)
      await navigate({ to: '/arsiparis/berkas' })
    } catch (error) {
      setActionError(resolveErrorMessage(error))
    } finally {
      setPendingClose(false)
    }
  }

  function openMetadataEditDialog() {
    if (!detail || !canEditActiveMetadata(detail)) return

    setMetadataForm({
      nomor_spm: detail.nomor_spm ?? '',
      retensi_aktif: detail.retensi_aktif ?? '',
      retensi_inaktif: detail.retensi_inaktif ?? '',
      closed_at: toDateOnlyInputValue(detail.closed_at),
    })
    setMetadataDialogOpen(true)
    setActionError(null)
    setActionSuccess(null)
  }

  async function submitMetadataEdit() {
    if (!detail || !canEditActiveMetadata(detail)) return

    if (isCloseBerkasFormIncomplete(metadataForm)) {
      setActionError('Nomor SPM, Retensi Aktif, dan Retensi Inaktif wajib diisi')
      setActionSuccess(null)
      return
    }

    setPendingMetadataEdit(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      await apiFetch(`/arsiparis/berkas/${encodeURIComponent(detail.berkas_id)}`, {
        method: 'PATCH',
        body: JSON.stringify(buildCloseBerkasRequestBody(metadataForm)),
      })
      setActionSuccess('Metadata arsip aktif berhasil diperbarui.')
      setMetadataDialogOpen(false)
      await fetchData()
    } catch (error) {
      setActionError(resolveErrorMessage(error))
    } finally {
      setPendingMetadataEdit(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [id])

  return (
    <PageLayout className="min-h-full bg-[#FFF9F4]">
      <div className={ARCHIVE_DETAIL_CONTAINER_CLASS}>
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
          <LoadingState label="Memuat detail berkas" />
        ) : error ? (
          <ErrorState
            title="Gagal memuat detail berkas"
            description={error}
            action={
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>
                <Link
                  to="/arsiparis/berkas"
                  className="inline-flex h-8 items-center justify-center rounded-xl border border-zinc-200/80 bg-[#FFFDF9] px-3 text-xs font-bold text-zinc-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                >
                  Kembali
                </Link>
              </div>
            }
            variant="page"
          />
        ) : !detail ? (
          <EmptyState
            title="Berkas tidak ditemukan"
            description="Berkas mungkin sudah tidak tersedia untuk konteks akses saat ini."
            icon={<FolderOpen size={22} />}
            action={
              <Link
                to="/arsiparis/berkas"
                className="inline-flex h-8 items-center justify-center rounded-xl border border-zinc-200/80 bg-[#FFFDF9] px-3 text-xs font-bold text-zinc-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
              >
                Kembali ke daftar
              </Link>
            }
          />
        ) : (
          (() => {
            const isOpenFolder = canShowCloseBerkasForm(detail)
            const tabs = isOpenFolder
              ? [
                { id: 'metadata' as const, label: 'Metadata Berkas' },
                { id: 'documents' as const, label: 'Daftar Dokumen' },
                { id: 'history' as const, label: 'Riwayat Aktivitas Berkas' },
              ]
              : [
                { id: 'metadata' as const, label: 'Metadata Arsip' },
                { id: 'documents' as const, label: 'Daftar Dokumen' },
                { id: 'history' as const, label: 'Riwayat Aktivitas' },
              ]
            const activeTabTitle = tabs.find((tab) => tab.id === activeTab)?.label ?? tabs[0].label

            return (
              <>
                <div className="flex items-center gap-3">
                  <Link
                    to="/arsiparis/berkas"
                    aria-label="Kembali ke daftar berkas"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800"
                  >
                    <ChevronLeft size={18} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <h1 className="line-clamp-2 font-headline text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
                      {formatKlasifikasiLabel(detail.klasifikasi_kode_snapshot, detail.klasifikasi_nama_snapshot)}
                    </h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <FolderOpen size={13} className="text-zinc-500" />
                      <Link to="/arsiparis/berkas" className="font-medium text-zinc-800 hover:text-orange-700">
                        Pemberkasan Arsip Aktif
                      </Link>
                      <ChevronRight size={12} className="text-zinc-300" />
                      <span>Detail Berkas</span>
                    </div>
                  </div>
                  <div className="hidden shrink-0 gap-2 sm:flex">
                    <StatusBerkasBadge status={detail.status_berkas} />
                    <StatusArsipBadge statusArsip={detail.status_arsip} statusBerkas={detail.status_berkas} />
                  </div>
                </div>

                <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
                  <div className="min-w-0 space-y-4">
                    <ArchiveTabs
                      tabs={tabs}
                      activeTab={activeTab}
                      onChange={(tab) => setActiveTab(tab)}
                    />
                    <div className="min-w-0">
                      <div className="rounded-t-[1.5rem] bg-gradient-to-r from-[#F97316] to-[#FB923C] px-4 py-4 text-white sm:px-5">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white">
                            {activeTab === 'metadata'
                              ? <FolderOpen size={17} />
                              : activeTab === 'documents'
                                ? <FileText size={17} />
                                : <History size={17} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h2 className="font-headline text-base font-bold tracking-tight text-white sm:text-lg">
                              {activeTabTitle}
                            </h2>
                            <p className="mt-0.5 max-w-2xl text-[10px] font-medium leading-relaxed text-white/90 sm:text-xs">
                              {activeTab === 'metadata'
                                ? isOpenFolder
                                  ? 'Metadata berkas berjalan sebelum finalisasi arsip.'
                                  : 'Metadata final folder-first untuk lifecycle arsip.'
                                : activeTab === 'documents'
                                  ? 'Dokumen dalam berkas dengan metadata sumber dan akses lampiran.'
                                  : 'Kronologi khusus berkas berdasarkan data yang tersedia.'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0 rounded-b-[1.5rem] border border-t-0 border-[#F1E5DA] bg-[#FFFDF9] p-4 shadow-sm shadow-zinc-950/5 sm:p-5">
                        {activeTab === 'metadata' && (
                          <FolderMetadataPanel detail={detail} />
                        )}
                        {activeTab === 'documents' && (
                          <ItemList berkasId={detail.berkas_id} statusArsip={detail.status_arsip} items={detail.items} />
                        )}
                        {activeTab === 'history' && (
                          <FolderHistoryPanel detail={detail} />
                        )}
                      </div>
                    </div>
                  </div>

                  <FolderActionPanel
                    detail={detail}
                    pendingLifecycleAction={pendingLifecycleAction}
                    destructionDialogOpen={destructionDialogOpen}
                    lifecycleConfirmOpen={lifecycleConfirmOpen}
                    onLifecycleConfirmOpenChange={(open) => {
                      if (!pendingLifecycleAction) setLifecycleConfirmOpen(open)
                    }}
                    destructionPhrase={destructionPhrase}
                    onDestructionPhraseChange={setDestructionPhrase}
                    onCancelDestruction={() => {
                      setDestructionDialogOpen(false)
                      setDestructionPhrase('')
                      setActionError(null)
                    }}
                    onDestructionOpenChange={(open) => {
                      setDestructionDialogOpen(open)
                      if (!open && !pendingLifecycleAction) {
                        setDestructionPhrase('')
                        setActionError(null)
                      }
                    }}
                    onLifecycleAction={submitLifecycleAction}
                    pendingMetadataEdit={pendingMetadataEdit}
                    onOpenMetadataEditDialog={openMetadataEditDialog}
                    pendingClose={pendingClose}
                    onOpenCloseDialog={() => {
                      setCloseForm({
                        ...EMPTY_CLOSE_BERKAS_FORM,
                        closed_at: getTodayDateOnlyInputValue(),
                      })
                      setCloseDialogOpen(true)
                      setActionError(null)
                      setActionSuccess(null)
                    }}
                  />
                </div>
              </>
            )
          })()
        )}
        {detail && (
          <CloseBerkasDialog
            open={closeDialogOpen}
            form={closeForm}
            pending={pendingClose}
            summary={{
              klasifikasiLabel: formatKlasifikasiLabel(detail.klasifikasi_kode_snapshot, detail.klasifikasi_nama_snapshot),
              itemCount: detail.item_count,
              totalNominalRealisasi: detail.total_nominal_realisasi,
            }}
            submitDisabled={pendingClose || !detail || isBerkasEmptyForClose(detail) || isCloseBerkasFormIncomplete(closeForm)}
            onOpenChange={(open) => {
              setCloseDialogOpen(open)
              if (!open && !pendingClose) setActionError(null)
            }}
            onFormChange={setCloseForm}
            onSubmit={submitCloseBerkas}
          />
        )}
        {detail && (
          <EditActiveMetadataDialog
            open={metadataDialogOpen}
            form={metadataForm}
            pending={pendingMetadataEdit}
            submitDisabled={pendingMetadataEdit || isCloseBerkasFormIncomplete(metadataForm) || !canEditActiveMetadata(detail)}
            onOpenChange={(open) => {
              setMetadataDialogOpen(open)
              if (!open && !pendingMetadataEdit) setActionError(null)
            }}
            onFormChange={setMetadataForm}
            onSubmit={submitMetadataEdit}
          />
        )}
      </div>
    </PageLayout>
  )
}

function EditActiveMetadataDialog({
  open,
  form,
  pending,
  submitDisabled,
  onOpenChange,
  onFormChange,
  onSubmit,
}: {
  open: boolean
  form: CloseBerkasFormState
  pending: boolean
  submitDisabled: boolean
  onOpenChange: (open: boolean) => void
  onFormChange: (form: CloseBerkasFormState) => void
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[#F0E1D5] bg-[#FFFAF6] shadow-2xl shadow-zinc-950/10 sm:max-w-2xl sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle>Edit Metadata Arsip Aktif</DialogTitle>
          <DialogDescription>
            Perbarui metadata final berkas selama statusnya masih Arsip Aktif.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold leading-relaxed text-orange-900">
            Edit metadata hanya berlaku untuk Arsip Aktif. Setelah berkas dipindahkan ke Inaktif, Usul Musnah, atau Dimusnahkan, metadata menjadi baca saja.
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className={ARCHIVE_METADATA_FORM_LABEL_CLASS} htmlFor="edit-berkas-nomor-spm">
              <span>Nomor SPM <span className="text-error">*</span></span>
              <input
                id="edit-berkas-nomor-spm"
                value={form.nomor_spm}
                onChange={(event) => onFormChange({ ...form, nomor_spm: event.target.value })}
                className={ARCHIVE_METADATA_FORM_INPUT_CLASS}
                maxLength={120}
                autoComplete="off"
              />
            </label>
            <label className={ARCHIVE_METADATA_FORM_LABEL_CLASS} htmlFor="edit-berkas-closed-at">
              <span>Tanggal Tutup Berkas</span>
              <DatePicker
                value={form.closed_at}
                disabled
                placeholder="Tanggal tutup belum tersedia"
              />
              <span className="mt-1 block text-[11px] font-semibold leading-relaxed text-zinc-500">
                Tanggal tutup adalah waktu finalisasi berkas dan tidak diubah dari edit metadata.
              </span>
            </label>
            <label className={ARCHIVE_METADATA_FORM_LABEL_CLASS} id="edit-berkas-retensi-aktif-label">
              <span>Retensi Aktif <span className="text-error">*</span></span>
              <Select value={form.retensi_aktif || null} onValueChange={(value) => onFormChange({ ...form, retensi_aktif: value ?? '' })}>
                <SelectTrigger className={ARCHIVE_METADATA_FORM_SELECT_TRIGGER_CLASS} aria-labelledby="edit-berkas-retensi-aktif-label">
                  <SelectValue placeholder="Pilih retensi aktif">
                    {(value) => value || 'Pilih retensi aktif'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className={ARCHIVE_METADATA_FORM_SELECT_CONTENT_CLASS}>
                {MANUAL_ARCHIVE_RETENTION_LABELS.map((label) => (
                  <SelectItem key={label} value={label} className={ARCHIVE_METADATA_FORM_SELECT_ITEM_CLASS}>{label}</SelectItem>
                ))}
                </SelectContent>
              </Select>
            </label>
            <label className={ARCHIVE_METADATA_FORM_LABEL_CLASS} id="edit-berkas-retensi-inaktif-label">
              <span>Retensi Inaktif <span className="text-error">*</span></span>
              <Select value={form.retensi_inaktif || null} onValueChange={(value) => onFormChange({ ...form, retensi_inaktif: value ?? '' })}>
                <SelectTrigger className={ARCHIVE_METADATA_FORM_SELECT_TRIGGER_CLASS} aria-labelledby="edit-berkas-retensi-inaktif-label">
                  <SelectValue placeholder="Pilih retensi inaktif">
                    {(value) => value || 'Pilih retensi inaktif'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className={ARCHIVE_METADATA_FORM_SELECT_CONTENT_CLASS}>
                {MANUAL_ARCHIVE_RETENTION_LABELS.map((label) => (
                  <SelectItem key={label} value={label} className={ARCHIVE_METADATA_FORM_SELECT_ITEM_CLASS}>{label}</SelectItem>
                ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" className="gap-1.5" disabled={submitDisabled} onClick={onSubmit}>
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Simpan Metadata
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FolderMetadataPanel({ detail }: { detail: BerkasDetail }) {
  const isOpenFolder = canShowCloseBerkasForm(detail)

  return (
    <div className="rounded-[1.15rem] border border-[#F1E5DA] bg-[#FFFDF9] px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="grid gap-x-10 gap-y-4 md:grid-cols-2">
        <MetadataCell label="Klasifikasi Arsip" value={formatKlasifikasiLabel(detail.klasifikasi_kode_snapshot, detail.klasifikasi_nama_snapshot)} />
        <MetadataCell label="Status Berkas" value={formatBerkasStatusLabel(detail.status_berkas)} />
        <MetadataCell label="Status Arsip" value={formatBerkasArchiveStatusLabel(detail.status_arsip, detail.status_berkas)} />
        <MetadataCell label="Jumlah Dokumen" value={String(detail.item_count)} />
        <MetadataCell label="Dokumen Persetujuan" value={String(detail.workflow_item_count)} />
        <MetadataCell label="Dokumen Manual" value={String(detail.manual_item_count)} />
        <MetadataCell label="Dibuat" value={formatNullableDateTimeLabel(detail.created_at)} />
        <MetadataCell label="Terakhir Diperbarui" value={formatNullableDateTimeLabel(detail.updated_at)} />
        {!isOpenFolder && (
          <>
            <MetadataCell label="Nomor SPM" value={detail.nomor_spm ?? '-'} emphasis />
            <MetadataCell label="Tanggal Ditutup" value={formatNullableDateTimeLabel(detail.closed_at)} />
            <MetadataCell label="Retensi Aktif" value={detail.retensi_aktif ?? '-'} />
            <MetadataCell label="Retensi Inaktif" value={detail.retensi_inaktif ?? '-'} />
            <MetadataCell label="Masa Aktif Berakhir" value={formatNullableDateLabel(detail.masa_aktif_berakhir)} />
            <MetadataCell label="Masa Inaktif Berakhir" value={formatNullableDateLabel(detail.masa_inaktif_berakhir)} />
          </>
        )}
      </div>
    </div>
  )
}

function FolderActionPanel({
  detail,
  pendingLifecycleAction,
  lifecycleConfirmOpen,
  onLifecycleConfirmOpenChange,
  destructionDialogOpen,
  destructionPhrase,
  onDestructionPhraseChange,
  onCancelDestruction,
  onDestructionOpenChange,
  onLifecycleAction,
  pendingMetadataEdit,
  onOpenMetadataEditDialog,
  pendingClose,
  onOpenCloseDialog,
}: {
  detail: BerkasDetail
  pendingLifecycleAction: boolean
  lifecycleConfirmOpen: boolean
  onLifecycleConfirmOpenChange: (open: boolean) => void
  destructionDialogOpen: boolean
  destructionPhrase: string
  onDestructionPhraseChange: (phrase: string) => void
  onCancelDestruction: () => void
  onDestructionOpenChange: (open: boolean) => void
  onLifecycleAction: (options?: { confirmation?: string }) => void
  pendingMetadataEdit: boolean
  onOpenMetadataEditDialog: () => void
  pendingClose: boolean
  onOpenCloseDialog: () => void
}) {
  const lifecycleAction = resolveBerkasLifecycleAction(detail.status_berkas, detail.status_arsip)
  const canSubmitDestruction = destructionPhrase === BERKAS_DESTRUCTION_CONFIRMATION_PHRASE
    && !pendingLifecycleAction
  const canShowClose = canShowCloseBerkasForm(detail)
  const closeBlockedByEmptyFolder = isBerkasEmptyForClose(detail)

  return (
    <aside className="min-w-0 space-y-3 xl:sticky xl:top-3">
      <div className="rounded-[1.45rem] border border-orange-200/70 bg-[#FFF8F1] p-5 shadow-sm shadow-orange-900/10">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-orange-900/70">
          <Wallet size={14} className="text-[#FF5A00]" />
          Total Nominal Realisasi
        </div>
        <p className="mt-3 font-mono text-2xl font-black tracking-tight text-zinc-950">
          {formatNominalRupiah(detail.total_nominal_realisasi)}
        </p>
      </div>

      <div className="rounded-[1.45rem] border border-[#F1E1CF] bg-[#FFF8EF] p-5 shadow-sm shadow-orange-900/10">
        <div className="flex items-center gap-2">
          <FolderOpen size={15} className="text-orange-900" />
          <p className="text-[13px] font-black uppercase tracking-[0.14em] text-orange-950">
            Siklus Hidup Berkas
          </p>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-orange-950/75">
          <span>Status:</span>
          <LifecycleStatusBadge detail={detail} />
        </div>
        <p className="mt-3 text-[13px] font-semibold leading-relaxed text-orange-950">
          {getFolderLifecycleDescription(detail)}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusBerkasBadge status={detail.status_berkas} />
        </div>
        {detail.status_arsip === 'DIMUSNAHKAN' && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            Data file sudah dimusnahkan
          </p>
        )}
        {detail.warnings.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {detail.warnings.map((warning) => (
              <Badge key={warning} className="border-amber-200 bg-amber-50 text-amber-700">
                {formatFolderWarningLabel(warning)}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-[1.25rem] border border-[#F1E5DA] bg-[#FFFDF9] p-3.5 shadow-sm shadow-zinc-950/5">
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-zinc-500">
          Aksi Kontrol Berkas
        </p>
        <div className="mt-3 space-y-2">
          {lifecycleAction && (
            <Button
              type="button"
              size="lg"
              variant={lifecycleAction.action === 'approve_destruction' ? 'destructive' : 'default'}
              className={`h-10 w-full gap-1.5 rounded-xl text-xs font-bold ${
                lifecycleAction.action === 'approve_destruction' ? 'bg-error text-white hover:bg-error/90' : 'bg-[#FF5A00] text-white hover:bg-[#EA580C]'
              }`}
              disabled={pendingLifecycleAction}
              onClick={() => {
                if (lifecycleAction.action === 'approve_destruction') {
                  onLifecycleAction()
                  return
                }

                onLifecycleConfirmOpenChange(true)
              }}
            >
              {pendingLifecycleAction
                ? <Loader2 size={14} className="animate-spin" />
                : lifecycleAction.action === 'approve_destruction'
                  ? <AlertTriangle size={14} />
                  : <ArrowRightCircle size={14} />}
              {pendingLifecycleAction ? 'Memproses...' : lifecycleAction.label}
            </Button>
          )}
          {canEditActiveMetadata(detail) && (
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="h-10 w-full gap-1.5 rounded-xl border-[#F0E1D5] bg-[#FFFDF9] text-xs font-bold"
              disabled={pendingMetadataEdit}
              onClick={onOpenMetadataEditDialog}
            >
              {pendingMetadataEdit ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
              {pendingMetadataEdit ? 'Memproses...' : 'Edit Metadata Arsip'}
            </Button>
          )}
          {canShowClose && (
            <Button
              type="button"
              size="lg"
              className="h-10 w-full gap-1.5 rounded-xl bg-[#FF5A00] text-xs font-bold text-white hover:bg-[#EA580C]"
              disabled={pendingClose || closeBlockedByEmptyFolder}
              onClick={onOpenCloseDialog}
            >
              {pendingClose ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {pendingClose ? 'Memproses...' : 'Tutup Berkas'}
            </Button>
          )}
          <Link to="/arsiparis/berkas" className="block">
            <Button variant="outline" size="lg" className="h-10 w-full gap-1.5 rounded-xl border-[#F0E1D5] bg-[#FFFDF9] text-xs font-bold">
              <ChevronLeft size={13} />
              Kembali ke Daftar
            </Button>
          </Link>
        </div>
        {lifecycleAction && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-900">
            {lifecycleAction.confirmation}
          </p>
        )}
        {canShowClose && closeBlockedByEmptyFolder && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            {EMPTY_BERKAS_CLOSE_MESSAGE}
          </p>
        )}
      </div>

      {lifecycleAction && lifecycleAction.action !== 'approve_destruction' && (
        <LifecycleConfirmationDialog
          open={lifecycleConfirmOpen}
          pending={pendingLifecycleAction}
          action={lifecycleAction}
          onOpenChange={onLifecycleConfirmOpenChange}
          onConfirm={() => onLifecycleAction({ confirmed: true })}
        />
      )}

      {lifecycleAction?.action === 'approve_destruction' && (
        <Dialog
          open={destructionDialogOpen}
          onOpenChange={(open) => {
            if (open || !pendingLifecycleAction) onDestructionOpenChange(open)
          }}
        >
          <DialogContent className="border-rose-200 bg-[#FFFAF6] shadow-2xl shadow-zinc-950/10 sm:max-w-md sm:rounded-3xl sm:p-8">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <AlertTriangle size={22} />
            </div>
            <DialogHeader className="items-center text-center">
              <DialogTitle>Musnahkan Data</DialogTitle>
              <DialogDescription className="max-w-sm text-center text-sm font-medium leading-relaxed text-zinc-700">
                Arsip akan ditandai sebagai dimusnahkan. Metadata tetap tersimpan, tetapi akses file akan diblokir.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-center font-headline text-2xl font-extrabold tracking-tight text-zinc-950">
                Musnahkan arsip?
              </p>
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-xs font-extrabold leading-relaxed text-rose-700">
                <p>Pemberitahuan: Pemusnahan data ini bersifat final.</p>
                <p className="mt-2">File fisik terkait berkas akan dihapus.</p>
                <p>Preview dan download file tidak akan tersedia setelah pemusnahan.</p>
                <p>Metadata berkas dan dokumen tetap tersimpan, namun lampiran berkas tidak akan dapat dilekatkan, diunduh, atau dipreview lagi.</p>
                <p>Aksi ini tidak mudah dibalik.</p>
              </div>

              <label className="block text-xs font-bold text-on-surface" htmlFor="berkas-detail-destruction-confirmation">
                Ketik frasa konfirmasi <span className="text-error">*</span>
                <input
                  id="berkas-detail-destruction-confirmation"
                  value={destructionPhrase}
                  onChange={(event) => onDestructionPhraseChange(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-red-200 bg-[#FFFDF9] px-3 py-2 text-sm font-semibold text-zinc-950 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                  placeholder={BERKAS_DESTRUCTION_CONFIRMATION_PHRASE}
                  autoComplete="off"
                />
              </label>
              <p className="text-[10px] font-semibold text-outline">
                Frasa wajib: {BERKAS_DESTRUCTION_CONFIRMATION_PHRASE}
              </p>
            </div>

            <DialogFooter className="gap-3 border-0 bg-transparent p-0">
              <Button
                type="button"
                variant="ghost"
                onClick={onCancelDestruction}
                disabled={pendingLifecycleAction}
              >
                Batal
              </Button>
              <Button
                type="button"
                className="gap-1.5 rounded-xl bg-rose-600 px-5 font-extrabold text-white hover:bg-rose-700"
                onClick={() => onLifecycleAction({ confirmation: destructionPhrase })}
                disabled={!canSubmitDestruction}
              >
                {pendingLifecycleAction
                  ? <Loader2 size={14} className="animate-spin" />
                  : <AlertTriangle size={14} />}
                Konfirmasi Musnahkan Data
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </aside>
  )
}

function LifecycleConfirmationDialog({
  open,
  pending,
  action,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  pending: boolean
  action: BerkasLifecycleActionView
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const isMarkInactive = action.action === 'mark_inactive'
  const title = isMarkInactive ? 'Pindahkan arsip ke Inaktif?' : 'Pindahkan arsip ke Usul Musnah?'
  const description = isMarkInactive
    ? 'Arsip aktif akan masuk ke masa inaktif. Setelah dipindahkan, metadata arsip tidak dapat diedit lagi.'
    : 'Arsip inaktif akan masuk ke daftar usul musnah untuk proses pemusnahan.'
  const confirmLabel = isMarkInactive ? 'Pindahkan ke Inaktif' : 'Pindahkan ke Usul Musnah'

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!pending) onOpenChange(nextOpen)
    }}>
      <DialogContent className="border-[#F0E1D5] bg-[#FFFAF6] shadow-2xl shadow-zinc-950/10 sm:max-w-md sm:rounded-3xl sm:p-8">
        <div className="flex items-start gap-5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-orange-50 text-[#FF5A00]">
            <AlertTriangle size={21} />
          </div>
          <div className="min-w-0 flex-1">
            <DialogHeader>
              <DialogTitle className="font-headline text-xl font-extrabold tracking-tight text-zinc-950">
                {title}
              </DialogTitle>
              <DialogDescription className="text-sm font-medium leading-relaxed text-zinc-700">
                {description}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-6 gap-3 border-0 bg-transparent p-0">
              <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
                Batalkan
              </Button>
              <Button
                type="button"
                className="rounded-xl bg-[#FF5A00] px-5 font-extrabold text-white hover:bg-[#EA580C]"
                disabled={pending}
                onClick={onConfirm}
              >
                {pending ? 'Memproses...' : confirmLabel}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function getFolderLifecycleDescription(detail: Pick<BerkasDetail, 'status_berkas' | 'status_arsip'>): string {
  if (detail.status_berkas === 'OPEN') {
    return 'Berkas masih terbuka dan dapat menerima dokumen baru untuk Jenis Pembayaran ini.'
  }
  if (detail.status_arsip === 'AKTIF') {
    return 'Berkas sudah ditutup sebagai Arsip Aktif. Metadata arsip masih dapat diperbarui selama status tetap Aktif.'
  }
  if (detail.status_arsip === 'INAKTIF') {
    return 'Berkas berada pada Arsip Inaktif. Metadata final menjadi baca saja.'
  }
  if (detail.status_arsip === 'USUL_MUSNAH') {
    return 'Berkas masuk Usul Musnah dan menunggu konfirmasi pemusnahan data.'
  }
  if (detail.status_arsip === 'DIMUSNAHKAN') {
    return 'Berkas sudah Dimusnahkan. Metadata tetap tersimpan dan akses file diblokir.'
  }
  return 'Status berkas perlu ditinjau.'
}

function ItemList({
  berkasId,
  statusArsip,
  items,
}: {
  berkasId: string
  statusArsip: string | null
  items: BerkasDetailItem[]
}) {
  const [previewing, setPreviewing] = useState<{ href: string; downloadHref: string; title: string } | null>(null)
  const [selectedItem, setSelectedItem] = useState<BerkasDetailItem | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<DetailSourceFilter>('ALL')
  const [sortOrder, setSortOrder] = useState<DetailSortOrder>('newest')
  const filteredItems = filterBerkasDetailItems(items, searchQuery, sourceFilter)
    .sort((left, right) => compareBerkasDetailItems(left, right, sortOrder))
  const hasSearchQuery = searchQuery.trim().length > 0
  const canExport = filteredItems.length > 0

  function exportCsv() {
    downloadCsvFile(BERKAS_DETAIL_ITEMS_CSV_FILENAME, createBerkasDetailItemsCsv(filteredItems))
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && previewing) setPreviewing(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [previewing])

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <ItemListHeader canExport={canExport} onExportCsv={exportCsv} />
        <LocalItemSearchField
          value={searchQuery}
          resultText={`${filteredItems.length} dari ${items.length} dokumen ditampilkan`}
          onChange={setSearchQuery}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
        />
        <div className="flex flex-col items-center gap-3 rounded-[1.15rem] border border-dashed border-orange-200 bg-[#FFFDF9] py-12">
          <FileText size={24} className="text-orange-500" />
          <p className="font-headline text-base font-bold text-zinc-950">Belum ada item dokumen</p>
          <p className="text-xs text-zinc-600">Dokumen persetujuan atau manual akan muncul setelah masuk ke berkas.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {previewing && (
        <PreviewModal
          href={previewing.href}
          downloadHref={previewing.downloadHref}
          title={previewing.title}
          onClose={() => setPreviewing(null)}
        />
      )}
      {selectedItem && (
        <DocumentMetadataDialog
          berkasId={berkasId}
          item={selectedItem}
          statusArsip={statusArsip}
          onClose={() => setSelectedItem(null)}
          onPreview={(href, downloadHref, title) => setPreviewing({ href, downloadHref, title })}
        />
      )}

      <div className="space-y-3">
        <ItemListHeader canExport={canExport} onExportCsv={exportCsv} />
        <LocalItemSearchField
          value={searchQuery}
          resultText={`${filteredItems.length} dari ${items.length} dokumen ditampilkan`}
          onChange={setSearchQuery}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
        />
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.15rem] border border-dashed border-orange-200 bg-[#FFFDF9] py-12">
            <FileText size={24} className="text-orange-500" />
            <p className="font-headline text-base font-bold text-zinc-950">{LOCAL_NO_MATCH_MESSAGE}</p>
            <p className="text-xs text-zinc-600">
              {hasSearchQuery
                ? 'Ubah kata kunci untuk melihat dokumen lain dalam berkas ini.'
                : 'Dokumen dalam berkas akan muncul di sini.'}
            </p>
          </div>
        ) : (
          <DocumentItemTable items={filteredItems} onSelectItem={setSelectedItem} />
        )}
      </div>
    </>
  )
}

function DocumentItemTable({
  items,
  onSelectItem,
}: {
  items: BerkasDetailItem[]
  onSelectItem: (item: BerkasDetailItem) => void
}) {
  return (
    <>
      <ArchiveTableShell className="rounded-[1.35rem]">
        <table className="w-full text-left">
          <thead>
            <tr className="border-neutral-200 bg-neutral-100 hover:bg-neutral-100">
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Judul Dokumen</th>
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Sumber</th>
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Tanggal Dokumen</th>
              <th className={ARCHIVE_TABLE_HEAD_CLASS}>Pengaju / Pembuat</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Nominal Realisasi</th>
              <th className={`text-center ${ARCHIVE_TABLE_HEAD_CLASS}`}>Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 text-[13px]">
            {items.map((item) => (
              <tr
                key={item.item_key}
                className={`${ARCHIVE_TABLE_ROW_CLASS} cursor-pointer`}
                onClick={() => onSelectItem(item)}
              >
                <td className="max-w-[420px] px-6 py-5">
                  <p className="line-clamp-2 text-[15px] font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-[#FF4D00]">
                    {item.source_title}
                  </p>
                  {item.has_attachments && (
                    <p className="mt-1 text-xs font-medium text-zinc-500">
                      {formatAttachmentCount(item.attachment_count)} lampiran
                    </p>
                  )}
                </td>
                <td className="px-6 py-5"><SourceBadge sourceType={item.source_type} /></td>
                <td className="px-6 py-5 text-sm font-semibold text-zinc-500">{formatNullableDateLabel(item.source_date)}</td>
                <td className="px-6 py-5 text-sm font-semibold text-zinc-950">{item.source_created_by_display_name ?? '-'}</td>
                <td className="px-6 py-5 text-center font-mono text-sm font-bold text-zinc-950">{formatNominalRupiah(item.source_nominal_realisasi)}</td>
                <td className="px-6 py-5 text-center">
                  <Button
                    type="button"
                    size="icon-lg"
                    variant="ghost"
                    className="size-10 rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-600 opacity-100 shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] group-hover:border-orange-200 group-hover:bg-orange-50 group-hover:text-orange-600 group-hover:shadow-[0_0_0_4px_rgba(251,146,60,0.12)] [&_svg]:!size-5"
                    aria-label={`Buka detail ${item.source_title}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelectItem(item)
                    }}
                  >
                    <ChevronRight strokeWidth={2.35} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ArchiveTableShell>

      <div className="grid gap-3 md:hidden">
        {items.map((item) => (
          <button
            key={item.item_key}
            type="button"
            className="rounded-[1.15rem] border border-[#F1E5DA] bg-[#FFFDF9] p-4 text-left shadow-sm shadow-zinc-950/[0.035]"
            onClick={() => onSelectItem(item)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-bold text-zinc-950">{item.source_title}</p>
                <p className="mt-1 text-xs font-semibold text-zinc-600">{item.source_created_by_display_name ?? '-'}</p>
              </div>
              <SourceBadge sourceType={item.source_type} />
            </div>
            <div className="mt-3 grid gap-1 text-xs text-zinc-600">
              <p>Tanggal: <span className="font-semibold text-zinc-950">{formatNullableDateLabel(item.source_date)}</span></p>
              <p>Nominal: <span className="font-mono font-bold text-zinc-950">{formatNominalRupiah(item.source_nominal_realisasi)}</span></p>
              <p>Lampiran: <span className="font-semibold text-zinc-950">{formatAttachmentCount(item.attachment_count)}</span></p>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

function DocumentMetadataDialog({
  berkasId,
  item,
  statusArsip,
  onClose,
  onPreview,
}: {
  berkasId: string
  item: BerkasDetailItem
  statusArsip: string | null
  onClose: () => void
  onPreview: (href: string, downloadHref: string, title: string) => void
}) {
  const fileBlocked = statusArsip === 'DIMUSNAHKAN'
  const sourceLabel = formatSourceTypeLabel(item.source_type)

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-[#F0E1D5] bg-[#FFFAF6] shadow-2xl shadow-zinc-950/10 sm:max-w-3xl sm:rounded-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800"
              onClick={onClose}
              aria-label="Kembali dari detail dokumen berkas"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0">
              <DialogTitle>Detail Dokumen Berkas</DialogTitle>
              <DialogDescription className="line-clamp-1">
                Detail Berkas / {item.source_title}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-[1.25rem] border border-[#F1E5DA] bg-[#FFFDF9] p-4 sm:p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <ModalMetadataField
                label={item.source_type === 'MANUAL' ? 'Nama/Judul Dokumen' : 'Judul Dokumen'}
                value={item.source_title}
                className="sm:col-span-2"
              />
              <ModalMetadataField label="Sumber Dokumentasi" value={<SourceBadge sourceType={item.source_type} />} />
              {item.workflow && (
                <>
                  <ModalMetadataField label="Fungsi" value={item.workflow.fungsi_nama ?? '-'} />
                  <ModalMetadataField label="Kegiatan" value={item.workflow.kegiatan_nama ?? '-'} />
                  <ModalMetadataField label="Status Sumber" value={item.workflow.status ?? '-'} />
                </>
              )}
              {item.manual && (
                <>
                  <ModalMetadataField label="Kategori" value={item.manual.category_name ?? '-'} />
                  <ModalMetadataField label="Keterangan" value={snippet(item.manual.keterangan)} />
                </>
              )}
              <ModalMetadataField label="Tanggal Dokumen/Sumber" value={formatNullableDateLabel(item.source_date)} />
              <ModalMetadataField label="Pengaju / Pembuat" value={item.source_created_by_display_name ?? '-'} />
              <ModalMetadataField label="Nominal Realisasi" value={formatNominalRupiah(item.source_nominal_realisasi)} emphasis />
            </div>
          </div>

          {item.warnings.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.warnings.map((warning) => (
                <Badge key={warning} className="border-amber-200 bg-amber-50 text-amber-700">
                  {formatItemWarningLabel(warning)}
                </Badge>
              ))}
            </div>
          )}

          <section>
            <h3 className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-zinc-950">Lampiran Pendukung</h3>
            <ItemAttachmentActions
              berkasId={berkasId}
              item={item}
              fileBlocked={fileBlocked}
              onPreview={onPreview}
            />
            {!item.has_attachments && (
              <div className="rounded-xl border border-dashed border-[#F0E1D5] bg-[#FFFDF9] px-3 py-4 text-xs font-semibold text-zinc-500">
                Tidak ada lampiran pendukung untuk dokumen {sourceLabel}.
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ModalMetadataField({
  label,
  value,
  emphasis,
  className,
}: {
  label: string
  value: ReactNode
  emphasis?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <div className={`mt-1 text-sm font-semibold leading-relaxed ${emphasis ? 'font-mono font-bold text-zinc-950' : 'text-zinc-950'}`}>
        {value}
      </div>
    </div>
  )
}

function ItemListHeader({
  canExport,
  onExportCsv,
}: {
  canExport: boolean
  onExportCsv: () => void
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <h3 className="font-headline text-lg font-extrabold text-zinc-950">Daftar Dokumen Dalam Berkas</h3>
        <p className="text-xs text-zinc-600">Daftar dokumen dengan metadata sumber dan file access yang mengikuti status lifecycle folder.</p>
      </div>
      <div className="flex flex-col gap-1 md:items-end">
        <ArchiveExportButton
          disabled={!canExport}
          title={canExport ? 'Ekspor CSV' : 'Tidak ada data untuk diekspor'}
          onClick={onExportCsv}
        />
        {!canExport && (
          <p className="text-xs text-on-surface-variant">Tidak ada data untuk diekspor.</p>
        )}
      </div>
    </div>
  )
}

function LocalItemSearchField({
  value,
  resultText,
  onChange,
  sourceFilter,
  onSourceFilterChange,
  sortOrder,
  onSortOrderChange,
}: {
  value: string
  resultText: string
  onChange: (value: string) => void
  sourceFilter: DetailSourceFilter
  onSourceFilterChange: (value: DetailSourceFilter) => void
  sortOrder: DetailSortOrder
  onSortOrderChange: (value: DetailSortOrder) => void
}) {
  return (
    <WorkflowSearchPanel
      search={value}
      onSearchChange={onChange}
      placeholder="Cari dokumen dalam berkas..."
      resultLabel={resultText}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <WorkflowStatusSelect
          value={sourceFilter === 'ALL' ? '' : sourceFilter}
          onChange={(nextValue) => onSourceFilterChange((nextValue || 'ALL') as DetailSourceFilter)}
          options={DETAIL_SOURCE_FILTER_OPTIONS}
          ariaLabel="Filter sumber dokumen berkas"
          className="min-w-[132px]"
        />
        <WorkflowStatusSelect
          value={sortOrder}
          onChange={(nextValue) => onSortOrderChange((nextValue || 'newest') as DetailSortOrder)}
          options={DETAIL_SORT_OPTIONS}
          ariaLabel="Urutan dokumen berkas"
          className="min-w-[156px]"
        />
      </div>
    </WorkflowSearchPanel>
  )
}

function ItemCard({
  berkasId,
  statusArsip,
  item,
  index,
  onPreview,
}: {
  berkasId: string
  statusArsip: string | null
  item: BerkasDetailItem
  index: number
  onPreview: (href: string, downloadHref: string, title: string) => void
}) {
  const fileBlocked = statusArsip === 'DIMUSNAHKAN'

  return (
    <div className="rounded-[1.15rem] border border-[#F1E5DA] bg-[#FFFDF9] p-4 shadow-sm shadow-zinc-950/[0.035]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700/70">Dokumen {index + 1}</span>
            <SourceBadge sourceType={item.source_type} />
            {item.has_attachments && (
              <Badge className="border-blue-200 bg-blue-50 text-blue-700">
                {formatAttachmentCount(item.attachment_count)} lampiran
              </Badge>
            )}
          </div>
          <h4 className="font-headline text-base font-extrabold text-zinc-950">{item.source_title}</h4>
          <p className="mt-1 text-xs text-zinc-600">
            Pembuat: {item.source_created_by_display_name ?? '-'}
          </p>
        </div>
        <div className="grid min-w-[220px] gap-1 rounded-xl border border-orange-100 bg-[#FFFAF6] p-3 text-xs text-zinc-600">
          <p>Tanggal sumber: <span className="font-semibold text-zinc-950">{formatNullableDateLabel(item.source_date)}</span></p>
          <p>Nominal: <span className="font-mono font-bold text-zinc-950">{formatNominalRupiah(item.source_nominal_realisasi)}</span></p>
          <p>Jumlah lampiran: <span className="font-semibold text-zinc-950">{formatAttachmentCount(item.attachment_count)}</span></p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {item.workflow && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/55 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-700">Sumber Persetujuan</p>
            <MetadataLine label="Status" value={item.workflow.status ?? '-'} />
            <MetadataLine label="Fungsi" value={item.workflow.fungsi_nama ?? '-'} />
            <MetadataLine label="Kegiatan" value={item.workflow.kegiatan_nama ?? '-'} />
          </div>
        )}
        {item.manual && (
          <div className="rounded-xl border border-sky-100 bg-sky-50/55 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-sky-700">Sumber Manual</p>
            <MetadataLine label="Kategori" value={item.manual.category_name ?? '-'} />
            <MetadataLine label="Keterangan" value={snippet(item.manual.keterangan)} />
          </div>
        )}
      </div>

      {item.warnings.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.warnings.map((warning) => (
            <Badge key={warning} className="border-amber-200 bg-amber-50 text-amber-700">
              {formatItemWarningLabel(warning)}
            </Badge>
          ))}
        </div>
      )}

      <ItemAttachmentActions
        berkasId={berkasId}
        item={item}
        fileBlocked={fileBlocked}
        onPreview={onPreview}
      />
    </div>
  )
}

function ItemAttachmentActions({
  berkasId,
  item,
  fileBlocked,
  onPreview,
}: {
  berkasId: string
  item: BerkasDetailItem
  fileBlocked: boolean
  onPreview: (href: string, downloadHref: string, title: string) => void
}) {
  const attachmentCount = typeof item.attachment_count === 'number' && item.attachment_count > 0
    ? item.attachment_count
    : 0
  const availableAttachments = item.attachments

  if (attachmentCount === 0 && availableAttachments.length === 0) return null

  if (fileBlocked) {
    return (
      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
        Data file sudah dimusnahkan
      </div>
    )
  }

  if (availableAttachments.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
        Metadata lampiran tidak tersedia.
      </div>
    )
  }

  return (
    <div className="mt-3 grid gap-2">
      {availableAttachments.map((attachment, lampiranIndex) => {
        const title = attachment.label || (availableAttachments.length === 1 ? 'Lampiran' : `Lampiran ${lampiranIndex + 1}`)
        const previewTitle = attachment.previewTitle || title
        const previewHref = buildBerkasItemAttachmentFileUrl(berkasId, item.item_file_key, lampiranIndex, 'preview')
        const downloadHref = buildBerkasItemAttachmentFileUrl(berkasId, item.item_file_key, lampiranIndex, 'download')

        return (
          <div
            key={`${item.item_key}-lampiran-${lampiranIndex}`}
            className="flex flex-col gap-3 rounded-xl border border-[#F1E5DA] bg-[#FFFDF9] px-3 py-2.5 sm:flex-row sm:items-center"
          >
            <FileText size={15} className="shrink-0 text-orange-600" />
            <p className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-950">{title}</p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => onPreview(previewHref, downloadHref, previewTitle)}
                className="rounded-xl border border-zinc-200/80 bg-[#FFFDF9] text-zinc-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
                aria-label={`Pratinjau ${title}`}
              >
                <Eye size={14} />
              </Button>
              <a
                href={downloadHref}
                className="inline-flex size-7 items-center justify-center rounded-xl border border-zinc-200/80 bg-[#FFFDF9] text-zinc-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
                aria-label={`Unduh ${title}`}
              >
                <Download size={14} />
              </a>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PreviewModal({
  href,
  downloadHref,
  title,
  onClose,
}: {
  href: string
  downloadHref: string
  title: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Tutup pratinjau"
      />
      <div
        className="relative z-10 flex h-[calc(100dvh-1rem)] max-h-[90dvh] w-full max-w-[92vw] flex-col overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/10 sm:h-[88vh] sm:max-w-[88vw]"
        role="dialog"
        aria-modal="true"
        aria-label="Pratinjau lampiran berkas"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex min-h-12 shrink-0 items-center gap-3 border-b border-white/10 bg-zinc-950 px-3 py-2 text-white sm:px-4">
          <FileText size={16} className="shrink-0 text-zinc-300" />
          <p className="flex-1 truncate text-sm font-semibold text-white">{title}</p>
          <a
            href={downloadHref}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-200 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={`Unduh ${title}`}
          >
            <Download size={17} />
          </a>
          <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:block">ESC</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pratinjau"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-zinc-900 p-2 sm:p-4">
          <iframe
            src={href}
            className="h-full min-h-[60vh] w-full max-w-6xl border-0 bg-white shadow-2xl shadow-black/40"
            title={title}
          />
        </div>
      </div>
    </div>
  )
}

function MetadataCell({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className={`break-words text-[13px] font-bold leading-snug sm:text-sm ${emphasis ? 'font-mono text-[#FF4D00]' : 'text-zinc-950'}`}>{value}</p>
    </div>
  )
}

function MetadataLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-xs text-zinc-600">
      {label}: <span className="font-semibold text-zinc-950">{value}</span>
    </p>
  )
}

function FolderHistoryPanel({ detail }: { detail: BerkasDetail }) {
  const historyItems = buildBerkasHistoryItems(detail)

  return (
    <ArchivePanel className="rounded-[1.35rem] bg-[#FFFDF9]">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <History size={17} className="text-orange-600" />
          <h3 className="font-headline text-lg font-extrabold text-zinc-950">
            Riwayat Aktivitas Berkas
          </h3>
        </div>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-600">
          Kronologi folder-first dari waktu berkas dibuka, dokumen masuk berkas, penutupan, dan status lifecycle yang tersedia.
        </p>
      </div>

      <div className="relative space-y-3 before:absolute before:left-[18px] before:top-5 before:h-[calc(100%-2.5rem)] before:w-px before:bg-[#F1D8C8]">
        {historyItems.map((item, index) => (
          <div key={`${item.label}-${item.timestampLabel}-${index}`} className="relative grid grid-cols-[38px_1fr] gap-3">
            <div className={`z-10 mt-1 flex h-9 w-9 items-center justify-center rounded-full border-4 border-[#FFFDF9] shadow-sm ${item.iconTone}`}>
              {item.icon}
            </div>
            <div className="rounded-2xl border border-[#F1E5DA] bg-[#FFFCF8] p-3.5 shadow-sm shadow-zinc-950/[0.025]">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-zinc-950">{item.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-600">{item.helper}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#F1E5DA] bg-[#FFFDF9] px-2.5 py-1 text-[11px] font-bold text-zinc-700 sm:ml-3">
                  <Clock size={12} className="text-orange-600" />
                  <span>{item.timestampLabel}</span>
                </div>
              </div>
              {item.timestampNote && (
                <p className="mt-2 text-[11px] font-medium leading-relaxed text-zinc-500">
                  {item.timestampNote}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      {detail.warnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">Catatan validasi berkas</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {detail.warnings.map((warning) => (
              <Badge key={warning} className="border-amber-200 bg-white text-amber-700">
                {formatFolderWarningLabel(warning)}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </ArchivePanel>
  )
}

type BerkasHistoryItem = {
  label: string
  helper: string
  icon: ReactNode
  iconTone: string
  timestampLabel: string
  timestampNote?: string
  sortTime: number | null
  domainOrder: number
  originalIndex: number
}

export function buildBerkasHistoryItems(detail: BerkasDetail): BerkasHistoryItem[] {
  if (detail.activity_events.length > 0) {
    return buildAuthoritativeBerkasHistoryItems(detail.activity_events)
  }

  const items: BerkasHistoryItem[] = []
  let originalIndex = 0

  items.push(historyItem({
    label: 'Berkas dibuka',
    date: detail.created_at,
    helper: 'Folder mulai menerima dokumen untuk Jenis Pembayaran ini.',
    icon: <FolderOpen size={15} />,
    iconTone: 'bg-[#FFF3E8] text-orange-700',
    domainOrder: 10,
    originalIndex: originalIndex++,
  }))

  detail.items.forEach((item) => {
    items.push(historyItem({
      label: item.source_type === 'MANUAL'
        ? 'Penambahan dokumen manual sukses'
        : 'Dokumen Persetujuan diklasifikasikan',
      date: item.item_added_at,
      helper: item.source_title,
      icon: item.source_type === 'MANUAL'
        ? <PlusCircle size={15} />
        : <FileText size={15} />,
      iconTone: item.source_type === 'MANUAL'
        ? 'bg-orange-50 text-orange-700'
        : 'bg-sky-50 text-sky-700',
      timestampNote: item.item_added_at
        ? undefined
        : 'Waktu masuk berkas tidak tersedia di DTO; tidak memakai tanggal sumber dokumen sebagai pengganti.',
      domainOrder: 20,
      originalIndex: originalIndex++,
    }))
  })

  if (detail.closed_at) {
    items.push(historyItem({
      label: 'Berkas ditutup',
      date: detail.closed_at,
      helper: 'Metadata final seperti Nomor SPM dan retensi sudah dicatat.',
      icon: <Check size={15} />,
      iconTone: 'bg-emerald-50 text-emerald-700',
      dateOnly: isUtcMidnightTimestamp(detail.closed_at),
      domainOrder: 30,
      originalIndex: originalIndex++,
    }))
  }

  const lifecycleItem = buildCurrentLifecycleHistoryItem(detail, originalIndex)
  if (lifecycleItem) items.push(lifecycleItem)

  return items.sort(compareBerkasHistoryItems)
}

function buildAuthoritativeBerkasHistoryItems(events: BerkasActivityEvent[]): BerkasHistoryItem[] {
  const sortedEvents = [...events]
    .filter((event) => Boolean(event.created_at))
    .sort((left, right) => {
      const leftTime = getDateSortTimeOrNull(left.created_at) ?? 0
      const rightTime = getDateSortTimeOrNull(right.created_at) ?? 0
      if (leftTime !== rightTime) return leftTime - rightTime
      return left.activity_key.localeCompare(right.activity_key)
    })

  const terminalIndex = sortedEvents.findIndex((event) => event.event_type === 'BERKAS_DIMUSNAHKAN')
  const visibleEvents = terminalIndex >= 0 ? sortedEvents.slice(0, terminalIndex + 1) : sortedEvents

  return visibleEvents.map((event, index) => historyItem({
    label: formatBerkasActivityEventLabel(event.event_type),
    date: event.created_at,
    helper: buildAuthoritativeBerkasHistoryHelper(event),
    icon: iconForBerkasActivityEvent(event.event_type),
    iconTone: iconToneForBerkasActivityEvent(event.event_type),
    domainOrder: index,
    originalIndex: index,
  }))
}

function buildAuthoritativeBerkasHistoryHelper(event: BerkasActivityEvent): string {
  const details = [
    event.message,
    event.source_type ? `Sumber: ${formatSourceTypeLabel(event.source_type)}.` : null,
    event.actor_display_name ? `Oleh ${event.actor_display_name}.` : null,
  ].filter((value): value is string => Boolean(value))

  if (details.length > 0) return details.join(' ')

  switch (event.event_type) {
    case 'BERKAS_DIBUKA':
      return 'Folder mulai menerima dokumen untuk Jenis Pembayaran ini.'
    case 'DOKUMEN_PERSETUJUAN_DIKLASIFIKASIKAN':
      return 'Dokumen Persetujuan masuk ke berkas.'
    case 'DOKUMEN_MANUAL_DITAMBAHKAN':
      return 'Dokumen Manual masuk ke berkas.'
    case 'BERKAS_DITUTUP':
      return 'Metadata final seperti Nomor SPM dan retensi sudah dicatat.'
    case 'METADATA_ARSIP_AKTIF_DIPERBARUI':
      return 'Metadata Arsip Aktif diperbarui sebelum dipindahkan ke lifecycle berikutnya.'
    case 'BERKAS_DIPINDAHKAN_KE_INAKTIF':
      return 'Berkas keluar dari Arsip Aktif dan metadata menjadi baca saja.'
    case 'BERKAS_DIPINDAHKAN_KE_USUL_MUSNAH':
      return 'Berkas masuk daftar usulan pemusnahan.'
    case 'BERKAS_DIMUSNAHKAN':
      return 'Status akhir berkas. Metadata tetap tersimpan dan preview/download diblokir.'
    default:
      return 'Aktivitas berkas tercatat.'
  }
}

function iconForBerkasActivityEvent(eventType: string): ReactNode {
  switch (eventType) {
    case 'BERKAS_DIBUKA':
      return <FolderOpen size={15} />
    case 'DOKUMEN_PERSETUJUAN_DIKLASIFIKASIKAN':
      return <FileText size={15} />
    case 'DOKUMEN_MANUAL_DITAMBAHKAN':
      return <PlusCircle size={15} />
    case 'BERKAS_DITUTUP':
    case 'METADATA_ARSIP_AKTIF_DIPERBARUI':
      return <Check size={15} />
    case 'BERKAS_DIPINDAHKAN_KE_INAKTIF':
      return <Archive size={15} />
    case 'BERKAS_DIPINDAHKAN_KE_USUL_MUSNAH':
      return <AlertTriangle size={15} />
    case 'BERKAS_DIMUSNAHKAN':
      return <Trash2 size={15} />
    default:
      return <History size={15} />
  }
}

function iconToneForBerkasActivityEvent(eventType: string): string {
  switch (eventType) {
    case 'BERKAS_DIBUKA':
      return 'bg-[#FFF3E8] text-orange-700'
    case 'DOKUMEN_PERSETUJUAN_DIKLASIFIKASIKAN':
      return 'bg-sky-50 text-sky-700'
    case 'DOKUMEN_MANUAL_DITAMBAHKAN':
      return 'bg-orange-50 text-orange-700'
    case 'BERKAS_DITUTUP':
    case 'METADATA_ARSIP_AKTIF_DIPERBARUI':
      return 'bg-emerald-50 text-emerald-700'
    case 'BERKAS_DIPINDAHKAN_KE_INAKTIF':
      return 'bg-amber-50 text-amber-700'
    case 'BERKAS_DIPINDAHKAN_KE_USUL_MUSNAH':
      return 'bg-orange-50 text-orange-700'
    case 'BERKAS_DIMUSNAHKAN':
      return 'bg-red-50 text-red-700'
    default:
      return 'bg-zinc-50 text-zinc-700'
  }
}

function historyItem({
  label,
  date,
  helper,
  icon,
  iconTone,
  timestampNote,
  dateOnly = false,
  domainOrder,
  originalIndex,
}: {
  label: string
  date: string | null | undefined
  helper: string
  icon: ReactNode
  iconTone: string
  timestampNote?: string
  dateOnly?: boolean
  domainOrder: number
  originalIndex: number
}): BerkasHistoryItem {
  return {
    label,
    helper,
    icon,
    iconTone,
    timestampLabel: formatHistoryDateLabel(date, { dateOnly }),
    timestampNote,
    sortTime: getDateSortTimeOrNull(date),
    domainOrder,
    originalIndex,
  }
}

function buildCurrentLifecycleHistoryItem(detail: BerkasDetail, originalIndex: number): BerkasHistoryItem | null {
  if (detail.status_arsip === 'INAKTIF') {
    return historyItem({
      label: 'Berkas dipindahkan ke Inaktif',
      date: detail.updated_at,
      helper: 'Berkas keluar dari arsip aktif dan metadata menjadi baca saja.',
      icon: <Archive size={15} />,
      iconTone: 'bg-amber-50 text-amber-700',
      timestampNote: 'Tidak ada log timestamp per-transisi; waktu ini berasal dari pembaruan status berkas saat ini.',
      domainOrder: 40,
      originalIndex,
    })
  }

  if (detail.status_arsip === 'USUL_MUSNAH') {
    return historyItem({
      label: 'Berkas dipindahkan ke Usul Musnah',
      date: detail.updated_at,
      helper: 'Berkas masuk daftar usulan pemusnahan. Metadata tetap baca saja.',
      icon: <AlertTriangle size={15} />,
      iconTone: 'bg-orange-50 text-orange-700',
      timestampNote: 'Tidak ada log timestamp per-transisi; waktu ini berasal dari pembaruan status berkas saat ini.',
      domainOrder: 50,
      originalIndex,
    })
  }

  if (detail.status_arsip === 'DIMUSNAHKAN') {
    return historyItem({
      label: 'Berkas dimusnahkan',
      date: detail.updated_at,
      helper: 'Status akhir berkas. Metadata tetap tersimpan dan preview/download diblokir.',
      icon: <Trash2 size={15} />,
      iconTone: 'bg-red-50 text-red-700',
      timestampNote: 'Tidak ada event setelah pemusnahan; waktu ini berasal dari pembaruan status akhir berkas.',
      domainOrder: 60,
      originalIndex,
    })
  }

  return null
}

function formatHistoryDateLabel(
  value: string | null | undefined,
  options: { dateOnly?: boolean } = {},
): string {
  if (!value) return 'Tanggal belum tersedia'
  if (options.dateOnly) return formatNullableDateLabel(value)
  const hasExplicitTime = /T\d{2}:\d{2}/.test(value) || /\b\d{2}:\d{2}\b/.test(value)
  return hasExplicitTime ? formatNullableDateTimeLabel(value) : formatNullableDateLabel(value)
}

function isUtcMidnightTimestamp(value: string | null | undefined): boolean {
  return typeof value === 'string' && /T00:00:00(?:\.000)?Z$/.test(value)
}

function getDateSortTimeOrNull(value: string | null | undefined): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

function getDateSortTime(value: string | null | undefined): number {
  return getDateSortTimeOrNull(value) ?? 0
}

function compareBerkasHistoryItems(left: BerkasHistoryItem, right: BerkasHistoryItem): number {
  if (left.sortTime !== null && right.sortTime !== null && left.sortTime !== right.sortTime) {
    const timeOrder = left.sortTime - right.sortTime
    const domainOrder = left.domainOrder - right.domainOrder

    if (domainOrder === 0 || Math.sign(timeOrder) === Math.sign(domainOrder)) {
      return timeOrder
    }
  }

  if (left.domainOrder !== right.domainOrder) return left.domainOrder - right.domainOrder

  return left.originalIndex - right.originalIndex
}

function SourceBadge({ sourceType }: { sourceType: string }) {
  return <StatusBadge kind="source" status={sourceType} fallbackLabel={formatSourceTypeLabel(sourceType)} />
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
    <span className="inline-flex w-fit items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-emerald-700 text-nowrap">
      {formatBerkasArchiveStatusLabel(statusArsip, statusBerkas)}
    </span>
  )
}

function LifecycleStatusBadge({ detail }: { detail: Pick<BerkasDetail, 'status_berkas' | 'status_arsip'> }) {
  return (
    <span className="inline-flex w-fit items-center rounded-md border border-orange-200 bg-[#FFF3E8] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-orange-900 text-nowrap">
      {formatBerkasArchiveStatusLabel(detail.status_arsip, detail.status_berkas)}
    </span>
  )
}

export function buildBerkasItemAttachmentFileUrl(
  berkasId: string,
  itemFileKey: string,
  lampiranIndex: number,
  purpose: 'preview' | 'download',
): string {
  return [
    '/api/arsiparis/berkas',
    encodeURIComponent(berkasId),
    'items',
    encodeURIComponent(itemFileKey),
    purpose,
    encodeURIComponent(String(lampiranIndex)),
  ].join('/')
}

export function canShowCloseBerkasForm(detail: Pick<BerkasDetail, 'status_berkas' | 'status_arsip'>): boolean {
  return detail.status_berkas === 'OPEN' && detail.status_arsip === null
}

export function canEditActiveMetadata(detail: Pick<BerkasDetail, 'status_berkas' | 'status_arsip'>): boolean {
  return detail.status_berkas === 'CLOSED' && detail.status_arsip === 'AKTIF'
}

export function isBerkasEmptyForClose(detail: Pick<BerkasDetail, 'item_count' | 'items'>): boolean {
  return detail.item_count < 1 || detail.items.length < 1
}

function toDateOnlyInputValue(value: string | null | undefined): string {
  if (!value) return ''
  return value.slice(0, 10)
}

function getTodayDateOnlyInputValue(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function filterBerkasDetailItems(
  items: BerkasDetailItem[],
  query: string,
  sourceFilter: DetailSourceFilter = 'ALL',
): BerkasDetailItem[] {
  const normalizedQuery = normalizeSearchValue(query)

  return items.filter((item) => {
    const matchesSource = sourceFilter === 'ALL' || item.source_type === sourceFilter
    const matchesSearch = !normalizedQuery || buildBerkasDetailItemSearchText(item).includes(normalizedQuery)
    return matchesSource && matchesSearch
  })
}

function compareBerkasDetailItems(
  left: BerkasDetailItem,
  right: BerkasDetailItem,
  sortOrder: DetailSortOrder,
): number {
  if (sortOrder === 'nominal_desc' || sortOrder === 'nominal_asc') {
    const leftNominal = typeof left.source_nominal_realisasi === 'number' ? left.source_nominal_realisasi : 0
    const rightNominal = typeof right.source_nominal_realisasi === 'number' ? right.source_nominal_realisasi : 0
    return sortOrder === 'nominal_desc' ? rightNominal - leftNominal : leftNominal - rightNominal
  }

  const leftTime = getDateSortTime(left.source_date)
  const rightTime = getDateSortTime(right.source_date)
  return sortOrder === 'oldest' ? leftTime - rightTime : rightTime - leftTime
}

function buildBerkasDetailItemSearchText(item: BerkasDetailItem): string {
  return [
    item.source_title,
    item.source_type,
    formatSourceTypeLabel(item.source_type),
    formatNullableDateLabel(item.source_date),
    item.source_created_by_display_name,
    formatNominalRupiah(item.source_nominal_realisasi),
    formatAttachmentCount(item.attachment_count),
    item.workflow?.title,
    item.workflow?.status,
    item.workflow?.fungsi_nama,
    item.workflow?.kegiatan_nama,
    item.manual?.nama,
    item.manual?.category_name,
    item.manual?.keterangan,
    ...item.attachments.flatMap((attachment) => [
      attachment.label,
      attachment.previewTitle,
      attachment.downloadFilename,
    ]),
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
    return 'Gagal mengambil detail berkas'
  }

  return 'Terjadi kesalahan'
}

export { buildCloseBerkasRequestBody } from './-components/CloseBerkasDialog'
