import { eq } from 'drizzle-orm'

import {
  arsip,
  manualArsip,
  manualArsipCategory,
} from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  masterFungsi,
  masterKegiatan,
} from '#/db/schema/master'
import {
  ARCHIVE_SOURCE_TYPE,
  ARCHIVE_SOURCE_TYPE_VALUES,
  type ArchiveSourceType,
  type StatusArsip,
} from '#/lib/constants/archive-status'

export type UnifiedArchiveDetailSourceType = ArchiveSourceType | 'UNKNOWN'

export type UnifiedArchiveDetailWarning =
  | 'UNKNOWN_SOURCE_TYPE'
  | 'MISSING_MANUAL_SOURCE'
  | 'WORKFLOW_WITHOUT_DOKUMEN_ID'
  | 'MANUAL_WITH_DOKUMEN_ID'
  | 'WORKFLOW_SOURCE_NOT_FOUND'
  | 'MANUAL_SOURCE_NOT_FOUND'
  | 'SOURCE_METADATA_INCOMPLETE'

export type WorkflowArchiveDetailSource = {
  sourceType: 'WORKFLOW'
  dokumenId: string
  judulDokumen: string | null
  isNonMaterial: boolean | null
  workflowStatus: string | null
  fungsiNama: string | null
  kegiatanNama: string | null
  tahun: number | null
  createdBy: string | null
}

export type ManualArchiveDetailSource = {
  sourceType: 'MANUAL'
  manualArsipId: string
  nama: string | null
  keterangan: string | null
  categoryId: string | null
  categoryName: string | null
  tanggalDokumenSumber: string | null
  tanggalDiarsipkan: string | null
  createdBy: string | null
  archivedBy: string | null
}

export type UnifiedArchiveDetail = {
  id: string
  sourceType: UnifiedArchiveDetailSourceType
  statusArsip: StatusArsip
  namaArsip: string | null
  nomorSurat: string | null
  klasifikasiId: string | null
  klasifikasiKodeSnapshot: string | null
  klasifikasiNamaSnapshot: string | null
  tanggalArsip: string | null
  retensiAktif: string | null
  retensiInaktif: string | null
  masaAktifBerakhir: string | null
  masaInaktifBerakhir: string | null
  nominalRealisasi: string | number | null
  createdBy: string | null
  archivedBy: string | null
  createdAt: string | null
  updatedAt: string | null
  warnings: UnifiedArchiveDetailWarning[]
  source: WorkflowArchiveDetailSource | ManualArchiveDetailSource | null
}

export type UnifiedArchiveDetailResult =
  | { status: 'found'; detail: UnifiedArchiveDetail }
  | { status: 'not_found' }

export type UnifiedArchiveDetailReaderDatabase = {
  select(projection: Record<string, unknown>): UnifiedArchiveDetailSelectFrom
}

type UnifiedArchiveDetailSelectFrom = {
  from(table: unknown): any
}

type CanonicalArchiveDetailRow = {
  id: string
  source_type: string | null
  dokumen_id: string | null
  status_arsip: StatusArsip
  nama_arsip: string | null
  nomor_surat: string | null
  klasifikasi_id: string | null
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string | null
  archived_at: Date | string | null
  retensi_aktif: string | null
  retensi_inaktif: string | null
  masa_aktif_berakhir: Date | string | null
  masa_inaktif_berakhir: Date | string | null
  nominal_realisasi: string | number | null
  created_by: string | null
  archived_by: string | null
  created_at: Date | string | null
  updated_at: Date | string | null
}

type WorkflowSourceDetailRow = {
  id: string
  judul: string | null
  is_non_material: boolean | null
  status: string | null
  fungsi_nama: string | null
  kegiatan_nama: string | null
  tahun: number | null
  created_by: string | null
}

type ManualSourceDetailRow = {
  id: string
  nama: string | null
  keterangan: string | null
  category_id: string | null
  category_name: string | null
  tanggal: Date | string | null
  tanggal_diarsipkan: Date | string | null
  created_by: string | null
  archived_by: string | null
}

export function createUnifiedArchiveDetailReader(
  database: UnifiedArchiveDetailReaderDatabase,
): {
  getUnifiedArchiveDetail: (archiveId: string) => Promise<UnifiedArchiveDetailResult>
} {
  return {
    getUnifiedArchiveDetail(archiveId) {
      return getUnifiedArchiveDetailForDatabase(database, archiveId)
    },
  }
}

export async function getUnifiedArchiveDetail(
  archiveId: string,
): Promise<UnifiedArchiveDetailResult> {
  const { db } = await import('#/db/client')

  return getUnifiedArchiveDetailForDatabase(
    db as unknown as UnifiedArchiveDetailReaderDatabase,
    archiveId,
  )
}

