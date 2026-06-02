import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowRightCircle,
  ChevronRight,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  Save,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  ArchivePageHeader,
  ArchivePanel,
  ArchiveTabs,
} from '#/components/archive/ArchivePagePrimitives'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { EmptyState } from '#/components/ui/EmptyState'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
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
  formatAttachmentCount,
  formatBerkasArchiveStatusLabel,
  formatBerkasStatusLabel,
  formatFolderWarningLabel,
  formatItemWarningLabel,
  formatKlasifikasiLabel,
  formatNominalRupiah,
  formatNullableDateLabel,
  formatSourceTypeLabel,
  resolveBerkasLifecycleAction,
  snippet,
} from '#/lib/archive/berkas-arsip-page-format'
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

export const Route = createFileRoute('/arsiparis/berkas/$id')({ component: BerkasArsipDetailPage })

type BerkasDetailItem = {
  item_key: string
  item_file_key: string
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
  warnings: string[]
  items: BerkasDetailItem[]
}

type BerkasDetailResponse = {
  berkas?: BerkasDetail
  error?: string
}

const LOCAL_NO_MATCH_MESSAGE = 'Tidak ada data yang cocok dengan pencarian.'
type DetailTab = 'metadata' | 'documents' | 'history'

function BerkasArsipDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<BerkasDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [pendingLifecycleAction, setPendingLifecycleAction] = useState(false)
  const [destructionDialogOpen, setDestructionDialogOpen] = useState(false)
  const [destructionPhrase, setDestructionPhrase] = useState('')
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [pendingClose, setPendingClose] = useState(false)
  const [closeForm, setCloseForm] = useState<CloseBerkasFormState>(EMPTY_CLOSE_BERKAS_FORM)
  const [activeTab, setActiveTab] = useState<DetailTab>('documents')

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

  async function submitLifecycleAction(options: { confirmation?: string } = {}) {
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
    } else if (!window.confirm(lifecycleAction.confirmation)) {
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

  useEffect(() => {
    fetchData()
  }, [id])

  useEffect(() => {
    if (detail && canShowCloseBerkasForm(detail) && activeTab === 'metadata') {
      setActiveTab('documents')
    }
  }, [detail?.status_berkas, detail?.status_arsip, activeTab])

  return (
    <PageLayout>
      <div className="space-y-6">
        <ArchivePageHeader
          eyebrow={
            <>
              <Link to="/arsiparis" className="hover:text-orange-900">Kepala Sub Bagian Umum</Link>
              <ChevronRight size={10} />
              <Link to="/arsiparis/berkas" className="hover:text-orange-900">Pemberkasan Arsip Aktif</Link>
              <ChevronRight size={10} />
              Detail Berkas
            </>
          }
          title="Detail Berkas Arsip"
          description="Detail folder-first dengan lifecycle berkas dan akses lampiran melalui endpoint server terotorisasi."
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
                  className="inline-flex h-8 items-center rounded-lg border border-orange-200 px-3 text-xs font-semibold text-orange-800 hover:bg-orange-50"
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
                className="inline-flex h-8 items-center rounded-lg border border-orange-200 px-3 text-xs font-semibold text-orange-800 hover:bg-orange-50"
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
                { id: 'documents' as const, label: 'Daftar Dokumen' },
                { id: 'history' as const, label: 'Riwayat Aktivitas Berkas' },
              ]
              : [
                { id: 'metadata' as const, label: 'Metadata Arsip' },
                { id: 'documents' as const, label: 'Daftar Dokumen' },
                { id: 'history' as const, label: 'Riwayat Aktivitas' },
              ]
            const resolvedActiveTab = isOpenFolder && activeTab === 'metadata' ? 'documents' : activeTab

            return (
              <>
                <ArchiveTabs
                  tabs={tabs}
                  activeTab={resolvedActiveTab}
                  onChange={(tab) => setActiveTab(tab)}
                />
                {resolvedActiveTab === 'metadata' && (
                  <FolderMetadataPanel
                    detail={detail}
                    pendingLifecycleAction={pendingLifecycleAction}
                    destructionDialogOpen={destructionDialogOpen}
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
                    pendingClose={pendingClose}
                    onOpenCloseDialog={() => {
                      setCloseDialogOpen(true)
                      setActionError(null)
                      setActionSuccess(null)
                    }}
                  />
                )}
                {resolvedActiveTab === 'documents' && (
                  <>
                    {isOpenFolder && (
                      <FolderMetadataPanel
                        detail={detail}
                        pendingLifecycleAction={pendingLifecycleAction}
                        destructionDialogOpen={destructionDialogOpen}
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
                        pendingClose={pendingClose}
                        onOpenCloseDialog={() => {
                          setCloseDialogOpen(true)
                          setActionError(null)
                          setActionSuccess(null)
                        }}
                      />
                    )}
                    <ItemList berkasId={detail.berkas_id} statusArsip={detail.status_arsip} items={detail.items} />
                  </>
                )}
                {resolvedActiveTab === 'history' && (
                  <FolderHistoryPanel detail={detail} />
                )}
              </>
            )
          })()
        )}
        {detail && (
          <CloseBerkasDialog
            open={closeDialogOpen}
            form={closeForm}
            pending={pendingClose}
            submitDisabled={pendingClose || !detail || isBerkasEmptyForClose(detail) || isCloseBerkasFormIncomplete(closeForm)}
            onOpenChange={(open) => {
              setCloseDialogOpen(open)
              if (!open && !pendingClose) setActionError(null)
            }}
            onFormChange={setCloseForm}
            onSubmit={submitCloseBerkas}
          />
        )}
      </div>
    </PageLayout>
  )
}

