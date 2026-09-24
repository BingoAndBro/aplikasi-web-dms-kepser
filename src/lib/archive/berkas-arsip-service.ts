import { and, eq, sql } from 'drizzle-orm'
import {
  berkasArsip,
  berkasArsipActivity,
  berkasArsipItem,
  masterKlasifikasiArsip,
  manualArsip,
} from '#/db/schema/arsip'
import {
  type BerkasActivityEventType,
} from '#/lib/archive/berkas-arsip-activity'
import {
  OperationalKlasifikasiSelectionError,
  validateOperationalKlasifikasiSelection,
  type OperationalKlasifikasiSelectionRepository,
} from '#/lib/archive/berkas-klasifikasi-eligibility'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { calculateBerkasDueDate } from '#/lib/archive/retention'
import {
  ARCHIVE_SOURCE_TYPE,
  BERKAS_ARCHIVE_STATUS,
  BERKAS_STATUS,
  type ArchiveSourceType,
  type BerkasArchiveStatus,
  type BerkasStatus,
} from '#/lib/constants/archive-status'
import {
  closeBerkasMetadataSchema,
  type CloseBerkasMetadataInput,
} from '#/lib/schemas/berkas-arsip'

type KlasifikasiSnapshot = {
  id: string
  kode: string | null
  nama: string
}

export type BerkasArsipDto = {
  id: string
  klasifikasi_id: string
  tahun_anggaran: number
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string
  status_berkas: BerkasStatus
  status_arsip: BerkasArchiveStatus | null
  nomor_spm: string | null
  retensi_aktif: string | null
  retensi_inaktif: string | null
  masa_aktif_berakhir: string | null
  masa_inaktif_berakhir: string | null
  closed_at: string | null
  closed_by: string | null
  created_by: string
}

export type BerkasArsipItemDto = {
  id: string
  berkas_id: string
  source_type: ArchiveSourceType
  dokumen_id: string | null
  manual_arsip_id: string | null
  added_by: string
}

type BerkasRow = {
  id: string
  klasifikasiId: string
  tahunAnggaran: number
  klasifikasiKodeSnapshot: string | null
  klasifikasiNamaSnapshot: string
  statusBerkas: BerkasStatus
  statusArsip: BerkasArchiveStatus | null
  nomorSpm: string | null
  retensiAktif: string | null
  retensiInaktif: string | null
  masaAktifBerakhir: string | null
  masaInaktifBerakhir: string | null
  closedAt: Date | string | null
  closedBy: string | null
  createdBy: string
}

type BerkasItemRow = {
  id: string
  berkasId: string
  sourceType: ArchiveSourceType
  dokumenId: string | null
  manualArsipId: string | null
  addedBy: string
}

type SourceReference = {
  id: string
  klasifikasiId: string | null
}

type BerkasActivityMetadataSnapshot = Record<string, string | null>

export type AppendBerkasActivityInput = {
  berkasId: string
  eventType: BerkasActivityEventType
  actorUserId: string | null
  sourceType?: ArchiveSourceType | null
  workflowDocumentId?: string | null
  manualDocumentId?: string | null
  catatan?: string | null
  metadataSnapshot?: BerkasActivityMetadataSnapshot | null
}

export type CreateOpenBerkasInput = {
  klasifikasiId: string
  tahunAnggaran: number
  actorUserId: string
}

export type AddWorkflowDocumentToOpenBerkasInput = {
  berkasId: string
  dokumenId: string
  actorUserId: string
}

export type AddManualDocumentToOpenBerkasInput = {
  berkasId: string
  manualArsipId: string
  actorUserId: string
}

export type CloseBerkasArsipInput = {
  berkasId: string
  actorUserId: string
  metadata: unknown
  now?: Date
}

export type UpdateActiveBerkasMetadataInput = {
  berkasId: string
  actorUserId: string
  metadata: unknown
}

export type BerkasArchiveLifecycleAction =
  | 'propose_destruction'
  | 'cancel_proposal'
  | 'approve_destruction'

export type TransitionBerkasArchiveStatusInput = {
  berkasId: string
  actorUserId: string
  action: BerkasArchiveLifecycleAction
}

