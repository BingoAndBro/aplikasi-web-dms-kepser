import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('AttachmentViewer destroyed-file UX wiring', () => {
  it('routes preview and download failures through safe storage-client messages', () => {
    const source = readFileSync('src/components/dokumen/AttachmentViewer.tsx', 'utf8')

    expect(source).toContain("import { useAppToast } from '#/components/ui/AppToast'")
    expect(source).toContain('const { showToast } = useAppToast()')
    expect(source).toContain('showToast({')
    expect(source).toContain('fetchFileBlobWithSignedUrl')
    expect(source).toContain('setPreviewError(previewFile.error ??')
    expect(source).toContain('Preview tidak dapat dibuka. Coba lagi.')
    expect(source).toContain('File gagal diunduh. Coba lagi.')
    expect(source).toContain('Unduhan dimulai.')
    expect(source).toContain('Gagal memuat pratinjau')
    expect(source).toContain('DOCUMENT_PREVIEW_PDF_ONLY_TITLE')
    expect(source).toContain('DOCUMENT_PREVIEW_PDF_ONLY_BODY')
    expect(source).toContain('validateDocumentUploadClientFileMetadata')
    expect(source).toContain('getDocumentUploadValidationUiMessage')
    expect(source).toContain('DOCUMENT_UPLOAD_HELPER_TEXT')
    expect(source).toContain('uploadValidationErrors')
    expect(source).toContain('border border-amber-200 bg-[#FFF8EA]')
    expect(source).toContain('validationUi.actionLabel')
    expect(source).not.toContain('alert(result.error)')
    expect(source).not.toContain('File berhasil diunduh.')
    expect(source).not.toContain('alert(clientError)')
    expect(source).not.toContain('alert(signedUrl)')
    expect(source).not.toContain('setPreviewError(signedUrl)')
    expect(source).not.toContain('token=')
    expect(source).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  })

  it('uses document-aware preview and download routes for every apiType branch', () => {
    const source = readFileSync('src/components/dokumen/AttachmentViewer.tsx', 'utf8')

    expect(source).toContain('return `/api/dokumen/${dokumen.id}/preview/${idx}`')
    expect(source).toContain('return `/api/dokumen/${dokumen.id}/download/${idx}`')
    expect(source).toContain('return `/api/ppk/dokumen/${dokumen.id}/preview/${idx}`')
    expect(source).toContain('return `/api/ppk/dokumen/${dokumen.id}/download/${idx}`')
    expect(source).toContain('return `/api/ppspm/dokumen/${dokumen.id}/preview/${idx}`')
    expect(source).toContain('return `/api/ppspm/dokumen/${dokumen.id}/download/${idx}`')
    expect(source).toContain('const apiPath = getPreviewApiPath(idx)')
    expect(source).toContain('const signedUrlResult = await getSignedUrlFromApi(apiPath)')
    expect(source).toContain('const apiPath = getDownloadApiPath(idx)')
    expect(source).toContain('const result = await downloadFromApi(apiPath, filename)')
    expect(source).not.toContain('getSignedUrlDirectResult')
    expect(source).not.toContain('apiType === \'default\'')
    expect(source).not.toContain('/api/dokumen/preview-url?url=')
    expect(source).not.toContain('/api/dokumen/download-url?url=')
  })

  it('uses bordered premium preview and download actions without changing behavior', () => {
    const source = readFileSync('src/components/dokumen/AttachmentViewer.tsx', 'utf8')

    expect(source).toContain('const fileActionButtonClassName = [')
    expect(source).toContain('rounded-xl border border-zinc-200/70 bg-[#FFFDF9]')
    expect(source).toContain('text-zinc-500 shadow-sm shadow-zinc-950/[0.025]')
    expect(source).toContain('hover:border-orange-300 hover:bg-orange-50 hover:text-[#FF5A00]')
    expect(source).toContain("className={cn(fileActionButtonClassName, 'gap-1.5')}")
    expect(source).toContain('Preview')
    expect(source).toContain('Unduh')
  })

  it('keeps the unified document preview overlay visual-only and route-safe', () => {
    const viewerSource = readFileSync('src/components/dokumen/AttachmentViewer.tsx', 'utf8')
    const editorSource = readFileSync('src/components/dokumen/AttachmentEditor.tsx', 'utf8')

    for (const source of [viewerSource, editorSource]) {
      expect(source).toContain('bg-black/85 backdrop-blur-sm')
      expect(source).toContain('createPortal((')
      expect(source).toContain('z-[100]')
      expect(source).toContain('max-h-[90dvh]')
      expect(source).toContain('sm:max-w-[88vw]')
      expect(source).toContain('bg-zinc-950')
      expect(source).toContain('bg-zinc-900')
      expect(source).toContain('Mode pratinjau dokumen')
      expect(source).toContain('aria-label={`Unduh ${previewFilename || \'lampiran\'}`}')
      expect(source).toContain('aria-label="Tutup pratinjau"')
      expect(source).not.toContain('DMS_LOCAL_STORAGE_ROOT')
      expect(source).not.toContain('document.cookie')
      expect(source).not.toContain('localStorage')
    }
  })
})
