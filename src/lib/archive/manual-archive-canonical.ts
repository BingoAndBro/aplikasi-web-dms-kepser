import {
  ARCHIVE_SOURCE_TYPE,
  ARCHIVE_STATUS,
  type StatusArsip,
} from '#/lib/constants/archive-status'

export type ManualArchiveCanonicalSource = {
  id: string | null | undefined
  canonicalArsipId?: string | null
  nama: string | null | undefined
  nomorSurat: string | null | undefined
  tanggalDiarsipkan: string | null | undefined
  klasifikasiId: string | null | undefined
  klasifikasiKodeSnapshot: string | null | undefined
  klasifikasiNamaSnapshot: string | null | undefined
  retensiAktif: string | null | undefined
  retensiInaktif: string | null | undefined
  masaAktifBerakhir: string | null | undefined
  masaInaktifBerakhir: string | null | undefined
  archivedBy: string | null | undefined
  createdBy: string | null | undefined
  nominalRealisasi: string | number | null | undefined
  statusArsip: StatusArsip | string | null | undefined
}

export type ManualArchiveCanonicalInsertValues = {
  sourceType: 'MANUAL'
  dokumenId: null
  namaArsip: string
  nomorSurat: string
  klasifikasiId: string
  klasifikasiKodeSnapshot: string
  klasifikasiNamaSnapshot: string
  retensiAktif: string
  retensiInaktif: string
  masaAktifBerakhir: string
  masaInaktifBerakhir: string
  archivedAt: Date
  archivedBy: string
  createdBy: string
  nominalRealisasi: string
  statusArsip: 'AKTIF'
  metadata: Record<string, never>
}

export type ManualArchiveCanonicalField =
  | 'id'
  | 'nama'
  | 'nomorSurat'
  | 'tanggalDiarsipkan'
  | 'klasifikasiId'
  | 'klasifikasiKodeSnapshot'
  | 'klasifikasiNamaSnapshot'
  | 'retensiAktif'
  | 'retensiInaktif'
  | 'masaAktifBerakhir'
  | 'masaInaktifBerakhir'
  | 'archivedBy'
  | 'createdBy'
  | 'nominalRealisasi'
  | 'statusArsip'

export type ManualArchiveCanonicalErrorReason =
  | 'missing_required_field'
  | 'invalid_date'
  | 'invalid_nominal'
  | 'invalid_status'
  | 'unexpected_error'

export class ManualArchiveCanonicalError extends Error {
  constructor(
    public readonly reason: ManualArchiveCanonicalErrorReason,
    public readonly field: ManualArchiveCanonicalField,
  ) {
    super(createManualArchiveCanonicalErrorMessage(reason, field))
    this.name = 'ManualArchiveCanonicalError'
  }
}

export type ManualArchiveCanonicalWritePlan =
  | {
      action: 'reuse'
      canonicalArsipId: string
    }
  | {
      action: 'create'
      sourceId: string
      insertValues: ManualArchiveCanonicalInsertValues
    }
  | {
      action: 'error'
      reason: ManualArchiveCanonicalErrorReason
      field?: ManualArchiveCanonicalField
      message: string
    }

type CompleteManualArchiveCanonicalSource = {
  id: string
  nama: string
  nomorSurat: string
  tanggalDiarsipkan: string
  klasifikasiId: string
  klasifikasiKodeSnapshot: string
  klasifikasiNamaSnapshot: string
  retensiAktif: string
  retensiInaktif: string
  masaAktifBerakhir: string
  masaInaktifBerakhir: string
  archivedBy: string
  createdBy: string
  nominalRealisasi: string
  statusArsip: 'AKTIF'
}

export function assertManualArchiveReadyForCanonicalWrite(
  source: ManualArchiveCanonicalSource,
): asserts source is CompleteManualArchiveCanonicalSource {
  normalizeRequiredString(source.id, 'id')
  normalizeRequiredString(source.nama, 'nama')
  normalizeRequiredString(source.nomorSurat, 'nomorSurat')
  normalizeRequiredDateOnly(source.tanggalDiarsipkan, 'tanggalDiarsipkan')
  normalizeRequiredString(source.klasifikasiId, 'klasifikasiId')
  normalizeRequiredString(source.klasifikasiKodeSnapshot, 'klasifikasiKodeSnapshot')
  normalizeRequiredString(source.klasifikasiNamaSnapshot, 'klasifikasiNamaSnapshot')
  normalizeRequiredString(source.retensiAktif, 'retensiAktif')
  normalizeRequiredString(source.retensiInaktif, 'retensiInaktif')
  normalizeRequiredDateOnly(source.masaAktifBerakhir, 'masaAktifBerakhir')
  normalizeRequiredDateOnly(source.masaInaktifBerakhir, 'masaInaktifBerakhir')
  normalizeRequiredString(source.archivedBy, 'archivedBy')
  normalizeRequiredString(source.createdBy, 'createdBy')
  normalizeRequiredNominal(source.nominalRealisasi)

  if (source.statusArsip !== ARCHIVE_STATUS.AKTIF) {
    throw new ManualArchiveCanonicalError('invalid_status', 'statusArsip')
  }
}

