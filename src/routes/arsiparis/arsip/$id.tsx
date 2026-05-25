import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRightCircle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Loader2,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { PageLayout } from '#/components/dashboard/PageLayout'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { ApiError, apiFetch } from '#/lib/api-client'
import type {
  ManualArchiveDetailSource,
  UnifiedArchiveAttachmentSummary,
  UnifiedArchiveDetail,
  UnifiedArchiveDetailWarning,
  WorkflowArchiveDetailSource,
} from '#/lib/archive/unified-archive-detail'
import { formatDate, formatDateTime } from '#/lib/utils/format'

export const Route = createFileRoute('/arsiparis/arsip/$id')({
  component: UnifiedArchiveDetailPage,
})

type UnifiedArchiveDetailResponse = {
  arsip?: UnifiedArchiveDetail
  error?: string
}

type UnifiedArchiveLifecycleAction = 'mark_inactive' | 'propose_destruction'

type UnifiedArchiveLifecycleResponse = {
  ok?: boolean
  error?: string
}

function UnifiedArchiveDetailPage() {
  const { id } = Route.useParams()
  const [detail, setDetail] = useState<UnifiedArchiveDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchDetail(options: { showLoading?: boolean } = {}) {
    const showLoading = options.showLoading ?? true
    if (showLoading) setLoading(true)
    setError(null)
    try {
      const json = await apiFetch<UnifiedArchiveDetailResponse>(`/arsiparis/arsip/${id}`)
      setDetail(json.arsip ?? null)
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 404) {
          setError('Arsip tidak ditemukan')
        } else if (error.status === 403) {
          setError('Akses ditolak')
        } else if (error.status === 401) {
          setError('Sesi tidak valid')
        } else {
          setError(readApiError(error.payload) ?? 'Gagal mengambil data arsip')
        }
      } else {
        setError('Terjadi kesalahan')
      }
      setDetail(null)
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    fetchDetail()
  }, [id])

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-outline">
              <Link to="/arsiparis" className="hover:text-primary">Kepala Sub Bagian Umum</Link>
              <span>/</span>
              <span className="text-primary">Detail Arsip</span>
            </div>
            <h2 className="font-headline text-2xl font-extrabold text-on-surface">Detail Arsip</h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              Detail kanonis read-only berdasarkan arsip.arsip.id.
            </p>
          </div>
          <Link
            to="/arsiparis/aktif"
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-outline-variant/50 px-3 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low"
          >
            <ArrowLeft size={14} />
            Kembali ke daftar
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-outline-variant/30 bg-white py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={fetchDetail} />
        ) : detail ? (
          <DetailContent detail={detail} />
        ) : (
          <ErrorState message="Metadata arsip tidak tersedia" onRetry={fetchDetail} />
        )}
      </div>
    </PageLayout>
  )
}