export type CloseBerkasPlan = {
  nomorSpm: string
  retensiAktif: CloseBerkasMetadataInput['retensi_aktif']
  // RP-01: kolom warisan, selalu null (tanpa migrasi).
  retensiInaktif: null
  closedAtDateOnly: string
  closedAt: Date
  masaAktifBerakhir: string
  masaInaktifBerakhir: null
}

export type ActiveBerkasMetadataPlan = {
  nomorSpm: string
  retensiAktif: CloseBerkasMetadataInput['retensi_aktif']
  // RP-01: kolom warisan, selalu null (tanpa migrasi).
  retensiInaktif: null
  retentionBaseDateOnly: string
  masaAktifBerakhir: string
  masaInaktifBerakhir: null
}

export type BerkasArsipRepository = OperationalKlasifikasiSelectionRepository & {
  findBerkasByKlasifikasiId(klasifikasiId: string, tahunAnggaran: number): Promise<BerkasRow[]>
  findOpenBerkasByKlasifikasiId(klasifikasiId: string, tahunAnggaran: number): Promise<BerkasRow | null>
  insertOpenBerkas(input: {
    klasifikasi: KlasifikasiSnapshot
    tahunAnggaran: number
    actorUserId: string
  }): Promise<BerkasRow>
  findBerkasById(id: string): Promise<BerkasRow | null>
  findWorkflowSource(dokumenId: string): Promise<SourceReference | null>
  findManualSource(manualArsipId: string): Promise<SourceReference | null>
  insertBerkasItem(input: {
    berkasId: string
    sourceType: ArchiveSourceType
    dokumenId: string | null
    manualArsipId: string | null
    actorUserId: string
  }): Promise<BerkasItemRow>
  countBerkasItems(berkasId: string): Promise<number>
  closeOpenBerkas(input: {
    berkasId: string
    actorUserId: string
    plan: CloseBerkasPlan
  }): Promise<BerkasRow | null>
  updateActiveBerkasMetadata(input: {
    berkasId: string
    plan: ActiveBerkasMetadataPlan
  }): Promise<BerkasRow | null>
  updateBerkasArchiveStatus(input: {
    berkasId: string
    currentStatusArsip: BerkasArchiveStatus
    nextStatusArsip: BerkasArchiveStatus
  }): Promise<BerkasRow | null>
  appendBerkasActivity(input: AppendBerkasActivityInput): Promise<void>
}

export type BerkasArsipServiceDeps = {
  repository?: BerkasArsipRepository
}

export type BerkasArsipErrorCode =
  | 'KLASIFIKASI_NOT_FOUND'
  | 'KLASIFIKASI_INACTIVE'
  | 'KLASIFIKASI_PARENT'
  | 'BERKAS_NOT_FOUND'
  | 'BERKAS_CLOSED'
  | 'BERKAS_KLASIFIKASI_CLOSED'
  | 'BERKAS_KLASIFIKASI_CONFLICT'
  | 'BERKAS_NOT_OPEN'
  | 'BERKAS_LIFECYCLE_NOT_FINAL'
  | 'BERKAS_LIFECYCLE_UNKNOWN'
  | 'BERKAS_LIFECYCLE_INVALID'
  | 'BERKAS_METADATA_NOT_EDITABLE'
  | 'BERKAS_EMPTY'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_KLASIFIKASI_UNAVAILABLE'
  | 'SOURCE_KLASIFIKASI_MISMATCH'
  | 'INVALID_CLOSE_METADATA'
  | 'CONFLICT'

export class BerkasArsipServiceError extends Error {
  constructor(
    public readonly code: BerkasArsipErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'BerkasArsipServiceError'
  }
}

export async function getOrCreateOpenBerkasForKlasifikasi(
  input: CreateOpenBerkasInput,
  deps: BerkasArsipServiceDeps = {},
): Promise<BerkasArsipDto> {
  const repository = getRepository(deps)
  const klasifikasi = await validateKlasifikasiForOperationalSelection(input.klasifikasiId, repository)
  const existing = await resolveExistingBerkasForKlasifikasi(repository, input.klasifikasiId, input.tahunAnggaran)
  if (existing) return toBerkasDto(existing)

  try {
    return toBerkasDto(await insertOpenBerkasWithActivity(repository, {
      klasifikasi,
      tahunAnggaran: input.tahunAnggaran,
      actorUserId: input.actorUserId,
    }))
  } catch (error) {
    if (!isUniqueConflict(error)) throw error

    const racedExisting = await resolveExistingBerkasForKlasifikasi(repository, input.klasifikasiId, input.tahunAnggaran)
    if (racedExisting) return toBerkasDto(racedExisting)

    throw new BerkasArsipServiceError('CONFLICT', 'Gagal membuka berkas karena konflik data')
  }
}

