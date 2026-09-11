import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'

import { users } from '#/db/schema/auth'
import {
  berkasArsip,
  berkasArsipActivity,
  berkasArsipItem,
  manualArsip,
  manualArsipAttachment,
} from '#/db/schema/arsip'
import {
  isBerkasActivityEventType,
  isBerkasActivitySourceType,
  type BerkasActivityEventType,
} from '#/lib/archive/berkas-arsip-activity'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  masterDetailPermintaan,
  masterFungsi,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
  masterKomponen,
} from '#/db/schema/master'
import {
  ARCHIVE_SOURCE_TYPE,
  ARCHIVE_SOURCE_TYPE_VALUES,
  BERKAS_ARCHIVE_STATUS_VALUES,
  BERKAS_STATUS_VALUES,
  type ArchiveSourceType,
  type BerkasArchiveStatus,
  type BerkasStatus,
} from '#/lib/constants/archive-status'
import {
  resolveManualAttachmentNames,
  resolveWorkflowAttachmentNames,
  type SafeBerkasAttachmentName,
} from '#/lib/archive/berkas-arsip-attachment-names'
import { computeBerkasAging } from '#/lib/archive/retention'

// Manual arsip and workflow dokumen both reference master_komponen, so the
// combined item-source query needs two independent aliases for the same table.
const workflowKomponen = alias(masterKomponen, 'workflow_komponen')
const manualKomponen = alias(masterKomponen, 'manual_komponen')

export const BERKAS_ARSIP_READ_MODEL_DEFAULT_LIMIT = 100
export const BERKAS_ARSIP_READ_MODEL_MAX_LIMIT = 500
export const BERKAS_ARSIP_READ_MODEL_MAX_OFFSET = 10_000

export const listBerkasArsipFolderQuerySchema = z
  .object({
    status_arsip: z.enum(BERKAS_ARCHIVE_STATUS_VALUES).nullable().optional(),
    status_berkas: z.enum(BERKAS_STATUS_VALUES).optional(),
    klasifikasi_id: z.uuid().optional(),
    search: z.string().trim().max(100).optional(),
    // RP-01: filter "hanya yang jatuh tempo" (dihitung dari closed_at + masa simpan).
    due_only: z.boolean().optional(),
    limit: z.number().int().min(1).max(BERKAS_ARSIP_READ_MODEL_MAX_LIMIT).optional(),
    offset: z.number().int().min(0).max(BERKAS_ARSIP_READ_MODEL_MAX_OFFSET).optional(),
  })
  .strict()

export type ListBerkasArsipFolderQuery = z.infer<typeof listBerkasArsipFolderQuerySchema>

export type BerkasArsipFolderListItemDto = {
  berkas_id: string
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
  // RP-01: dihitung saat baca (tanpa scheduler).
  umur_berkas: number | null
  jatuh_tempo: boolean
  tanggal_jatuh_tempo: string | null
  item_count: number
  workflow_item_count: number
  manual_item_count: number
  total_nominal_realisasi: number | null
  created_at: string | null
  updated_at: string | null
}

export type BerkasArsipFolderListSummary = {
  total_rows_returned: number
  status_berkas_counts: Partial<Record<BerkasStatus, number>>
  status_arsip_counts: Partial<Record<BerkasArchiveStatus | 'UNKNOWN', number>>
  item_count_total: number
  workflow_item_count_total: number
  manual_item_count_total: number
  total_nominal_realisasi: number | null
  applied_limit: number
  applied_offset: number
}

export type BerkasArsipFolderListResult = {
  rows: BerkasArsipFolderListItemDto[]
  summary: BerkasArsipFolderListSummary
}

export type BerkasArsipDetailItemWarning =
  | 'SOURCE_NOT_FOUND'
  | 'UNKNOWN_SOURCE_TYPE'
  | 'ATTACHMENT_METADATA_UNAVAILABLE'

export type BerkasArsipDetailItemDto = {
  item_id: string
  item_added_at: string | null
  source_type: ArchiveSourceType
  source_title: string
  source_date: string | null
  source_nominal_realisasi: number | null
  source_created_by_display_name: string | null
  attachment_count: number | null
  attachments: SafeBerkasAttachmentName[]
  has_attachments: boolean
  workflow: {
    title: string | null
    status: string | null
    current_step: string | null
    fungsi_nama: string | null
    kegiatan_nama: string | null
  } | null
  manual: {
    nama: string | null
    komponen_name: string | null
    keterangan: string | null
  } | null
  warnings: BerkasArsipDetailItemWarning[]
}

