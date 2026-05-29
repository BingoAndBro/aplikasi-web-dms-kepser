import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { and, asc, desc, eq, isNull, sql, type SQL } from 'drizzle-orm'
import { db } from '#/db/client'
import {
  arsip,
  berkasArsip,
  berkasArsipItem,
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
import {
  ARCHIVE_SOURCE_TYPE,
  ARCHIVE_STATUS,
  BERKAS_STATUS,
} from '#/lib/constants/archive-status'
import { ROLES } from '#/lib/constants/roles'
import {
  addManualDocumentToOpenBerkas,
  BerkasArsipServiceError,
  getOrCreateOpenBerkasForKlasifikasi,
  type BerkasArsipRepository,
} from '#/lib/archive/berkas-arsip-service'
import {
  buildManualArchiveCanonicalUpdateValues,
  createManualArchiveCanonicalWritePlan,
} from '#/lib/archive/manual-archive-canonical'
import { calculateManualArchiveRetentionDates } from '#/lib/archive/retention'
import type {
  CreateManualArsipInput,
  ListManualArsipQuery,
  ManualArsipSafeMetadata,
} from '#/lib/schemas/manual-arsip'
import { updateManualArsipSchema } from '#/lib/schemas/manual-arsip'
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

export type ManualArsipUpdateResponse = ManualArsipListItemResponse & {
  metadata: ManualArsipSafeMetadata
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
  kode: string | null
}

type ManualArsipAttachmentFileRow = {
  id: string
  judul_lampiran: string
  original_filename: string
  content_type: string
  size_bytes: number
  logical_path: string
}

type ManualArsipAttachmentFileReference = {
  id: string
  nama: string
  tanggal: string | Date | null
  status_arsip: string
  category_nama: string | null
  attachment: ManualArsipAttachmentFileRow
}

type ManualArsipPatchUpdateValues = {
  nama: string
  tanggal: string
  nomorSurat: string | null
  tanggalDiarsipkan: string | null
  keterangan: string
  categoryId: string
  klasifikasiId: string
  klasifikasiKodeSnapshot: string | null
  klasifikasiNamaSnapshot: string
  retensiAktif: string | null
  retensiInaktif: string | null
  masaAktifBerakhir: string | null
  masaInaktifBerakhir: string | null
  nominalRealisasi: string | null
  metadata: ManualArsipSafeMetadata
  updatedAt: Date
}

type ManualArsipPatchUpdatedRow = {
  id: string
  nama: string
  tanggal: string
  nomor_surat: string | null
  tanggal_diarsipkan: string | null
  keterangan: string
  nominal_realisasi: string | number | null
  status_arsip: string
  category_id: string
  klasifikasi_id: string | null
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string | null
  retensi_aktif: string | null
  retensi_inaktif: string | null
  masa_aktif_berakhir: string | null
  masa_inaktif_berakhir: string | null
  archived_by: string | null
  canonical_arsip_id: string | null
  metadata: unknown
  created_by: string
  created_at: Date | string | null
  updated_at: Date | string | null
}

type ManualArsipTransaction = Pick<typeof db, 'select' | 'insert' | 'update'>

const FALLBACK_ATTACHMENT_TITLE_SEGMENT = 'Lampiran'
const FALLBACK_MANUAL_ARSIP_SEGMENT = 'Arsip'
const FALLBACK_CATEGORY_SEGMENT = 'Kategori'
const FALLBACK_DATE_SEGMENT = 'Tanggal'
const MAX_CONTENT_DISPOSITION_FILENAME_LENGTH = 180
const EXTENSIONS_BY_MANUAL_ARSIP_CONTENT_TYPE: Record<string, readonly string[]> = {
  'application/pdf': ['pdf'],
  'image/bmp': ['bmp'],
  'image/gif': ['gif'],
  'image/heic': ['heic'],
  'image/heif': ['heif'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/jpg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/tiff': ['tif', 'tiff'],
  'image/webp': ['webp'],
}
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
    throw new ManualArsipApiError('Kategori dokumen tidak ditemukan', 400)
  }

  const klasifikasi = await findActiveKlasifikasi(input.klasifikasi_id)
  if (!klasifikasi) {
    throw new ManualArsipApiError('Jenis pembayaran tidak ditemukan', 400)
  }

  const retentionDates = getManualArchiveRetentionDates(input)

  const created = await db.transaction(async (tx) => {
      const [source] = await tx
        .insert(manualArsip)
        .values({
          nama: input.nama,
          tanggal: input.tanggal,
          nomorSurat: input.nomor_surat,
          tanggalDiarsipkan: input.tanggal_diarsipkan,
          keterangan: input.keterangan,
          categoryId: category.id,
          klasifikasiId: klasifikasi.id,
          klasifikasiKodeSnapshot: klasifikasi.kode,
          klasifikasiNamaSnapshot: klasifikasi.nama,
          retensiAktif: input.retensi_aktif,
          retensiInaktif: input.retensi_inaktif,
          masaAktifBerakhir: retentionDates.masaAktifBerakhir,
          masaInaktifBerakhir: retentionDates.masaInaktifBerakhir,
          nominalRealisasi: normalizeNominalForWrite(input.nominal_realisasi),
          statusArsip: ARCHIVE_STATUS.AKTIF,
          metadata: input.metadata ?? {},
          createdBy,
          archivedBy: input.tanggal_diarsipkan ? createdBy : null,
          canonicalArsipId: null,
        })
        .returning({
          id: manualArsip.id,
          nama: manualArsip.nama,
          tanggal: manualArsip.tanggal,
          nomor_surat: manualArsip.nomorSurat,
          tanggal_diarsipkan: manualArsip.tanggalDiarsipkan,
          keterangan: manualArsip.keterangan,
          nominal_realisasi: manualArsip.nominalRealisasi,
          status_arsip: manualArsip.statusArsip,
          category_id: manualArsip.categoryId,
          klasifikasi_id: manualArsip.klasifikasiId,
          klasifikasi_kode_snapshot: manualArsip.klasifikasiKodeSnapshot,
          klasifikasi_nama_snapshot: manualArsip.klasifikasiNamaSnapshot,
          retensi_aktif: manualArsip.retensiAktif,
          retensi_inaktif: manualArsip.retensiInaktif,
          masa_aktif_berakhir: manualArsip.masaAktifBerakhir,
          masa_inaktif_berakhir: manualArsip.masaInaktifBerakhir,
          archived_by: manualArsip.archivedBy,
          canonical_arsip_id: manualArsip.canonicalArsipId,
          metadata: manualArsip.metadata,
          created_by: manualArsip.createdBy,
          created_at: manualArsip.createdAt,
          updated_at: manualArsip.updatedAt,
        })

      if (!source) {
        throw new Error('MANUAL_ARCHIVE_SOURCE_CREATE_FAILED')
      }

      const plan = createManualArchiveCanonicalWritePlan({
        id: source.id,
        canonicalArsipId: source.canonical_arsip_id,
        nama: source.nama,
        nomorSurat: source.nomor_surat,
        tanggalDiarsipkan: source.tanggal_diarsipkan,
        klasifikasiId: source.klasifikasi_id,
        klasifikasiKodeSnapshot: source.klasifikasi_kode_snapshot,
        klasifikasiNamaSnapshot: source.klasifikasi_nama_snapshot,
        retensiAktif: source.retensi_aktif,
        retensiInaktif: source.retensi_inaktif,
        masaAktifBerakhir: source.masa_aktif_berakhir,
        masaInaktifBerakhir: source.masa_inaktif_berakhir,
        archivedBy: source.archived_by,
        createdBy: source.created_by,
        nominalRealisasi: source.nominal_realisasi,
        statusArsip: source.status_arsip,
      })

      if (plan.action !== 'create') {
        throw new Error('MANUAL_ARCHIVE_CANONICAL_PLAN_NOT_CREATE')
      }

      const [canonical] = await tx
        .insert(arsip)
        .values(plan.insertValues)
        .returning({
          id: arsip.id,
        })

      if (!canonical) {
        throw new Error('MANUAL_ARCHIVE_CANONICAL_CREATE_FAILED')
      }

      const [linked] = await tx
        .update(manualArsip)
        .set({
          canonicalArsipId: canonical.id,
        })
        .where(and(
          eq(manualArsip.id, source.id),
          isNull(manualArsip.canonicalArsipId),
        ))
        .returning({
          id: manualArsip.id,
          canonical_arsip_id: manualArsip.canonicalArsipId,
        })

      if (!linked?.canonical_arsip_id) {
        throw new Error('MANUAL_ARCHIVE_CANONICAL_LINK_FAILED')
      }

      const berkasRepository = createManualArchiveBerkasRepository(tx)
      const openBerkas = await getOrCreateOpenBerkasForKlasifikasi({
        klasifikasiId: klasifikasi.id,
        actorUserId: createdBy,
      }, { repository: berkasRepository })

      await addManualDocumentToOpenBerkas({
        berkasId: openBerkas.id,
        manualArsipId: source.id,
        actorUserId: createdBy,
      }, { repository: berkasRepository })

      return source
  }).catch((error) => {
    if (error instanceof BerkasArsipServiceError) {
      throw new ManualArsipApiError(error.message, statusForBerkasServiceError(error))
    }

    throw error
  })

  if (!created) {
    throw new ManualArsipApiError('Gagal membuat dokumen manual', 500)
  }

  return {
    ...toManualArsipListItem(created, category, klasifikasi),
    metadata: sanitizeMetadata(created.metadata),
    attachments: [],
  }
}