function FolderMetadataPanel({
  detail,
  pendingLifecycleAction,
  destructionDialogOpen,
  destructionPhrase,
  onDestructionPhraseChange,
  onCancelDestruction,
  onDestructionOpenChange,
  onLifecycleAction,
  pendingClose,
  onOpenCloseDialog,
}: {
  detail: BerkasDetail
  pendingLifecycleAction: boolean
  destructionDialogOpen: boolean
  destructionPhrase: string
  onDestructionPhraseChange: (phrase: string) => void
  onCancelDestruction: () => void
  onDestructionOpenChange: (open: boolean) => void
  onLifecycleAction: (options?: { confirmation?: string }) => void
  pendingClose: boolean
  onOpenCloseDialog: () => void
}) {
  const lifecycleAction = resolveBerkasLifecycleAction(detail.status_berkas, detail.status_arsip)
  const canSubmitDestruction = destructionPhrase === BERKAS_DESTRUCTION_CONFIRMATION_PHRASE
    && !pendingLifecycleAction
  const canShowClose = canShowCloseBerkasForm(detail)
  const closeBlockedByEmptyFolder = isBerkasEmptyForClose(detail)
  const isOpenFolder = canShowClose

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10">
            <FolderOpen size={22} className="text-emerald-600" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-outline">Jenis Pembayaran</p>
          <h3 className="mt-1 font-headline text-xl font-extrabold text-on-surface">
            {formatKlasifikasiLabel(detail.klasifikasi_kode_snapshot, detail.klasifikasi_nama_snapshot)}
          </h3>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="flex flex-wrap gap-2">
            <StatusBerkasBadge status={detail.status_berkas} />
            <StatusArsipBadge statusArsip={detail.status_arsip} statusBerkas={detail.status_berkas} />
          </div>
          {lifecycleAction && (
            <Button
              type="button"
              size="sm"
              variant={lifecycleAction.action === 'approve_destruction' ? 'destructive' : 'default'}
              className={`gap-1.5 ${
                lifecycleAction.action === 'approve_destruction' ? 'bg-error text-white hover:bg-error/90' : ''
              }`}
              disabled={pendingLifecycleAction}
              onClick={() => onLifecycleAction()}
            >
              {pendingLifecycleAction
                ? <Loader2 size={14} className="animate-spin" />
                : lifecycleAction.action === 'approve_destruction'
                  ? <AlertTriangle size={14} />
                  : <ArrowRightCircle size={14} />}
              {pendingLifecycleAction ? 'Memproses...' : lifecycleAction.label}
            </Button>
          )}
          {canShowClose && (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={pendingClose || closeBlockedByEmptyFolder}
              onClick={onOpenCloseDialog}
            >
              {pendingClose ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {pendingClose ? 'Memproses...' : 'Tutup Berkas'}
            </Button>
          )}
          {detail.status_arsip === 'DIMUSNAHKAN' && (
            <p className="text-xs font-semibold text-red-700">Data file sudah dimusnahkan</p>
          )}
        </div>
      </div>

      {detail.warnings.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {detail.warnings.map((warning) => (
            <Badge key={warning} className="border-amber-200 bg-amber-50 text-amber-700">
              {formatFolderWarningLabel(warning)}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <MetadataCell label="Status Berkas" value={formatBerkasStatusLabel(detail.status_berkas)} />
        <MetadataCell label="Status Arsip" value={formatBerkasArchiveStatusLabel(detail.status_arsip, detail.status_berkas)} />
        <MetadataCell label="Jumlah Dokumen" value={String(detail.item_count)} />
        <MetadataCell label="Total Nominal" value={formatNominalRupiah(detail.total_nominal_realisasi)} />
        <MetadataCell label="Dokumen Workflow" value={String(detail.workflow_item_count)} />
        <MetadataCell label="Dokumen Manual" value={String(detail.manual_item_count)} />
        <MetadataCell label="Dibuat" value={formatNullableDateLabel(detail.created_at)} />
        <MetadataCell label="Terakhir Diperbarui" value={formatNullableDateLabel(detail.updated_at)} />
        {!isOpenFolder && (
          <>
            <MetadataCell label="Nomor SPM" value={detail.nomor_spm ?? '-'} />
            <MetadataCell label="Tanggal Ditutup" value={formatNullableDateLabel(detail.closed_at)} />
            <MetadataCell label="Retensi Aktif" value={detail.retensi_aktif ?? '-'} />
            <MetadataCell label="Retensi Inaktif" value={detail.retensi_inaktif ?? '-'} />
            <MetadataCell label="Masa Aktif Berakhir" value={formatNullableDateLabel(detail.masa_aktif_berakhir)} />
            <MetadataCell label="Masa Inaktif Berakhir" value={formatNullableDateLabel(detail.masa_inaktif_berakhir)} />
          </>
        )}
      </div>
      {lifecycleAction && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {lifecycleAction.confirmation}
        </p>
      )}
      {canShowClose && closeBlockedByEmptyFolder && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          {EMPTY_BERKAS_CLOSE_MESSAGE}
        </p>
      )}
      {lifecycleAction?.action === 'approve_destruction' && (
        <Dialog
          open={destructionDialogOpen}
          onOpenChange={(open) => {
            if (open || !pendingLifecycleAction) onDestructionOpenChange(open)
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Musnahkan Data</DialogTitle>
              <DialogDescription>
                Konfirmasi final untuk mengubah status berkas menjadi Dimusnahkan.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low/30 px-3 py-2 text-xs text-on-surface">
                Berkas: <span className="font-semibold">
                  {formatKlasifikasiLabel(detail.klasifikasi_kode_snapshot, detail.klasifikasi_nama_snapshot)}
                </span>
              </div>

              <div className="space-y-2 rounded-xl border border-error/30 bg-error/5 p-3 text-xs font-semibold text-error/90">
                <p>Status berkas akan menjadi Dimusnahkan.</p>
                <p>File fisik terkait berkas akan dihapus.</p>
                <p>Preview dan download file tidak akan tersedia setelah pemusnahan.</p>
                <p>Metadata berkas dan dokumen tetap tersimpan.</p>
                <p>Aksi ini tidak mudah dibalik.</p>
              </div>

              <label className="block text-xs font-bold text-on-surface" htmlFor="berkas-detail-destruction-confirmation">
                Ketik frasa konfirmasi <span className="text-error">*</span>
                <input
                  id="berkas-detail-destruction-confirmation"
                  value={destructionPhrase}
                  onChange={(event) => onDestructionPhraseChange(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-outline-variant/60 bg-white px-3 py-2 text-sm font-semibold text-on-surface outline-none focus:border-error focus:ring-1 focus:ring-error"
                  placeholder={BERKAS_DESTRUCTION_CONFIRMATION_PHRASE}
                  autoComplete="off"
                />
              </label>
              <p className="text-[10px] font-semibold text-outline">
                Frasa wajib: {BERKAS_DESTRUCTION_CONFIRMATION_PHRASE}
              </p>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onCancelDestruction}
                disabled={pendingLifecycleAction}
              >
                Batal
              </Button>
              <Button
                type="button"
                className="gap-1.5 bg-error text-white hover:bg-error/90"
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
    </div>
  )
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
  const [previewing, setPreviewing] = useState<{ href: string; title: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const filteredItems = filterBerkasDetailItems(items, searchQuery)
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
        />
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant/60 bg-surface-container-low/30 py-12">
          <FileText size={24} className="text-outline" />
          <p className="font-headline text-base font-bold text-on-surface">Belum ada item dokumen</p>
          <p className="text-xs text-on-surface-variant">Item workflow atau manual akan muncul setelah masuk ke berkas.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {previewing && (
        <PreviewModal
          href={previewing.href}
          title={previewing.title}
          onClose={() => setPreviewing(null)}
        />
      )}

      <div className="space-y-3">
        <ItemListHeader canExport={canExport} onExportCsv={exportCsv} />
        <LocalItemSearchField
          value={searchQuery}
          resultText={`${filteredItems.length} dari ${items.length} dokumen ditampilkan`}
          onChange={setSearchQuery}
        />
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant/60 bg-surface-container-low/30 py-12">
            <FileText size={24} className="text-outline" />
            <p className="font-headline text-base font-bold text-on-surface">{LOCAL_NO_MATCH_MESSAGE}</p>
            <p className="text-xs text-on-surface-variant">
              {hasSearchQuery
                ? 'Ubah kata kunci untuk melihat dokumen lain dalam berkas ini.'
                : 'Dokumen dalam berkas akan muncul di sini.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredItems.map((item, index) => (
              <ItemCard
                key={item.item_key}
                berkasId={berkasId}
                statusArsip={statusArsip}
                item={item}
                index={index}
                onPreview={(href, title) => setPreviewing({ href, title })}
              />
            ))}
          </div>
        )}
      </div>
    </>
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
        <h3 className="font-headline text-lg font-extrabold text-on-surface">Daftar Dokumen Dalam Berkas</h3>
        <p className="text-xs text-on-surface-variant">Kartu item ringan dengan file access yang mengikuti status lifecycle folder.</p>
      </div>
      <div className="flex flex-col gap-1 md:items-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit gap-1.5"
          disabled={!canExport}
          title={canExport ? 'Export daftar dokumen dalam berkas' : 'Tidak ada data untuk diekspor'}
          onClick={onExportCsv}
        >
          <Download size={14} />
          Export Daftar Dokumen CSV
        </Button>
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
}: {
  value: string
  resultText: string
  onChange: (value: string) => void
}) {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-white p-4 shadow-sm">
      <label className="block text-xs font-bold text-on-surface" htmlFor="berkas-detail-local-search">
        Pencarian lokal dokumen
        <input
          id="berkas-detail-local-search"
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 w-full rounded-lg border border-outline-variant/60 bg-white px-3 py-2 text-sm font-semibold text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          placeholder="Cari dokumen dalam berkas..."
          autoComplete="off"
        />
      </label>
      <div className="mt-2 flex flex-col gap-1 text-xs text-on-surface-variant md:flex-row md:items-center md:justify-between">
        <p>Filter lokal berdasarkan judul, sumber, provenance, pembuat, nominal, dan label lampiran.</p>
        <p className="font-semibold text-outline">{resultText}</p>
      </div>
    </div>
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
  onPreview: (href: string, title: string) => void
}) {
  const fileBlocked = statusArsip === 'DIMUSNAHKAN'

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-outline">Dokumen {index + 1}</span>
            <SourceBadge sourceType={item.source_type} />
            {item.has_attachments && (
              <Badge className="border-blue-200 bg-blue-50 text-blue-700">
                {formatAttachmentCount(item.attachment_count)} lampiran
              </Badge>
            )}
          </div>
          <h4 className="font-headline text-base font-extrabold text-on-surface">{item.source_title}</h4>
          <p className="mt-1 text-xs text-on-surface-variant">
            Pembuat: {item.source_created_by_display_name ?? '-'}
          </p>
        </div>
        <div className="grid min-w-[220px] gap-1 text-xs text-on-surface-variant">
          <p>Tanggal sumber: <span className="font-semibold text-on-surface">{formatNullableDateLabel(item.source_date)}</span></p>
          <p>Nominal: <span className="font-semibold text-on-surface">{formatNominalRupiah(item.source_nominal_realisasi)}</span></p>
          <p>Jumlah lampiran: <span className="font-semibold text-on-surface">{formatAttachmentCount(item.attachment_count)}</span></p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {item.workflow && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-700">Provenance Workflow</p>
            <MetadataLine label="Status" value={item.workflow.status ?? '-'} />
            <MetadataLine label="Fungsi" value={item.workflow.fungsi_nama ?? '-'} />
            <MetadataLine label="Kegiatan" value={item.workflow.kegiatan_nama ?? '-'} />
          </div>
        )}
        {item.manual && (
          <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-sky-700">Provenance Manual</p>
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
  onPreview: (href: string, title: string) => void
}) {
  const attachmentCount = typeof item.attachment_count === 'number' && item.attachment_count > 0
    ? item.attachment_count
    : 0

  if (attachmentCount === 0) return null

  if (fileBlocked) {
    return (
      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
        Data file sudah dimusnahkan
      </div>
    )
  }

  return (
    <div className="mt-3 grid gap-2">
      {Array.from({ length: attachmentCount }, (_, lampiranIndex) => {
        const attachment = item.attachments[lampiranIndex]
        const title = attachment?.label ?? (attachmentCount === 1 ? 'Lampiran' : `Lampiran ${lampiranIndex + 1}`)
        const previewTitle = attachment?.previewTitle ?? title
        const previewHref = buildBerkasItemAttachmentFileUrl(berkasId, item.item_file_key, lampiranIndex, 'preview')
        const downloadHref = buildBerkasItemAttachmentFileUrl(berkasId, item.item_file_key, lampiranIndex, 'download')

        return (
          <div
            key={`${item.item_key}-lampiran-${lampiranIndex}`}
            className="flex items-center gap-3 rounded-lg border border-outline-variant/30 bg-surface-container-low/20 px-3 py-2"
          >
            <FileText size={15} className="shrink-0 text-outline" />
            <p className="min-w-0 flex-1 truncate text-xs font-semibold text-on-surface">{title}</p>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => onPreview(previewHref, previewTitle)}
                aria-label={`Pratinjau ${title}`}
              >
                <Eye size={14} />
              </Button>
              <a
                href={downloadHref}
                className="inline-flex size-6 items-center justify-center rounded-[min(var(--radius-md),10px)] hover:bg-muted hover:text-foreground"
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
  title,
  onClose,
}: {
  href: string
  title: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Tutup pratinjau"
      />
      <div
        className="relative z-10 mx-4 flex max-h-[70vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Pratinjau lampiran berkas"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
          <FileText size={16} className="shrink-0 text-primary" />
          <p className="flex-1 truncate text-sm font-semibold text-on-surface">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pratinjau"
            className="flex size-7 items-center justify-center rounded-full hover:bg-surface-container-low"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-surface-container-low/30">
          <iframe
            src={href}
            className="h-[calc(70vh-72px)] w-full border-0"
            title={title}
          />
        </div>
      </div>
    </div>
  )
}

function MetadataCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/30 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-outline">{label}</p>
      <p className="mt-1 text-sm font-semibold text-on-surface">{value}</p>
    </div>
  )
}

function MetadataLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-xs text-on-surface-variant">
      {label}: <span className="font-semibold text-on-surface">{value}</span>
    </p>
  )
}

function FolderHistoryPanel({ detail }: { detail: BerkasDetail }) {
  const historyItems = [
    {
      label: 'Berkas dibuat',
      value: formatNullableDateLabel(detail.created_at),
    },
    ...(detail.closed_at
      ? [{
        label: 'Berkas ditutup',
        value: formatNullableDateLabel(detail.closed_at),
      }]
      : []),
    {
      label: 'Terakhir diperbarui',
      value: formatNullableDateLabel(detail.updated_at),
    },
  ]

  return (
    <ArchivePanel>
      <div className="mb-4">
        <h3 className="font-headline text-lg font-extrabold text-on-surface">
          Riwayat Aktivitas Berkas
        </h3>
        <p className="mt-1 text-xs text-on-surface-variant">
          Ringkasan aktivitas yang tersedia dari data berkas saat ini.
        </p>
      </div>
      <div className="space-y-3">
        {historyItems.map((item, index) => (
          <div key={`${item.label}-${index}`} className="grid grid-cols-[28px_1fr] gap-3">
            <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
              {index + 1}
            </div>
            <div className="rounded-xl border border-orange-100 bg-[#FFFDF9] p-3">
              <p className="text-sm font-semibold text-on-surface">{item.label}</p>
              <p className="mt-1 text-xs text-on-surface-variant">{item.value}</p>
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

function SourceBadge({ sourceType }: { sourceType: string }) {
  return <StatusBadge kind="source" status={sourceType} fallbackLabel={formatSourceTypeLabel(sourceType)} />
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

export function isBerkasEmptyForClose(detail: Pick<BerkasDetail, 'item_count' | 'items'>): boolean {
  return detail.item_count < 1 || detail.items.length < 1
}

function filterBerkasDetailItems(items: BerkasDetailItem[], query: string): BerkasDetailItem[] {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) return items

  return items.filter((item) => buildBerkasDetailItemSearchText(item).includes(normalizedQuery))
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