export type BerkasArsipActivityEventDto = {
  event_type: BerkasActivityEventType
  source_type: ArchiveSourceType | null
  message: string | null
  created_at: string
  actor_display_name: string | null
}

export type BerkasArsipDetailDto = BerkasArsipFolderListItemDto & {
  items: BerkasArsipDetailItemDto[]
  activity_events: BerkasArsipActivityEventDto[]
  warnings: Array<'OPEN_STATUS_ARSIP_NULL' | 'CLOSED_STATUS_ARSIP_UNKNOWN'>
}

export type BerkasArsipDetailResult =
  | { status: 'found'; detail: BerkasArsipDetailDto }
  | { status: 'not_found' }

export type BerkasFolderReadRow = {
  berkas_id: string
  klasifikasi_id: string
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string
  status_berkas: BerkasStatus
  status_arsip: BerkasArchiveStatus | null
  nomor_spm: string | null
  retensi_aktif: string | null
  retensi_inaktif: string | null
  masa_aktif_berakhir: Date | string | null
  masa_inaktif_berakhir: Date | string | null
  closed_at: Date | string | null
  closed_by: string | null
  created_at: Date | string | null
  updated_at: Date | string | null
}

export type BerkasItemSourceReadRow = {
  item_id: string
  item_added_at: Date | string | null
  berkas_id: string
  source_type: ArchiveSourceType | string
  dokumen_id: string | null
  manual_arsip_id: string | null
  workflow_title: string | null
  workflow_status: string | null
  workflow_current_step: string | null
  workflow_date: Date | string | null
  workflow_nominal_realisasi: string | number | null
  workflow_is_non_material: boolean | null
  workflow_created_by: string | null
  workflow_lampiran_urls: unknown
  fungsi_nama: string | null
  kegiatan_nama: string | null
  komponen_nama: string | null
  nama_dokumen: string | null
  jenis_permintaan_nama: string | null
  kategori_permintaan_nama: string | null
  detail_permintaan_nama: string | null
  manual_nama: string | null
  manual_date: Date | string | null
  manual_nominal_realisasi: string | number | null
  manual_created_by: string | null
  manual_komponen_name: string | null
  manual_keterangan: string | null
}

export type ActorDisplayReadRow = {
  id: string
  display_name: string | null
  nama_lengkap: string | null
  email: string | null
}

export type ManualAttachmentNameReadRow = {
  manual_arsip_id: string
  judul_lampiran: string | null
  original_filename: string | null
  content_type: string | null
}

export type BerkasActivityReadRow = {
  id: string
  berkas_id: string
  event_type: string
  actor_user_id: string | null
  source_type: string | null
  workflow_document_id: string | null
  manual_document_id: string | null
  catatan: string | null
  created_at: Date | string
}

export type BerkasArsipReadModelRepository = {
  listFolders(options: NormalizedListBerkasArsipFolderQuery): Promise<BerkasFolderReadRow[]>
  getFolderById(berkasId: string): Promise<BerkasFolderReadRow | null>
  listItemsForBerkasIds(berkasIds: string[]): Promise<BerkasItemSourceReadRow[]>
  listActivityEventsForBerkasIds(berkasIds: string[]): Promise<BerkasActivityReadRow[]>
  listManualAttachmentsByManualArsipIds(manualArsipIds: string[]): Promise<Map<string, ManualAttachmentNameReadRow[]>>
  findActorDisplayNames(actorIds: string[]): Promise<Map<string, string>>
}

export type BerkasArsipReadModelDeps = {
  repository?: BerkasArsipReadModelRepository
}

type NormalizedListBerkasArsipFolderQuery = {
  status_arsip: BerkasArchiveStatus | null | undefined
  status_berkas: BerkasStatus | null
  klasifikasi_id: string | null
  search: string | null
  due_only: boolean
  limit: number
  offset: number
}

export async function listBerkasArsipFolders(
  query: ListBerkasArsipFolderQuery = {},
  deps: BerkasArsipReadModelDeps = {},
): Promise<BerkasArsipFolderListResult> {
  const options = normalizeListQuery(query)
  const repository = getRepository(deps)
  const folderRows = await repository.listFolders(options)
  const itemRows = await repository.listItemsForBerkasIds(folderRows.map((row) => row.berkas_id))
  const itemSummaries = summarizeItemsByBerkas(itemRows)
  const mapped = folderRows.map((row) => mapFolderRowToListDto(row, itemSummaries.get(row.berkas_id)))
  const rows = options.due_only ? mapped.filter((row) => row.jatuh_tempo) : mapped

  return {
    rows,
    summary: summarizeFolderListRows(rows, options),
  }
}

