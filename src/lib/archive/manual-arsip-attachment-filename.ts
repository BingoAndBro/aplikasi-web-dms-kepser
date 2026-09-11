import path from 'node:path'

import { DOCUMENT_UPLOAD_EXTENSIONS_BY_MIME_TYPE } from '#/lib/upload/document-upload-policy'

/**
 * Single source of truth for the formal filename of a MANUAL (KSBU) archive
 * attachment. Used both by the actual download/preview response headers
 * (`manual-arsip.ts`) and by the berkas read-model that powers the
 * preview/list UI (`berkas-arsip-attachment-names.ts`), so the two never
 * drift apart again (see RP-06 in docs/rencana-perubahan.md).
 */

const FALLBACK_ATTACHMENT_TITLE_SEGMENT = 'Lampiran'
const FALLBACK_MANUAL_ARSIP_SEGMENT = 'Arsip'
const FALLBACK_KOMPONEN_SEGMENT = 'Komponen'
const FALLBACK_DATE_SEGMENT = 'Tanggal'
const MAX_FILENAME_LENGTH = 180
const EXTENSIONS_BY_MANUAL_ARSIP_CONTENT_TYPE: Record<string, readonly string[]> =
  DOCUMENT_UPLOAD_EXTENSIONS_BY_MIME_TYPE
const WINDOWS_DRIVE_PATTERN = /^[a-z]:[\\/]/i
const URL_LIKE_PATTERN = /^[a-z][a-z0-9+.-]*:/i
// Unicode combining diacritical marks (U+0300-U+036F), built from code points
// to avoid embedding non-printable characters directly in source.
const COMBINING_DIACRITICS_PATTERN = new RegExp(
  `[${String.fromCodePoint(0x0300)}-${String.fromCodePoint(0x036f)}]`,
  'g',
)

export type ManualArsipAttachmentFilenameAttachment = {
  judul_lampiran: string | null
  original_filename: string | null
  content_type: string | null
}

export type ManualArsipAttachmentFilenameDocument = {
  nama: string | null
  tanggal: string | Date | null
  komponen_nama: string | null
}

export function buildManualArsipAttachmentFilename(
  attachment: ManualArsipAttachmentFilenameAttachment,
  document: ManualArsipAttachmentFilenameDocument,
): string {
  const baseName = [
    sanitizeFilenameSegment(attachment.judul_lampiran, FALLBACK_ATTACHMENT_TITLE_SEGMENT),
    sanitizeFilenameSegment(document.nama, FALLBACK_MANUAL_ARSIP_SEGMENT),
    sanitizeFilenameSegment(document.komponen_nama, FALLBACK_KOMPONEN_SEGMENT),
    sanitizeFilenameSegment(formatManualArsipDateSegment(document.tanggal), FALLBACK_DATE_SEGMENT),
  ].join('_')
  const extension = resolveManualArsipAttachmentExtension(attachment)
  const filename = extension ? `${baseName}.${extension}` : baseName

  return truncateManualArsipAttachmentFilename(filename, extension)
}

function sanitizeFilenameSegment(value: string | null | undefined, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  const withoutDiacritics = trimmed.normalize('NFKD').replace(COMBINING_DIACRITICS_PATTERN, '')
  const sanitized = withoutDiacritics
    .replace(/[\r\n"\\/]/g, '_')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[-_]+|[-_]+$/g, '')

  if (
    !sanitized
    || sanitized === '.'
    || sanitized === '..'
    || sanitized.includes('..')
    || path.isAbsolute(sanitized)
    || WINDOWS_DRIVE_PATTERN.test(sanitized)
    || URL_LIKE_PATTERN.test(sanitized)
  ) {
    return fallback
  }

  return sanitized
}

function formatManualArsipDateSegment(value: string | Date | null): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value !== 'string') return ''

  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/)

  return match?.[1] ?? ''
}

function resolveManualArsipAttachmentExtension(
  attachment: ManualArsipAttachmentFilenameAttachment,
): string | null {
  const normalizedContentType = (attachment.content_type ?? '').trim().toLowerCase()
  const allowedExtensions = EXTENSIONS_BY_MANUAL_ARSIP_CONTENT_TYPE[normalizedContentType] ?? []
  const originalExtension = safeExtensionFromFilename(attachment.original_filename ?? '')

  if (originalExtension && allowedExtensions.includes(originalExtension)) {
    return originalExtension
  }

  return allowedExtensions[0] ?? originalExtension
}

function safeExtensionFromFilename(filename: string): string | null {
  const trimmed = filename.trim()

  if (
    !trimmed
    || trimmed === '.'
    || trimmed === '..'
    || trimmed.includes('/')
    || trimmed.includes('\\')
    || trimmed.includes('\r')
    || trimmed.includes('\n')
    || trimmed.includes('"')
    || trimmed.includes('..')
    || path.isAbsolute(trimmed)
    || WINDOWS_DRIVE_PATTERN.test(trimmed)
    || URL_LIKE_PATTERN.test(trimmed)
  ) {
    return null
  }

  const extension = path.extname(trimmed).replace(/^\./, '').toLowerCase()
  return /^[a-z0-9]{1,12}$/.test(extension) ? extension : null
}

function truncateManualArsipAttachmentFilename(filename: string, extension: string | null): string {
  if (filename.length <= MAX_FILENAME_LENGTH) return filename

  const suffix = extension ? `.${extension}` : ''
  const maxBaseLength = Math.max(
    FALLBACK_ATTACHMENT_TITLE_SEGMENT.length,
    MAX_FILENAME_LENGTH - suffix.length,
  )
  const baseName = suffix ? filename.slice(0, -suffix.length) : filename
  const truncatedBase = baseName
    .slice(0, maxBaseLength)
    .replace(/[-_]+$/g, '')
    || FALLBACK_ATTACHMENT_TITLE_SEGMENT

  return `${truncatedBase}${suffix}`
}
