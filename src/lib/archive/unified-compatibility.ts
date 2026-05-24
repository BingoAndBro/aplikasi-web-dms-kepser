import {
  ARCHIVE_SOURCE_TYPE,
  type ArchiveSourceType,
  type StatusArsip,
} from '#/lib/constants/archive-status'

export type UnifiedArchiveCompatibilityRow = {
  source_type: ArchiveSourceType
  source_id: string
  canonical_archive_id: string | null
  dokumen_transaksi_id: string | null
  nama_arsip: string | null
  nomor_surat: string | null
  klasifikasi_id: string | null
  klasifikasi_kode_snapshot: string | null
  klasifikasi_nama_snapshot: string | null
  tanggal_diarsipkan: string | null
  diarsipkan_oleh: string | null
  retensi_aktif: string | null
  retensi_inaktif: string | null
  masa_aktif_berakhir: string | null
  masa_inaktif_berakhir: string | null
  nominal_realisasi: number | null
  status_arsip: StatusArsip
  attachment_count: number
  missing_fields: UnifiedArchiveMissingField[]
  warnings: UnifiedArchiveWarning[]
}

export type UnifiedArchiveMissingField =
  | 'canonical_archive_id'
  | 'created_by'
  | 'diarsipkan_oleh'
  | 'dokumen_transaksi_id'
  | 'klasifikasi_id'
  | 'klasifikasi_kode_snapshot'
  | 'klasifikasi_nama_snapshot'
  | 'masa_aktif_berakhir'
  | 'masa_inaktif_berakhir'
  | 'nama_arsip'
  | 'nominal_realisasi'
  | 'nomor_surat'
  | 'retensi_aktif'
  | 'retensi_inaktif'
  | 'tanggal_diarsipkan'

export type UnifiedArchiveWarning =
  | 'attachment_count_not_joined'
  | 'manual_canonical_parent_required'
  | 'manual_nominal_realisasi_nullable_legacy_row'
  | 'manual_nomor_surat_not_available_in_source'
  | 'manual_retention_fields_not_available_in_source'
  | 'workflow_legacy_klasifikasi_text_requires_mapping'
  | 'workflow_nama_arsip_derived_from_document_title'
  | 'workflow_source_type_not_workflow'

export type WorkflowArchiveCompatibilityInput = {
  id: string
  sourceType?: ArchiveSourceType | string | null
  dokumenId: string | null
  namaArsip?: string | null
  documentTitle?: string | null
  nomorSurat: string | null
  klasifikasi?: string | null
  klasifikasiId?: string | null
  klasifikasiKodeSnapshot?: string | null
  klasifikasiNamaSnapshot?: string | null
  archivedAt: Date | string | null
  archivedBy: string | null
  createdBy?: string | null
  retensiAktif: string | null
  retensiInaktif: string | null
  masaAktifBerakhir: Date | string | null
  masaInaktifBerakhir: Date | string | null
  nominalRealisasi: string | number | null
  statusArsip: StatusArsip
  lampiranSnapshot?: unknown
}

export type ManualArchiveCompatibilityInput = {
  id: string
  canonicalArchiveId?: string | null
  nama: string | null
  tanggal: Date | string | null
  createdAt?: Date | string | null
  createdBy: string | null
  klasifikasiId?: string | null
  klasifikasiKodeSnapshot?: string | null
  klasifikasiNamaSnapshot?: string | null
  nominalRealisasi: string | number | null
  statusArsip: StatusArsip
  attachmentCount?: number | null
}

export type UnifiedArchiveBackfillSummary = {
  total_rows: number
  by_source_type: Record<ArchiveSourceType, number>
  missing_field_counts: Partial<Record<UnifiedArchiveMissingField, number>>
  warning_counts: Partial<Record<UnifiedArchiveWarning, number>>
}

