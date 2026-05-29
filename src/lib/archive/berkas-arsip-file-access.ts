// Server-only module. Do not import from client components.
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { and, asc, eq } from 'drizzle-orm'

import {
  berkasArsip,
  berkasArsipItem,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  ARCHIVE_SOURCE_TYPE,
  BERKAS_ARCHIVE_STATUS,
  type ArchiveSourceType,
  type BerkasArchiveStatus,
} from '#/lib/constants/archive-status'
import {
  assertSafeLogicalStoragePath,
  getFileExtension,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
} from '#/lib/storage/local-storage-paths'

export type BerkasArsipFileAccessPurpose = 'preview' | 'download'

export type BerkasArsipFileAccessFolderRow = {
  id: string
  status_arsip: BerkasArchiveStatus | null
}

export type BerkasArsipFileAccessItemRow = {
  id: string
  berkas_id: string
  source_type: ArchiveSourceType | string
  dokumen_id: string | null
  manual_arsip_id: string | null
}

export type BerkasArsipWorkflowFileSourceRow = {
  id: string
  judul: string | null
  tanggal: Date | string | null
  lampiran_urls: unknown
}

export type BerkasArsipManualAttachmentRow = {
  id: string
}

export type BerkasArsipFileAccessRepository = {
  getFolderById(berkasId: string): Promise<BerkasArsipFileAccessFolderRow | null>
  getItemById(berkasId: string, itemId: string): Promise<BerkasArsipFileAccessItemRow | null>
  getWorkflowSourceById(dokumenId: string): Promise<BerkasArsipWorkflowFileSourceRow | null>
  getManualAttachmentByIndex(manualArsipId: string, lampiranIndex: number): Promise<BerkasArsipManualAttachmentRow | null>
}

export type BerkasArsipFileAccessDeps = {
  repository?: BerkasArsipFileAccessRepository
  root?: string
  manualFileResponse?: (input: {
    manualArsipId: string
    attachmentId: string
    purpose: BerkasArsipFileAccessPurpose
  }) => Promise<Response>
}

type WorkflowAttachmentReference = {
  logicalPath: string
  attachmentName: string
  originalFilename: string | null
  contentType: string | null
}

const SAFE_MIME_PATTERN = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/
const WINDOWS_DRIVE_PATTERN = /^[a-z]:[\\/]/i
const URL_LIKE_PATTERN = /^[a-z][a-z0-9+.-]*:/i
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

export async function createBerkasArsipItemAttachmentFileResponse({
  berkasId,
  itemId,
  lampiranIndex,
  purpose,
}: {
  berkasId: string
  itemId: string
  lampiranIndex: number
  purpose: BerkasArsipFileAccessPurpose
}, deps: BerkasArsipFileAccessDeps = {}): Promise<Response> {
  if (!Number.isSafeInteger(lampiranIndex) || lampiranIndex < 0) {
    return secureJsonError('Lampiran berkas tidak ditemukan', 404)
  }

  const repository = deps.repository ?? defaultBerkasArsipFileAccessRepository
  const folder = await repository.getFolderById(berkasId)
  if (!folder) return secureJsonError('Berkas tidak ditemukan', 404)

  if (folder.status_arsip === BERKAS_ARCHIVE_STATUS.DIMUSNAHKAN) {
    return secureJsonError('Data sudah dimusnahkan', 410)
  }

  const item = await repository.getItemById(berkasId, itemId)
  if (!item || item.berkas_id !== berkasId) {
    return secureJsonError('Lampiran berkas tidak ditemukan', 404)
  }

  if (item.source_type === ARCHIVE_SOURCE_TYPE.WORKFLOW) {
    return createWorkflowItemAttachmentFileResponse({
      repository,
      item,
      lampiranIndex,
      purpose,
      root: deps.root,
    })
  }

  if (item.source_type === ARCHIVE_SOURCE_TYPE.MANUAL) {
    return createManualItemAttachmentFileResponse({
      repository,
      item,
      lampiranIndex,
      purpose,
      manualFileResponse: deps.manualFileResponse,
    })
  }

  return secureJsonError('Sumber item tidak ditemukan', 404)
}