async function assertBerkasCanAcceptItems(
  berkasId: string,
  deps: BerkasArsipServiceDeps = {},
): Promise<BerkasArsipDto> {
  const row = await getRepository(deps).findBerkasById(berkasId)
  if (!row) {
    throw new BerkasArsipServiceError('BERKAS_NOT_FOUND', 'Berkas tidak ditemukan')
  }

  if (row.statusBerkas !== BERKAS_STATUS.OPEN) {
    throw new BerkasArsipServiceError(
      'BERKAS_CLOSED',
      'Berkas ini tidak dapat dipilih karena sudah ditutup',
    )
  }

  return toBerkasDto(row)
}

export async function addWorkflowDocumentToOpenBerkas(
  input: AddWorkflowDocumentToOpenBerkasInput,
  deps: BerkasArsipServiceDeps = {},
): Promise<BerkasArsipItemDto> {
  const repository = getRepository(deps)
  const berkas = await assertBerkasCanAcceptItems(input.berkasId, { repository })
  const source = await repository.findWorkflowSource(input.dokumenId)
  if (!source) {
    throw new BerkasArsipServiceError('SOURCE_NOT_FOUND', 'Dokumen workflow tidak ditemukan')
  }

  assertSourceMatchesBerkas(source, berkas)

  const item = await insertBerkasItemSafely(repository, {
    berkasId: input.berkasId,
    sourceType: ARCHIVE_SOURCE_TYPE.WORKFLOW,
    dokumenId: input.dokumenId,
    manualArsipId: null,
    actorUserId: input.actorUserId,
  })
  await repository.appendBerkasActivity({
    berkasId: input.berkasId,
    eventType: 'DOKUMEN_PERSETUJUAN_DIKLASIFIKASIKAN',
    actorUserId: input.actorUserId,
    sourceType: ARCHIVE_SOURCE_TYPE.WORKFLOW,
    workflowDocumentId: input.dokumenId,
  })

  return toBerkasItemDto(item)
}

export async function addManualDocumentToOpenBerkas(
  input: AddManualDocumentToOpenBerkasInput,
  deps: BerkasArsipServiceDeps = {},
): Promise<BerkasArsipItemDto> {
  const repository = getRepository(deps)
  const berkas = await assertBerkasCanAcceptItems(input.berkasId, { repository })
  const source = await repository.findManualSource(input.manualArsipId)
  if (!source) {
    throw new BerkasArsipServiceError('SOURCE_NOT_FOUND', 'Dokumen manual tidak ditemukan')
  }

  assertSourceMatchesBerkas(source, berkas)

  const item = await insertBerkasItemSafely(repository, {
    berkasId: input.berkasId,
    sourceType: ARCHIVE_SOURCE_TYPE.MANUAL,
    dokumenId: null,
    manualArsipId: input.manualArsipId,
    actorUserId: input.actorUserId,
  })
  await repository.appendBerkasActivity({
    berkasId: input.berkasId,
    eventType: 'DOKUMEN_MANUAL_DITAMBAHKAN',
    actorUserId: input.actorUserId,
    sourceType: ARCHIVE_SOURCE_TYPE.MANUAL,
    manualDocumentId: input.manualArsipId,
  })

  return toBerkasItemDto(item)
}

