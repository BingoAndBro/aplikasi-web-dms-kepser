import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { and, asc, desc, eq, type SQL } from 'drizzle-orm'
import { db } from '#/db/client'
import {
  manualArsip,
  manualArsipAttachment,
  manualArsipCategory,
  masterKlasifikasiArsip,
} from '#/db/schema/arsip'
import {
  getLocalServerSession,
  hasLocalRole,
  type LocalServerSession,
} from '#/lib/auth/local-server-auth'
import { ARCHIVE_STATUS } from '#/lib/constants/archive-status'
import { ROLES } from '#/lib/constants/roles'
import type {
  CreateManualArsipInput,
  ListManualArsipQuery,
  ManualArsipSafeMetadata,
} from '#/lib/schemas/manual-arsip'
import {
  createManualArsipAttachmentStorageDescriptors,
  isAllowedManualArsipAttachmentContentType,
  writeManualArsipAttachmentContent,
} from '#/lib/storage/manual-arsip-upload'
import {
  assertSafeLogicalStoragePath,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
} from '#/lib/storage/local-storage-paths'

export const MANUAL_ARSIP_LIST_DEFAULT_LIMIT = 100

export class ManualArsipApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ManualArsipApiError'
  }
}

export type ManualArsipCategoryResponse = {
  id: string
  nama: string
  deskripsi: string | null
}

export type ManualArsipListItemResponse = {
  id: string
  nama: string
  tanggal: string
  keterangan: string
  nominal_realisasi: number | null
  status_arsip: string
  category: ManualArsipCategoryResponse
  klasifikasi: {
    id: string | null
    nama: string | null
    nama_snapshot: string | null
  }
  created_by: string
  created_at: string
  updated_at: string
}

export type ManualArsipDetailResponse = ManualArsipListItemResponse & {
  metadata: ManualArsipSafeMetadata
  attachments: ManualArsipAttachmentResponse[]
}

export type ManualArsipAttachmentResponse = {
  id: string
  judul_lampiran: string
  original_filename: string
  content_type: string
  size_bytes: number
  created_at: string
}

export type ManualArsipAttachmentFilePurpose = 'preview' | 'download'

type CategoryRow = {
  id: string
  nama: string
  deskripsi: string | null
}

type KlasifikasiRow = {
  id: string
  nama: string
}

type ManualArsipAttachmentFileRow = {
  id: string
  judul_lampiran: string
  original_filename: string
  content_type: string
  size_bytes: number
  logical_path: string
}

const FALLBACK_ATTACHMENT_FILENAME = 'lampiran'
const WINDOWS_DRIVE_PATTERN = /^[a-z]:[\\/]/i
const URL_LIKE_PATTERN = /^[a-z][a-z0-9+.-]*:/i

export async function requireManualArsipApiSession(request: Request): Promise<LocalServerSession | Response> {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasLocalRole(session, ROLES.KEPALA_SUB_BAGIAN_UMUM)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  return session
}

export async function listManualArsipCategories(): Promise<ManualArsipCategoryResponse[]> {
  const rows = await db
    .select({
      id: manualArsipCategory.id,
      nama: manualArsipCategory.nama,
      deskripsi: manualArsipCategory.deskripsi,
    })
    .from(manualArsipCategory)
    .where(eq(manualArsipCategory.isActive, true))
    .orderBy(asc(manualArsipCategory.nama))

  return rows
}

