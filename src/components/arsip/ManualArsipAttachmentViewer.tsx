/**
 * Penampil lampiran dokumen manual KSBU dengan tampilan yang sama persis dengan
 * AttachmentViewer (dokumen alur pengajuan): kartu lampiran, tombol
 * Preview/Unduh, toast, dan modal pratinjau PDF. Bedanya hanya sumber file —
 * endpoint manual_arsip yang langsung mengalirkan file (tanpa signed URL).
 *
 * Dipakai di: ManualArsipDetailDialog (Laporan Kinerja & Monitoring Nominal).
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Eye, FileText, Loader2, X } from 'lucide-react'

import {
  buildManualArsipAttachmentFileUrl,
  type ManualArsipAttachmentApiBase,
  type ManualArsipAttachmentMetadata,
} from '#/components/arsip/ManualArsipAttachments'
import { useAppToast } from '#/components/ui/AppToast'
import { Button } from '#/components/ui/button'
import { downloadZipBlob, extractContentDispositionFilename } from '#/lib/file-helpers'
import { fetchFileBlobWithSignedUrl, formatDateTime } from '#/lib/storage-client'
import { cn } from '#/lib/utils'
import {
  DOCUMENT_PREVIEW_PDF_ONLY_BODY,
  DOCUMENT_PREVIEW_PDF_ONLY_TITLE,
} from '#/lib/upload/document-upload-policy'

// Sama dengan fileActionButtonClassName di AttachmentViewer.
const FILE_ACTION_BUTTON_CLASS = [
  'h-8 rounded-xl border border-zinc-200/70 bg-bg-surface px-2.5',
  'text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500 shadow-sm shadow-zinc-950/[0.025]',
  'transition hover:border-brand-solid hover:bg-brand-surface hover:text-brand-solid hover:shadow-brand-solid/10',
  'focus-visible:border-brand-solid focus-visible:ring-brand-border',
].join(' ')

type ManualAttachment = ManualArsipAttachmentMetadata & { original_filename?: string }

export function ManualArsipAttachmentViewer({
  apiBase,
  manualArsipId,
  attachments,
  fileUnavailable,
}: {
  apiBase: ManualArsipAttachmentApiBase
  manualArsipId: string
  attachments: ManualAttachment[]
  fileUnavailable: boolean
}) {
  const { showToast } = useAppToast()
  const [previewing, setPreviewing] = useState<ManualAttachment | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewPdfOnly, setPreviewPdfOnly] = useState(false)

  useEffect(() => {
    if (!previewing) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Tutup pratinjau dulu, bukan dialog detail di belakangnya.
        event.stopPropagation()
        closePreview()
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [previewing])

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function clearPreviewUrl() {
    setPreviewUrl((current) => {
      if (current?.startsWith('blob:')) URL.revokeObjectURL(current)
      return null
    })
  }

  function closePreview() {
    setPreviewing(null)
    clearPreviewUrl()
    setPreviewError(null)
    setPreviewPdfOnly(false)
  }

  async function handlePreview(attachment: ManualAttachment) {
    setPreviewing(attachment)
    clearPreviewUrl()
    setPreviewError(null)
    setPreviewPdfOnly(false)

    if (attachment.content_type.trim().toLowerCase() !== 'application/pdf') {
      setPreviewPdfOnly(true)
      return
    }

    setPreviewLoading(true)
    try {
      const result = await fetchFileBlobWithSignedUrl(
        buildManualArsipAttachmentFileUrl(apiBase, manualArsipId, attachment.id, 'preview'),
      )
      if (result.error || !result.blob) {
        setPreviewError(result.error ?? 'Gagal memuat pratinjau')
        showToast({ title: 'Gagal', description: 'Preview tidak dapat dibuka. Coba lagi.', variant: 'error' })
        return
      }

      setPreviewUrl(URL.createObjectURL(result.blob))
      showToast({ title: 'Berhasil', description: 'Preview file PDF berhasil ditampilkan.', variant: 'success' })
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleDownload(attachment: ManualAttachment) {
    try {
      const response = await fetch(
        buildManualArsipAttachmentFileUrl(apiBase, manualArsipId, attachment.id, 'download'),
        { credentials: 'include' },
      )
      if (!response.ok) {
        showToast({ title: 'Gagal', description: 'File gagal diunduh. Coba lagi.', variant: 'error' })
        return
      }

      const fallbackName = attachment.original_filename || attachment.judul_lampiran || 'lampiran'
      downloadZipBlob(
        await response.blob(),
        extractContentDispositionFilename(response.headers.get('Content-Disposition'), fallbackName),
      )
      showToast({ title: 'Berhasil', description: 'Unduhan dimulai.', variant: 'success' })
    } catch {
      showToast({ title: 'Gagal', description: 'File gagal diunduh. Coba lagi.', variant: 'error' })
    }
  }

  if (attachments.length === 0) {
    return (
      <div className="rounded-[1.25rem] border border-brand-border bg-bg-surface p-4 shadow-sm">
        <h2 className="font-headline text-base font-bold tracking-tight text-zinc-950 sm:text-lg">Dokumen Pendukung</h2>
        <p className="py-6 text-center text-xs font-medium text-zinc-500">
          Belum ada lampiran.
        </p>
      </div>
    )
  }

  // Sama seperti tampilan "Data file sudah dibersihkan" di AttachmentViewer.
  if (fileUnavailable) {
    return (
      <div className="rounded-[1.25rem] border border-brand-border bg-bg-surface p-4 shadow-sm">
        <h2 className="font-headline text-base font-bold tracking-tight text-zinc-950 sm:text-lg">Dokumen Pendukung</h2>
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700">
          Data file sudah dimusnahkan
        </div>
        <ul className="mt-3 space-y-1.5">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-2 rounded-xl border border-brand-border bg-white/60 px-3 py-2 text-xs font-semibold text-zinc-500"
            >
              <FileText size={15} className="shrink-0 text-zinc-400" />
              <span className="min-w-0 flex-1 truncate">{attachment.judul_lampiran}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const previewTitle = previewing ? (previewing.judul_lampiran || 'Pratinjau lampiran') : ''

  return (
    <>
      {previewing && createPortal((
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4"
          onClick={(event) => { if (event.target === event.currentTarget) closePreview() }}
        >
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />
          <div
            className="relative z-10 flex h-[calc(100dvh-1rem)] max-h-[90dvh] w-full max-w-[92vw] flex-col overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl ring-1 ring-white/10 sm:h-[88vh] sm:max-w-[88vw]"
            role="dialog"
            aria-modal="true"
            aria-label="Pratinjau lampiran"
          >
            <div className="flex min-h-12 shrink-0 items-center gap-3 border-b border-white/10 bg-zinc-950 px-3 py-2 text-white sm:px-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-5 text-white">{previewTitle}</p>
                <p className="hidden text-[11px] leading-4 text-zinc-400 sm:block">Mode pratinjau dokumen</p>
              </div>
              <button
                type="button"
                onClick={() => { void handleDownload(previewing) }}
                aria-label={`Unduh ${previewTitle}`}
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Download size={17} />
              </button>
              <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:block">ESC</span>
              <button
                type="button"
                onClick={closePreview}
                aria-label="Tutup pratinjau"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-zinc-900 p-2 sm:p-4">
              {previewLoading ? (
                <div className="flex h-full min-h-60 w-full items-center justify-center">
                  <Loader2 size={26} className="animate-spin text-white" />
                </div>
              ) : previewPdfOnly ? (
                <div className="flex h-full min-h-60 w-full flex-col items-center justify-center gap-2 rounded-xl bg-zinc-950/60 px-4 text-center">
                  <p className="text-sm font-semibold text-zinc-100">{DOCUMENT_PREVIEW_PDF_ONLY_TITLE}</p>
                  <p className="text-xs font-medium text-zinc-400">{DOCUMENT_PREVIEW_PDF_ONLY_BODY}</p>
                </div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  className="h-full min-h-[60vh] w-full max-w-6xl border-0 bg-white shadow-2xl shadow-black/40"
                  title={previewTitle}
                />
              ) : (
                <div className="flex h-full min-h-60 w-full items-center justify-center rounded-xl bg-zinc-950/60 px-4 text-center">
                  {previewError ? (
                    <p className="text-sm font-medium text-red-300">{previewError}</p>
                  ) : (
                    <p className="text-sm text-zinc-300">Gagal memuat pratinjau.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ), document.body)}

      <div>
        <div className="mb-3">
          <h2 className="font-headline text-base font-bold tracking-tight text-zinc-950 sm:text-lg">Dokumen Pendukung</h2>
          <p className="mt-0.5 text-xs font-medium leading-relaxed text-zinc-700 sm:text-sm">
            Berkas pendukung yang diunggah Kepala Sub Bagian Umum saat menambahkan dokumen ini.
          </p>
        </div>
        <div className="space-y-2.5">
          {attachments.map((attachment, index) => {
            const nama = attachment.judul_lampiran || `Lampiran ${index + 1}`
            return (
              <div
                key={attachment.id}
                className="flex min-h-16 items-center gap-3 rounded-2xl border border-brand-border bg-bg-surface px-4 py-3"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-brand-border bg-brand-surface text-brand-solid">
                  <FileText size={18} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-zinc-950">{nama}</p>
                  <p className="mt-1 text-[11px] font-medium text-zinc-500">
                    {`${fileFormat(attachment)}${attachment.created_at ? ` - ${formatDateTime(attachment.created_at)}` : ''}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { void handlePreview(attachment) }}
                    className={cn(FILE_ACTION_BUTTON_CLASS, 'gap-1.5')}
                    aria-label={`Pratinjau ${nama}`}
                  >
                    <Eye size={15} />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { void handleDownload(attachment) }}
                    className={cn(FILE_ACTION_BUTTON_CLASS, 'gap-1.5')}
                    aria-label={`Unduh ${nama}`}
                  >
                    <Download size={15} />
                    Unduh
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// Sama dengan getFileFormat di AttachmentViewer: ekstensi file dalam huruf besar.
function fileFormat(attachment: ManualAttachment): string {
  const source = attachment.original_filename || ''
  const extension = source.includes('.') ? source.split('.').pop() : ''
  if (extension) return extension.toUpperCase()
  return attachment.content_type.trim().toLowerCase() === 'application/pdf' ? 'PDF' : 'File'
}