export async function closeBerkasArsip(
  input: CloseBerkasArsipInput,
  deps: BerkasArsipServiceDeps = {},
): Promise<BerkasArsipDto> {
  const repository = getRepository(deps)
  const existing = await repository.findBerkasById(input.berkasId)
  if (!existing) {
    throw new BerkasArsipServiceError('BERKAS_NOT_FOUND', 'Berkas tidak ditemukan')
  }

  if (existing.statusBerkas !== BERKAS_STATUS.OPEN) {
    throw new BerkasArsipServiceError('BERKAS_NOT_OPEN', 'Berkas sudah ditutup')
  }

  const itemCount = await repository.countBerkasItems(input.berkasId)
  if (itemCount < 1) {
    throw new BerkasArsipServiceError('BERKAS_EMPTY', 'Berkas kosong tidak dapat ditutup')
  }

  const plan = buildCloseBerkasPlan(input.metadata, input.now)
  const closed = await repository.closeOpenBerkas({
    berkasId: input.berkasId,
    actorUserId: input.actorUserId,
    plan,
  })

  if (!closed) {
    throw new BerkasArsipServiceError('BERKAS_NOT_OPEN', 'Berkas sudah ditutup')
  }
  await repository.appendBerkasActivity({
    berkasId: input.berkasId,
    eventType: 'BERKAS_DITUTUP',
    actorUserId: input.actorUserId,
    metadataSnapshot: {
      status_berkas: BERKAS_STATUS.CLOSED,
      status_arsip: BERKAS_ARCHIVE_STATUS.AKTIF,
      tahun_anggaran: String(closed.tahunAnggaran),
      nomor_spm: closed.nomorSpm,
      retensi_aktif: closed.retensiAktif,
      retensi_inaktif: closed.retensiInaktif,
      masa_aktif_berakhir: dateLikeToDateOnly(closed.masaAktifBerakhir),
      masa_inaktif_berakhir: dateLikeToDateOnly(closed.masaInaktifBerakhir),
    },
  })

  return toBerkasDto(closed)
}

export async function transitionBerkasArchiveStatus(
  input: TransitionBerkasArchiveStatusInput,
  deps: BerkasArsipServiceDeps = {},
): Promise<BerkasArsipDto> {
  const repository = getRepository(deps)
  const existing = await repository.findBerkasById(input.berkasId)
  if (!existing) {
    throw new BerkasArsipServiceError('BERKAS_NOT_FOUND', 'Berkas tidak ditemukan')
  }

  if (existing.statusBerkas !== BERKAS_STATUS.CLOSED) {
    throw new BerkasArsipServiceError(
      'BERKAS_LIFECYCLE_NOT_FINAL',
      'Berkas terbuka belum dapat dipindahkan lifecycle',
    )
  }

  if (!existing.statusArsip) {
    throw new BerkasArsipServiceError(
      'BERKAS_LIFECYCLE_UNKNOWN',
      'Status berkas belum tersedia',
    )
  }

  const nextStatusArsip = nextStatusForBerkasLifecycleAction(input.action, existing.statusArsip)
  const updated = await repository.updateBerkasArchiveStatus({
    berkasId: input.berkasId,
    currentStatusArsip: existing.statusArsip,
    nextStatusArsip,
  })

  if (!updated) {
    throw new BerkasArsipServiceError(
      'BERKAS_LIFECYCLE_INVALID',
      'Status berkas sudah berubah',
    )
  }
  await repository.appendBerkasActivity({
    berkasId: input.berkasId,
    eventType: eventTypeForBerkasLifecycleAction(input.action),
    actorUserId: input.actorUserId,
    metadataSnapshot: {
      status_berkas: BERKAS_STATUS.CLOSED,
      status_arsip: nextStatusArsip,
    },
  })

  return toBerkasDto(updated)
}