async function createWorkflowItemAttachmentFileResponse({
  repository,
  item,
  lampiranIndex,
  purpose,
  root,
}: {
  repository: BerkasArsipFileAccessRepository
  item: BerkasArsipFileAccessItemRow
  lampiranIndex: number
  purpose: BerkasArsipFileAccessPurpose
  root?: string
}): Promise<Response> {
  if (!item.dokumen_id) return secureJsonError('Sumber item tidak ditemukan', 404)

  const source = await repository.getWorkflowSourceById(item.dokumen_id)
  if (!source) return secureJsonError('Sumber item tidak ditemukan', 404)

  const reference = resolveWorkflowAttachmentReference(source.lampiran_urls, lampiranIndex)
  if (!reference) return secureJsonError('Lampiran berkas tidak ditemukan', 404)

  let physicalPath: string
  try {
    physicalPath = resolvePhysicalStoragePath(root ?? getLocalStorageRoot(), reference.logicalPath)
  } catch {
    return secureJsonError('File berkas tidak ditemukan', 404)
  }

  let fileSize: number
  try {
    const fileStat = await stat(physicalPath)
    if (!fileStat.isFile()) return secureJsonError('File berkas tidak ditemukan', 404)
    fileSize = fileStat.size
  } catch (error) {
    if (isMissingFileError(error)) return secureJsonError('File berkas tidak ditemukan', 404)
    return secureJsonError('Gagal mengakses file berkas', 500)
  }

  let fileContent: Buffer
  try {
    fileContent = await readFile(physicalPath)
  } catch {
    return secureJsonError('Gagal mengakses file berkas', 500)
  }

  const headers = secureFileHeaders()
  headers.set('Content-Type', reference.contentType ?? inferContentType(reference.logicalPath))
  headers.set('Content-Disposition', buildContentDisposition(resolveWorkflowFilename(reference), purpose))
  headers.set('Content-Length', String(fileContent.byteLength || fileSize))

  return new Response(fileContent, {
    status: 200,
    headers,
  })
}

async function createManualItemAttachmentFileResponse({
  repository,
  item,
  lampiranIndex,
  purpose,
  manualFileResponse,
}: {
  repository: BerkasArsipFileAccessRepository
  item: BerkasArsipFileAccessItemRow
  lampiranIndex: number
  purpose: BerkasArsipFileAccessPurpose
  manualFileResponse?: BerkasArsipFileAccessDeps['manualFileResponse']
}): Promise<Response> {
  if (!item.manual_arsip_id) return secureJsonError('Sumber item tidak ditemukan', 404)

  const attachment = await repository.getManualAttachmentByIndex(item.manual_arsip_id, lampiranIndex)
  if (!attachment) return secureJsonError('Lampiran berkas tidak ditemukan', 404)

  const responder = manualFileResponse ?? createDefaultManualFileResponse

  return responder({
    manualArsipId: item.manual_arsip_id,
    attachmentId: attachment.id,
    purpose,
  })
}

async function createDefaultManualFileResponse(input: {
  manualArsipId: string
  attachmentId: string
  purpose: BerkasArsipFileAccessPurpose
}): Promise<Response> {
  const { createManualArsipAttachmentFileResponse } = await import('#/lib/manual-arsip')

  return createManualArsipAttachmentFileResponse(input)
}