export async function createManualArsipRecord(
  input: CreateManualArsipInput,
  createdBy: string,
): Promise<ManualArsipDetailResponse> {
  const category = await findActiveManualArsipCategory(input.category_id)
  if (!category) {
    throw new ManualArsipApiError('Kategori arsip manual tidak ditemukan', 400)
  }

  const klasifikasi = input.klasifikasi_id
    ? await findActiveKlasifikasi(input.klasifikasi_id)
    : null

  if (input.klasifikasi_id && !klasifikasi) {
    throw new ManualArsipApiError('Klasifikasi arsip tidak ditemukan', 400)
  }

  const [created] = await db
    .insert(manualArsip)
    .values({
      nama: input.nama,
      tanggal: input.tanggal,
      keterangan: input.keterangan,
      categoryId: category.id,
      klasifikasiId: klasifikasi?.id ?? null,
      klasifikasiNamaSnapshot: klasifikasi?.nama ?? null,
      nominalRealisasi: normalizeNominalForWrite(input.nominal_realisasi),
      statusArsip: ARCHIVE_STATUS.AKTIF,
      metadata: input.metadata ?? {},
      createdBy,
    })
    .returning({
      id: manualArsip.id,
      nama: manualArsip.nama,
      tanggal: manualArsip.tanggal,
      keterangan: manualArsip.keterangan,
      nominal_realisasi: manualArsip.nominalRealisasi,
      status_arsip: manualArsip.statusArsip,
      category_id: manualArsip.categoryId,
      klasifikasi_id: manualArsip.klasifikasiId,
      klasifikasi_nama_snapshot: manualArsip.klasifikasiNamaSnapshot,
      metadata: manualArsip.metadata,
      created_by: manualArsip.createdBy,
      created_at: manualArsip.createdAt,
      updated_at: manualArsip.updatedAt,
    })

  if (!created) {
    throw new ManualArsipApiError('Gagal membuat arsip manual', 500)
  }

  return {
    ...toManualArsipListItem(created, category, klasifikasi),
    metadata: sanitizeMetadata(created.metadata),
    attachments: [],
  }
}

export async function listManualArsipRecords(
  query: ListManualArsipQuery,
): Promise<ManualArsipListItemResponse[]> {
  const filters: SQL[] = []

  if (query.category_id) filters.push(eq(manualArsip.categoryId, query.category_id))
  if (query.klasifikasi_id) filters.push(eq(manualArsip.klasifikasiId, query.klasifikasi_id))
  if (query.status_arsip) filters.push(eq(manualArsip.statusArsip, query.status_arsip))

  let builder = db
    .select({
      id: manualArsip.id,
      nama: manualArsip.nama,
      tanggal: manualArsip.tanggal,
      keterangan: manualArsip.keterangan,
      nominal_realisasi: manualArsip.nominalRealisasi,
      status_arsip: manualArsip.statusArsip,
      category_id: manualArsip.categoryId,
      category_nama: manualArsipCategory.nama,
      category_deskripsi: manualArsipCategory.deskripsi,
      klasifikasi_id: manualArsip.klasifikasiId,
      klasifikasi_nama: masterKlasifikasiArsip.nama,
      klasifikasi_nama_snapshot: manualArsip.klasifikasiNamaSnapshot,
      created_by: manualArsip.createdBy,
      created_at: manualArsip.createdAt,
      updated_at: manualArsip.updatedAt,
    })
    .from(manualArsip)
    .leftJoin(manualArsipCategory, eq(manualArsip.categoryId, manualArsipCategory.id))
    .leftJoin(masterKlasifikasiArsip, eq(manualArsip.klasifikasiId, masterKlasifikasiArsip.id))

  if (filters.length > 0) {
    builder = builder.where(and(...filters))
  }

  const rows = await builder
    .orderBy(desc(manualArsip.tanggal), desc(manualArsip.updatedAt))
    .limit(query.limit)

  return rows.map((row) => ({
    id: row.id,
    nama: row.nama,
    tanggal: row.tanggal,
    keterangan: row.keterangan,
    nominal_realisasi: normalizeNumericValue(row.nominal_realisasi),
    status_arsip: row.status_arsip,
    category: {
      id: row.category_id,
      nama: row.category_nama ?? '',
      deskripsi: row.category_deskripsi ?? null,
    },
    klasifikasi: {
      id: row.klasifikasi_id,
      nama: row.klasifikasi_nama ?? row.klasifikasi_nama_snapshot,
      nama_snapshot: row.klasifikasi_nama_snapshot,
    },
    created_by: row.created_by,
    created_at: isoDateString(row.created_at),
    updated_at: isoDateString(row.updated_at),
  }))
}