export async function updateActiveBerkasMetadata(
  input: UpdateActiveBerkasMetadataInput,
  deps: BerkasArsipServiceDeps = {},
): Promise<BerkasArsipDto> {
  const repository = getRepository(deps)
  const existing = await repository.findBerkasById(input.berkasId)
  if (!existing) {
    throw new BerkasArsipServiceError('BERKAS_NOT_FOUND', 'Berkas tidak ditemukan')
  }

  if (existing.statusBerkas !== BERKAS_STATUS.CLOSED || existing.statusArsip !== BERKAS_ARCHIVE_STATUS.AKTIF) {
    throw new BerkasArsipServiceError(
      'BERKAS_METADATA_NOT_EDITABLE',
      'Metadata hanya dapat diedit untuk berkas berstatus Tersimpan',
    )
  }

  const plan = buildActiveBerkasMetadataPlan(input.metadata, existing.closedAt)
  const updated = await repository.updateActiveBerkasMetadata({
    berkasId: input.berkasId,
    plan,
  })

  if (!updated) {
    throw new BerkasArsipServiceError(
      'BERKAS_METADATA_NOT_EDITABLE',
      'Metadata Tersimpan sudah tidak dapat diedit',
    )
  }
  await repository.appendBerkasActivity({
    berkasId: input.berkasId,
    eventType: 'METADATA_ARSIP_AKTIF_DIPERBARUI',
    actorUserId: input.actorUserId,
    metadataSnapshot: {
      status_berkas: BERKAS_STATUS.CLOSED,
      status_arsip: BERKAS_ARCHIVE_STATUS.AKTIF,
      nomor_spm: updated.nomorSpm,
      retensi_aktif: updated.retensiAktif,
      retensi_inaktif: updated.retensiInaktif,
      masa_aktif_berakhir: dateLikeToDateOnly(updated.masaAktifBerakhir),
      masa_inaktif_berakhir: dateLikeToDateOnly(updated.masaInaktifBerakhir),
    },
  })

  return toBerkasDto(updated)
}

function buildActiveBerkasMetadataPlan(
  metadata: unknown,
  existingClosedAt: Date | string | null,
): ActiveBerkasMetadataPlan {
  const parsed = parseCloseBerkasMetadata(metadata, 'Metadata Tersimpan tidak valid')

  const retentionBaseDateOnly = dateLikeToDateOnly(existingClosedAt)
  if (!retentionBaseDateOnly) {
    throw new BerkasArsipServiceError(
      'BERKAS_METADATA_NOT_EDITABLE',
      'Metadata Tersimpan belum memiliki tanggal tutup',
    )
  }

  return {
    nomorSpm: parsed.nomor_spm,
    retensiAktif: parsed.retensi_aktif,
    retensiInaktif: null,
    retentionBaseDateOnly,
    masaAktifBerakhir: calculateBerkasDueDate({
      closedAt: retentionBaseDateOnly,
      masaSimpan: parsed.retensi_aktif,
    }),
    masaInaktifBerakhir: null,
  }
}

export function buildCloseBerkasPlan(
  metadata: unknown,
  now = new Date(),
): CloseBerkasPlan {
  const parsed = parseCloseBerkasMetadata(metadata, 'Metadata tutup berkas tidak valid')

  const closedAtDateOnly = parsed.closed_at ?? toServerDateOnly(now)

  return {
    nomorSpm: parsed.nomor_spm,
    retensiAktif: parsed.retensi_aktif,
    retensiInaktif: null,
    closedAtDateOnly,
    closedAt: dateOnlyToUtcMidnight(closedAtDateOnly),
    masaAktifBerakhir: calculateBerkasDueDate({
      closedAt: closedAtDateOnly,
      masaSimpan: parsed.retensi_aktif,
    }),
    masaInaktifBerakhir: null,
  }
}