const defaultBerkasArsipFileAccessRepository: BerkasArsipFileAccessRepository = {
  async getFolderById(berkasId) {
    const database = await getDatabase()
    const rows = await database
      .select({
        id: berkasArsip.id,
        status_arsip: berkasArsip.statusArsip,
      })
      .from(berkasArsip)
      .where(eq(berkasArsip.id, berkasId))
      .limit(1) as BerkasArsipFileAccessFolderRow[]

    return rows[0] ?? null
  },

  async getItemById(berkasId, itemId) {
    const database = await getDatabase()
    const rows = await database
      .select({
        id: berkasArsipItem.id,
        berkas_id: berkasArsipItem.berkasId,
        source_type: berkasArsipItem.sourceType,
        dokumen_id: berkasArsipItem.dokumenId,
        manual_arsip_id: berkasArsipItem.manualArsipId,
      })
      .from(berkasArsipItem)
      .where(and(
        eq(berkasArsipItem.id, itemId),
        eq(berkasArsipItem.berkasId, berkasId),
      ))
      .limit(1) as BerkasArsipFileAccessItemRow[]

    return rows[0] ?? null
  },

  async getWorkflowSourceById(dokumenId) {
    const database = await getDatabase()
    const rows = await database
      .select({
        id: dokumenTransaksi.id,
        judul: dokumenTransaksi.judul,
        tanggal: dokumenTransaksi.tanggal,
        lampiran_urls: dokumenTransaksi.lampiranUrls,
      })
      .from(dokumenTransaksi)
      .where(eq(dokumenTransaksi.id, dokumenId))
      .limit(1) as BerkasArsipWorkflowFileSourceRow[]

    return rows[0] ?? null
  },

  async getManualAttachmentByIndex(manualArsipId, lampiranIndex) {
    const database = await getDatabase()
    const rows = await database
      .select({
        id: manualArsipAttachment.id,
      })
      .from(manualArsipAttachment)
      .where(eq(manualArsipAttachment.manualArsipId, manualArsipId))
      .orderBy(asc(manualArsipAttachment.createdAt), asc(manualArsipAttachment.id))
      .limit(1)
      .offset(lampiranIndex) as BerkasArsipManualAttachmentRow[]

    return rows[0] ?? null
  },
}

async function getDatabase() {
  const client = await import('#/db/client')
  return client.db
}

function resolveWorkflowAttachmentReference(
  lampiranUrls: unknown,
  lampiranIndex: number,
): WorkflowAttachmentReference | null {
  const entries = parseWorkflowAttachmentEntries(lampiranUrls)
  const entry = entries[lampiranIndex]
  if (!isRecord(entry)) return null

  const logicalPath = resolveWorkflowAttachmentLogicalPath(entry)
  if (!logicalPath) return null

  return {
    logicalPath,
    attachmentName: firstSafeFilenameText(
      entry.nama,
      entry.name,
      entry.title,
      entry.displayName,
      entry.display_name,
    ) ?? `lampiran-${lampiranIndex + 1}`,
    originalFilename: firstSafeFilenameText(
      entry.fileName,
      entry.file_name,
      entry.filename,
      entry.originalFilename,
      entry.original_filename,
    ),
    contentType: firstSafeMimeType(
      entry.mimeType,
      entry.mime_type,
      entry.contentType,
      entry.content_type,
      entry.type,
    ),
  }
}

function parseWorkflowAttachmentEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
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

function resolveWorkflowFilename(reference: WorkflowAttachmentReference): string {
  const extension = getFileExtension(reference.originalFilename ?? reference.logicalPath)
  if (extension && !path.extname(reference.attachmentName)) {
    return `${reference.attachmentName}.${extension}`
  }

  return reference.originalFilename ?? reference.attachmentName
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
  purpose: BerkasArsipFileAccessPurpose,
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
    || path.isAbsolute(trimmed)
    || WINDOWS_DRIVE_PATTERN.test(trimmed)
    || URL_LIKE_PATTERN.test(trimmed)
  ) {
    return null
  }

  const sanitized = trimmed.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim()
  if (!sanitized || sanitized === '.' || sanitized === '..' || sanitized.includes('..')) return null

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