export async function getBerkasArsipDetail(
  berkasId: string,
  deps: BerkasArsipReadModelDeps = {},
): Promise<BerkasArsipDetailResult> {
  const repository = getRepository(deps)
  const folderRow = await repository.getFolderById(berkasId)
  if (!folderRow) return { status: 'not_found' }

  const itemRows = await repository.listItemsForBerkasIds([berkasId])
  const manualAttachments = await repository.listManualAttachmentsByManualArsipIds(
    itemRows
      .map((row) => trimToNull(row.manual_arsip_id))
      .filter((id): id is string => Boolean(id)),
  )
  const activityRows = await repository.listActivityEventsForBerkasIds([berkasId])
  const actorDisplayNames = await repository.findActorDisplayNames([
    ...collectSourceActorIds(itemRows),
    ...collectActivityActorIds(activityRows),
  ])
  const itemSummaries = summarizeItemsByBerkas(itemRows)
  const folder = mapFolderRowToListDto(folderRow, itemSummaries.get(folderRow.berkas_id))

  return {
    status: 'found',
    detail: {
      ...folder,
      items: itemRows.map((row) => mapItemRowToDetailDto(row, manualAttachments, actorDisplayNames)),
      activity_events: mapActivityRowsToDto(activityRows, actorDisplayNames),
      warnings: collectFolderWarnings(folderRow),
    },
  }
}

