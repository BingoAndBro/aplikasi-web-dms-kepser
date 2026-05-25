import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { and, eq } from 'drizzle-orm'

import {
  arsip,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  ARCHIVE_SOURCE_TYPE,
  ARCHIVE_STATUS,
  type StatusArsip,
} from '#/lib/constants/archive-status'
import {
  assertSafeLogicalStoragePath,
  getFileExtension,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
} from '#/lib/storage/local-storage-paths'

export type UnifiedArchiveFileActionPurpose = 'preview' | 'download'
export type UnifiedArchiveFileActionResult = Response

export type UnifiedArchiveFileActionDatabase = {
  select(projection: Record<string, unknown>): UnifiedArchiveFileActionSelectFrom
}

type UnifiedArchiveFileActionSelectFrom = {
  from(table: unknown): any
}

type UnifiedArchiveFileActionOptions = {
  archiveId: string
  attachmentRef: string
  purpose: UnifiedArchiveFileActionPurpose
  database?: UnifiedArchiveFileActionDatabase
  root?: string
  manualFileResponse?: (input: {
    manualArsipId: string
    attachmentId: string
    purpose: UnifiedArchiveFileActionPurpose
  }) => Promise<Response>
}

type CanonicalFileActionRow = {
  id: string
  source_type: string | null
  dokumen_id: string | null
  status_arsip: StatusArsip
  lampiran_snapshot: unknown
}

type WorkflowDocumentRow = {
  id: string
  status: string
}

type ManualSourceRow = {
  id: string
  status_arsip: StatusArsip
}

type ManualAttachmentRow = {
  id: string
}

type WorkflowAttachmentReference = {
  logicalPath: string
  contentType: string | null
  filename: string
}

const WORKFLOW_REF_PATTERN = /^workflow-([1-9]\d*)$/
const MANUAL_REF_PATTERN = /^manual-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
const SAFE_MIME_PATTERN = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  bmp: 'image/bmp',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  txt: 'text/plain; charset=utf-8',
  webp: 'image/webp',
}

export async function createUnifiedArchiveAttachmentFileResponse({
  archiveId,
  attachmentRef,
  purpose,
  database,
  root,
  manualFileResponse,
}: UnifiedArchiveFileActionOptions): Promise<UnifiedArchiveFileActionResult> {
  const db = database ?? await loadDefaultDatabase()
  const canonical = await selectCanonicalFileActionRow(db, archiveId)

  if (!canonical) return secureJsonError('Arsip tidak ditemukan', 404)
  if (canonical.status_arsip === ARCHIVE_STATUS.DIMUSNAHKAN) {
    return secureJsonError('File arsip tidak tersedia karena arsip telah dimusnahkan', 410)
  }

  if (canonical.source_type === ARCHIVE_SOURCE_TYPE.WORKFLOW) {
    return createWorkflowArchiveAttachmentFileResponse({
      database: db,
      canonical,
      attachmentRef,
      purpose,
      root,
    })
  }

  if (canonical.source_type === ARCHIVE_SOURCE_TYPE.MANUAL) {
    return createManualArchiveAttachmentFileResponse({
      database: db,
      canonical,
      attachmentRef,
      purpose,
      manualFileResponse,
    })
  }

  return secureJsonError('Lampiran arsip tidak ditemukan', 404)
}

export function isSafeWorkflowAttachmentEntry(value: unknown): boolean {
  return resolveWorkflowAttachmentLogicalPath(value) !== null
}

