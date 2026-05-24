import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'

import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  arsip,
  manualArsip,
  manualArsipAttachment,
  masterKlasifikasiArsip,
} from '#/db/schema/arsip'
import {
  ARCHIVE_SOURCE_TYPE,
  ARCHIVE_STATUS_VALUES,
  type StatusArsip,
} from '#/lib/constants/archive-status'
import {
  mapManualArchiveToCompatibilityRow,
  mapWorkflowArchiveToCompatibilityRow,
  summarizeUnifiedArchiveBackfillRows,
  type UnifiedArchiveBackfillSummary,
  type UnifiedArchiveCompatibilityRow,
} from './unified-compatibility'

export const UNIFIED_ARCHIVE_COMPATIBILITY_READER_DEFAULT_LIMIT = 100
export const UNIFIED_ARCHIVE_COMPATIBILITY_READER_MAX_LIMIT = 500

export type UnifiedArchiveCompatibilityReportOptions = {
  status_arsip?: StatusArsip
  limit?: number
}

export type UnifiedArchiveCompatibilityReport = {
  rows: UnifiedArchiveCompatibilityRow[]
  summary: UnifiedArchiveBackfillSummary
}

export type UnifiedArchiveCompatibilityReaderDatabase = {
  select(projection: Record<string, unknown>): UnifiedArchiveSelectFrom
}

type UnifiedArchiveSelectFrom = {
  from(table: unknown): any
}

type WorkflowArchiveReaderRow = {
  id: string
  source_type: string | null
  dokumen_id: string | null
  nama_arsip: string | null
  document_title: string | null
  nomor_surat: string | null
  klasifikasi: string | null
  klasifikasi_id: string | null
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string | null
  archived_at: Date | string | null
  archived_by: string | null
  created_by: string | null
  retensi_aktif: string | null
  retensi_inaktif: string | null
  masa_aktif_berakhir: Date | string | null
  masa_inaktif_berakhir: Date | string | null
  nominal_realisasi: string | number | null
  status_arsip: StatusArsip
  lampiran_snapshot: unknown
}

type ManualArchiveReaderRow = {
  id: string
  nama: string | null
  tanggal: Date | string | null
  created_at: Date | string | null
  created_by: string | null
  klasifikasi_id: string | null
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string | null
  nominal_realisasi: string | number | null
  status_arsip: StatusArsip
}

type ManualAttachmentCountRow = {
  manual_arsip_id: string
  attachment_count: string | number | null
}

export function createUnifiedArchiveCompatibilityReader(
  database: UnifiedArchiveCompatibilityReaderDatabase,
): {
  getUnifiedArchiveCompatibilityReport: (
    options?: UnifiedArchiveCompatibilityReportOptions
  ) => Promise<UnifiedArchiveCompatibilityReport>
} {
  return {
    getUnifiedArchiveCompatibilityReport(options = {}) {
      return getUnifiedArchiveCompatibilityReportForDatabase(database, options)
    },
  }
}

export async function getUnifiedArchiveCompatibilityReport(
  options: UnifiedArchiveCompatibilityReportOptions = {},
): Promise<UnifiedArchiveCompatibilityReport> {
  const { db } = await import('#/db/client')

  return getUnifiedArchiveCompatibilityReportForDatabase(
    db as unknown as UnifiedArchiveCompatibilityReaderDatabase,
    options,
  )
}

export async function getUnifiedArchiveCompatibilityReportForDatabase(
  database: UnifiedArchiveCompatibilityReaderDatabase,
  options: UnifiedArchiveCompatibilityReportOptions = {},
): Promise<UnifiedArchiveCompatibilityReport> {
  const limit = normalizeReaderLimit(options.limit)
  const statusFilter = normalizeStatusFilter(options.status_arsip)

  const [workflowRows, manualRows] = await Promise.all([
    selectWorkflowArchiveRows(database, { limit, statusFilter }),
    selectManualArchiveRows(database, { limit, statusFilter }),
  ])
  const manualAttachmentCounts = await selectManualAttachmentCounts(
    database,
    manualRows.map((row) => row.id),
  )

  const rows = [
    ...workflowRows.map((row) => mapWorkflowArchiveToCompatibilityRow({
      id: row.id,
      sourceType: row.source_type,
      dokumenId: row.dokumen_id,
      namaArsip: row.nama_arsip,
      documentTitle: row.document_title,
      nomorSurat: row.nomor_surat,
      klasifikasi: row.klasifikasi,
      klasifikasiId: row.klasifikasi_id,
      klasifikasiKodeSnapshot: row.klasifikasi_kode_snapshot,
      klasifikasiNamaSnapshot: row.klasifikasi_nama_snapshot,
      archivedAt: row.archived_at,
      archivedBy: row.archived_by,
      createdBy: row.created_by,
      retensiAktif: row.retensi_aktif,
      retensiInaktif: row.retensi_inaktif,
      masaAktifBerakhir: row.masa_aktif_berakhir,
      masaInaktifBerakhir: row.masa_inaktif_berakhir,
      nominalRealisasi: row.nominal_realisasi,
      statusArsip: row.status_arsip,
      lampiranSnapshot: row.lampiran_snapshot,
    })),
    ...manualRows.map((row) => mapManualArchiveToCompatibilityRow({
      id: row.id,
      nama: row.nama,
      tanggal: row.tanggal,
      createdAt: row.created_at,
      createdBy: row.created_by,
      klasifikasiId: row.klasifikasi_id,
      klasifikasiKodeSnapshot: row.klasifikasi_kode_snapshot,
      klasifikasiNamaSnapshot: row.klasifikasi_nama_snapshot,
      nominalRealisasi: row.nominal_realisasi,
      statusArsip: row.status_arsip,
      attachmentCount: manualAttachmentCounts.get(row.id) ?? 0,
    })),
  ]

  return {
    rows,
    summary: summarizeUnifiedArchiveBackfillRows(rows),
  }
}

