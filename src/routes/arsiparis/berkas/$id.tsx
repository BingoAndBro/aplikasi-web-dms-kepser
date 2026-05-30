import { createFileRoute, Link } from '@tanstack/react-router'
import {
  AlertCircle,
  ChevronRight,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
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

function BerkasArsipDetailPage() {
  const { id } = Route.useParams()
  const [detail, setDetail] = useState<BerkasDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [pendingLifecycleAction, setPendingLifecycleAction] = useState(false)

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

  async function submitLifecycleAction() {
    if (!detail) return

    const lifecycleAction = resolveBerkasLifecycleAction(detail.status_berkas, detail.status_arsip)
    if (!lifecycleAction) return
    if (!window.confirm(lifecycleAction.confirmation)) return

    setPendingLifecycleAction(true)
    setActionError(null)
    setActionSuccess(null)

    try {
      await apiFetch(`/arsiparis/berkas/${encodeURIComponent(detail.berkas_id)}/lifecycle`, {
        method: 'POST',
        body: JSON.stringify({ action: lifecycleAction.action }),
      })
      setActionSuccess(lifecycleAction.successMessage)
      await fetchData()
    } catch (error) {
      setActionError(resolveErrorMessage(error))
    } finally {
      setPendingLifecycleAction(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [id])

  return (
    <PageLayout>
      <div className="space-y-6">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-outline">
            <Link to="/arsiparis" className="hover:text-primary">Kepala Sub Bagian Umum</Link>
            <ChevronRight size={10} />
            <Link to="/arsiparis/berkas" className="hover:text-primary">Pemberkasan Arsip Aktif</Link>
            <ChevronRight size={10} />
            <span className="text-primary">Detail Berkas</span>
          </div>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">Detail Berkas Arsip</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            Detail folder-first dengan lifecycle status-only dan akses lampiran melalui endpoint server terotorisasi.
          </p>
        </div>

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
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchData}>Coba Lagi</Button>
              <Link
                to="/arsiparis/berkas"
                className="inline-flex h-7 items-center rounded-lg border border-outline-variant/40 px-2.5 text-[11px] font-semibold text-primary hover:bg-primary/5"
              >
                Kembali
              </Link>
            </div>
          </div>
        ) : !detail ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 py-20">
            <FolderOpen size={28} className="text-outline" />
            <p className="font-headline text-lg font-bold text-on-surface">Berkas tidak ditemukan</p>
            <Link
              to="/arsiparis/berkas"
              className="inline-flex h-7 items-center rounded-lg border border-outline-variant/40 px-2.5 text-[11px] font-semibold text-primary hover:bg-primary/5"
            >
              Kembali ke daftar
            </Link>
          </div>
        ) : (
          <>
            <FolderMetadataPanel
              detail={detail}
              pendingLifecycleAction={pendingLifecycleAction}
              onLifecycleAction={submitLifecycleAction}
            />
            <ItemList berkasId={detail.berkas_id} statusArsip={detail.status_arsip} items={detail.items} />
          </>
        )}
      </div>
    </PageLayout>
  )
}

function FolderMetadataPanel({
  detail,
  pendingLifecycleAction,
  onLifecycleAction,
}: {
  detail: BerkasDetail
  pendingLifecycleAction: boolean
  onLifecycleAction: () => void
}) {
  const lifecycleAction = resolveBerkasLifecycleAction(detail.status_berkas, detail.status_arsip)

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
              variant={lifecycleAction.action === 'approve_destruction' ? 'destructive' : 'outline'}
              disabled={pendingLifecycleAction}
              onClick={onLifecycleAction}
            >
              {pendingLifecycleAction ? 'Memproses...' : lifecycleAction.label}
            </Button>
          )}
          {detail.status_arsip === 'DIMUSNAHKAN' && (
            <p className="text-xs font-semibold text-red-700">Data sudah dimusnahkan</p>
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
        <MetadataCell label="Nomor SPM" value={detail.nomor_spm ?? '-'} />
        <MetadataCell label="Tanggal Ditutup" value={formatNullableDateLabel(detail.closed_at)} />
        <MetadataCell label="Jumlah Dokumen" value={String(detail.item_count)} />
        <MetadataCell label="Dokumen Workflow" value={String(detail.workflow_item_count)} />
        <MetadataCell label="Dokumen Manual" value={String(detail.manual_item_count)} />
        <MetadataCell label="Total Nominal" value={formatNominalRupiah(detail.total_nominal_realisasi)} />
        <MetadataCell label="Retensi Aktif" value={detail.retensi_aktif ?? '-'} />
        <MetadataCell label="Retensi Inaktif" value={detail.retensi_inaktif ?? '-'} />
        <MetadataCell label="Masa Aktif Berakhir" value={formatNullableDateLabel(detail.masa_aktif_berakhir)} />
        <MetadataCell label="Masa Inaktif Berakhir" value={formatNullableDateLabel(detail.masa_inaktif_berakhir)} />
      </div>
      {lifecycleAction && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {lifecycleAction.confirmation}
        </p>
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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && previewing) setPreviewing(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [previewing])

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-variant/60 bg-surface-container-low/30 py-12">
        <FileText size={24} className="text-outline" />
        <p className="font-headline text-base font-bold text-on-surface">Belum ada item dokumen</p>
        <p className="text-xs text-on-surface-variant">Item workflow atau manual akan muncul setelah masuk ke berkas.</p>
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
        <div>
          <h3 className="font-headline text-lg font-extrabold text-on-surface">Daftar Dokumen Dalam Berkas</h3>
          <p className="text-xs text-on-surface-variant">Kartu item ringan dengan file access yang mengikuti status lifecycle folder.</p>
        </div>
        <div className="grid gap-3">
          {items.map((item, index) => (
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
      </div>
    </>
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
        Data sudah dimusnahkan
      </div>
    )
  }

  return (
    <div className="mt-3 grid gap-2">
      {Array.from({ length: attachmentCount }, (_, lampiranIndex) => {
        const title = attachmentCount === 1 ? 'Lampiran' : `Lampiran ${lampiranIndex + 1}`
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
                onClick={() => onPreview(previewHref, title)}
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

function SourceBadge({ sourceType }: { sourceType: string }) {
  const className = sourceType === 'WORKFLOW'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : sourceType === 'MANUAL'
      ? 'border-sky-200 bg-sky-50 text-sky-700'
      : 'border-slate-200 bg-slate-50 text-slate-700'

  return <Badge className={className}>{formatSourceTypeLabel(sourceType)}</Badge>
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