async function createWorkflowArchiveAttachmentFileResponse({
  database,
  canonical,
  attachmentRef,
  purpose,
  root,
}: {
  database: UnifiedArchiveFileActionDatabase
  canonical: CanonicalFileActionRow
  attachmentRef: string
  purpose: UnifiedArchiveFileActionPurpose
  root?: string
}): Promise<Response> {
  const parsedRef = parseWorkflowAttachmentRef(attachmentRef)
  if (parsedRef === null) return secureJsonError('Lampiran arsip tidak ditemukan', 404)
  if (!canonical.dokumen_id) return secureJsonError('Lampiran arsip tidak ditemukan', 404)

  const document = await selectWorkflowDocument(database, canonical.dokumen_id)
  if (!document || !['COMPLETED', 'ARCHIVED'].includes(document.status)) {
    return secureJsonError('Lampiran arsip tidak ditemukan', 404)
  }

  const reference = resolveWorkflowAttachmentReference(canonical.lampiran_snapshot, parsedRef.index)
  if (!reference) return secureJsonError('Lampiran arsip tidak ditemukan', 404)

  let physicalPath: string
  try {
    physicalPath = resolvePhysicalStoragePath(root ?? getLocalStorageRoot(), reference.logicalPath)
  } catch {
    return secureJsonError('File arsip tidak ditemukan', 404)
  }

  let fileSize: number
  try {
    const fileStat = await stat(physicalPath)
    if (!fileStat.isFile()) return secureJsonError('File arsip tidak ditemukan', 404)
    fileSize = fileStat.size
  } catch (error) {
    if (isMissingFileError(error)) return secureJsonError('File arsip tidak ditemukan', 404)
    return secureJsonError('Gagal mengakses file arsip', 500)
  }

  let fileContent: Buffer
  try {
    fileContent = await readFile(physicalPath)
  } catch {
    return secureJsonError('Gagal mengakses file arsip', 500)
  }

  const headers = secureFileHeaders()
  headers.set('Content-Type', reference.contentType ?? inferContentType(reference.logicalPath))
  headers.set('Content-Disposition', buildContentDisposition(reference.filename, purpose))
  headers.set('Content-Length', String(fileContent.byteLength || fileSize))

  return new Response(fileContent, {
    status: 200,
    headers,
  })
}

async function createManualArchiveAttachmentFileResponse({
  database,
  canonical,
  attachmentRef,
  purpose,
  manualFileResponse,
}: {
  database: UnifiedArchiveFileActionDatabase
  canonical: CanonicalFileActionRow
  attachmentRef: string
  purpose: UnifiedArchiveFileActionPurpose
  manualFileResponse?: ManualArchiveFileResponder
}): Promise<Response> {
  const responder = manualFileResponse ?? createDefaultManualArsipAttachmentFileResponse

  const attachmentId = parseManualAttachmentRef(attachmentRef)
  if (!attachmentId) return secureJsonError('Lampiran arsip tidak ditemukan', 404)

  const source = await selectManualSourceByCanonicalArchive(database, canonical.id)
  if (!source) return secureJsonError('Lampiran arsip tidak ditemukan', 404)
  if (source.status_arsip === ARCHIVE_STATUS.DIMUSNAHKAN) {
    return secureJsonError('File arsip tidak tersedia karena arsip telah dimusnahkan', 410)
  }

  const attachment = await selectManualAttachment(database, source.id, attachmentId)
  if (!attachment) return secureJsonError('Lampiran arsip tidak ditemukan', 404)

  return responder({
    manualArsipId: source.id,
    attachmentId: attachment.id,
    purpose,
  })
}

type ManualArchiveFileResponder = (input: {
  manualArsipId: string
  attachmentId: string
  purpose: UnifiedArchiveFileActionPurpose
}) => Promise<Response>

async function createDefaultManualArsipAttachmentFileResponse(input: {
  manualArsipId: string
  attachmentId: string
  purpose: UnifiedArchiveFileActionPurpose
}): Promise<Response> {
  const { createManualArsipAttachmentFileResponse } = await import('#/lib/manual-arsip')

  return createManualArsipAttachmentFileResponse(input)
}

async function selectCanonicalFileActionRow(
  database: UnifiedArchiveFileActionDatabase,
  archiveId: string,
): Promise<CanonicalFileActionRow | null> {
  const rows = await database
    .select({
      id: arsip.id,
      source_type: arsip.sourceType,
      dokumen_id: arsip.dokumenId,
      status_arsip: arsip.statusArsip,
      lampiran_snapshot: arsip.lampiranSnapshot,
    })
    .from(arsip)
    .where(eq(arsip.id, archiveId))
    .limit(1) as CanonicalFileActionRow[]

  return rows[0] ?? null
}

async function selectWorkflowDocument(
  database: UnifiedArchiveFileActionDatabase,
  dokumenId: string,
): Promise<WorkflowDocumentRow | null> {
  const rows = await database
    .select({
      id: dokumenTransaksi.id,
      status: dokumenTransaksi.status,
    })
    .from(dokumenTransaksi)
    .where(eq(dokumenTransaksi.id, dokumenId))
    .limit(1) as WorkflowDocumentRow[]

  return rows[0] ?? null
}

async function selectManualSourceByCanonicalArchive(
  database: UnifiedArchiveFileActionDatabase,
  archiveId: string,
): Promise<ManualSourceRow | null> {
  const rows = await database
    .select({
      id: manualArsip.id,
      status_arsip: manualArsip.statusArsip,
    })
    .from(manualArsip)
    .where(eq(manualArsip.canonicalArsipId, archiveId))
    .limit(1) as ManualSourceRow[]

  return rows[0] ?? null
}

