import { and, eq, sql } from 'drizzle-orm'
import {
  berkasArsip,
  berkasArsipItem,
  masterKlasifikasiArsip,
  manualArsip,
} from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { calculateManualArchiveRetentionDates } from '#/lib/archive/retention'
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

export type CreateOpenBerkasInput = {
  klasifikasiId: string
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

export type BerkasArchiveLifecycleAction =
  | 'mark_inactive'
  | 'propose_destruction'
  | 'approve_destruction'

export type TransitionBerkasArchiveStatusInput = {
  berkasId: string
  actorUserId: string
  action: BerkasArchiveLifecycleAction
}

export type CloseBerkasPlan = {
  nomorSpm: string
  retensiAktif: CloseBerkasMetadataInput['retensi_aktif']
  retensiInaktif: CloseBerkasMetadataInput['retensi_inaktif']
  closedAtDateOnly: string
  closedAt: Date
  masaAktifBerakhir: string
  masaInaktifBerakhir: string
}

export type BerkasArsipRepository = {
  findActiveKlasifikasi(id: string): Promise<KlasifikasiSnapshot | null>
  findBerkasByKlasifikasiId(klasifikasiId: string): Promise<BerkasRow[]>
  findOpenBerkasByKlasifikasiId(klasifikasiId: string): Promise<BerkasRow | null>
  insertOpenBerkas(input: {
    klasifikasi: KlasifikasiSnapshot
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
  updateBerkasArchiveStatus(input: {
    berkasId: string
    currentStatusArsip: BerkasArchiveStatus
    nextStatusArsip: BerkasArchiveStatus
  }): Promise<BerkasRow | null>
}

export type BerkasArsipServiceDeps = {
  repository?: BerkasArsipRepository
}

export type BerkasArsipErrorCode =
  | 'KLASIFIKASI_NOT_FOUND'
  | 'BERKAS_NOT_FOUND'
  | 'BERKAS_CLOSED'
  | 'BERKAS_KLASIFIKASI_CLOSED'
  | 'BERKAS_KLASIFIKASI_CONFLICT'
  | 'BERKAS_NOT_OPEN'
  | 'BERKAS_LIFECYCLE_NOT_FINAL'
  | 'BERKAS_LIFECYCLE_UNKNOWN'
  | 'BERKAS_LIFECYCLE_INVALID'
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

export async function findOpenBerkasForKlasifikasi(
  klasifikasiId: string,
  deps: BerkasArsipServiceDeps = {},
): Promise<BerkasArsipDto | null> {
  const row = await getRepository(deps).findOpenBerkasByKlasifikasiId(klasifikasiId)
  return row ? toBerkasDto(row) : null
}

export async function createOpenBerkasForKlasifikasi(
  input: CreateOpenBerkasInput,
  deps: BerkasArsipServiceDeps = {},
): Promise<BerkasArsipDto> {
  const repository = getRepository(deps)
  const existing = await resolveExistingBerkasForKlasifikasi(repository, input.klasifikasiId)
  if (existing) return toBerkasDto(existing)

  const klasifikasi = await repository.findActiveKlasifikasi(input.klasifikasiId)
  if (!klasifikasi) {
    throw new BerkasArsipServiceError('KLASIFIKASI_NOT_FOUND', 'Jenis pembayaran tidak ditemukan')
  }

  const row = await repository.insertOpenBerkas({
    klasifikasi,
    actorUserId: input.actorUserId,
  })

  return toBerkasDto(row)
}

export async function getOrCreateOpenBerkasForKlasifikasi(
  input: CreateOpenBerkasInput,
  deps: BerkasArsipServiceDeps = {},
): Promise<BerkasArsipDto> {
  const repository = getRepository(deps)
  const existing = await resolveExistingBerkasForKlasifikasi(repository, input.klasifikasiId)
  if (existing) return toBerkasDto(existing)

  try {
    return await createOpenBerkasForKlasifikasi(input, { repository })
  } catch (error) {
    if (!isUniqueConflict(error)) throw error

    const racedExisting = await resolveExistingBerkasForKlasifikasi(repository, input.klasifikasiId)
    if (racedExisting) return toBerkasDto(racedExisting)

    throw new BerkasArsipServiceError('CONFLICT', 'Gagal membuka berkas karena konflik data')
  }
}

export async function assertBerkasCanAcceptItems(
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
      'Status arsip berkas belum tersedia',
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
      'Status arsip berkas sudah berubah',
    )
  }

  return toBerkasDto(updated)
}

export function buildCloseBerkasPlan(
  metadata: unknown,
  now = new Date(),
): CloseBerkasPlan {
  const parsed = closeBerkasMetadataSchema.safeParse(metadata)
  if (!parsed.success) {
    throw new BerkasArsipServiceError(
      'INVALID_CLOSE_METADATA',
      parsed.error.issues[0]?.message ?? 'Metadata tutup berkas tidak valid',
    )
  }

  const closedAtDateOnly = parsed.data.closed_at ?? toServerDateOnly(now)
  const retentionDates = calculateManualArchiveRetentionDates({
    tanggalDiarsipkan: closedAtDateOnly,
    retensiAktif: parsed.data.retensi_aktif,
    retensiInaktif: parsed.data.retensi_inaktif,
  })

  return {
    nomorSpm: parsed.data.nomor_spm,
    retensiAktif: parsed.data.retensi_aktif,
    retensiInaktif: parsed.data.retensi_inaktif,
    closedAtDateOnly,
    closedAt: dateOnlyToUtcMidnight(closedAtDateOnly),
    masaAktifBerakhir: retentionDates.masaAktifBerakhir,
    masaInaktifBerakhir: retentionDates.masaInaktifBerakhir,
  }
}

const defaultBerkasArsipRepository: BerkasArsipRepository = {
  async findActiveKlasifikasi(id) {
    const database = await getDatabase()
    const [row] = await database
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
    const database = await getDatabase()
    const [row] = await database
      .select()
      .from(berkasArsip)
      .where(and(
        eq(berkasArsip.klasifikasiId, klasifikasiId),
        eq(berkasArsip.statusBerkas, BERKAS_STATUS.OPEN),
      ))
      .limit(1)

    return row ?? null
  },

  async findBerkasByKlasifikasiId(klasifikasiId) {
    const database = await getDatabase()
    return database
      .select()
      .from(berkasArsip)
      .where(eq(berkasArsip.klasifikasiId, klasifikasiId)) as Promise<BerkasRow[]>
  },

  async insertOpenBerkas(input) {
    const database = await getDatabase()
    const [row] = await database
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
}

function getRepository(deps: BerkasArsipServiceDeps): BerkasArsipRepository {
  return deps.repository ?? defaultBerkasArsipRepository
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
): Promise<BerkasRow | null> {
  const rows = await repository.findBerkasByKlasifikasiId(klasifikasiId)
  const openRows = rows.filter((row) => row.statusBerkas === BERKAS_STATUS.OPEN)

  if (openRows.length === 1) return openRows[0] ?? null

  if (openRows.length > 1) {
    throw new BerkasArsipServiceError(
      'BERKAS_KLASIFIKASI_CONFLICT',
      'Data berkas untuk Jenis Pembayaran ini perlu ditinjau',
    )
  }

  if (rows.length > 0) {
    throw new BerkasArsipServiceError(
      'BERKAS_KLASIFIKASI_CLOSED',
      'Berkas untuk Jenis Pembayaran ini sudah ditutup',
    )
  }

  return null
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
  const allowed: Record<BerkasArchiveLifecycleAction, Partial<Record<BerkasArchiveStatus, BerkasArchiveStatus>>> = {
    mark_inactive: {
      [BERKAS_ARCHIVE_STATUS.AKTIF]: BERKAS_ARCHIVE_STATUS.INAKTIF,
    },
    propose_destruction: {
      [BERKAS_ARCHIVE_STATUS.INAKTIF]: BERKAS_ARCHIVE_STATUS.USUL_MUSNAH,
    },
    approve_destruction: {
      [BERKAS_ARCHIVE_STATUS.USUL_MUSNAH]: BERKAS_ARCHIVE_STATUS.DIMUSNAHKAN,
    },
  }

  const nextStatus = allowed[action][currentStatus]
  if (!nextStatus) {
    throw new BerkasArsipServiceError(
      'BERKAS_LIFECYCLE_INVALID',
      'Perubahan status arsip berkas tidak valid',
    )
  }

  return nextStatus
}

function toBerkasDto(row: BerkasRow): BerkasArsipDto {
  return {
    id: row.id,
    klasifikasi_id: row.klasifikasiId,
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

function dateOnlyToUtcMidnight(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
}

function dateLikeToIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === 'object'
      && 'code' in error
      && (error as { code?: unknown }).code === '23505',
  )
}