export function buildManualArchiveCanonicalInsertValues(
  source: ManualArchiveCanonicalSource,
): ManualArchiveCanonicalInsertValues {
  assertManualArchiveReadyForCanonicalWrite(source)

  return {
    sourceType: ARCHIVE_SOURCE_TYPE.MANUAL,
    dokumenId: null,
    namaArsip: normalizeRequiredString(source.nama, 'nama'),
    nomorSurat: normalizeRequiredString(source.nomorSurat, 'nomorSurat'),
    klasifikasiId: normalizeRequiredString(source.klasifikasiId, 'klasifikasiId'),
    klasifikasiKodeSnapshot: normalizeRequiredString(source.klasifikasiKodeSnapshot, 'klasifikasiKodeSnapshot'),
    klasifikasiNamaSnapshot: normalizeRequiredString(source.klasifikasiNamaSnapshot, 'klasifikasiNamaSnapshot'),
    retensiAktif: normalizeRequiredString(source.retensiAktif, 'retensiAktif'),
    retensiInaktif: normalizeRequiredString(source.retensiInaktif, 'retensiInaktif'),
    masaAktifBerakhir: normalizeRequiredDateOnly(source.masaAktifBerakhir, 'masaAktifBerakhir'),
    masaInaktifBerakhir: normalizeRequiredDateOnly(source.masaInaktifBerakhir, 'masaInaktifBerakhir'),
    // Manual Archive stores a date-only archive date. The canonical timestamp
    // uses UTC midnight for the same YYYY-MM-DD, never the current server time.
    archivedAt: dateOnlyToUtcMidnight(source.tanggalDiarsipkan),
    archivedBy: normalizeRequiredString(source.archivedBy, 'archivedBy'),
    createdBy: normalizeRequiredString(source.createdBy, 'createdBy'),
    nominalRealisasi: normalizeRequiredNominal(source.nominalRealisasi),
    statusArsip: ARCHIVE_STATUS.AKTIF,
    metadata: {},
  }
}

export function createManualArchiveCanonicalWritePlan(
  source: ManualArchiveCanonicalSource,
): ManualArchiveCanonicalWritePlan {
  const existingCanonicalId = trimToNull(source.canonicalArsipId)
  if (existingCanonicalId) {
    return {
      action: 'reuse',
      canonicalArsipId: existingCanonicalId,
    }
  }

  try {
    return {
      action: 'create',
      sourceId: normalizeRequiredString(source.id, 'id'),
      insertValues: buildManualArchiveCanonicalInsertValues(source),
    }
  } catch (error) {
    if (error instanceof ManualArchiveCanonicalError) {
      return {
        action: 'error',
        reason: error.reason,
        field: error.field,
        message: error.message,
      }
    }

    return {
      action: 'error',
      reason: 'unexpected_error',
      message: 'Manual Archive canonical write planning failed',
    }
  }
}

function normalizeRequiredString(
  value: string | null | undefined,
  field: ManualArchiveCanonicalField,
): string {
  const trimmed = trimToNull(value)
  if (!trimmed) {
    throw new ManualArchiveCanonicalError('missing_required_field', field)
  }

  return trimmed
}

function normalizeRequiredDateOnly(
  value: string | null | undefined,
  field: ManualArchiveCanonicalField,
): string {
  const normalized = normalizeRequiredString(value, field)
  if (!isValidDateOnly(normalized)) {
    throw new ManualArchiveCanonicalError('invalid_date', field)
  }

  return normalized
}

function normalizeRequiredNominal(value: string | number | null | undefined): string {
  const normalized = typeof value === 'number'
    ? value.toString()
    : trimToNull(value)

  if (!normalized) {
    throw new ManualArchiveCanonicalError('missing_required_field', 'nominalRealisasi')
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ManualArchiveCanonicalError('invalid_nominal', 'nominalRealisasi')
  }

  return normalized
}

function dateOnlyToUtcMidnight(value: string): Date {
  const normalized = normalizeRequiredDateOnly(value, 'tanggalDiarsipkan')
  const [year, month, day] = normalized.split('-').map(Number)

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
}

function isValidDateOnly(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}

function createManualArchiveCanonicalErrorMessage(
  reason: ManualArchiveCanonicalErrorReason,
  field: ManualArchiveCanonicalField,
): string {
  return `Manual Archive canonical write blocked: ${reason}:${field}`
}