export async function getUnifiedArchiveDetailForDatabase(
  database: UnifiedArchiveDetailReaderDatabase,
  archiveId: string,
): Promise<UnifiedArchiveDetailResult> {
  const canonical = await selectCanonicalArchiveDetail(database, archiveId)
  if (!canonical) return { status: 'not_found' }

  const sourceType = normalizeSourceType(canonical.source_type)
  const warnings = new Set<UnifiedArchiveDetailWarning>()
  collectCanonicalWarnings(canonical, sourceType, warnings)

  const source = await selectAndMapSourceDetail(database, canonical, sourceType, warnings)

  return {
    status: 'found',
    detail: {
      id: canonical.id,
      sourceType,
      statusArsip: canonical.status_arsip,
      namaArsip: trimToNull(canonical.nama_arsip),
      nomorSurat: trimToNull(canonical.nomor_surat),
      klasifikasiId: trimToNull(canonical.klasifikasi_id),
      klasifikasiKodeSnapshot: trimToNull(canonical.klasifikasi_kode_snapshot),
      klasifikasiNamaSnapshot: trimToNull(canonical.klasifikasi_nama_snapshot),
      tanggalArsip: toIsoLikeString(canonical.archived_at),
      retensiAktif: trimToNull(canonical.retensi_aktif),
      retensiInaktif: trimToNull(canonical.retensi_inaktif),
      masaAktifBerakhir: toIsoLikeString(canonical.masa_aktif_berakhir),
      masaInaktifBerakhir: toIsoLikeString(canonical.masa_inaktif_berakhir),
      nominalRealisasi: normalizeNominal(canonical.nominal_realisasi),
      createdBy: trimToNull(canonical.created_by),
      archivedBy: trimToNull(canonical.archived_by),
      createdAt: toIsoLikeString(canonical.created_at),
      updatedAt: toIsoLikeString(canonical.updated_at),
      warnings: [...warnings].sort(),
      source,
    },
  }
}

async function selectCanonicalArchiveDetail(
  database: UnifiedArchiveDetailReaderDatabase,
  archiveId: string,
): Promise<CanonicalArchiveDetailRow | null> {
  const rows = await database
    .select({
      id: arsip.id,
      source_type: arsip.sourceType,
      dokumen_id: arsip.dokumenId,
      status_arsip: arsip.statusArsip,
      nama_arsip: arsip.namaArsip,
      nomor_surat: arsip.nomorSurat,
      klasifikasi_id: arsip.klasifikasiId,
      klasifikasi_kode_snapshot: arsip.klasifikasiKodeSnapshot,
      klasifikasi_nama_snapshot: arsip.klasifikasiNamaSnapshot,
      archived_at: arsip.archivedAt,
      retensi_aktif: arsip.retensiAktif,
      retensi_inaktif: arsip.retensiInaktif,
      masa_aktif_berakhir: arsip.masaAktifBerakhir,
      masa_inaktif_berakhir: arsip.masaInaktifBerakhir,
      nominal_realisasi: arsip.nominalRealisasi,
      created_by: arsip.createdBy,
      archived_by: arsip.archivedBy,
      created_at: arsip.createdAt,
      updated_at: arsip.updatedAt,
    })
    .from(arsip)
    .where(eq(arsip.id, archiveId))
    .limit(1) as CanonicalArchiveDetailRow[]

  return rows[0] ?? null
}

async function selectAndMapSourceDetail(
  database: UnifiedArchiveDetailReaderDatabase,
  canonical: CanonicalArchiveDetailRow,
  sourceType: UnifiedArchiveDetailSourceType,
  warnings: Set<UnifiedArchiveDetailWarning>,
): Promise<WorkflowArchiveDetailSource | ManualArchiveDetailSource | null> {
  if (sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW) {
    const dokumenId = trimToNull(canonical.dokumen_id)
    if (!dokumenId) return null

    const workflow = await selectWorkflowSourceDetail(database, dokumenId)
    if (!workflow) {
      warnings.add('WORKFLOW_SOURCE_NOT_FOUND')
      return null
    }

    const source = mapWorkflowSourceDetail(workflow)
    if (isWorkflowSourceMetadataIncomplete(source)) {
      warnings.add('SOURCE_METADATA_INCOMPLETE')
    }

    return source
  }

  if (sourceType === ARCHIVE_SOURCE_TYPE.MANUAL) {
    const manual = await selectManualSourceDetail(database, canonical.id)
    if (!manual) {
      warnings.add('MISSING_MANUAL_SOURCE')
      warnings.add('MANUAL_SOURCE_NOT_FOUND')
      return null
    }

    const source = mapManualSourceDetail(manual)
    if (isManualSourceMetadataIncomplete(source)) {
      warnings.add('SOURCE_METADATA_INCOMPLETE')
    }

    return source
  }

  return null
}

