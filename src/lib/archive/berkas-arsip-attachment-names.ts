import path from 'node:path'

import {
  buildStorageFilename,
  type DokumenRow,
  type LampiranUrl,
} from '#/lib/dokumen'
import { buildManualArsipAttachmentFilename } from '#/lib/archive/manual-arsip-attachment-filename'
import {
  assertSafeLogicalStoragePath,
  getFileExtension,
} from '#/lib/storage/local-storage-paths'

export type SafeBerkasAttachmentName = {
  label: string
  previewTitle: string
  downloadFilename: string
}

export type WorkflowAttachmentNamingDocument = {
  id: string
  judul: string | null
  tanggal: Date | string | null
  is_non_material: boolean | null
  kegiatan_nama: string | null
  jenis_dokumen_nama: string | null
  jenis_permintaan_nama: string | null
  kategori_permintaan_nama: string | null
  detail_permintaan_nama: string | null
}

export type WorkflowAttachmentReference = SafeBerkasAttachmentName & {
  logicalPath: string
  contentType: string | null
}

export type ManualAttachmentNamingRow = {
  judul_lampiran: string | null
  original_filename: string | null
  content_type: string | null
}

export type ManualAttachmentNamingDocument = {
  nama: string | null
  tanggal: Date | string | null
  category_nama: string | null
}

const SAFE_MIME_PATTERN = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/
const WINDOWS_DRIVE_PATTERN = /^[a-z]:[\\/]/i
const URL_LIKE_PATTERN = /^[a-z][a-z0-9+.-]*:/i

export function resolveWorkflowAttachmentReference(
  lampiranUrls: unknown,
  document: WorkflowAttachmentNamingDocument,
  lampiranIndex: number,
): WorkflowAttachmentReference | null {
  const entry = parseWorkflowAttachmentEntries(lampiranUrls)[lampiranIndex]
  if (!isRecord(entry)) return null

  const logicalPath = resolveWorkflowAttachmentLogicalPath(entry)
  if (!logicalPath) return null

  const names = resolveWorkflowAttachmentNamesFromEntry(entry, document, lampiranIndex)

  return {
    ...names,
    logicalPath,
    contentType: firstSafeMimeType(
      entry.mimeType,
      entry.mime_type,
      entry.contentType,
      entry.content_type,
      entry.type,
    ),
  }
}

export function resolveWorkflowAttachmentNames(
  lampiranUrls: unknown,
  document: WorkflowAttachmentNamingDocument,
): SafeBerkasAttachmentName[] {
  return parseWorkflowAttachmentEntries(lampiranUrls)
    .map((entry, index) => isRecord(entry)
      ? resolveWorkflowAttachmentNamesFromEntry(entry, document, index)
      : fallbackWorkflowAttachmentNames(index))
}

export function resolveManualAttachmentNames(
  row: ManualAttachmentNamingRow,
  document: ManualAttachmentNamingDocument,
): SafeBerkasAttachmentName {
  const label = firstSafeAttachmentText(row.judul_lampiran)
    ?? firstSafeFilenameText(row.original_filename)
    ?? 'Lampiran'
  const filename = sanitizeBerkasAttachmentFilename(
    buildManualArsipAttachmentFilename(row, document),
  ) ?? label

  return {
    label,
    previewTitle: filename,
    downloadFilename: filename,
  }
}

export function parseWorkflowAttachmentEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function sanitizeBerkasAttachmentFilename(value: unknown): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''

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
    || hasSensitiveNameText(trimmed)
  ) {
    return null
  }

  const sanitized = trimmed.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim()
  if (!sanitized || sanitized === '.' || sanitized === '..' || sanitized.includes('..')) return null

  return sanitized.slice(0, 180)
}

export function buildBerkasContentDisposition(
  filename: string,
  purpose: 'preview' | 'download',
): string {
  const disposition = purpose === 'download' ? 'attachment' : 'inline'
  const safeFilename = sanitizeBerkasAttachmentFilename(filename) ?? 'lampiran'

  return `${disposition}; filename="${safeFilename}"`
}

function resolveWorkflowAttachmentNamesFromEntry(
  entry: Record<string, unknown>,
  document: WorkflowAttachmentNamingDocument,
  index: number,
): SafeBerkasAttachmentName {
  const label = firstSafeAttachmentText(
    entry.nama,
    entry.displayName,
    entry.display_name,
    entry.judulLampiran,
    entry.judul_lampiran,
    entry.title,
    entry.name,
  ) ?? firstSafeFilenameText(
    entry.fileName,
    entry.file_name,
    entry.filename,
    entry.originalFilename,
    entry.original_filename,
  ) ?? `Lampiran ${index + 1}`

  const sourceFilename = resolveWorkflowSourceFilename(entry, document)
  const filename = sourceFilename ?? resolveFallbackWorkflowFilename(entry, label) ?? label

  return {
    label,
    previewTitle: filename,
    downloadFilename: filename,
  }
}

function resolveWorkflowSourceFilename(
  entry: Record<string, unknown>,
  document: WorkflowAttachmentNamingDocument,
): string | null {
  const sourceLabel = firstSafeAttachmentText(entry.nama)
  if (!sourceLabel) return null

  const lampiran = toLampiranUrl(entry)
  if (!lampiran) return null
  if (!hasBuildableWorkflowDocumentMetadata(document)) return null

  try {
    const filename = buildStorageFilename(toDokumenRow(document), lampiran)
    return sanitizeBerkasAttachmentFilename(filename)
  } catch {
    return null
  }
}

