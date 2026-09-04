// Server-only module. Do not import from client components.
import { readFile, stat } from 'node:fs/promises'
import { and, asc, eq } from 'drizzle-orm'

import {
  berkasArsip,
  berkasArsipItem,
  manualArsip,
  manualArsipAttachment,
  manualArsipCategory,
} from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  masterDetailPermintaan,
  masterJenisDokumen,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
} from '#/db/schema/master'
import {
  ARCHIVE_SOURCE_TYPE,
  BERKAS_ARCHIVE_STATUS,
  type ArchiveSourceType,
  type BerkasArchiveStatus,
} from '#/lib/constants/archive-status'
import {
  getFileExtension,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
} from '#/lib/storage/local-storage-paths'
import {
  buildBerkasContentDisposition,
  parseWorkflowAttachmentEntries,
  resolveWorkflowAttachmentReference,
  sanitizeBerkasAttachmentFilename,
} from '#/lib/archive/berkas-arsip-attachment-names'
import { buildManualArsipAttachmentFilename } from '#/lib/archive/manual-arsip-attachment-filename'

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
  is_non_material: boolean | null
  kegiatan_nama: string | null
  jenis_dokumen_nama: string | null
  jenis_permintaan_nama: string | null
  kategori_permintaan_nama: string | null
  detail_permintaan_nama: string | null
  lampiran_urls: unknown
}

export type BerkasArsipManualAttachmentRow = {
  id: string
}

export type BerkasArsipManualAttachmentExportRow = {
  logicalPath: string
  judulLampiran: string
  originalFilename: string | null
  contentType: string | null
  manualNama: string | null
  manualTanggal: Date | string | null
  categoryNama: string | null
}

export type BerkasArsipFileAccessRepository = {
  getFolderById(berkasId: string): Promise<BerkasArsipFileAccessFolderRow | null>
  getItemById(berkasId: string, itemId: string): Promise<BerkasArsipFileAccessItemRow | null>
  getWorkflowSourceById(dokumenId: string): Promise<BerkasArsipWorkflowFileSourceRow | null>
  getManualAttachmentByIndex(manualArsipId: string, lampiranIndex: number): Promise<BerkasArsipManualAttachmentRow | null>
  getManualAttachmentsForItem(manualArsipId: string): Promise<BerkasArsipManualAttachmentExportRow[]>
}

export type BerkasArsipItemAttachmentExportRef = {
  logicalPath: string
  namaAman: string
}

export type BerkasArsipItemAttachmentsResult =
  | { ok: true; attachments: BerkasArsipItemAttachmentExportRef[] }
  | { ok: false; status: number; message: string }

export type BerkasArsipFileAccessDeps = {
  repository?: BerkasArsipFileAccessRepository
  root?: string
  manualFileResponse?: (input: {
    manualArsipId: string
    attachmentId: string
    purpose: BerkasArsipFileAccessPurpose
  }) => Promise<Response>
}

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
    return secureJsonError('Data file sudah dimusnahkan', 410)
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

/**
 * Non-HTTP resolver for server-side ZIP export (RP-02/RP-07): returns every
 * attachment of one berkas item as `{ logicalPath, namaAman }`, without
 * reading file contents (streaming/append happens in document-zip.ts).
 */
export async function resolveBerkasArsipItemAttachments(
  berkasId: string,
  itemId: string,
  deps: BerkasArsipFileAccessDeps = {},
): Promise<BerkasArsipItemAttachmentsResult> {
  const repository = deps.repository ?? defaultBerkasArsipFileAccessRepository

  const folder = await repository.getFolderById(berkasId)
  if (!folder) return { ok: false, status: 404, message: 'Berkas tidak ditemukan' }

  if (folder.status_arsip === BERKAS_ARCHIVE_STATUS.DIMUSNAHKAN) {
    return { ok: false, status: 410, message: 'Data file sudah dimusnahkan' }
  }

  const item = await repository.getItemById(berkasId, itemId)
  if (!item || item.berkas_id !== berkasId) {
    return { ok: false, status: 404, message: 'Lampiran berkas tidak ditemukan' }
  }

  if (item.source_type === ARCHIVE_SOURCE_TYPE.WORKFLOW) {
    return resolveWorkflowItemAttachmentsForExport({ repository, item })
  }

  if (item.source_type === ARCHIVE_SOURCE_TYPE.MANUAL) {
    return resolveManualItemAttachmentsForExport({ repository, item })
  }

  return { ok: false, status: 404, message: 'Sumber item tidak ditemukan' }
}