const defaultBerkasArsipRepository: BerkasArsipRepository = {
  async findKlasifikasiForOperationalSelection(id) {
    const database = await getDatabase()
    const [row] = await database
      .select({
        id: masterKlasifikasiArsip.id,
        kode: masterKlasifikasiArsip.kode,
        nama: masterKlasifikasiArsip.nama,
        isActive: masterKlasifikasiArsip.isActive,
      })
      .from(masterKlasifikasiArsip)
      .where(eq(masterKlasifikasiArsip.id, id))
      .limit(1)

    if (!row) return null

    const [child] = await database
      .select({ id: masterKlasifikasiArsip.id })
      .from(masterKlasifikasiArsip)
      .where(eq(masterKlasifikasiArsip.parentId, id))
      .limit(1)

    return {
      ...row,
      hasChildren: Boolean(child),
    }
  },

  async findOpenBerkasByKlasifikasiId(klasifikasiId, tahunAnggaran) {
    const database = await getDatabase()
    const [row] = await database
      .select()
      .from(berkasArsip)
      .where(and(
        eq(berkasArsip.klasifikasiId, klasifikasiId),
        eq(berkasArsip.tahunAnggaran, tahunAnggaran),
        eq(berkasArsip.statusBerkas, BERKAS_STATUS.OPEN),
      ))
      .limit(1)

    return row ?? null
  },

  async findBerkasByKlasifikasiId(klasifikasiId, tahunAnggaran) {
    const database = await getDatabase()
    return database
      .select()
      .from(berkasArsip)
      .where(and(
        eq(berkasArsip.klasifikasiId, klasifikasiId),
        eq(berkasArsip.tahunAnggaran, tahunAnggaran),
      )) as Promise<BerkasRow[]>
  },

  async insertOpenBerkas(input) {
    const database = await getDatabase()
    const [row] = await database
      .insert(berkasArsip)
      .values({
        klasifikasiId: input.klasifikasi.id,
        tahunAnggaran: input.tahunAnggaran,
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
    const database = await getDatabase()
    const [row] = await database
      .select()
      .from(berkasArsip)
      .where(eq(berkasArsip.id, id))
      .limit(1)

    return row ?? null
  },

  async findWorkflowSource(dokumenId) {
    const database = await getDatabase()
    const [row] = await database
      .select({
        id: dokumenTransaksi.id,
        // dokumen_transaksi has no active klasifikasi_id; callers that know the selected
        // workflow classification must provide a route-scoped repository.
        klasifikasiId: sql<null>`null`,
      })
      .from(dokumenTransaksi)
      .where(eq(dokumenTransaksi.id, dokumenId))
      .limit(1)

    return row ?? null
  },

  async findManualSource(manualArsipId) {
    const database = await getDatabase()
    const [row] = await database
      .select({
        id: manualArsip.id,
        klasifikasiId: manualArsip.klasifikasiId,
      })
      .from(manualArsip)
      .where(eq(manualArsip.id, manualArsipId))
      .limit(1)

    return row ?? null
  },

  async insertBerkasItem(input) {
    const database = await getDatabase()
    const [row] = await database
      .insert(berkasArsipItem)
      .values({
        berkasId: input.berkasId,
        sourceType: input.sourceType,
        dokumenId: input.dokumenId,
        manualArsipId: input.manualArsipId,
        addedBy: input.actorUserId,
      })
      .returning()

    if (!row) throw new Error('BERKAS_ITEM_CREATE_FAILED')
    return row
  },

  async countBerkasItems(berkasId) {
    const database = await getDatabase()
    const [row] = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(berkasArsipItem)
      .where(eq(berkasArsipItem.berkasId, berkasId))

    return Number(row?.count ?? 0)
  },

  async closeOpenBerkas(input) {
    const database = await getDatabase()
    const [row] = await database
      .update(berkasArsip)
      .set({
        statusBerkas: BERKAS_STATUS.CLOSED,
        statusArsip: BERKAS_ARCHIVE_STATUS.AKTIF,
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

  async updateBerkasArchiveStatus(input) {
    const database = await getDatabase()
    const [row] = await database
      .update(berkasArsip)
      .set({
        statusArsip: input.nextStatusArsip,
        updatedAt: new Date(),
      })
      .where(and(
        eq(berkasArsip.id, input.berkasId),
        eq(berkasArsip.statusBerkas, BERKAS_STATUS.CLOSED),
        eq(berkasArsip.statusArsip, input.currentStatusArsip),
      ))
      .returning()

    return row ?? null
  },

  async updateActiveBerkasMetadata(input) {
    const database = await getDatabase()
    const [row] = await database
      .update(berkasArsip)
      .set({
        nomorSpm: input.plan.nomorSpm,
        retensiAktif: input.plan.retensiAktif,
        retensiInaktif: input.plan.retensiInaktif,
        masaAktifBerakhir: input.plan.masaAktifBerakhir,
        masaInaktifBerakhir: input.plan.masaInaktifBerakhir,
        updatedAt: new Date(),
      })
      .where(and(
        eq(berkasArsip.id, input.berkasId),
        eq(berkasArsip.statusBerkas, BERKAS_STATUS.CLOSED),
        eq(berkasArsip.statusArsip, BERKAS_ARCHIVE_STATUS.AKTIF),
      ))
      .returning()

    return row ?? null
  },

  async appendBerkasActivity(input) {
    const database = await getDatabase()
    await database
      .insert(berkasArsipActivity)
      .values({
        berkasId: input.berkasId,
        eventType: input.eventType,
        actorUserId: input.actorUserId,
        sourceType: input.sourceType ?? null,
        workflowDocumentId: input.workflowDocumentId ?? null,
        manualDocumentId: input.manualDocumentId ?? null,
        catatan: normalizeActivityText(input.catatan),
        metadataSnapshot: input.metadataSnapshot ?? null,
      })
  },
}

function getRepository(deps: BerkasArsipServiceDeps): BerkasArsipRepository {
  return deps.repository ?? defaultBerkasArsipRepository
}

async function validateKlasifikasiForOperationalSelection(
  klasifikasiId: string,
  repository: BerkasArsipRepository,
): Promise<KlasifikasiSnapshot> {
  try {
    return await validateOperationalKlasifikasiSelection(klasifikasiId, repository)
  } catch (error) {
    if (error instanceof OperationalKlasifikasiSelectionError) {
      throw new BerkasArsipServiceError(error.code, error.message)
    }

    throw error
  }
}

async function getDatabase() {
  const client = await import('#/db/client')
  return client.db
}

function assertSourceMatchesBerkas(
  source: SourceReference,
  berkas: BerkasArsipDto,
): void {
  if (source.klasifikasiId !== berkas.klasifikasi_id) {
    if (!source.klasifikasiId) {
      throw new BerkasArsipServiceError(
        'SOURCE_KLASIFIKASI_UNAVAILABLE',
        'Jenis pembayaran dokumen belum tersedia untuk validasi berkas',
      )
    }

    throw new BerkasArsipServiceError(
      'SOURCE_KLASIFIKASI_MISMATCH',
      'Jenis pembayaran dokumen tidak sesuai dengan berkas',
    )
  }
}

async function resolveExistingBerkasForKlasifikasi(
  repository: BerkasArsipRepository,
  klasifikasiId: string,
  tahunAnggaran: number,
): Promise<BerkasRow | null> {
  const rows = await repository.findBerkasByKlasifikasiId(klasifikasiId, tahunAnggaran)
  const openRows = rows.filter((row) => row.statusBerkas === BERKAS_STATUS.OPEN)

  if (openRows.length === 1) return openRows[0] ?? null

  if (openRows.length > 1) {
    throw new BerkasArsipServiceError(
      'BERKAS_KLASIFIKASI_CONFLICT',
      'Data berkas untuk Cara Pembayaran ini perlu ditinjau',
    )
  }

  if (rows.length > 0) {
    throw new BerkasArsipServiceError(
      'BERKAS_KLASIFIKASI_CLOSED',
      `Berkas untuk Cara Pembayaran ini TA ${tahunAnggaran} sudah ditutup`,
    )
  }

  return null
}

async function insertOpenBerkasWithActivity(
  repository: BerkasArsipRepository,
  input: {
    klasifikasi: KlasifikasiSnapshot
    tahunAnggaran: number
    actorUserId: string
  },
): Promise<BerkasRow> {
  const row = await repository.insertOpenBerkas(input)
  await repository.appendBerkasActivity({
    berkasId: row.id,
    eventType: 'BERKAS_DIBUKA',
    actorUserId: input.actorUserId,
    metadataSnapshot: {
      status_berkas: BERKAS_STATUS.OPEN,
      status_arsip: null,
      tahun_anggaran: String(row.tahunAnggaran),
      klasifikasi_kode_snapshot: row.klasifikasiKodeSnapshot,
      klasifikasi_nama_snapshot: row.klasifikasiNamaSnapshot,
    },
  })

  return row
}

async function insertBerkasItemSafely(
  repository: BerkasArsipRepository,
  input: Parameters<BerkasArsipRepository['insertBerkasItem']>[0],
): Promise<BerkasItemRow> {
  try {
    return await repository.insertBerkasItem(input)
  } catch (error) {
    if (!isUniqueConflict(error)) throw error

    throw new BerkasArsipServiceError(
      'CONFLICT',
      'Dokumen sudah terhubung ke berkas',
    )
  }
}

function nextStatusForBerkasLifecycleAction(
  action: BerkasArchiveLifecycleAction,
  currentStatus: BerkasArchiveStatus,
): BerkasArchiveStatus {
  // RP-01: lifecycle 2 tahap sesudah tutup. `INAKTIF` dibuang dari alur.
  const allowed: Record<BerkasArchiveLifecycleAction, Partial<Record<BerkasArchiveStatus, BerkasArchiveStatus>>> = {
    propose_destruction: {
      [BERKAS_ARCHIVE_STATUS.AKTIF]: BERKAS_ARCHIVE_STATUS.USUL_MUSNAH,
    },
    cancel_proposal: {
      [BERKAS_ARCHIVE_STATUS.USUL_MUSNAH]: BERKAS_ARCHIVE_STATUS.AKTIF,
    },
    approve_destruction: {
      [BERKAS_ARCHIVE_STATUS.USUL_MUSNAH]: BERKAS_ARCHIVE_STATUS.DIMUSNAHKAN,
    },
  }

  const nextStatus = allowed[action]?.[currentStatus]
  if (!nextStatus) {
    throw new BerkasArsipServiceError(
      'BERKAS_LIFECYCLE_INVALID',
      'Perubahan status berkas tidak valid',
    )
  }

  return nextStatus
}

function toBerkasDto(row: BerkasRow): BerkasArsipDto {
  return {
    id: row.id,
    klasifikasi_id: row.klasifikasiId,
    tahun_anggaran: row.tahunAnggaran,
    klasifikasi_kode_snapshot: row.klasifikasiKodeSnapshot,
    klasifikasi_nama_snapshot: row.klasifikasiNamaSnapshot,
    status_berkas: row.statusBerkas,
    status_arsip: row.statusArsip,
    nomor_spm: row.nomorSpm,
    retensi_aktif: row.retensiAktif,
    retensi_inaktif: row.retensiInaktif,
    masa_aktif_berakhir: row.masaAktifBerakhir,
    masa_inaktif_berakhir: row.masaInaktifBerakhir,
    closed_at: row.closedAt ? dateLikeToIso(row.closedAt) : null,
    closed_by: row.closedBy,
    created_by: row.createdBy,
  }
}

function toBerkasItemDto(row: BerkasItemRow): BerkasArsipItemDto {
  return {
    id: row.id,
    berkas_id: row.berkasId,
    source_type: row.sourceType,
    dokumen_id: row.dokumenId,
    manual_arsip_id: row.manualArsipId,
    added_by: row.addedBy,
  }
}

function toServerDateOnly(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

// RP-01: pemetaan event dibuat action-aware. `cancel_proposal` menuju AKTIF tetapi
// TIDAK boleh memakai event 'BERKAS_DITUTUP'; ia memakai event yang sudah ada di
// CHECK constraint (`METADATA_ARSIP_AKTIF_DIPERBARUI`) sehingga tanpa migrasi.
function eventTypeForBerkasLifecycleAction(
  action: BerkasArchiveLifecycleAction,
): BerkasActivityEventType {
  switch (action) {
    case 'propose_destruction':
      return 'BERKAS_DIPINDAHKAN_KE_USUL_MUSNAH'
    case 'cancel_proposal':
      return 'METADATA_ARSIP_AKTIF_DIPERBARUI'
    case 'approve_destruction':
      return 'BERKAS_DIMUSNAHKAN'
  }
}

function parseCloseBerkasMetadata(
  metadata: unknown,
  defaultMessage: string,
): CloseBerkasMetadataInput {
  const parsed = closeBerkasMetadataSchema.safeParse(normalizeCloseBerkasMetadata(metadata))
  if (!parsed.success) {
    throw new BerkasArsipServiceError(
      'INVALID_CLOSE_METADATA',
      parsed.error.issues[0]?.message ?? defaultMessage,
    )
  }

  return parsed.data
}

function normalizeCloseBerkasMetadata(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata
  if (!('closed_at' in metadata) || (metadata as { closed_at?: unknown }).closed_at !== null) return metadata

  const rest = { ...(metadata as Record<string, unknown>) }
  delete rest.closed_at
  return rest
}

function dateOnlyToUtcMidnight(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
}

function dateLikeToIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

function dateLikeToDateOnly(value: Date | string | null): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)

  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value)
  return match?.[1] ?? null
}

function normalizeActivityText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, 500)
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === 'object'
      && 'code' in error
      && (error as { code?: unknown }).code === '23505',
  )
}