export async function getManualArsipDetail(
  id: string,
): Promise<ManualArsipDetailResponse | null> {
  const [row] = await db
    .select({
      id: manualArsip.id,
      nama: manualArsip.nama,
      tanggal: manualArsip.tanggal,
      keterangan: manualArsip.keterangan,
      nominal_realisasi: manualArsip.nominalRealisasi,
      status_arsip: manualArsip.statusArsip,
      category_id: manualArsip.categoryId,
      category_nama: manualArsipCategory.nama,
      category_deskripsi: manualArsipCategory.deskripsi,
      klasifikasi_id: manualArsip.klasifikasiId,
      klasifikasi_nama: masterKlasifikasiArsip.nama,
      klasifikasi_nama_snapshot: manualArsip.klasifikasiNamaSnapshot,
      metadata: manualArsip.metadata,
      created_by: manualArsip.createdBy,
      created_at: manualArsip.createdAt,
      updated_at: manualArsip.updatedAt,
    })
    .from(manualArsip)
    .leftJoin(manualArsipCategory, eq(manualArsip.categoryId, manualArsipCategory.id))
    .leftJoin(masterKlasifikasiArsip, eq(manualArsip.klasifikasiId, masterKlasifikasiArsip.id))
    .where(eq(manualArsip.id, id))
    .limit(1)

  if (!row) return null

  const attachments = await db
    .select({
      id: manualArsipAttachment.id,
      judul_lampiran: manualArsipAttachment.judulLampiran,
      original_filename: manualArsipAttachment.originalFilename,
      content_type: manualArsipAttachment.contentType,
      size_bytes: manualArsipAttachment.sizeBytes,
      created_at: manualArsipAttachment.createdAt,
    })
    .from(manualArsipAttachment)
    .where(eq(manualArsipAttachment.manualArsipId, id))
    .orderBy(asc(manualArsipAttachment.createdAt))

  return {
    id: row.id,
    nama: row.nama,
    tanggal: row.tanggal,
    keterangan: row.keterangan,
    nominal_realisasi: normalizeNumericValue(row.nominal_realisasi),
    status_arsip: row.status_arsip,
    category: {
      id: row.category_id,
      nama: row.category_nama ?? '',
      deskripsi: row.category_deskripsi ?? null,
    },
    klasifikasi: {
      id: row.klasifikasi_id,
      nama: row.klasifikasi_nama ?? row.klasifikasi_nama_snapshot,
      nama_snapshot: row.klasifikasi_nama_snapshot,
    },
    metadata: sanitizeMetadata(row.metadata),
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      judul_lampiran: attachment.judul_lampiran,
      original_filename: attachment.original_filename,
      content_type: attachment.content_type,
      size_bytes: attachment.size_bytes,
      created_at: isoDateString(attachment.created_at),
    })),
    created_by: row.created_by,
    created_at: isoDateString(row.created_at),
    updated_at: isoDateString(row.updated_at),
  }
}

export async function uploadManualArsipAttachments(
  manualArsipId: string,
  createdBy: string,
  files: File[],
  titles: string[],
): Promise<ManualArsipAttachmentResponse[]> {
  if (titles.length !== files.length) {
    throw new ManualArsipApiError('Jumlah judul lampiran harus sesuai dengan jumlah file', 400)
  }

  if (titles.some((title) => title.trim().length === 0)) {
    throw new ManualArsipApiError('Judul lampiran wajib diisi', 400)
  }

  if (titles.some((title) => title.trim().length > 120)) {
    throw new ManualArsipApiError('Judul lampiran maksimal 120 karakter', 400)
  }

  const normalizedTitles = titles.map((title) => title.trim())

  const [parent] = await db
    .select({
      id: manualArsip.id,
      status_arsip: manualArsip.statusArsip,
    })
    .from(manualArsip)
    .where(eq(manualArsip.id, manualArsipId))
    .limit(1)

  if (!parent) {
    throw new ManualArsipApiError('Arsip manual tidak ditemukan', 404)
  }

  if (parent.status_arsip !== ARCHIVE_STATUS.AKTIF) {
    throw new ManualArsipApiError('Lampiran hanya dapat diunggah untuk arsip manual berstatus AKTIF', 409)
  }

  const descriptors = createManualArsipAttachmentStorageDescriptors({
    files: files.map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
    })),
    manualArsipId,
    ownerUserId: createdBy,
  })

  const contents: ArrayBuffer[] = []
  for (const file of files) {
    try {
      contents.push(await file.arrayBuffer())
    } catch {
      throw new ManualArsipApiError('Gagal membaca file lampiran', 400)
    }
  }

  for (const [index, descriptor] of descriptors.entries()) {
    await writeManualArsipAttachmentContent({
      logicalPath: descriptor.logicalPath,
      content: contents[index],
      expectedBytes: descriptor.sizeBytes,
    })
  }

  const inserted = await db.transaction(async (tx) => tx
    .insert(manualArsipAttachment)
    .values(descriptors.map((descriptor, index) => ({
      manualArsipId,
      logicalPath: descriptor.logicalPath,
      originalFilename: descriptor.originalFilename,
      judulLampiran: normalizedTitles[index],
      contentType: descriptor.contentType,
      sizeBytes: descriptor.sizeBytes,
      createdBy,
      metadata: {},
    })))
    .returning({
      id: manualArsipAttachment.id,
      judul_lampiran: manualArsipAttachment.judulLampiran,
      original_filename: manualArsipAttachment.originalFilename,
      content_type: manualArsipAttachment.contentType,
      size_bytes: manualArsipAttachment.sizeBytes,
      created_at: manualArsipAttachment.createdAt,
    }))

  if (inserted.length !== descriptors.length) {
    throw new ManualArsipApiError('Gagal menyimpan metadata lampiran arsip manual', 500)
  }

  return inserted.map((attachment) => ({
    id: attachment.id,
    judul_lampiran: attachment.judul_lampiran,
    original_filename: attachment.original_filename,
    content_type: attachment.content_type,
    size_bytes: attachment.size_bytes,
    created_at: isoDateString(attachment.created_at),
  }))
}