const defaultBerkasArsipReadModelRepository: BerkasArsipReadModelRepository = {
  async listFolders(options) {
    const database = await getDatabase()
    const filters = buildFolderFilters(options)

    let builder = database
      .select(folderProjection())
      .from(berkasArsip) as any

    if (filters.length > 0) builder = builder.where(and(...filters))

    // RP-01: daftar berkas tertutup diurutkan terlama dulu (closed_at ASC) untuk
    // prioritas pembersihan. Daftar terbuka / tak terfilter tetap terbaru dulu.
    const orderBy = options.status_berkas === 'CLOSED'
      ? [asc(berkasArsip.closedAt), asc(berkasArsip.createdAt), asc(berkasArsip.id)]
      : [desc(berkasArsip.updatedAt), desc(berkasArsip.createdAt), desc(berkasArsip.id)]

    return builder
      .orderBy(...orderBy)
      .limit(options.limit)
      .offset(options.offset) as Promise<BerkasFolderReadRow[]>
  },

  async getFolderById(berkasId) {
    const database = await getDatabase()
    const rows = await database
      .select(folderProjection())
      .from(berkasArsip)
      .where(eq(berkasArsip.id, berkasId))
      .limit(1) as BerkasFolderReadRow[]

    return rows[0] ?? null
  },

  async listItemsForBerkasIds(berkasIds) {
    const uniqueIds = [...new Set(berkasIds.filter(Boolean))]
    if (uniqueIds.length === 0) return []

    const database = await getDatabase()
    return database
      .select({
        item_id: berkasArsipItem.id,
        item_added_at: berkasArsipItem.addedAt,
        berkas_id: berkasArsipItem.berkasId,
        source_type: berkasArsipItem.sourceType,
        dokumen_id: berkasArsipItem.dokumenId,
        manual_arsip_id: berkasArsipItem.manualArsipId,
        workflow_title: dokumenTransaksi.judul,
        workflow_status: dokumenTransaksi.status,
        workflow_current_step: dokumenTransaksi.currentStep,
        workflow_date: dokumenTransaksi.tanggal,
        workflow_nominal_realisasi: dokumenTransaksi.nominalRealisasi,
        workflow_is_non_material: dokumenTransaksi.isNonMaterial,
        workflow_created_by: dokumenTransaksi.createdBy,
        workflow_lampiran_urls: dokumenTransaksi.lampiranUrls,
        fungsi_nama: masterFungsi.nama,
        kegiatan_nama: masterKegiatan.nama,
        komponen_nama: workflowKomponen.nama,
        nama_dokumen: dokumenTransaksi.namaDokumen,
        jenis_permintaan_nama: masterJenisPermintaan.nama,
        kategori_permintaan_nama: masterKategoriPermintaan.nama,
        detail_permintaan_nama: masterDetailPermintaan.nama,
        manual_nama: manualArsip.nama,
        manual_date: manualArsip.tanggal,
        manual_nominal_realisasi: manualArsip.nominalRealisasi,
        manual_created_by: manualArsip.createdBy,
        manual_komponen_name: manualKomponen.nama,
        manual_keterangan: manualArsip.keterangan,
      })
      .from(berkasArsipItem)
      .leftJoin(dokumenTransaksi, eq(berkasArsipItem.dokumenId, dokumenTransaksi.id))
      .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
      .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
      .leftJoin(workflowKomponen, eq(dokumenTransaksi.komponenId, workflowKomponen.id))
      .leftJoin(masterJenisPermintaan, eq(dokumenTransaksi.jenisPermintaanId, masterJenisPermintaan.id))
      .leftJoin(masterKategoriPermintaan, eq(dokumenTransaksi.kategoriPermintaanId, masterKategoriPermintaan.id))
      .leftJoin(masterDetailPermintaan, eq(dokumenTransaksi.detailPermintaanId, masterDetailPermintaan.id))
      .leftJoin(manualArsip, eq(berkasArsipItem.manualArsipId, manualArsip.id))
      .leftJoin(manualKomponen, eq(manualArsip.komponenId, manualKomponen.id))
      .where(inArray(berkasArsipItem.berkasId, uniqueIds))
      .orderBy(berkasArsipItem.addedAt, berkasArsipItem.id) as Promise<BerkasItemSourceReadRow[]>
  },

  async listActivityEventsForBerkasIds(berkasIds) {
    const uniqueIds = [...new Set(berkasIds.filter(Boolean))]
    if (uniqueIds.length === 0) return []

    const database = await getDatabase()
    return database
      .select({
        id: berkasArsipActivity.id,
        berkas_id: berkasArsipActivity.berkasId,
        event_type: berkasArsipActivity.eventType,
        actor_user_id: berkasArsipActivity.actorUserId,
        source_type: berkasArsipActivity.sourceType,
        workflow_document_id: berkasArsipActivity.workflowDocumentId,
        manual_document_id: berkasArsipActivity.manualDocumentId,
        catatan: berkasArsipActivity.catatan,
        created_at: berkasArsipActivity.createdAt,
      })
      .from(berkasArsipActivity)
      .where(inArray(berkasArsipActivity.berkasId, uniqueIds))
      .orderBy(asc(berkasArsipActivity.createdAt), asc(berkasArsipActivity.id)) as Promise<BerkasActivityReadRow[]>
  },

  async listManualAttachmentsByManualArsipIds(manualArsipIds) {
    const uniqueIds = [...new Set(manualArsipIds.filter(Boolean))]
    if (uniqueIds.length === 0) return new Map()

    const database = await getDatabase()
    const rows = await database
      .select({
        manual_arsip_id: manualArsipAttachment.manualArsipId,
        judul_lampiran: manualArsipAttachment.judulLampiran,
        original_filename: manualArsipAttachment.originalFilename,
        content_type: manualArsipAttachment.contentType,
      })
      .from(manualArsipAttachment)
      .where(inArray(manualArsipAttachment.manualArsipId, uniqueIds))
      .orderBy(
        manualArsipAttachment.manualArsipId,
        asc(manualArsipAttachment.createdAt),
        asc(manualArsipAttachment.id),
      ) as ManualAttachmentNameReadRow[]

    return groupManualAttachmentsByManualArsipId(rows)
  },

  async findActorDisplayNames(actorIds) {
    const uniqueIds = [...new Set(actorIds.filter(Boolean))]
    if (uniqueIds.length === 0) return new Map()

    const database = await getDatabase()
    const rows = await database
      .select({
        id: users.id,
        display_name: users.displayName,
        nama_lengkap: users.namaLengkap,
        email: users.email,
      })
      .from(users)
      .where(inArray(users.id, uniqueIds))
      .limit(uniqueIds.length) as ActorDisplayReadRow[]

    return new Map(
      rows
        .map((row) => [row.id, resolveActorDisplayName(row)] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
    )
  },
}

function getRepository(deps: BerkasArsipReadModelDeps): BerkasArsipReadModelRepository {
  return deps.repository ?? defaultBerkasArsipReadModelRepository
}

async function getDatabase() {
  const client = await import('#/db/client')
  return client.db
}

function folderProjection() {
  return {
    berkas_id: berkasArsip.id,
    klasifikasi_id: berkasArsip.klasifikasiId,
    klasifikasi_kode_snapshot: berkasArsip.klasifikasiKodeSnapshot,
    klasifikasi_nama_snapshot: berkasArsip.klasifikasiNamaSnapshot,
    status_berkas: berkasArsip.statusBerkas,
    status_arsip: berkasArsip.statusArsip,
    nomor_spm: berkasArsip.nomorSpm,
    retensi_aktif: berkasArsip.retensiAktif,
    retensi_inaktif: berkasArsip.retensiInaktif,
    masa_aktif_berakhir: berkasArsip.masaAktifBerakhir,
    masa_inaktif_berakhir: berkasArsip.masaInaktifBerakhir,
    closed_at: berkasArsip.closedAt,
    closed_by: berkasArsip.closedBy,
    created_at: berkasArsip.createdAt,
    updated_at: berkasArsip.updatedAt,
  }
}

function buildFolderFilters(options: NormalizedListBerkasArsipFolderQuery): SQL[] {
  const filters: SQL[] = []

  if (options.status_arsip !== undefined) {
    filters.push(options.status_arsip === null
      ? sql`${berkasArsip.statusArsip} is null`
      : eq(berkasArsip.statusArsip, options.status_arsip))
  }
  if (options.status_berkas) filters.push(eq(berkasArsip.statusBerkas, options.status_berkas))
  if (options.klasifikasi_id) filters.push(eq(berkasArsip.klasifikasiId, options.klasifikasi_id))
  if (options.search) {
    const pattern = `%${escapeIlikePattern(options.search)}%`
    const searchFilter = or(
      ilike(berkasArsip.klasifikasiKodeSnapshot, pattern),
      ilike(berkasArsip.klasifikasiNamaSnapshot, pattern),
      ilike(berkasArsip.nomorSpm, pattern),
    )
    if (searchFilter) filters.push(searchFilter)
  }

  return filters
}

type ItemSummary = {
  itemCount: number
  workflowItemCount: number
  manualItemCount: number
  totalNominalRealisasi: number | null
}

function summarizeItemsByBerkas(itemRows: BerkasItemSourceReadRow[]): Map<string, ItemSummary> {
  const summaries = new Map<string, ItemSummary>()

  for (const row of itemRows) {
    const current = summaries.get(row.berkas_id) ?? {
      itemCount: 0,
      workflowItemCount: 0,
      manualItemCount: 0,
      totalNominalRealisasi: null,
    }

    current.itemCount += 1
    if (row.source_type === ARCHIVE_SOURCE_TYPE.WORKFLOW) current.workflowItemCount += 1
    if (row.source_type === ARCHIVE_SOURCE_TYPE.MANUAL) current.manualItemCount += 1

    const nominal = getSourceNominal(row)
    if (nominal !== null) {
      current.totalNominalRealisasi = (current.totalNominalRealisasi ?? 0) + nominal
    }

    summaries.set(row.berkas_id, current)
  }

  return summaries
}

// RP-01: "Umur Berkas" + "Jatuh Tempo" dihitung saat baca. Tanggal jatuh tempo
// disimpan di kolom warisan `masa_aktif_berakhir` sejak RP-01.
function mapBerkasAging(row: BerkasFolderReadRow): {
  umur_berkas: number | null
  jatuh_tempo: boolean
  tanggal_jatuh_tempo: string | null
} {
  if (row.status_berkas !== 'CLOSED') {
    return { umur_berkas: null, jatuh_tempo: false, tanggal_jatuh_tempo: null }
  }

  const aging = computeBerkasAging({
    closedAt: row.closed_at ?? null,
    dueDate: toIsoLikeString(row.masa_aktif_berakhir),
  })

  return {
    umur_berkas: aging.umurHari,
    jatuh_tempo: aging.jatuhTempo,
    tanggal_jatuh_tempo: aging.tanggalJatuhTempo,
  }
}

function mapFolderRowToListDto(
  row: BerkasFolderReadRow,
  summary: ItemSummary | undefined,
): BerkasArsipFolderListItemDto {
  return {
    berkas_id: row.berkas_id,
    klasifikasi_id: row.klasifikasi_id,
    klasifikasi_kode_snapshot: trimToNull(row.klasifikasi_kode_snapshot),
    klasifikasi_nama_snapshot: row.klasifikasi_nama_snapshot,
    status_berkas: row.status_berkas,
    status_arsip: normalizeBerkasArchiveStatus(row.status_arsip),
    nomor_spm: trimToNull(row.nomor_spm),
    retensi_aktif: trimToNull(row.retensi_aktif),
    retensi_inaktif: trimToNull(row.retensi_inaktif),
    masa_aktif_berakhir: toIsoLikeString(row.masa_aktif_berakhir),
    masa_inaktif_berakhir: toIsoLikeString(row.masa_inaktif_berakhir),
    closed_at: toIsoLikeString(row.closed_at),
    closed_by: trimToNull(row.closed_by),
    ...mapBerkasAging(row),
    item_count: summary?.itemCount ?? 0,
    workflow_item_count: summary?.workflowItemCount ?? 0,
    manual_item_count: summary?.manualItemCount ?? 0,
    total_nominal_realisasi: summary?.totalNominalRealisasi ?? null,
    created_at: toIsoLikeString(row.created_at),
    updated_at: toIsoLikeString(row.updated_at),
  }
}

function mapItemRowToDetailDto(
  row: BerkasItemSourceReadRow,
  manualAttachments: Map<string, ManualAttachmentNameReadRow[]>,
  actorDisplayNames: Map<string, string>,
): BerkasArsipDetailItemDto {
  const sourceType = normalizeSourceType(row.source_type)
  const sourceFound = isSourceFound(row, sourceType)
  const sourceCreatedBy = sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW
    ? trimToNull(row.workflow_created_by)
    : trimToNull(row.manual_created_by)
  const attachments = getAttachmentNames(row, sourceType, sourceFound, manualAttachments)
  const attachmentCount = getAttachmentCount(row, sourceType, sourceFound, attachments)
  const warnings = collectItemWarnings(row, sourceType, sourceFound, attachmentCount)

  return {
    item_id: row.item_id,
    item_added_at: toIsoLikeString(row.item_added_at),
    source_type: sourceType,
    source_title: getSourceTitle(row, sourceType, sourceFound),
    source_date: getSourceDate(row, sourceType),
    source_nominal_realisasi: getSourceNominal(row),
    source_created_by_display_name: sourceCreatedBy ? actorDisplayNames.get(sourceCreatedBy) ?? null : null,
    attachment_count: attachmentCount,
    attachments,
    has_attachments: typeof attachmentCount === 'number' && attachmentCount > 0,
    workflow: sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW
      ? {
        title: trimToNull(row.workflow_title),
        status: trimToNull(row.workflow_status),
        current_step: trimToNull(row.workflow_current_step),
        fungsi_nama: trimToNull(row.fungsi_nama),
        kegiatan_nama: trimToNull(row.kegiatan_nama),
      }
      : null,
    manual: sourceType === ARCHIVE_SOURCE_TYPE.MANUAL
      ? {
        nama: trimToNull(row.manual_nama),
        komponen_name: trimToNull(row.manual_komponen_name),
        keterangan: trimToNull(row.manual_keterangan),
      }
      : null,
    warnings,
  }
}

function summarizeFolderListRows(
  rows: BerkasArsipFolderListItemDto[],
  options: NormalizedListBerkasArsipFolderQuery,
): BerkasArsipFolderListSummary {
  const summary: BerkasArsipFolderListSummary = {
    total_rows_returned: rows.length,
    status_berkas_counts: {},
    status_arsip_counts: {},
    item_count_total: 0,
    workflow_item_count_total: 0,
    manual_item_count_total: 0,
    total_nominal_realisasi: null,
    applied_limit: options.limit,
    applied_offset: options.offset,
  }

  for (const row of rows) {
    summary.status_berkas_counts[row.status_berkas] = (summary.status_berkas_counts[row.status_berkas] ?? 0) + 1
    const archiveStatus = row.status_arsip ?? 'UNKNOWN'
    summary.status_arsip_counts[archiveStatus] = (summary.status_arsip_counts[archiveStatus] ?? 0) + 1
    summary.item_count_total += row.item_count
    summary.workflow_item_count_total += row.workflow_item_count
    summary.manual_item_count_total += row.manual_item_count
    if (row.total_nominal_realisasi !== null) {
      summary.total_nominal_realisasi = (summary.total_nominal_realisasi ?? 0) + row.total_nominal_realisasi
    }
  }

  return summary
}

function normalizeListQuery(query: ListBerkasArsipFolderQuery): NormalizedListBerkasArsipFolderQuery {
  const parsed = listBerkasArsipFolderQuerySchema.safeParse(query)
  const data = parsed.success ? parsed.data : {}

  return {
    status_arsip: Object.prototype.hasOwnProperty.call(data, 'status_arsip')
      ? data.status_arsip
      : undefined,
    status_berkas: data.status_berkas ?? null,
    klasifikasi_id: trimToNull(data.klasifikasi_id),
    search: trimToNull(data.search),
    due_only: data.due_only ?? false,
    limit: data.limit ?? BERKAS_ARSIP_READ_MODEL_DEFAULT_LIMIT,
    offset: data.offset ?? 0,
  }
}

function collectSourceActorIds(itemRows: BerkasItemSourceReadRow[]): string[] {
  return [
    ...new Set(itemRows.flatMap((row) => [
      trimToNull(row.workflow_created_by),
      trimToNull(row.manual_created_by),
    ]).filter((id): id is string => Boolean(id))),
  ]
}

function collectActivityActorIds(activityRows: BerkasActivityReadRow[]): string[] {
  return [
    ...new Set(activityRows.map((row) => trimToNull(row.actor_user_id)).filter((id): id is string => Boolean(id))),
  ]
}

function mapActivityRowsToDto(
  rows: BerkasActivityReadRow[],
  actorDisplayNames: Map<string, string>,
): BerkasArsipActivityEventDto[] {
  return rows
    .map((row): BerkasArsipActivityEventDto | null => {
      if (!isBerkasActivityEventType(row.event_type)) return null
      const sourceType = isBerkasActivitySourceType(row.source_type) ? row.source_type : null
      const createdAt = toIsoLikeString(row.created_at)
      if (!createdAt) return null
      const actorUserId = trimToNull(row.actor_user_id)

      return {
        event_type: row.event_type,
        source_type: sourceType,
        message: trimToNull(row.catatan),
        created_at: createdAt,
        actor_display_name: actorUserId ? actorDisplayNames.get(actorUserId) ?? null : null,
      }
    })
    .filter((row): row is BerkasArsipActivityEventDto => Boolean(row))
}

function collectFolderWarnings(
  row: BerkasFolderReadRow,
): Array<'OPEN_STATUS_ARSIP_NULL' | 'CLOSED_STATUS_ARSIP_UNKNOWN'> {
  const warnings: Array<'OPEN_STATUS_ARSIP_NULL' | 'CLOSED_STATUS_ARSIP_UNKNOWN'> = []

  if (row.status_berkas === 'OPEN' && row.status_arsip === null) {
    warnings.push('OPEN_STATUS_ARSIP_NULL')
  }
  if (row.status_berkas === 'CLOSED' && row.status_arsip === null) {
    warnings.push('CLOSED_STATUS_ARSIP_UNKNOWN')
  }

  return warnings
}

function collectItemWarnings(
  row: BerkasItemSourceReadRow,
  sourceType: ArchiveSourceType,
  sourceFound: boolean,
  attachmentCount: number | null,
): BerkasArsipDetailItemWarning[] {
  const warnings = new Set<BerkasArsipDetailItemWarning>()

  if (!ARCHIVE_SOURCE_TYPE_VALUES.includes(row.source_type as ArchiveSourceType)) {
    warnings.add('UNKNOWN_SOURCE_TYPE')
  }
  if (!sourceFound) warnings.add('SOURCE_NOT_FOUND')
  if (sourceFound && attachmentCount === null) warnings.add('ATTACHMENT_METADATA_UNAVAILABLE')

  return [...warnings].sort()
}

function isSourceFound(row: BerkasItemSourceReadRow, sourceType: ArchiveSourceType): boolean {
  if (sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW) return Boolean(trimToNull(row.workflow_title))
  if (sourceType === ARCHIVE_SOURCE_TYPE.MANUAL) return Boolean(trimToNull(row.manual_nama))

  return false
}

function getSourceTitle(
  row: BerkasItemSourceReadRow,
  sourceType: ArchiveSourceType,
  sourceFound: boolean,
): string {
  if (!sourceFound) return 'Sumber tidak ditemukan'
  if (sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW) return trimToNull(row.workflow_title) ?? 'Dokumen workflow'
  if (sourceType === ARCHIVE_SOURCE_TYPE.MANUAL) return trimToNull(row.manual_nama) ?? 'Dokumen manual'

  return 'Sumber tidak dikenal'
}

function getSourceDate(row: BerkasItemSourceReadRow, sourceType: ArchiveSourceType): string | null {
  if (sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW) return toIsoLikeString(row.workflow_date)
  if (sourceType === ARCHIVE_SOURCE_TYPE.MANUAL) return toIsoLikeString(row.manual_date)

  return null
}

function getSourceNominal(row: BerkasItemSourceReadRow): number | null {
  if (row.source_type === ARCHIVE_SOURCE_TYPE.WORKFLOW) {
    if (row.workflow_is_non_material === true) return null
    return normalizeMoney(row.workflow_nominal_realisasi)
  }
  if (row.source_type === ARCHIVE_SOURCE_TYPE.MANUAL) {
    return normalizeMoney(row.manual_nominal_realisasi)
  }

  return null
}

function getAttachmentCount(
  row: BerkasItemSourceReadRow,
  sourceType: ArchiveSourceType,
  sourceFound: boolean,
  attachments: SafeBerkasAttachmentName[],
): number | null {
  if (!sourceFound) return null
  if (sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW) return countJsonArray(row.workflow_lampiran_urls)
  if (sourceType === ARCHIVE_SOURCE_TYPE.MANUAL) return attachments.length

  return null
}

function getAttachmentNames(
  row: BerkasItemSourceReadRow,
  sourceType: ArchiveSourceType,
  sourceFound: boolean,
  manualAttachments: Map<string, ManualAttachmentNameReadRow[]>,
): SafeBerkasAttachmentName[] {
  if (!sourceFound) return []
  if (sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW) {
    return resolveWorkflowAttachmentNames(row.workflow_lampiran_urls, {
      id: row.dokumen_id ?? '',
      judul: row.workflow_title,
      tanggal: row.workflow_date,
      is_non_material: row.workflow_is_non_material,
      kegiatan_nama: row.kegiatan_nama,
      nama_dokumen: row.nama_dokumen,
      komponen_nama: row.komponen_nama,
      jenis_permintaan_nama: row.jenis_permintaan_nama,
      kategori_permintaan_nama: row.kategori_permintaan_nama,
      detail_permintaan_nama: row.detail_permintaan_nama,
    })
  }
  if (sourceType === ARCHIVE_SOURCE_TYPE.MANUAL) {
    const manualArsipId = trimToNull(row.manual_arsip_id)
    if (!manualArsipId) return []

    const document = {
      nama: row.manual_nama,
      tanggal: row.manual_date,
      komponen_nama: row.manual_komponen_name,
    }

    return (manualAttachments.get(manualArsipId) ?? [])
      .map(attachment => resolveManualAttachmentNames(attachment, document))
  }

  return []
}

function normalizeSourceType(value: string | null | undefined): ArchiveSourceType {
  return ARCHIVE_SOURCE_TYPE_VALUES.includes(value as ArchiveSourceType)
    ? value as ArchiveSourceType
    : ARCHIVE_SOURCE_TYPE.WORKFLOW
}

function normalizeBerkasArchiveStatus(value: string | null | undefined): BerkasArchiveStatus | null {
  return BERKAS_ARCHIVE_STATUS_VALUES.includes(value as BerkasArchiveStatus)
    ? value as BerkasArchiveStatus
    : null
}

function normalizeMoney(value: string | number | null | undefined): number | null {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN

  return Number.isFinite(parsed) ? parsed : null
}

function countJsonArray(value: unknown): number | null {
  if (Array.isArray(value)) return value.length
  if (value === null || value === undefined) return 0
  if (typeof value !== 'string') return null

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.length : null
  } catch {
    return null
  }
}

function groupManualAttachmentsByManualArsipId(
  rows: ManualAttachmentNameReadRow[],
): Map<string, ManualAttachmentNameReadRow[]> {
  const grouped = new Map<string, ManualAttachmentNameReadRow[]>()

  for (const row of rows) {
    const current = grouped.get(row.manual_arsip_id) ?? []
    current.push(row)
    grouped.set(row.manual_arsip_id, current)
  }

  return grouped
}

function resolveActorDisplayName(row: ActorDisplayReadRow): string | null {
  return trimToNull(row.display_name)
    ?? trimToNull(row.nama_lengkap)
    ?? trimToNull(row.email)
}

function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

function toIsoLikeString(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) return value.toISOString()
  return trimToNull(value)
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}