function hasBuildableWorkflowDocumentMetadata(document: WorkflowAttachmentNamingDocument): boolean {
  if (!trimToNull(formatDateLike(document.tanggal))) return false
  if (!trimToNull(document.kegiatan_nama)) return false

  if (document.is_non_material === true) return Boolean(trimToNull(document.jenis_dokumen_nama))

  return Boolean(
    trimToNull(document.detail_permintaan_nama)
      ?? trimToNull(document.kategori_permintaan_nama)
      ?? trimToNull(document.jenis_permintaan_nama),
  )
}

function toLampiranUrl(entry: Record<string, unknown>): LampiranUrl | null {
  const url = typeof entry.url === 'string' ? entry.url.trim() : ''
  if (!url) return null

  try {
    assertSafeLogicalStoragePath(url)
  } catch {
    return null
  }

  return {
    kelengkapan_id: typeof entry.kelengkapan_id === 'string' ? entry.kelengkapan_id : '',
    nama: firstSafeAttachmentText(entry.nama) ?? 'Lampiran',
    url,
    uploaded_at: typeof entry.uploaded_at === 'string' ? entry.uploaded_at : '',
  }
}

function toDokumenRow(document: WorkflowAttachmentNamingDocument): DokumenRow {
  return {
    id: document.id,
    judul: document.judul ?? '',
    fungsi_id: '',
    kegiatan_jenis_id: '',
    is_ketua_tim: false,
    status: '',
    current_step: null,
    revision_target: null,
    revision_notes: null,
    lampiran_urls: [],
    tahun: 0,
    tanggal: formatDateLike(document.tanggal),
    created_by: '',
    nominal_realisasi: null,
    is_non_material: document.is_non_material === true,
    jenis_dokumen_id: null,
    keterangan_detail: null,
    created_at: '',
    updated_at: '',
    kegiatan_nama: document.kegiatan_nama ?? undefined,
    jenis_permintaan_nama: document.jenis_permintaan_nama ?? undefined,
    kategori_permintaan_nama: document.kategori_permintaan_nama ?? undefined,
    detail_permintaan_nama: document.detail_permintaan_nama ?? undefined,
    jenis_dokumen_nama: document.jenis_dokumen_nama ?? undefined,
  }
}

function formatDateLike(value: Date | string | null): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return typeof value === 'string' ? value : ''
}

function fallbackWorkflowAttachmentNames(index: number): SafeBerkasAttachmentName {
  const label = `Lampiran ${index + 1}`

  return {
    label,
    previewTitle: label,
    downloadFilename: label,
  }
}

function withSafeExtension(filename: string, entry: Record<string, unknown>): string | null {
  return appendExtensionFromLogicalPath(filename, resolveWorkflowAttachmentLogicalPath(entry))
}

function appendExtensionFromLogicalPath(filename: string, logicalPath: string | null): string | null {
  const safeFilename = sanitizeBerkasAttachmentFilename(filename)
  if (!safeFilename) return null
  if (path.extname(safeFilename)) return safeFilename
  if (!logicalPath) return safeFilename

  const extension = getFileExtension(logicalPath)
  if (!extension) return safeFilename

  return sanitizeBerkasAttachmentFilename(`${safeFilename}.${extension}`)
}

function resolveFallbackWorkflowFilename(
  entry: Record<string, unknown>,
  label: string,
): string | null {
  return withSafeExtension(
    firstSafeFilenameText(
      entry.fileName,
      entry.file_name,
      entry.filename,
      entry.originalFilename,
      entry.original_filename,
    ) ?? label,
    entry,
  )
}

function resolveWorkflowAttachmentLogicalPath(entry: Record<string, unknown>): string | null {
  const rawPath = entry.url
  if (typeof rawPath !== 'string' || !rawPath.trim()) return null

  try {
    return assertSafeLogicalStoragePath(rawPath)
  } catch {
    return null
  }
}

function firstSafeAttachmentText(...values: unknown[]): string | null {
  for (const value of values) {
    const safeValue = toSafeAttachmentText(value)
    if (safeValue) return safeValue
  }

  return null
}

function firstSafeFilenameText(...values: unknown[]): string | null {
  for (const value of values) {
    const safeValue = sanitizeBerkasAttachmentFilename(value)
    if (safeValue) return safeValue
  }

  return null
}

function firstSafeMimeType(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const normalized = value.trim().toLowerCase()
    if (SAFE_MIME_PATTERN.test(normalized)) return normalized
  }

  return null
}

function toSafeAttachmentText(value: unknown): string | null {
  const trimmed = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (
    !trimmed
    || trimmed.length > 200
    || trimmed.includes('/')
    || trimmed.includes('\\')
    || trimmed.includes('\r')
    || trimmed.includes('\n')
    || trimmed.includes('"')
    || trimmed.includes('..')
    || path.isAbsolute(trimmed)
    || WINDOWS_DRIVE_PATTERN.test(trimmed)
    || URL_LIKE_PATTERN.test(trimmed)
    || hasSensitiveNameText(trimmed)
  ) {
    return null
  }

  return trimmed.slice(0, 180)
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}

function hasSensitiveNameText(value: string): boolean {
  const lower = value.toLowerCase()

  return lower.includes('token')
    || lower.includes('signedurl')
    || lower.includes('signed_url')
    || lower.includes('storage root')
    || lower.includes('storage_root')
    || lower.includes('logical_path')
    || lower.includes('logicalpath')
    || lower.includes('physical_path')
    || lower.includes('physicalpath')
    || lower.includes('database_url')
    || lower.includes('/storage/')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