async function selectManualAttachment(
  database: UnifiedArchiveFileActionDatabase,
  manualArsipId: string,
  attachmentId: string,
): Promise<ManualAttachmentRow | null> {
  const rows = await database
    .select({
      id: manualArsipAttachment.id,
    })
    .from(manualArsipAttachment)
    .where(and(
      eq(manualArsipAttachment.id, attachmentId),
      eq(manualArsipAttachment.manualArsipId, manualArsipId),
    ))
    .limit(1) as ManualAttachmentRow[]

  return rows[0] ?? null
}

function resolveWorkflowAttachmentReference(
  snapshot: unknown,
  index: number,
): WorkflowAttachmentReference | null {
  const entries = parseWorkflowAttachmentSnapshot(snapshot)
  const entry = entries[index - 1]
  if (!isRecord(entry)) return null

  const logicalPath = resolveWorkflowAttachmentLogicalPath(entry)
  if (!logicalPath) return null

  return {
    logicalPath,
    contentType: firstSafeMimeType(
      entry.mimeType,
      entry.mime_type,
      entry.contentType,
      entry.content_type,
      entry.type,
    ),
    filename: resolveWorkflowAttachmentFilename(entry, index, logicalPath),
  }
}

function resolveWorkflowAttachmentLogicalPath(entry: unknown): string | null {
  if (!isRecord(entry)) return null

  const rawPath = entry.url
  if (typeof rawPath !== 'string' || !rawPath.trim()) return null

  try {
    return assertSafeLogicalStoragePath(rawPath)
  } catch {
    return null
  }
}

function parseWorkflowAttachmentSnapshot(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function resolveWorkflowAttachmentFilename(
  entry: Record<string, unknown>,
  index: number,
  logicalPath: string,
): string {
  const base = firstSafeFilenameText(
    entry.displayName,
    entry.display_name,
    entry.judulLampiran,
    entry.judul_lampiran,
    entry.title,
    entry.nama,
    entry.name,
    entry.fileName,
    entry.file_name,
    entry.filename,
    entry.originalFilename,
    entry.original_filename,
  ) ?? `lampiran-${index}`
  const logicalExtension = getFileExtension(logicalPath)

  if (!logicalExtension || path.extname(base)) return base

  return `${base}.${logicalExtension}`
}

function parseWorkflowAttachmentRef(value: string): { index: number } | null {
  const match = value.match(WORKFLOW_REF_PATTERN)
  if (!match) return null

  const index = Number(match[1])
  return Number.isSafeInteger(index) ? { index } : null
}

function parseManualAttachmentRef(value: string): string | null {
  return value.match(MANUAL_REF_PATTERN)?.[1] ?? null
}

function firstSafeMimeType(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue

    const normalized = value.trim().toLowerCase()
    if (SAFE_MIME_PATTERN.test(normalized)) return normalized
  }

  return null
}

function firstSafeFilenameText(...values: unknown[]): string | null {
  for (const value of values) {
    const sanitized = sanitizeContentDispositionFilename(value)
    if (sanitized) return sanitized
  }

  return null
}

function buildContentDisposition(
  filename: string,
  purpose: UnifiedArchiveFileActionPurpose,
): string {
  const disposition = purpose === 'download' ? 'attachment' : 'inline'
  const safeFilename = sanitizeContentDispositionFilename(filename) ?? 'lampiran'

  return `${disposition}; filename="${safeFilename}"`
}

function inferContentType(logicalPath: string): string {
  const extension = getFileExtension(logicalPath)

  return CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream'
}

function sanitizeContentDispositionFilename(value: unknown): string | null {
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
    || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    || /^[a-z]:[\\/]/i.test(trimmed)
    || path.isAbsolute(trimmed)
  ) {
    return null
  }

  const sanitized = trimmed.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim()

  if (!sanitized || sanitized === '.' || sanitized === '..' || sanitized.includes('..')) {
    return null
  }

  return sanitized.slice(0, 180)
}

function secureJsonError(message: string, status: number): Response {
  return Response.json({ error: message }, {
    status,
    headers: secureFileHeaders(),
  })
}

function secureFileHeaders(): Headers {
  return new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function loadDefaultDatabase(): Promise<UnifiedArchiveFileActionDatabase> {
  const { db } = await import('#/db/client')

  return db as unknown as UnifiedArchiveFileActionDatabase
}