function DetailContent({ detail }: { detail: UnifiedArchiveDetail }) {
  return (
    <div className="space-y-6">
      {detail.statusArsip === 'DIMUSNAHKAN' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
          Arsip telah dimusnahkan. Metadata dapat dilihat, tetapi akses file tidak tersedia.
        </div>
      )}

      {detail.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-800">
            <AlertTriangle size={16} />
            Peringatan Metadata Sumber
          </div>
          <div className="flex flex-wrap gap-2">
            {detail.warnings.map((warning) => (
              <Badge key={warning} className="border-amber-200 bg-white text-amber-800">
                {formatWarning(warning)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <section className="rounded-xl border border-outline-variant/30 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-headline text-lg font-extrabold text-on-surface">Metadata Arsip</h3>
            <p className="text-xs text-on-surface-variant">Informasi umum kanonis dari arsip.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={detail.statusArsip} />
            <SourceBadge sourceType={detail.sourceType} />
          </div>
        </div>

        <DescriptionGrid
          items={[
            ['Nama Arsip', formatText(detail.namaArsip)],
            ['Nomor Surat', formatText(detail.nomorSurat)],
            ['Status Arsip', detail.statusArsip],
            ['Sumber', formatSourceType(detail.sourceType)],
            ['Klasifikasi Arsip', formatKlasifikasi(detail)],
            ['Tanggal Arsip', formatNullableDate(detail.tanggalArsip)],
            ['Retensi Aktif', formatText(detail.retensiAktif)],
            ['Retensi Inaktif', formatText(detail.retensiInaktif)],
            ['Masa Aktif Berakhir', formatNullableDate(detail.masaAktifBerakhir)],
            ['Masa Inaktif Berakhir', formatNullableDate(detail.masaInaktifBerakhir)],
            ['Nominal Realisasi', formatNominal(detail.nominalRealisasi)],
            ['Dibuat oleh', formatActorName(detail.createdByName, detail.createdBy)],
            ['Diarsipkan oleh', formatActorName(detail.archivedByName, detail.archivedBy)],
            ['Tanggal dibuat', formatNullableDateTime(detail.createdAt)],
            ['Terakhir diperbarui', formatNullableDateTime(detail.updatedAt)],
          ]}
        />
      </section>

      <SourceSection detail={detail} />

      <AttachmentSection detail={detail} />

      <LifecycleActionSection detail={detail} />
    </div>
  )
}

function LifecycleActionSection({
  detail,
}: {
  detail: UnifiedArchiveDetail
}) {
  const navigate = useNavigate()
  const [pendingAction, setPendingAction] = useState<UnifiedArchiveLifecycleAction | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const lifecycleAction = resolveLifecycleAction(detail.statusArsip)

  async function submitLifecycleAction(action: UnifiedArchiveLifecycleAction) {
    const confirmationMessage = action === 'mark_inactive'
      ? 'Pindahkan arsip ini ke status Inaktif?'
      : 'Ajukan arsip ini ke Usul Musnah?'

    if (!window.confirm(confirmationMessage)) return

    setPendingAction(action)
    setActionError(null)

    try {
      await apiFetch<UnifiedArchiveLifecycleResponse>(
        `/arsiparis/arsip/${detail.id}/lifecycle`,
        {
          method: 'POST',
          body: JSON.stringify({ action }),
        },
      )
      await navigate({
        to: action === 'mark_inactive' ? '/arsiparis/inaktif' : '/arsiparis/usul-musnah',
      })
    } catch (error) {
      if (error instanceof ApiError) {
        setActionError(readApiError(error.payload) ?? 'Gagal mengubah status lifecycle arsip.')
      } else {
        setActionError('Terjadi kesalahan saat mengubah status lifecycle arsip.')
      }
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <section className="rounded-xl border border-outline-variant/30 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-1">
        <h3 className="font-headline text-lg font-extrabold text-on-surface">
          Aksi Lifecycle
        </h3>
        <p className="text-xs text-on-surface-variant">
          Perubahan status tetap divalidasi oleh server dan role Kepala Sub Bagian Umum.
        </p>
      </div>

      {actionError && (
        <div className="mb-3 rounded-lg border border-error/20 bg-error/5 px-3 py-2 text-xs font-semibold text-error">
          {actionError}
        </div>
      )}

      {lifecycleAction ? (
        <Button
          className="w-full gap-1.5 sm:w-auto"
          onClick={() => submitLifecycleAction(lifecycleAction.action)}
          disabled={pendingAction !== null}
        >
          {pendingAction === lifecycleAction.action
            ? <Loader2 size={14} className="animate-spin" />
            : <ArrowRightCircle size={14} />}
          {lifecycleAction.label}
        </Button>
      ) : detail.statusArsip === 'USUL_MUSNAH' ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Persetujuan pemusnahan tidak ditampilkan di UI pada fase ini. Gunakan proses/API terpisah yang sudah disetujui.
        </div>
      ) : detail.statusArsip === 'DIMUSNAHKAN' ? (
        <p className="text-sm text-on-surface-variant">
          Tidak ada aksi lifecycle untuk arsip yang sudah dimusnahkan.
        </p>
      ) : (
        <p className="text-sm text-on-surface-variant">
          Tidak ada aksi lifecycle yang tersedia untuk status arsip saat ini.
        </p>
      )}
    </section>
  )
}

function SourceSection({ detail }: { detail: UnifiedArchiveDetail }) {
  if (detail.source?.sourceType === 'WORKFLOW') {
    return <WorkflowSourceSection source={detail.source} />
  }

  if (detail.source?.sourceType === 'MANUAL') {
    return <ManualSourceSection source={detail.source} />
  }

  return (
    <section className="rounded-xl border border-outline-variant/30 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <FileText size={18} className="text-outline" />
        <h3 className="font-headline text-lg font-extrabold text-on-surface">
          Metadata Sumber
        </h3>
      </div>
      <p className="text-sm text-on-surface-variant">
        {detail.sourceType === 'UNKNOWN'
          ? 'Sumber tidak dikenal'
          : 'Metadata sumber belum lengkap'}
      </p>
    </section>
  )
}

function WorkflowSourceSection({ source }: { source: WorkflowArchiveDetailSource }) {
  return (
    <section className="rounded-xl border border-outline-variant/30 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-headline text-lg font-extrabold text-on-surface">
        Metadata Dokumen Persetujuan
      </h3>
      <DescriptionGrid
        items={[
          ['ID Dokumen', source.dokumenId],
          ['Judul Dokumen', formatText(source.judulDokumen)],
          ['Jenis Dokumen', formatMaterial(source.isNonMaterial)],
          ['Status Workflow', formatText(source.workflowStatus)],
          ['Fungsi', formatText(source.fungsiNama)],
          ['Kegiatan', formatText(source.kegiatanNama)],
          ['Tahun', source.tahun === null ? '-' : String(source.tahun)],
        ]}
      />
    </section>
  )
}

function ManualSourceSection({ source }: { source: ManualArchiveDetailSource }) {
  return (
    <section className="rounded-xl border border-outline-variant/30 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-headline text-lg font-extrabold text-on-surface">
        Metadata Arsip Manual
      </h3>
      <DescriptionGrid
        items={[
          ['Nama', formatText(source.nama)],
          ['Keterangan', formatText(source.keterangan)],
          ['Kategori', formatText(source.categoryName)],
          ['Tanggal Dokumen/Sumber', formatNullableDate(source.tanggalDokumenSumber)],
        ]}
      />
    </section>
  )
}

function AttachmentSection({ detail }: { detail: UnifiedArchiveDetail }) {
  const [previewing, setPreviewing] = useState<{ href: string; title: string } | null>(null)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && previewing) setPreviewing(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [previewing])

  return (
    <>
      {previewing && (
        <PreviewModal
          href={previewing.href}
          title={previewing.title}
          onClose={() => setPreviewing(null)}
        />
      )}

      <section className="rounded-xl border border-outline-variant/30 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-1">
          <h3 className="font-headline text-lg font-extrabold text-on-surface">
            Lampiran Arsip
          </h3>
          <p className="text-xs text-on-surface-variant">
            Akses file tersedia hanya melalui endpoint server terotorisasi.
          </p>
        </div>

        {detail.statusArsip === 'DIMUSNAHKAN' && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            Akses file tidak tersedia karena arsip telah dimusnahkan.
          </div>
        )}

        {detail.attachments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-outline-variant/50 bg-surface-container-low/30 p-4 text-sm text-on-surface-variant">
            Belum ada metadata lampiran yang tersedia.
          </div>
        ) : (
          <div className="space-y-2">
            {detail.attachments.map((attachment, index) => (
              <AttachmentCard
                key={attachment.attachmentId ?? `${attachment.sourceType}-${attachment.index ?? index}`}
                archiveId={detail.id}
                attachment={attachment}
                fallbackIndex={index + 1}
                onPreview={(href, title) => setPreviewing({ href, title })}
              />
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function AttachmentCard({
  archiveId,
  attachment,
  fallbackIndex,
  onPreview,
}: {
  archiveId: string
  attachment: UnifiedArchiveAttachmentSummary
  fallbackIndex: number
  onPreview: (href: string, title: string) => void
}) {
  const previewHref = buildAttachmentActionHref(archiveId, attachment, 'preview')
  const downloadHref = buildAttachmentActionHref(archiveId, attachment, 'download')
  const attachmentName = formatAttachmentName(attachment, fallbackIndex)

  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-container-low/20 p-3">
      {attachment.availability === 'AVAILABLE' ? (
        <CheckCircle2 size={16} className="shrink-0 text-green-600" />
      ) : (
        <AlertCircle size={16} className="shrink-0 text-amber-600" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-xs font-medium text-on-surface">
            {attachmentName}
          </p>
          <AttachmentAvailabilityBadge availability={attachment.availability} />
        </div>
        <p className="mt-0.5 text-[10px] text-outline">
          {formatAttachmentSubtext(attachment)}
        </p>
      </div>

      {previewHref && downloadHref ? (
        <div className="flex items-center gap-2">
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => onPreview(previewHref, attachmentName)}
            aria-label={`Pratinjau ${attachmentName}`}
          >
            <Eye size={14} />
          </Button>
          <a
            href={downloadHref}
            className="inline-flex size-6 items-center justify-center rounded-[min(var(--radius-md),10px)] hover:bg-muted hover:text-foreground"
            aria-label={`Unduh ${attachmentName}`}
          >
            <Download size={14} />
          </a>
        </div>
      ) : (
        <p className="text-[10px] font-semibold text-on-surface-variant">
          {formatAttachmentAvailability(attachment.availability)}
        </p>
      )}
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
        aria-label="Pratinjau lampiran arsip"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
          <CheckCircle2 size={16} className="shrink-0 text-primary" />
          <p className="flex-1 truncate text-sm font-semibold text-on-surface">{title}</p>
          <span className="hidden text-[10px] text-outline sm:block">ESC</span>
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
            className="h-[calc(70vh-96px)] w-full border-0"
            title={title}
          />
        </div>
      </div>
    </div>
  )
}

function DescriptionGrid({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-outline-variant/20 bg-surface-container-low/30 p-3">
          <dt className="text-[10px] font-bold uppercase tracking-widest text-outline">{label}</dt>
          <dd className="mt-1 break-words text-sm font-semibold text-on-surface">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-error/20 bg-error/5 py-20">
      <AlertCircle size={32} className="text-error" />
      <p className="text-sm text-on-surface-variant">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>Coba Lagi</Button>
    </div>
  )
}

function StatusBadge({ status }: { status: UnifiedArchiveDetail['statusArsip'] }) {
  const className = status === 'AKTIF'
    ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
    : status === 'INAKTIF'
      ? 'border-sky-200 bg-sky-100 text-sky-700'
      : status === 'USUL_MUSNAH'
        ? 'border-amber-200 bg-amber-100 text-amber-700'
        : 'border-rose-200 bg-rose-100 text-rose-700'

  return <Badge className={className}>{status}</Badge>
}

function SourceBadge({ sourceType }: { sourceType: UnifiedArchiveDetail['sourceType'] }) {
  const className = sourceType === 'MANUAL'
    ? 'border-sky-200 bg-sky-100 text-sky-700'
    : sourceType === 'WORKFLOW'
      ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
      : 'border-slate-200 bg-slate-100 text-slate-700'

  return <Badge className={className}>{formatSourceType(sourceType)}</Badge>
}

function AttachmentAvailabilityBadge({
  availability,
}: {
  availability: UnifiedArchiveAttachmentSummary['availability']
}) {
  const className = availability === 'AVAILABLE'
    ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
    : availability === 'UNAVAILABLE_DESTROYED'
      ? 'border-rose-200 bg-rose-100 text-rose-700'
      : 'border-amber-200 bg-amber-100 text-amber-700'

  return <Badge className={className}>{formatAttachmentAvailability(availability)}</Badge>
}

function resolveLifecycleAction(status: UnifiedArchiveDetail['statusArsip']): {
  action: UnifiedArchiveLifecycleAction
  label: string
} | null {
  if (status === 'AKTIF') {
    return {
      action: 'mark_inactive',
      label: 'Pindahkan ke Inaktif',
    }
  }

  if (status === 'INAKTIF') {
    return {
      action: 'propose_destruction',
      label: 'Pindahkan ke Usul Musnah',
    }
  }

  return null
}

function formatWarning(warning: UnifiedArchiveDetailWarning): string {
  if (warning === 'ATTACHMENT_METADATA_UNAVAILABLE') return 'Metadata lampiran tidak tersedia'
  if (warning === 'ATTACHMENT_SOURCE_INCOMPLETE') return 'Sumber lampiran belum lengkap'
  if (warning === 'UNKNOWN_SOURCE_TYPE') return 'Jenis sumber arsip tidak dikenal'
  if (warning === 'MISSING_MANUAL_SOURCE') return 'Data sumber manual belum lengkap'
  if (warning === 'WORKFLOW_WITHOUT_DOKUMEN_ID') return 'Dokumen workflow belum terhubung'
  if (warning === 'MANUAL_WITH_DOKUMEN_ID') return 'Arsip manual memiliki relasi dokumen tidak lazim'
  if (warning === 'WORKFLOW_SOURCE_NOT_FOUND') return 'Metadata dokumen persetujuan tidak ditemukan'
  if (warning === 'MANUAL_SOURCE_NOT_FOUND') return 'Metadata arsip manual tidak ditemukan'
  return 'Metadata sumber belum lengkap'
}

function formatSourceType(sourceType: UnifiedArchiveDetail['sourceType']): string {
  if (sourceType === 'WORKFLOW') return 'Dokumen Persetujuan'
  if (sourceType === 'MANUAL') return 'Arsip Manual'
  return 'Sumber tidak dikenal'
}

function formatKlasifikasi(detail: UnifiedArchiveDetail): string {
  const kode = detail.klasifikasiKodeSnapshot
  const nama = detail.klasifikasiNamaSnapshot
  if (kode && nama) return `${kode} - ${nama}`
  return formatText(kode ?? nama)
}

function formatMaterial(value: boolean | null): string {
  if (value === true) return 'Non-Material'
  if (value === false) return 'Material'
  return '-'
}

function formatAttachmentName(attachment: UnifiedArchiveAttachmentSummary, fallbackIndex: number): string {
  if (attachment.sourceType === 'WORKFLOW') {
    return formatText(attachment.fileName ?? attachment.displayName ?? `Lampiran ${attachment.index ?? fallbackIndex}`)
  }

  return formatText(attachment.displayName ?? attachment.fileName ?? `Lampiran ${attachment.index ?? fallbackIndex}`)
}

function formatAttachmentType(mimeType: string | null): string {
  if (!mimeType) return '-'
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === 'image/png') return 'Gambar PNG'
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'Gambar JPEG'
  if (mimeType === 'image/webp') return 'Gambar WebP'
  if (mimeType === 'image/gif') return 'Gambar GIF'
  if (mimeType === 'image/tiff') return 'Gambar TIFF'
  if (mimeType === 'image/bmp') return 'Gambar BMP'
  if (mimeType.startsWith('image/')) return `Gambar ${mimeType.split('/')[1]?.toUpperCase() ?? ''}`.trim()

  return mimeType
}

function formatFileSize(sizeBytes: number | null): string {
  if (sizeBytes === null || !Number.isFinite(sizeBytes) || sizeBytes < 0) return '-'
  if (sizeBytes < 1024) return `${sizeBytes} B`

  const units = ['KB', 'MB', 'GB']
  let value = sizeBytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value)} ${units[unitIndex]}`
}

function formatAttachmentSubtext(attachment: UnifiedArchiveAttachmentSummary): string {
  return `${formatAttachmentType(attachment.mimeType)} - ${formatFileSize(attachment.sizeBytes)}`
}

function formatAttachmentAvailability(
  availability: UnifiedArchiveAttachmentSummary['availability'],
): string {
  if (availability === 'AVAILABLE') return 'Tersedia'
  if (availability === 'UNAVAILABLE_DESTROYED') return 'Tidak tersedia - dimusnahkan'
  return 'Tidak tersedia - sumber belum lengkap'
}

function buildAttachmentActionHref(
  archiveId: string,
  attachment: UnifiedArchiveAttachmentSummary,
  action: 'preview' | 'download',
): string | null {
  if (attachment.availability !== 'AVAILABLE') return null

  const attachmentRef = buildAttachmentRef(attachment)
  if (!attachmentRef) return null

  const params = new URLSearchParams({
    action,
    attachmentRef,
  })

  return `/api/arsiparis/arsip/${encodeURIComponent(archiveId)}?${params.toString()}`
}

function buildAttachmentRef(attachment: UnifiedArchiveAttachmentSummary): string | null {
  if (attachment.sourceType === 'WORKFLOW') {
    return attachment.index && attachment.index > 0 ? `workflow-${attachment.index}` : null
  }

  if (attachment.sourceType === 'MANUAL') {
    return attachment.attachmentId ? `manual-${attachment.attachmentId}` : null
  }

  return null
}

function formatText(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : '-'
}

function formatActorName(name: string | null | undefined, actorId: string | null | undefined): string {
  if (name && name.trim().length > 0) return name
  if (actorId && actorId.trim().length > 0) return 'Pengguna tidak ditemukan'

  return 'Tidak tersedia'
}

function formatNullableDate(value: string | null): string {
  return value ? formatDate(value) : '-'
}

function formatNullableDateTime(value: string | null): string {
  return value ? formatDateTime(value) : '-'
}

function formatNominal(value: string | number | null): string {
  if (value === null || value === '') return '-'
  const numericValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numericValue)) return String(value)

  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(numericValue)
}

function readApiError(payload: unknown): string | null {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    return typeof payload.error === 'string' ? payload.error : null
  }

  return null
}