export async function createManualArsipAttachmentFileResponse({
  manualArsipId,
  attachmentId,
  purpose,
  root,
}: {
  manualArsipId: string
  attachmentId: string
  purpose: ManualArsipAttachmentFilePurpose
  root?: string
}): Promise<Response> {
  const reference = await loadManualArsipAttachmentFileReference(manualArsipId, attachmentId)

  if (!reference) {
    return secureJsonError('Lampiran arsip manual tidak ditemukan', 404)
  }

  if (reference.status_arsip === ARCHIVE_STATUS.DIMUSNAHKAN) {
    return secureJsonError('File lampiran tidak tersedia - arsip telah dimusnahkan', 410)
  }

  const normalizedContentType = reference.attachment.content_type.trim().toLowerCase()
  if (!isAllowedManualArsipAttachmentContentType(normalizedContentType)) {
    return secureJsonError('File lampiran tidak ditemukan', 404)
  }

  let physicalPath: string
  try {
    const logicalPath = assertSafeLogicalStoragePath(reference.attachment.logical_path)
    physicalPath = resolvePhysicalStoragePath(root ?? getLocalStorageRoot(), logicalPath)
  } catch {
    return secureJsonError('File lampiran tidak ditemukan', 404)
  }

  let fileSize: number
  try {
    const fileStat = await stat(physicalPath)
    if (!fileStat.isFile()) {
      return secureJsonError('File lampiran tidak ditemukan', 404)
    }
    fileSize = fileStat.size
  } catch (error) {
    if (isMissingFileError(error)) {
      return secureJsonError('File lampiran tidak ditemukan', 404)
    }

    return secureJsonError('Gagal mengakses file lampiran', 500)
  }

  let fileContent: Buffer
  try {
    fileContent = await readFile(physicalPath)
  } catch {
    return secureJsonError('Gagal mengakses file lampiran', 500)
  }

  const headers = secureFileHeaders()
  headers.set('Content-Type', normalizedContentType)
  headers.set('Content-Disposition', buildManualArsipAttachmentContentDisposition(reference.attachment, purpose))
  headers.set('Content-Length', String(fileContent.byteLength || fileSize))

  return new Response(fileContent, {
    status: 200,
    headers,
  })
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function toSafeErrorLog(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') return { type: typeof error }

  const candidate = error as {
    code?: unknown
    name?: unknown
  }

  return {
    name: typeof candidate.name === 'string' ? candidate.name : undefined,
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
  }
}

async function findActiveManualArsipCategory(id: string): Promise<CategoryRow | null> {
  const [row] = await db
    .select({
      id: manualArsipCategory.id,
      nama: manualArsipCategory.nama,
      deskripsi: manualArsipCategory.deskripsi,
    })
    .from(manualArsipCategory)
    .where(and(
      eq(manualArsipCategory.id, id),
      eq(manualArsipCategory.isActive, true),
    ))
    .limit(1)

  return row ?? null
}

async function findActiveKlasifikasi(id: string): Promise<KlasifikasiRow | null> {
  const [row] = await db
    .select({
      id: masterKlasifikasiArsip.id,
      nama: masterKlasifikasiArsip.nama,
    })
    .from(masterKlasifikasiArsip)
    .where(and(
      eq(masterKlasifikasiArsip.id, id),
      eq(masterKlasifikasiArsip.isActive, true),
    ))
    .limit(1)

  return row ?? null
}

function toManualArsipListItem(
  row: {
    id: string
    nama: string
    tanggal: string
    keterangan: string
    nominal_realisasi: string | number | null
    status_arsip: string
    category_id: string
    klasifikasi_id: string | null
    klasifikasi_nama_snapshot: string | null
    created_by: string
    created_at: Date | string | null
    updated_at: Date | string | null
  },
  category: CategoryRow,
  klasifikasi: KlasifikasiRow | null,
): ManualArsipListItemResponse {
  return {
    id: row.id,
    nama: row.nama,
    tanggal: row.tanggal,
    keterangan: row.keterangan,
    nominal_realisasi: normalizeNumericValue(row.nominal_realisasi),
    status_arsip: row.status_arsip,
    category,
    klasifikasi: {
      id: row.klasifikasi_id,
      nama: klasifikasi?.nama ?? row.klasifikasi_nama_snapshot,
      nama_snapshot: row.klasifikasi_nama_snapshot,
    },
    created_by: row.created_by,
    created_at: isoDateString(row.created_at),
    updated_at: isoDateString(row.updated_at),
  }
}

function normalizeNominalForWrite(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value.toString()
}

function normalizeNumericValue(value: string | number | null): number | null {
  if (value === null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function sanitizeMetadata(value: unknown): ManualArsipSafeMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as ManualArsipSafeMetadata
}

function isoDateString(value: Date | string | null): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return ''
}

async function loadManualArsipAttachmentFileReference(
  manualArsipId: string,
  attachmentId: string,
): Promise<{
  status_arsip: string
  attachment: ManualArsipAttachmentFileRow
} | null> {
  const [parent] = await db
    .select({
      id: manualArsip.id,
      status_arsip: manualArsip.statusArsip,
    })
    .from(manualArsip)
    .where(eq(manualArsip.id, manualArsipId))
    .limit(1)

  if (!parent) return null

  const [attachment] = await db
    .select({
      id: manualArsipAttachment.id,
      judul_lampiran: manualArsipAttachment.judulLampiran,
      original_filename: manualArsipAttachment.originalFilename,
      content_type: manualArsipAttachment.contentType,
      size_bytes: manualArsipAttachment.sizeBytes,
      logical_path: manualArsipAttachment.logicalPath,
    })
    .from(manualArsipAttachment)
    .where(and(
      eq(manualArsipAttachment.id, attachmentId),
      eq(manualArsipAttachment.manualArsipId, manualArsipId),
    ))
    .limit(1)

  if (!attachment) return null

  return {
    status_arsip: parent.status_arsip,
    attachment,
  }
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

function buildManualArsipAttachmentContentDisposition(
  attachment: ManualArsipAttachmentFileRow,
  purpose: ManualArsipAttachmentFilePurpose,
): string {
  const disposition = purpose === 'download' ? 'attachment' : 'inline'
  const filename = resolveAttachmentDisplayFilename(attachment)

  return `${disposition}; filename="${filename}"`
}

function resolveAttachmentDisplayFilename(attachment: ManualArsipAttachmentFileRow): string {
  const originalExtension = safeExtensionFromFilename(attachment.original_filename)
  const titleFilename = sanitizeContentDispositionFilename(attachment.judul_lampiran)

  if (titleFilename) {
    return path.extname(titleFilename) || !originalExtension
      ? titleFilename
      : `${titleFilename}.${originalExtension}`
  }

  return sanitizeContentDispositionFilename(attachment.original_filename)
    ?? (originalExtension ? `${FALLBACK_ATTACHMENT_FILENAME}.${originalExtension}` : FALLBACK_ATTACHMENT_FILENAME)
}

function sanitizeContentDispositionFilename(filename: string): string | null {
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

  const sanitized = trimmed.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim()

  if (
    !sanitized
    || sanitized === '.'
    || sanitized === '..'
    || sanitized.includes('..')
  ) {
    return null
  }

  return sanitized
}

function safeExtensionFromFilename(filename: string): string | null {
  const safeFilename = sanitizeContentDispositionFilename(filename)
  if (!safeFilename) return null

  const extension = path.extname(safeFilename).replace(/^\./, '').toLowerCase()
  return /^[a-z0-9]{1,12}$/.test(extension) ? extension : null
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}
