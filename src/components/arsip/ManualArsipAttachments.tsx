/**
 * Lampiran dokumen manual KSBU (arsip.manual_arsip_attachment): baris lampiran
 * dengan Preview/Download dan modal pratinjau.
 *
 * Dipakai di: Penambahan Dokumen KSBU (endpoint /api/kasubag/manual-arsip) dan
 * detail dokumen manual di Laporan Kinerja / Monitoring Nominal Realisasi
 * (endpoint read-only /api/laporan/manual-arsip). Otorisasi tetap di server.
 */
import { useEffect, useState } from 'react'
import { Download, Eye, FileText, Loader2, X } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import {
  DOCUMENT_PREVIEW_PDF_ONLY_BODY,
  DOCUMENT_PREVIEW_PDF_ONLY_TITLE,
} from '#/lib/upload/document-upload-policy'

export type ManualArsipAttachmentApiBase = '/api/kasubag/manual-arsip' | '/api/laporan/manual-arsip'

export type ManualArsipAttachmentMetadata = {
  id: string
  judul_lampiran: string
  content_type: string
  size_bytes: number
  created_at: string
}

export type PreviewingAttachment = {
  title: string
  url: string
  downloadUrl?: string
  isPdf: boolean
}

export function buildManualArsipAttachmentFileUrl(
  apiBase: ManualArsipAttachmentApiBase,
  manualArsipId: string,
  attachmentId: string,
  purpose: 'preview' | 'download',
) {
  return `${apiBase}/${encodeURIComponent(manualArsipId)}/attachments/${encodeURIComponent(attachmentId)}/${purpose}`
}

export function buildManualArsipAttachmentPreview(
  apiBase: ManualArsipAttachmentApiBase,
  manualArsipId: string,
  attachment: ManualArsipAttachmentMetadata,
): PreviewingAttachment {
  return {
    title: attachment.judul_lampiran || 'Pratinjau lampiran',
    url: buildManualArsipAttachmentFileUrl(apiBase, manualArsipId, attachment.id, 'preview'),
    downloadUrl: buildManualArsipAttachmentFileUrl(apiBase, manualArsipId, attachment.id, 'download'),
    isPdf: attachment.content_type.trim().toLowerCase() === 'application/pdf',
  }
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatFriendlyAttachmentMetadata(attachment: ManualArsipAttachmentMetadata) {
  return `${getFriendlyDocumentType(attachment.content_type)} • ${formatFileSize(attachment.size_bytes)}`
}

function getFriendlyDocumentType(contentType: string) {
  switch (contentType.trim().toLowerCase()) {
    case 'application/pdf':
      return 'PDF'
    case 'application/msword':
      return 'DOC'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'DOCX'
    case 'application/vnd.ms-excel':
      return 'XLS'
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return 'XLSX'
    case 'image/jpeg':
      return 'Gambar JPEG'
    case 'image/png':
      return 'Gambar PNG'
    default:
      return 'File'
  }
}

function attachmentLinkClass(variant: 'outline' | 'primary') {
  return cn(
    'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    variant === 'primary'
      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
      : 'border border-border bg-background hover:bg-accent hover:text-accent-foreground',
  )
}

export function ManualArsipAttachmentRow({
  apiBase,
  attachment,
  index,
  manualArsipId,
  fileUnavailable,
  onPreview,
}: {
  apiBase: ManualArsipAttachmentApiBase
  attachment: ManualArsipAttachmentMetadata
  index: number
  manualArsipId: string
  fileUnavailable: boolean
  onPreview: (manualArsipId: string, attachment: ManualArsipAttachmentMetadata) => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-brand-border bg-bg-surface px-3 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText size={15} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-on-surface">
            {attachment.judul_lampiran || `Lampiran ${index + 1}`}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">
            {formatFriendlyAttachmentMetadata(attachment)}
          </p>
        </div>
      </div>

      {fileUnavailable ? (
        <p className="text-xs font-medium text-red-700 sm:text-right">
          Data file sudah dimusnahkan
        </p>
      ) : (
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPreview(manualArsipId, attachment)}
            className="h-8 gap-1.5"
          >
            <Eye size={13} />
            Preview
          </Button>
          <a
            href={buildManualArsipAttachmentFileUrl(apiBase, manualArsipId, attachment.id, 'download')}
            className={attachmentLinkClass('primary')}
          >
            <Download size={13} />
            Download
          </a>
        </div>
      )}
    </div>
  )
}

export function ManualArsipPreviewModal({
  preview,
  onClose,
}: {
  preview: PreviewingAttachment
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(preview.isPdf)
  }, [preview.isPdf, preview.url])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4">
      <button
        type="button"
        aria-label="Tutup pratinjau"
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex h-[calc(100dvh-1rem)] max-h-[90dvh] w-full max-w-[92vw] flex-col overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/10 sm:h-[88vh] sm:max-w-[88vw]"
        role="dialog"
        aria-modal="true"
        aria-label="Pratinjau lampiran dokumen manual"
      >
        <div className="flex min-h-12 shrink-0 items-center gap-3 border-b border-white/10 bg-zinc-950 px-3 py-2 text-white sm:px-4">
          <Eye size={16} className="shrink-0 text-zinc-300" />
          <p className="flex-1 truncate text-sm font-semibold text-white">{preview.title}</p>
          <a
            href={preview.downloadUrl ?? preview.url}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-200 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={`Unduh ${preview.title}`}
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
            <X size={16} />
          </button>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-zinc-900 p-2 sm:p-4">
          {preview.isPdf && loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/70">
              <div className="flex flex-col items-center gap-2 text-xs text-zinc-300">
                <Loader2 size={22} className="animate-spin text-white" />
                Memuat pratinjau...
              </div>
            </div>
          )}
          {preview.isPdf ? (
            <iframe
              src={preview.url}
              className="h-full min-h-[60vh] w-full max-w-6xl border-0 bg-white shadow-2xl shadow-black/40"
              title={preview.title}
              onLoad={() => setLoading(false)}
            />
          ) : (
            <div className="flex h-full min-h-60 w-full flex-col items-center justify-center gap-2 rounded-xl bg-zinc-950/60 px-4 text-center">
              <p className="text-sm font-semibold text-zinc-100">{DOCUMENT_PREVIEW_PDF_ONLY_TITLE}</p>
              <p className="text-xs font-medium text-zinc-400">{DOCUMENT_PREVIEW_PDF_ONLY_BODY}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
