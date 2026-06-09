/**
 * FileUploadButton — handles file selection, validation, and upload.
 * States: idle → uploading → uploaded | error
 */
import { useEffect, useRef, useState } from 'react'
import { Upload, CheckCircle2, AlertTriangle, Loader2, Eye, Pencil, Trash2, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import type { LampiranUrl } from '#/lib/dokumen-helpers'
import { extractFilenameFromPath } from '#/lib/utils/file'
import { downloadWithSignedUrl, fetchFileBlobWithSignedUrl, getSignedUrlDirectResult } from '#/lib/storage-client'
import {
  DOCUMENT_PREVIEW_PDF_ONLY_BODY,
  DOCUMENT_PREVIEW_PDF_ONLY_TITLE,
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE,
  DOCUMENT_UPLOAD_HELPER_TEXT,
  getDocumentUploadValidationUiMessage,
  isPdfLikeFilename,
  validateDocumentUploadClientFileMetadata,
} from '#/lib/upload/document-upload-policy'

type UploadState = 'idle' | 'uploading' | 'uploaded' | 'error'

interface FileUploadButtonProps {
  kelengkapanId: string
  namaDokumen: string
  initialLampiran?: LampiranUrl // pre-populated for edit/resubmit page
  onUploaded: (lampiran: LampiranUrl) => void
  onRemoved?: () => void
  className?: string
}

export function FileUploadButton({
  kelengkapanId,
  namaDokumen,
  initialLampiran,
  onUploaded,
  onRemoved,
  className,
}: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>(initialLampiran ? 'uploaded' : 'idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [filename, setFilename] = useState(initialLampiran?.url ? extractFilenameFromPath(initialLampiran.url) : '')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewPdfOnly, setPreviewPdfOnly] = useState(false)

  useEffect(() => {
    if (initialLampiran?.url) {
      setState('uploaded')
      setFilename(extractFilenameFromPath(initialLampiran.url))
      return
    }

    setState('idle')
    setFilename('')
  }, [initialLampiran?.url])

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function clearPreviewUrl() {
    setPreviewUrl(current => {
      if (current?.startsWith('blob:')) URL.revokeObjectURL(current)
      return null
    })
  }

  function closePreview() {
    clearPreviewUrl()
    setPreviewError('')
    setPreviewPdfOnly(false)
    setPreviewLoading(false)
  }

  async function handlePreview() {
    if (!initialLampiran?.url || previewLoading) return

    clearPreviewUrl()
    setPreviewError('')
    setPreviewPdfOnly(false)

    const displayFilename = filename || extractFilenameFromPath(initialLampiran.url) || namaDokumen
    if (!isPdfLikeFilename(displayFilename) && !isPdfLikeFilename(initialLampiran.url)) {
      setPreviewPdfOnly(true)
      return
    }

    setPreviewLoading(true)

    try {
      const signedUrlResult = await getSignedUrlDirectResult(initialLampiran.url)
      if (signedUrlResult.error || !signedUrlResult.signedUrl) {
        setPreviewError(signedUrlResult.error ?? 'Gagal memuat pratinjau')
        return
      }

      const previewFile = await fetchFileBlobWithSignedUrl(signedUrlResult.signedUrl)
      if (previewFile.error || !previewFile.blob) {
        setPreviewError(previewFile.error ?? 'Gagal memuat pratinjau')
        return
      }

      setPreviewUrl(URL.createObjectURL(previewFile.blob))
    } catch {
      setPreviewError('Gagal memuat pratinjau')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleDownload() {
    if (!initialLampiran?.url) return

    try {
      const signedUrlResult = await getSignedUrlDirectResult(initialLampiran.url)
      if (signedUrlResult.error || !signedUrlResult.signedUrl) {
        setPreviewError(signedUrlResult.error ?? 'Gagal mengunduh file')
        return
      }

      await downloadWithSignedUrl(
        signedUrlResult.signedUrl,
        filename || extractFilenameFromPath(initialLampiran.url) || namaDokumen,
      )
    } catch {
      setPreviewError('Gagal mengunduh file')
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const clientError = validateDocumentUploadClientFileMetadata(file)
    if (clientError) {
      e.target.value = ''
      setErrorMsg(clientError)
      setState('error')
      return
    }

    setFilename(file.name)
    setErrorMsg('')
    setState('uploading')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('kelengkapan_id', kelengkapanId)
      formData.append('nama_dokumen', namaDokumen)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })

      const json = await res.json()

      if (!res.ok) {
        setErrorMsg(typeof json.error === 'string' ? json.error : DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE)
        setState('error')
        return
      }

      const lampiran: LampiranUrl = {
        kelengkapan_id: json.kelengkapan_id,
        nama: json.nama,
        url: json.url,
        uploaded_at: json.uploaded_at,
      }

      onUploaded(lampiran)
      setState('uploaded')
    } catch {
      setErrorMsg(DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE)
      setState('error')
    }

    // Reset input
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const previewOpen = previewLoading || !!previewUrl || !!previewError || previewPdfOnly

  if (state === 'uploaded') {
    return (
      <>
        <div className={cn('flex shrink-0 items-center justify-end gap-2', className)}>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Pratinjau ${namaDokumen}`}
              onClick={handlePreview}
              disabled={previewLoading || !initialLampiran?.url}
              className="text-stone-500 hover:bg-white hover:text-stone-900"
            >
              {previewLoading ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept={DOCUMENT_UPLOAD_ACCEPT}
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Ganti ${namaDokumen}`}
              onClick={() => inputRef.current?.click()}
              className="text-stone-500 hover:bg-white hover:text-stone-900"
            >
              <Pencil size={13} />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Hapus ${namaDokumen}`}
              onClick={() => {
                closePreview()
                setState('idle')
                setFilename('')
                onRemoved?.()
              }}
              className="text-error hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 size={13} />
            </Button>
        </div>
        {previewOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) closePreview() }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div className="relative z-10 flex max-h-[76vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-3">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-900">
                  {filename || namaDokumen}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => { void handleDownload() }}
                  className="h-8 shrink-0 gap-1.5"
                >
                  Unduh File
                </Button>
                <button
                  type="button"
                  onClick={closePreview}
                  aria-label="Tutup pratinjau"
                  className="flex size-7 cursor-pointer items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="min-h-48 flex-1 bg-stone-50">
                {previewLoading ? (
                  <div className="flex h-48 items-center justify-center">
                    <Loader2 size={22} className="animate-spin text-[#F97316]" />
                  </div>
                ) : previewPdfOnly ? (
                  <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center">
                    <p className="text-sm font-semibold text-stone-900">{DOCUMENT_PREVIEW_PDF_ONLY_TITLE}</p>
                    <p className="text-xs font-medium text-stone-600">{DOCUMENT_PREVIEW_PDF_ONLY_BODY}</p>
                  </div>
                ) : previewUrl ? (
                  <iframe
                    src={previewUrl}
                    className="h-[calc(76vh-64px)] w-full border-0"
                    title={filename || namaDokumen}
                  />
                ) : (
                  <div className="flex h-48 items-center justify-center px-6 text-center">
                    <p className="text-sm font-medium text-error">
                      {previewError || 'Gagal memuat pratinjau'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  if (state === 'uploading') {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg bg-[#FFF3D6] px-3 py-2', className)}>
        <Loader2 size={14} className="shrink-0 animate-spin text-[#D97706]" />
        <p className="text-[10px] font-semibold text-stone-600">Mengunggah...</p>
      </div>
    )
  }

  if (state === 'error') {
    const validationUi = getDocumentUploadValidationUiMessage(errorMsg)

    return (
      <div className={cn('flex min-w-0 items-start gap-2 rounded-xl border border-amber-200 bg-[#FFF8EA] p-2.5', className)}>
        <input
          ref={inputRef}
          type="file"
          accept={DOCUMENT_UPLOAD_ACCEPT}
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <AlertTriangle size={13} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-stone-900">{validationUi.title}</p>
          <p className="mt-0.5 text-[11px] font-medium leading-4 text-stone-600">{validationUi.description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => inputRef.current?.click()}
          className="h-7 shrink-0 border-amber-300 bg-white px-2.5 text-[11px] font-semibold text-[#C55A00] hover:bg-[#FFF1D6] hover:text-[#A84800]"
        >
          {validationUi.actionLabel}
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('flex min-w-0 items-center justify-end', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_UPLOAD_ACCEPT}
        onChange={handleFileSelect}
        className="hidden"
      />
      <Button
        type="button"
        size="sm"
        className="h-10 w-full rounded-2xl bg-[#FFF0DD] px-5 text-[11px] font-bold text-[#EA580C] hover:bg-[#FFE4BF] sm:w-auto"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={12} />
        Unggah
      </Button>
      <p className="sr-only">{DOCUMENT_UPLOAD_HELPER_TEXT}</p>
    </div>
  )
}
