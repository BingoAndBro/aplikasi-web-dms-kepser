import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/routes/arsiparis/penambahan-arsip.tsx', 'utf8')
const manualUploadSource = readFileSync('src/lib/storage/manual-arsip-upload.ts', 'utf8')

describe('Phase 15L.7D.1 Penambahan Dokumen upload source guard', () => {
  it('uses the central document/lampiran upload policy for manual attachments', () => {
    expect(source).toContain('DOCUMENT_UPLOAD_ACCEPT')
    expect(source).toContain('DOCUMENT_UPLOAD_HELPER_TEXT')
    expect(source).toContain('validateDocumentUploadClientFileMetadata')
    expect(source).toContain('const MANUAL_ARSIP_ATTACHMENT_ACCEPT = DOCUMENT_UPLOAD_ACCEPT')
    expect(manualUploadSource).toContain('MANUAL_ARSIP_ATTACHMENT_MAX_BYTES = DOCUMENT_UPLOAD_MAX_BYTES')
    expect(manualUploadSource).toContain('MANUAL_ARSIP_ALLOWED_CONTENT_TYPES = DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES')
    expect(source).not.toContain('10 MB')
    expect(source).not.toContain('10MB')
    expect(manualUploadSource).not.toContain('10 * 1024 * 1024')
  })

  it('uses warm inline validation presentation for normal file validation failures', () => {
    expect(source).toContain('function ManualAttachmentValidationInline')
    expect(source).toContain('getDocumentUploadValidationUiMessage')
    expect(source).toContain('border border-amber-200 bg-[#FFF8EA]')
    expect(source).toContain('validationUi.actionLabel')
    expect(source).toContain('htmlFor={inputId}')
    expect(source).not.toContain('text-[10px] text-error">{errors[attachmentFileErrorKey(row.id)]}</p>')
  })
})