function createManualArchiveBerkasRepository(
  tx: ManualArsipTransaction,
): BerkasArsipRepository {
  return {
    async findActiveKlasifikasi(id) {
      const [row] = await tx
        .select({
          id: masterKlasifikasiArsip.id,
          kode: masterKlasifikasiArsip.kode,
          nama: masterKlasifikasiArsip.nama,
        })
        .from(masterKlasifikasiArsip)
        .where(and(
          eq(masterKlasifikasiArsip.id, id),
          eq(masterKlasifikasiArsip.isActive, true),
        ))
        .limit(1)

      return row ?? null
    },

    async findOpenBerkasByKlasifikasiId(klasifikasiId) {
      const [row] = await tx
        .select()
        .from(berkasArsip)
        .where(and(
          eq(berkasArsip.klasifikasiId, klasifikasiId),
          eq(berkasArsip.statusBerkas, BERKAS_STATUS.OPEN),
        ))
        .limit(1)

      return row ?? null
    },

    async insertOpenBerkas(input) {
      const [row] = await tx
        .insert(berkasArsip)
        .values({
          klasifikasiId: input.klasifikasi.id,
          klasifikasiKodeSnapshot: input.klasifikasi.kode,
          klasifikasiNamaSnapshot: input.klasifikasi.nama,
          statusBerkas: BERKAS_STATUS.OPEN,
          createdBy: input.actorUserId,
        })
        .returning()

      if (!row) throw new Error('BERKAS_OPEN_CREATE_FAILED')
      return row
    },

    async findBerkasById(id) {
      const [row] = await tx
        .select()
        .from(berkasArsip)
        .where(eq(berkasArsip.id, id))
        .limit(1)

      return row ?? null
    },

    async findWorkflowSource() {
      throw new Error('WORKFLOW_SOURCE_NOT_SUPPORTED_IN_MANUAL_ARCHIVE_CREATE')
    },

    async findManualSource(manualArsipId) {
      const [row] = await tx
        .select({
          id: manualArsip.id,
          canonicalArsipId: manualArsip.canonicalArsipId,
          klasifikasiId: manualArsip.klasifikasiId,
        })
        .from(manualArsip)
        .where(eq(manualArsip.id, manualArsipId))
        .limit(1)

      return row ?? null
    },

    async insertBerkasItem(input) {
      const [row] = await tx
        .insert(berkasArsipItem)
        .values({
          berkasId: input.berkasId,
          sourceType: input.sourceType,
          dokumenId: input.dokumenId,
          manualArsipId: input.manualArsipId,
          canonicalArsipId: input.canonicalArsipId,
          addedBy: input.actorUserId,
        })
        .returning()

      if (!row) throw new Error('BERKAS_ITEM_CREATE_FAILED')
      return row
    },

    async countBerkasItems(berkasId) {
      const [row] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(berkasArsipItem)
        .where(eq(berkasArsipItem.berkasId, berkasId))

      return Number(row?.count ?? 0)
    },

    async closeOpenBerkas(input) {
      const [row] = await tx
        .update(berkasArsip)
        .set({
          statusBerkas: BERKAS_STATUS.CLOSED,
          nomorSpm: input.plan.nomorSpm,
          retensiAktif: input.plan.retensiAktif,
          retensiInaktif: input.plan.retensiInaktif,
          masaAktifBerakhir: input.plan.masaAktifBerakhir,
          masaInaktifBerakhir: input.plan.masaInaktifBerakhir,
          closedAt: input.plan.closedAt,
          closedBy: input.actorUserId,
          updatedAt: new Date(),
        })
        .where(and(
          eq(berkasArsip.id, input.berkasId),
          eq(berkasArsip.statusBerkas, BERKAS_STATUS.OPEN),
        ))
        .returning()

      return row ?? null
    },
  }
}