async function selectWorkflowSourceDetail(
  database: UnifiedArchiveDetailReaderDatabase,
  dokumenId: string,
): Promise<WorkflowSourceDetailRow | null> {
  const rows = await database
    .select({
      id: dokumenTransaksi.id,
      judul: dokumenTransaksi.judul,
      is_non_material: dokumenTransaksi.isNonMaterial,
      status: dokumenTransaksi.status,
      fungsi_nama: masterFungsi.nama,
      kegiatan_nama: masterKegiatan.nama,
      tahun: dokumenTransaksi.tahun,
      created_by: dokumenTransaksi.createdBy,
    })
    .from(dokumenTransaksi)
    .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
    .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
    .where(eq(dokumenTransaksi.id, dokumenId))
    .limit(1) as WorkflowSourceDetailRow[]

  return rows[0] ?? null
}

async function selectManualSourceDetail(
  database: UnifiedArchiveDetailReaderDatabase,
  archiveId: string,
): Promise<ManualSourceDetailRow | null> {
  const rows = await database
    .select({
      id: manualArsip.id,
      nama: manualArsip.nama,
      keterangan: manualArsip.keterangan,
      category_id: manualArsip.categoryId,
      category_name: manualArsipCategory.nama,
      tanggal: manualArsip.tanggal,
      tanggal_diarsipkan: manualArsip.tanggalDiarsipkan,
      created_by: manualArsip.createdBy,
      archived_by: manualArsip.archivedBy,
    })
    .from(manualArsip)
    .leftJoin(manualArsipCategory, eq(manualArsip.categoryId, manualArsipCategory.id))
    .where(eq(manualArsip.canonicalArsipId, archiveId))
    .limit(1) as ManualSourceDetailRow[]

  return rows[0] ?? null
}

function collectCanonicalWarnings(
  row: CanonicalArchiveDetailRow,
  sourceType: UnifiedArchiveDetailSourceType,
  warnings: Set<UnifiedArchiveDetailWarning>,
): void {
  if (sourceType === 'UNKNOWN') {
    warnings.add('UNKNOWN_SOURCE_TYPE')
  }
  if (sourceType === ARCHIVE_SOURCE_TYPE.WORKFLOW && !trimToNull(row.dokumen_id)) {
    warnings.add('WORKFLOW_WITHOUT_DOKUMEN_ID')
  }
  if (sourceType === ARCHIVE_SOURCE_TYPE.MANUAL && trimToNull(row.dokumen_id)) {
    warnings.add('MANUAL_WITH_DOKUMEN_ID')
  }
}

function mapWorkflowSourceDetail(row: WorkflowSourceDetailRow): WorkflowArchiveDetailSource {
  return {
    sourceType: 'WORKFLOW',
    dokumenId: row.id,
    judulDokumen: trimToNull(row.judul),
    isNonMaterial: typeof row.is_non_material === 'boolean' ? row.is_non_material : null,
    workflowStatus: trimToNull(row.status),
    fungsiNama: trimToNull(row.fungsi_nama),
    kegiatanNama: trimToNull(row.kegiatan_nama),
    tahun: typeof row.tahun === 'number' && Number.isFinite(row.tahun) ? row.tahun : null,
    createdBy: trimToNull(row.created_by),
  }
}

function mapManualSourceDetail(row: ManualSourceDetailRow): ManualArchiveDetailSource {
  return {
    sourceType: 'MANUAL',
    manualArsipId: row.id,
    nama: trimToNull(row.nama),
    keterangan: trimToNull(row.keterangan),
    categoryId: trimToNull(row.category_id),
    categoryName: trimToNull(row.category_name),
    tanggalDokumenSumber: toIsoLikeString(row.tanggal),
    tanggalDiarsipkan: toIsoLikeString(row.tanggal_diarsipkan),
    createdBy: trimToNull(row.created_by),
    archivedBy: trimToNull(row.archived_by),
  }
}

function isWorkflowSourceMetadataIncomplete(source: WorkflowArchiveDetailSource): boolean {
  return !source.judulDokumen
    || !source.workflowStatus
    || !source.fungsiNama
    || !source.kegiatanNama
    || source.tahun === null
    || !source.createdBy
}

function isManualSourceMetadataIncomplete(source: ManualArchiveDetailSource): boolean {
  return !source.nama
    || !source.keterangan
    || !source.categoryId
    || !source.categoryName
    || !source.tanggalDokumenSumber
    || !source.tanggalDiarsipkan
    || !source.createdBy
}

function normalizeSourceType(value: string | null | undefined): UnifiedArchiveDetailSourceType {
  return ARCHIVE_SOURCE_TYPE_VALUES.includes(value as ArchiveSourceType)
    ? value as ArchiveSourceType
    : 'UNKNOWN'
}

function normalizeNominal(value: string | number | null | undefined): string | number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  return trimToNull(value)
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
