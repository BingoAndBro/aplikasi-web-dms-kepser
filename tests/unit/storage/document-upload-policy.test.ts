import { describe, expect, it } from 'vitest'

import {
  DOCUMENT_PREVIEW_PDF_ONLY_BODY,
  DOCUMENT_PREVIEW_PDF_ONLY_TITLE,
  DOCUMENT_UPLOAD_ALLOWED_EXTENSIONS,
  DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES,
  DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE,
  DOCUMENT_UPLOAD_HELPER_TEXT,
  DOCUMENT_UPLOAD_INVALID_FILE_MESSAGE,
  DOCUMENT_UPLOAD_INVALID_FORMAT_MESSAGE,
  DOCUMENT_UPLOAD_MAX_BYTES,
  DOCUMENT_UPLOAD_TOO_LARGE_MESSAGE,
  getDocumentUploadValidationUiMessage,
  matchesDocumentUploadSignature,
  validateDocumentUploadClientFileMetadata,
} from '#/lib/upload/document-upload-policy'
import {
  PROFILE_AVATAR_ALLOWED_MIME_TYPES,
  PROFILE_AVATAR_MAX_BYTES,
} from '#/lib/storage/profile-avatar'

describe('central document upload policy', () => {
  it('keeps the final document/lampiran allowlist and 5 MB cap', () => {
    expect(DOCUMENT_UPLOAD_MAX_BYTES).toBe(5 * 1024 * 1024)
    expect(DOCUMENT_UPLOAD_ALLOWED_EXTENSIONS).toEqual([
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'jpg',
      'jpeg',
      'png',
    ])
    expect(DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES).toEqual([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
    ])
    expect(DOCUMENT_UPLOAD_HELPER_TEXT).toBe(
      'PDF, DOC, DOCX, XLS, XLSX, JPG, atau PNG • Maks. 5 MB',
    )
  })

  it('keeps compact warm inline validation copy separate from server validation messages', () => {
    expect(getDocumentUploadValidationUiMessage(DOCUMENT_UPLOAD_INVALID_FORMAT_MESSAGE)).toEqual({
      title: 'Format tidak didukung',
      description: 'Gunakan PDF, DOC, DOCX, XLS, XLSX, JPG, atau PNG. Maksimal 5 MB.',
      actionLabel: 'Pilih File Lain',
    })
    expect(getDocumentUploadValidationUiMessage(DOCUMENT_UPLOAD_TOO_LARGE_MESSAGE)).toEqual({
      title: 'Ukuran file terlalu besar',
      description: 'Maksimal 5 MB per file.',
      actionLabel: 'Pilih File Lain',
    })
    expect(getDocumentUploadValidationUiMessage(DOCUMENT_UPLOAD_INVALID_FILE_MESSAGE)).toEqual({
      title: 'File tidak valid',
      description: 'Pilih file lain dengan format yang didukung.',
      actionLabel: 'Pilih File Lain',
    })
    expect(getDocumentUploadValidationUiMessage(DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE)).toEqual({
      title: 'Gagal mengunggah file',
      description: 'Coba lagi atau pilih file lain.',
      actionLabel: 'Coba Lagi',
    })
  })

  it('rejects unsupported formats, webp, svg, mismatches, empty files, and oversize files', () => {
    expect(validateDocumentUploadClientFileMetadata({
      name: 'vector.svg',
      type: 'image/svg+xml',
      size: 10,
    })).toBe(DOCUMENT_UPLOAD_INVALID_FORMAT_MESSAGE)

    expect(validateDocumentUploadClientFileMetadata({
      name: 'avatar.webp',
      type: 'image/webp',
      size: 10,
    })).toBe(DOCUMENT_UPLOAD_INVALID_FORMAT_MESSAGE)

    expect(validateDocumentUploadClientFileMetadata({
      name: 'script.js',
      type: 'application/javascript',
      size: 10,
    })).toBe(DOCUMENT_UPLOAD_INVALID_FORMAT_MESSAGE)

    expect(validateDocumentUploadClientFileMetadata({
      name: 'report.pdf',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 10,
    })).toBe(DOCUMENT_UPLOAD_INVALID_FORMAT_MESSAGE)

    expect(validateDocumentUploadClientFileMetadata({
      name: 'report.pdf',
      type: 'application/pdf',
      size: 0,
    })).toBe(DOCUMENT_UPLOAD_INVALID_FILE_MESSAGE)

    expect(validateDocumentUploadClientFileMetadata({
      name: 'report.pdf',
      type: 'application/pdf',
      size: DOCUMENT_UPLOAD_MAX_BYTES + 1,
    })).toBe(DOCUMENT_UPLOAD_TOO_LARGE_MESSAGE)
  })

  it('validates feasible signatures without accepting arbitrary binary data', () => {
    expect(matchesDocumentUploadSignature(Buffer.from('%PDF-1.4 test'), 'application/pdf')).toBe(true)
    expect(matchesDocumentUploadSignature(Buffer.from('<html></html>'), 'application/pdf')).toBe(false)
    expect(matchesDocumentUploadSignature(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).toBe(true)
    expect(matchesDocumentUploadSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png')).toBe(true)
    expect(matchesDocumentUploadSignature(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'application/msword')).toBe(true)
    expect(matchesDocumentUploadSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true)
  })

  it('keeps avatar policy separate and stricter', () => {
    expect(PROFILE_AVATAR_MAX_BYTES).toBe(2 * 1024 * 1024)
    expect(PROFILE_AVATAR_ALLOWED_MIME_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ])
    expect(DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES).not.toContain('image/webp')
  })

  it('keeps non-PDF preview copy calm and download-oriented', () => {
    expect(DOCUMENT_PREVIEW_PDF_ONLY_TITLE).toBe('Preview hanya tersedia untuk file PDF.')
    expect(DOCUMENT_PREVIEW_PDF_ONLY_BODY).toBe('Silakan unduh file ini untuk membukanya.')
  })
})