async function selectWorkflowArchiveRows(
  database: UnifiedArchiveCompatibilityReaderDatabase,
  input: {
    limit: number
    statusFilter: StatusArsip | null
  },
): Promise<WorkflowArchiveReaderRow[]> {
  const filters: SQL[] = [
    eq(arsip.sourceType, ARCHIVE_SOURCE_TYPE.WORKFLOW),
  ]
  if (input.statusFilter) filters.push(eq(arsip.statusArsip, input.statusFilter))

  return database
    .select({
      id: arsip.id,
      source_type: arsip.sourceType,
      dokumen_id: arsip.dokumenId,
      nama_arsip: arsip.namaArsip,
      document_title: dokumenTransaksi.judul,
      nomor_surat: arsip.nomorSurat,
      klasifikasi: arsip.klasifikasi,
      klasifikasi_id: arsip.klasifikasiId,
      klasifikasi_kode_snapshot: arsip.klasifikasiKodeSnapshot,
      klasifikasi_nama_snapshot: arsip.klasifikasiNamaSnapshot,
      archived_at: arsip.archivedAt,
      archived_by: arsip.archivedBy,
      created_by: arsip.createdBy,
      retensi_aktif: arsip.retensiAktif,
      retensi_inaktif: arsip.retensiInaktif,
      masa_aktif_berakhir: arsip.masaAktifBerakhir,
      masa_inaktif_berakhir: arsip.masaInaktifBerakhir,
      nominal_realisasi: arsip.nominalRealisasi,
      status_arsip: arsip.statusArsip,
      lampiran_snapshot: arsip.lampiranSnapshot,
    })
    .from(arsip)
    .leftJoin(dokumenTransaksi, eq(arsip.dokumenId, dokumenTransaksi.id))
    .where(and(...filters))
    .orderBy(desc(arsip.archivedAt))
    .limit(input.limit) as Promise<WorkflowArchiveReaderRow[]>
}

async function selectManualArchiveRows(
  database: UnifiedArchiveCompatibilityReaderDatabase,
  input: {
    limit: number
    statusFilter: StatusArsip | null
  },
): Promise<ManualArchiveReaderRow[]> {
  const filters: SQL[] = []
  if (input.statusFilter) filters.push(eq(manualArsip.statusArsip, input.statusFilter))

  let builder = database
    .select({
      id: manualArsip.id,
      nama: manualArsip.nama,
      tanggal: manualArsip.tanggal,
      created_at: manualArsip.createdAt,
      created_by: manualArsip.createdBy,
      klasifikasi_id: manualArsip.klasifikasiId,
      klasifikasi_kode_snapshot: masterKlasifikasiArsip.kode,
      klasifikasi_nama_snapshot: manualArsip.klasifikasiNamaSnapshot,
      nominal_realisasi: manualArsip.nominalRealisasi,
      status_arsip: manualArsip.statusArsip,
    })
    .from(manualArsip)
    .leftJoin(masterKlasifikasiArsip, eq(manualArsip.klasifikasiId, masterKlasifikasiArsip.id)) as any

  if (filters.length > 0) {
    builder = builder.where(and(...filters))
  }

  return builder
    .orderBy(desc(manualArsip.tanggal), desc(manualArsip.createdAt))
    .limit(input.limit) as Promise<ManualArchiveReaderRow[]>
}

async function selectManualAttachmentCounts(
  database: UnifiedArchiveCompatibilityReaderDatabase,
  manualArsipIds: string[],
): Promise<Map<string, number>> {
  if (manualArsipIds.length === 0) return new Map()

  const rows = await database
    .select({
      manual_arsip_id: manualArsipAttachment.manualArsipId,
      attachment_count: sql<number>`count(${manualArsipAttachment.id})`,
    })
    .from(manualArsipAttachment)
    .where(inArray(manualArsipAttachment.manualArsipId, manualArsipIds))
    .groupBy(manualArsipAttachment.manualArsipId) as ManualAttachmentCountRow[]

  return new Map(
    rows.map((row) => [
      row.manual_arsip_id,
      normalizeAttachmentCount(row.attachment_count),
    ]),
  )
}

function normalizeReaderLimit(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return UNIFIED_ARCHIVE_COMPATIBILITY_READER_DEFAULT_LIMIT
  }

  const normalized = Math.trunc(value)
  if (normalized < 1) return UNIFIED_ARCHIVE_COMPATIBILITY_READER_DEFAULT_LIMIT

  return Math.min(normalized, UNIFIED_ARCHIVE_COMPATIBILITY_READER_MAX_LIMIT)
}

function normalizeStatusFilter(value: StatusArsip | null | undefined): StatusArsip | null {
  return ARCHIVE_STATUS_VALUES.includes(value as StatusArsip)
    ? value as StatusArsip
    : null
}

function normalizeAttachmentCount(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
  }

  return 0
}