export function mapWorkflowArchiveToCompatibilityRow(
  input: WorkflowArchiveCompatibilityInput,
): UnifiedArchiveCompatibilityRow {
  const missing = createMissingFieldCollector()
  const warnings = createWarningCollector()

  const canonicalNamaArsip = trimToNull(input.namaArsip)
  const fallbackNamaArsip = canonicalNamaArsip ? null : trimToNull(input.documentTitle)
  const namaArsip = canonicalNamaArsip ?? fallbackNamaArsip

  if (!namaArsip) missing.add('nama_arsip')
  if (!canonicalNamaArsip && fallbackNamaArsip) {
    warnings.add('workflow_nama_arsip_derived_from_document_title')
  }

  const nomorSurat = trimToNull(input.nomorSurat)
  const klasifikasiId = trimToNull(input.klasifikasiId)
  const klasifikasiKodeSnapshot = trimToNull(input.klasifikasiKodeSnapshot)
  const klasifikasiNamaSnapshot = trimToNull(input.klasifikasiNamaSnapshot)

  if (!input.dokumenId) missing.add('dokumen_transaksi_id')
  if (!nomorSurat) missing.add('nomor_surat')
  if (!klasifikasiId) missing.add('klasifikasi_id')
  if (!klasifikasiKodeSnapshot) missing.add('klasifikasi_kode_snapshot')
  if (!klasifikasiNamaSnapshot) missing.add('klasifikasi_nama_snapshot')
  if (!input.archivedAt) missing.add('tanggal_diarsipkan')
  if (!input.archivedBy) missing.add('diarsipkan_oleh')
  if (!input.createdBy) missing.add('created_by')
  addRetentionMissingFields(missing, input)

  if (!klasifikasiId && trimToNull(input.klasifikasi)) {
    warnings.add('workflow_legacy_klasifikasi_text_requires_mapping')
  }

  if (input.sourceType && input.sourceType !== ARCHIVE_SOURCE_TYPE.WORKFLOW) {
    warnings.add('workflow_source_type_not_workflow')
  }

  return {
    source_type: ARCHIVE_SOURCE_TYPE.WORKFLOW,
    source_id: input.id,
    canonical_archive_id: input.id,
    dokumen_transaksi_id: input.dokumenId,
    nama_arsip: namaArsip,
    nomor_surat: nomorSurat,
    klasifikasi_id: klasifikasiId,
    klasifikasi_kode_snapshot: klasifikasiKodeSnapshot,
    klasifikasi_nama_snapshot: klasifikasiNamaSnapshot,
    tanggal_diarsipkan: toIsoLikeString(input.archivedAt),
    diarsipkan_oleh: input.archivedBy,
    retensi_aktif: trimToNull(input.retensiAktif),
    retensi_inaktif: trimToNull(input.retensiInaktif),
    masa_aktif_berakhir: toIsoLikeString(input.masaAktifBerakhir),
    masa_inaktif_berakhir: toIsoLikeString(input.masaInaktifBerakhir),
    nominal_realisasi: normalizeNumericValue(input.nominalRealisasi),
    status_arsip: input.statusArsip,
    attachment_count: countLampiranSnapshot(input.lampiranSnapshot),
    missing_fields: missing.values(),
    warnings: warnings.values(),
  }
}