function statusForBerkasServiceError(error: BerkasArsipServiceError): number {
  switch (error.code) {
    case 'KLASIFIKASI_NOT_FOUND':
    case 'SOURCE_KLASIFIKASI_MISMATCH':
    case 'INVALID_CLOSE_METADATA':
      return 400
    case 'BERKAS_NOT_FOUND':
    case 'SOURCE_NOT_FOUND':
      return 404
    case 'BERKAS_CLOSED':
    case 'BERKAS_NOT_OPEN':
    case 'BERKAS_EMPTY':
    case 'CONFLICT':
      return 409
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

export async function updateManualArsipRecord(
  id: string,
  rawInput: unknown,
): Promise<ManualArsipUpdateResponse> {
  const [existing] = await db
    .select({
      id: manualArsip.id,
      status_arsip: manualArsip.statusArsip,
      canonical_arsip_id: manualArsip.canonicalArsipId,
    })
    .from(manualArsip)
    .where(eq(manualArsip.id, id))
    .limit(1)

  if (!existing) {
    throw new ManualArsipApiError('Dokumen manual tidak ditemukan', 404)
  }

  if (existing.status_arsip !== ARCHIVE_STATUS.AKTIF) {
    throw new ManualArsipApiError('Dokumen manual hanya dapat diedit saat status AKTIF', 409)
  }

  const parsed = updateManualArsipSchema.safeParse(rawInput)
  if (!parsed.success) {
    throw new ManualArsipApiError(parsed.error.issues[0].message, 400)
  }

  const input = parsed.data
  const category = await findActiveManualArsipCategory(input.category_id)
  if (!category) {
    throw new ManualArsipApiError('Kategori dokumen tidak ditemukan', 400)
  }

  const klasifikasi = await findActiveKlasifikasi(input.klasifikasi_id)
  if (!klasifikasi) {
    throw new ManualArsipApiError('Jenis pembayaran tidak ditemukan', 400)
  }

  const retentionDates = getManualArchiveRetentionDates(input)

  const updateValues: ManualArsipPatchUpdateValues = {
    nama: input.nama,
    tanggal: input.tanggal,
    nomorSurat: input.nomor_surat,
    tanggalDiarsipkan: input.tanggal_diarsipkan,
    keterangan: input.keterangan,
    categoryId: category.id,
    klasifikasiId: klasifikasi.id,
    klasifikasiKodeSnapshot: klasifikasi.kode,
    klasifikasiNamaSnapshot: klasifikasi.nama,
    retensiAktif: input.retensi_aktif,
    retensiInaktif: input.retensi_inaktif,
    masaAktifBerakhir: retentionDates.masaAktifBerakhir,
    masaInaktifBerakhir: retentionDates.masaInaktifBerakhir,
    nominalRealisasi: normalizeNominalForWrite(input.nominal_realisasi),
    metadata: input.metadata ?? {},
    updatedAt: new Date(),
  }

  const updated = existing.canonical_arsip_id
    ? await updateLinkedManualArsipRecord({
      id,
      canonicalArsipId: existing.canonical_arsip_id,
      updateValues,
    })
    : await updateUnlinkedManualArsipRecord({
      id,
      updateValues,
    })

  if (!updated) {
    throw new ManualArsipApiError('Dokumen manual hanya dapat diedit saat status AKTIF', 409)
  }

  return {
    ...toManualArsipListItem(updated, category, klasifikasi),
    metadata: sanitizeMetadata(updated.metadata),
  }
}

async function updateUnlinkedManualArsipRecord({
  id,
  updateValues,
}: {
  id: string
  updateValues: ManualArsipPatchUpdateValues
}): Promise<ManualArsipPatchUpdatedRow | null> {
  const [updated] = await db
    .update(manualArsip)
    .set(updateValues)
    .where(and(
      eq(manualArsip.id, id),
      eq(manualArsip.statusArsip, ARCHIVE_STATUS.AKTIF),
    ))
    .returning({
      id: manualArsip.id,
      nama: manualArsip.nama,
      tanggal: manualArsip.tanggal,
      nomor_surat: manualArsip.nomorSurat,
      tanggal_diarsipkan: manualArsip.tanggalDiarsipkan,
      keterangan: manualArsip.keterangan,
      nominal_realisasi: manualArsip.nominalRealisasi,
      status_arsip: manualArsip.statusArsip,
      category_id: manualArsip.categoryId,
      klasifikasi_id: manualArsip.klasifikasiId,
      klasifikasi_kode_snapshot: manualArsip.klasifikasiKodeSnapshot,
      klasifikasi_nama_snapshot: manualArsip.klasifikasiNamaSnapshot,
      retensi_aktif: manualArsip.retensiAktif,
      retensi_inaktif: manualArsip.retensiInaktif,
      masa_aktif_berakhir: manualArsip.masaAktifBerakhir,
      masa_inaktif_berakhir: manualArsip.masaInaktifBerakhir,
      archived_by: manualArsip.archivedBy,
      canonical_arsip_id: manualArsip.canonicalArsipId,
      metadata: manualArsip.metadata,
      created_by: manualArsip.createdBy,
      created_at: manualArsip.createdAt,
      updated_at: manualArsip.updatedAt,
    })

  return updated ?? null
}

async function updateLinkedManualArsipRecord({
  id,
  canonicalArsipId,
  updateValues,
}: {
  id: string
  canonicalArsipId: string
  updateValues: ManualArsipPatchUpdateValues
}): Promise<ManualArsipPatchUpdatedRow | null> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(manualArsip)
      .set(updateValues)
      .where(and(
        eq(manualArsip.id, id),
        eq(manualArsip.statusArsip, ARCHIVE_STATUS.AKTIF),
      ))
      .returning({
        id: manualArsip.id,
        nama: manualArsip.nama,
        tanggal: manualArsip.tanggal,
        nomor_surat: manualArsip.nomorSurat,
        tanggal_diarsipkan: manualArsip.tanggalDiarsipkan,
        keterangan: manualArsip.keterangan,
        nominal_realisasi: manualArsip.nominalRealisasi,
        status_arsip: manualArsip.statusArsip,
        category_id: manualArsip.categoryId,
        klasifikasi_id: manualArsip.klasifikasiId,
        klasifikasi_kode_snapshot: manualArsip.klasifikasiKodeSnapshot,
        klasifikasi_nama_snapshot: manualArsip.klasifikasiNamaSnapshot,
        retensi_aktif: manualArsip.retensiAktif,
        retensi_inaktif: manualArsip.retensiInaktif,
        masa_aktif_berakhir: manualArsip.masaAktifBerakhir,
        masa_inaktif_berakhir: manualArsip.masaInaktifBerakhir,
        archived_by: manualArsip.archivedBy,
        canonical_arsip_id: manualArsip.canonicalArsipId,
        metadata: manualArsip.metadata,
        created_by: manualArsip.createdBy,
        created_at: manualArsip.createdAt,
        updated_at: manualArsip.updatedAt,
      })

    if (!updated) return null

    const [canonical] = await tx
      .update(arsip)
      .set({
        ...buildManualArchiveCanonicalUpdateValues({
          id: updated.id,
          canonicalArsipId: updated.canonical_arsip_id,
          nama: updated.nama,
          nomorSurat: updated.nomor_surat,
          tanggalDiarsipkan: updated.tanggal_diarsipkan,
          klasifikasiId: updated.klasifikasi_id,
          klasifikasiKodeSnapshot: updated.klasifikasi_kode_snapshot,
          klasifikasiNamaSnapshot: updated.klasifikasi_nama_snapshot,
          retensiAktif: updated.retensi_aktif,
          retensiInaktif: updated.retensi_inaktif,
          masaAktifBerakhir: updated.masa_aktif_berakhir,
          masaInaktifBerakhir: updated.masa_inaktif_berakhir,
          archivedBy: updated.archived_by,
          createdBy: updated.created_by,
          nominalRealisasi: updated.nominal_realisasi,
          statusArsip: updated.status_arsip,
        }),
        updatedAt: new Date(),
      })
      .where(and(
        eq(arsip.id, canonicalArsipId),
        eq(arsip.sourceType, ARCHIVE_SOURCE_TYPE.MANUAL),
      ))
      .returning({
        id: arsip.id,
      })

    if (!canonical) {
      throw new Error('MANUAL_ARCHIVE_CANONICAL_UPDATE_FAILED')
    }

    return updated
  })
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
    throw new ManualArsipApiError('Dokumen manual tidak ditemukan', 404)
  }

  if (parent.status_arsip !== ARCHIVE_STATUS.AKTIF) {
    throw new ManualArsipApiError('Lampiran hanya dapat diunggah untuk dokumen manual berstatus AKTIF', 409)
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
    throw new ManualArsipApiError('Gagal menyimpan metadata lampiran dokumen manual', 500)
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
    return secureJsonError('Lampiran dokumen manual tidak ditemukan', 404)
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
  headers.set('Content-Disposition', buildManualArsipAttachmentContentDisposition(reference, purpose))
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
      kode: masterKlasifikasiArsip.kode,
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

function getManualArchiveRetentionDates(input: Pick<
  CreateManualArsipInput,
  'tanggal_diarsipkan' | 'retensi_aktif' | 'retensi_inaktif'
>): {
  masaAktifBerakhir: string | null
  masaInaktifBerakhir: string | null
} {
  if (!input.tanggal_diarsipkan || !input.retensi_aktif || !input.retensi_inaktif) {
    return {
      masaAktifBerakhir: null,
      masaInaktifBerakhir: null,
    }
  }

  return calculateManualArchiveRetentionDates({
    tanggalDiarsipkan: input.tanggal_diarsipkan,
    retensiAktif: input.retensi_aktif,
    retensiInaktif: input.retensi_inaktif,
  })
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
): Promise<ManualArsipAttachmentFileReference | null> {
  const [parent] = await db
    .select({
      id: manualArsip.id,
      nama: manualArsip.nama,
      tanggal: manualArsip.tanggal,
      status_arsip: manualArsip.statusArsip,
      category_nama: manualArsipCategory.nama,
    })
    .from(manualArsip)
    .leftJoin(manualArsipCategory, eq(manualArsip.categoryId, manualArsipCategory.id))
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
    id: parent.id,
    nama: parent.nama,
    tanggal: parent.tanggal,
    status_arsip: parent.status_arsip,
    category_nama: parent.category_nama ?? null,
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
  reference: ManualArsipAttachmentFileReference,
  purpose: ManualArsipAttachmentFilePurpose,
): string {
  const disposition = purpose === 'download' ? 'attachment' : 'inline'
  const filename = resolveManualArsipAttachmentPolicyFilename(reference)

  return `${disposition}; filename="${filename}"`
}

function resolveManualArsipAttachmentPolicyFilename(
  reference: ManualArsipAttachmentFileReference,
): string {
  const baseName = [
    sanitizeFilenameSegment(reference.attachment.judul_lampiran, FALLBACK_ATTACHMENT_TITLE_SEGMENT),
    sanitizeFilenameSegment(reference.nama, FALLBACK_MANUAL_ARSIP_SEGMENT),
    sanitizeFilenameSegment(reference.category_nama, FALLBACK_CATEGORY_SEGMENT),
    sanitizeFilenameSegment(formatManualArsipDateSegment(reference.tanggal), FALLBACK_DATE_SEGMENT),
  ].join('_')
  const extension = resolveManualArsipAttachmentExtension(reference.attachment)
  const filename = extension ? `${baseName}.${extension}` : baseName

  return truncateContentDispositionFilename(filename, extension)
}

function sanitizeFilenameSegment(value: string | null | undefined, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  const withoutDiacritics = trimmed.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
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

function resolveManualArsipAttachmentExtension(attachment: ManualArsipAttachmentFileRow): string | null {
  const normalizedContentType = attachment.content_type.trim().toLowerCase()
  const allowedExtensions = EXTENSIONS_BY_MANUAL_ARSIP_CONTENT_TYPE[normalizedContentType] ?? []
  const originalExtension = safeExtensionFromFilename(attachment.original_filename)

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

function truncateContentDispositionFilename(filename: string, extension: string | null): string {
  if (filename.length <= MAX_CONTENT_DISPOSITION_FILENAME_LENGTH) return filename

  const suffix = extension ? `.${extension}` : ''
  const maxBaseLength = Math.max(
    FALLBACK_ATTACHMENT_TITLE_SEGMENT.length,
    MAX_CONTENT_DISPOSITION_FILENAME_LENGTH - suffix.length,
  )
  const baseName = suffix ? filename.slice(0, -suffix.length) : filename
  const truncatedBase = baseName
    .slice(0, maxBaseLength)
    .replace(/[-_]+$/g, '')
    || FALLBACK_ATTACHMENT_TITLE_SEGMENT

  return `${truncatedBase}${suffix}`
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}