async function resolveWorkflowItemAttachmentsForExport({
  repository,
  item,
}: {
  repository: BerkasArsipFileAccessRepository
  item: BerkasArsipFileAccessItemRow
}): Promise<BerkasArsipItemAttachmentsResult> {
  if (!item.dokumen_id) return { ok: false, status: 404, message: 'Sumber item tidak ditemukan' }

  const source = await repository.getWorkflowSourceById(item.dokumen_id)
  if (!source) return { ok: false, status: 404, message: 'Sumber item tidak ditemukan' }

  const entryCount = parseWorkflowAttachmentEntries(source.lampiran_urls).length
  const attachments: BerkasArsipItemAttachmentExportRef[] = []

  for (let lampiranIndex = 0; lampiranIndex < entryCount; lampiranIndex++) {
    const reference = resolveWorkflowAttachmentReference(source.lampiran_urls, source, lampiranIndex)
    if (reference) {
      attachments.push({ logicalPath: reference.logicalPath, namaAman: reference.downloadFilename })
    }
  }

  return { ok: true, attachments }
}

async function resolveManualItemAttachmentsForExport({
  repository,
  item,
}: {
  repository: BerkasArsipFileAccessRepository
  item: BerkasArsipFileAccessItemRow
}): Promise<BerkasArsipItemAttachmentsResult> {
  if (!item.manual_arsip_id) return { ok: false, status: 404, message: 'Sumber item tidak ditemukan' }

  const rows = await repository.getManualAttachmentsForItem(item.manual_arsip_id)

  return {
    ok: true,
    attachments: rows.map(row => ({
      logicalPath: row.logicalPath,
      namaAman: sanitizeBerkasAttachmentFilename(
        buildManualArsipAttachmentFilename(
          {
            judul_lampiran: row.judulLampiran,
            original_filename: row.originalFilename,
            content_type: row.contentType,
          },
          {
            nama: row.manualNama,
            tanggal: row.manualTanggal,
            category_nama: row.categoryNama,
          },
        ),
      ) ?? row.judulLampiran,
    })),
  }
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

  const reference = resolveWorkflowAttachmentReference(source.lampiran_urls, source, lampiranIndex)
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
  headers.set('Content-Disposition', buildBerkasContentDisposition(reference.downloadFilename, purpose))
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
        is_non_material: dokumenTransaksi.isNonMaterial,
        kegiatan_nama: masterKegiatan.nama,
        jenis_dokumen_nama: masterJenisDokumen.nama,
        jenis_permintaan_nama: masterJenisPermintaan.nama,
        kategori_permintaan_nama: masterKategoriPermintaan.nama,
        detail_permintaan_nama: masterDetailPermintaan.nama,
        lampiran_urls: dokumenTransaksi.lampiranUrls,
      })
      .from(dokumenTransaksi)
      .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
      .leftJoin(masterJenisDokumen, eq(dokumenTransaksi.jenisDokumenId, masterJenisDokumen.id))
      .leftJoin(masterJenisPermintaan, eq(dokumenTransaksi.jenisPermintaanId, masterJenisPermintaan.id))
      .leftJoin(masterKategoriPermintaan, eq(dokumenTransaksi.kategoriPermintaanId, masterKategoriPermintaan.id))
      .leftJoin(masterDetailPermintaan, eq(dokumenTransaksi.detailPermintaanId, masterDetailPermintaan.id))
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

  async getManualAttachmentsForItem(manualArsipId) {
    const database = await getDatabase()
    const rows = await database
      .select({
        logicalPath: manualArsipAttachment.logicalPath,
        judulLampiran: manualArsipAttachment.judulLampiran,
        originalFilename: manualArsipAttachment.originalFilename,
        contentType: manualArsipAttachment.contentType,
        manualNama: manualArsip.nama,
        manualTanggal: manualArsip.tanggal,
        categoryNama: manualArsipCategory.nama,
      })
      .from(manualArsipAttachment)
      .innerJoin(manualArsip, eq(manualArsipAttachment.manualArsipId, manualArsip.id))
      .leftJoin(manualArsipCategory, eq(manualArsip.categoryId, manualArsipCategory.id))
      .where(eq(manualArsipAttachment.manualArsipId, manualArsipId))
      .orderBy(asc(manualArsipAttachment.createdAt), asc(manualArsipAttachment.id)) as BerkasArsipManualAttachmentExportRow[]

    return rows
  },
}

async function getDatabase() {
  const client = await import('#/db/client')
  return client.db
}

function inferContentType(logicalPath: string): string {
  const extension = getFileExtension(logicalPath)

  return CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream'
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