export function mapManualArchiveToCompatibilityRow(
  input: ManualArchiveCompatibilityInput,
): UnifiedArchiveCompatibilityRow {
  const missing = createMissingFieldCollector()
  const warnings = createWarningCollector()

  const canonicalArchiveId = trimToNull(input.canonicalArchiveId)
  const namaArsip = trimToNull(input.nama)
  const klasifikasiId = trimToNull(input.klasifikasiId)
  const klasifikasiKodeSnapshot = trimToNull(input.klasifikasiKodeSnapshot)
  const klasifikasiNamaSnapshot = trimToNull(input.klasifikasiNamaSnapshot)
  const nominalRealisasi = normalizeNumericValue(input.nominalRealisasi)

  if (!canonicalArchiveId) {
    missing.add('canonical_archive_id')
    warnings.add('manual_canonical_parent_required')
  }
  if (!namaArsip) missing.add('nama_arsip')
  missing.add('nomor_surat')
  warnings.add('manual_nomor_surat_not_available_in_source')
  if (!klasifikasiId) missing.add('klasifikasi_id')
  if (!klasifikasiKodeSnapshot) missing.add('klasifikasi_kode_snapshot')
  if (!klasifikasiNamaSnapshot) missing.add('klasifikasi_nama_snapshot')
  if (!input.tanggal) missing.add('tanggal_diarsipkan')
  if (!input.createdBy) missing.add('diarsipkan_oleh')
  addManualRetentionGaps(missing, warnings)

  if (nominalRealisasi === null || nominalRealisasi <= 0) {
    missing.add('nominal_realisasi')
    warnings.add('manual_nominal_realisasi_nullable_legacy_row')
  }

  if (input.attachmentCount === undefined || input.attachmentCount === null) {
    warnings.add('attachment_count_not_joined')
  }

  return {
    source_type: ARCHIVE_SOURCE_TYPE.MANUAL,
    source_id: input.id,
    canonical_archive_id: canonicalArchiveId,
    dokumen_transaksi_id: null,
    nama_arsip: namaArsip,
    nomor_surat: null,
    klasifikasi_id: klasifikasiId,
    klasifikasi_kode_snapshot: klasifikasiKodeSnapshot,
    klasifikasi_nama_snapshot: klasifikasiNamaSnapshot,
    tanggal_diarsipkan: toIsoLikeString(input.tanggal),
    diarsipkan_oleh: input.createdBy,
    retensi_aktif: null,
    retensi_inaktif: null,
    masa_aktif_berakhir: null,
    masa_inaktif_berakhir: null,
    nominal_realisasi: nominalRealisasi,
    status_arsip: input.statusArsip,
    attachment_count: normalizeAttachmentCount(input.attachmentCount),
    missing_fields: missing.values(),
    warnings: warnings.values(),
  }
}

export function summarizeUnifiedArchiveBackfillRows(
  rows: UnifiedArchiveCompatibilityRow[],
): UnifiedArchiveBackfillSummary {
  const summary: UnifiedArchiveBackfillSummary = {
    total_rows: rows.length,
    by_source_type: {
      WORKFLOW: 0,
      MANUAL: 0,
    },
    missing_field_counts: {},
    warning_counts: {},
  }

  for (const row of rows) {
    summary.by_source_type[row.source_type] += 1
    for (const field of row.missing_fields) {
      summary.missing_field_counts[field] = (summary.missing_field_counts[field] ?? 0) + 1
    }
    for (const warning of row.warnings) {
      summary.warning_counts[warning] = (summary.warning_counts[warning] ?? 0) + 1
    }
  }

  return summary
}

function createMissingFieldCollector(): {
  add: (field: UnifiedArchiveMissingField) => void
  values: () => UnifiedArchiveMissingField[]
} {
  const fields = new Set<UnifiedArchiveMissingField>()

  return {
    add: (field) => fields.add(field),
    values: () => [...fields].sort(),
  }
}

function createWarningCollector(): {
  add: (field: UnifiedArchiveWarning) => void
  values: () => UnifiedArchiveWarning[]
} {
  const warnings = new Set<UnifiedArchiveWarning>()

  return {
    add: (warning) => warnings.add(warning),
    values: () => [...warnings].sort(),
  }
}

function addRetentionMissingFields(
  missing: ReturnType<typeof createMissingFieldCollector>,
  input: {
    retensiAktif: string | null
    retensiInaktif: string | null
    masaAktifBerakhir: Date | string | null
    masaInaktifBerakhir: Date | string | null
  },
): void {
  if (!trimToNull(input.retensiAktif)) missing.add('retensi_aktif')
  if (!trimToNull(input.retensiInaktif)) missing.add('retensi_inaktif')
  if (!input.masaAktifBerakhir) missing.add('masa_aktif_berakhir')
  if (!input.masaInaktifBerakhir) missing.add('masa_inaktif_berakhir')
}

function addManualRetentionGaps(
  missing: ReturnType<typeof createMissingFieldCollector>,
  warnings: ReturnType<typeof createWarningCollector>,
): void {
  missing.add('retensi_aktif')
  missing.add('retensi_inaktif')
  missing.add('masa_aktif_berakhir')
  missing.add('masa_inaktif_berakhir')
  warnings.add('manual_retention_fields_not_available_in_source')
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toIsoLikeString(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) return value.toISOString()
  return trimToNull(value)
}

function normalizeNumericValue(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function countLampiranSnapshot(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (typeof value !== 'string') return 0

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

function normalizeAttachmentCount(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return Math.trunc(value)
}
