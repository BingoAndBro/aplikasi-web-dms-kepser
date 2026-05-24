export const MANUAL_ARCHIVE_RETENTION_LABELS = [
  '1 Tahun',
  '3 Tahun',
  '5 Tahun',
  '10 Tahun',
  'Permanen',
] as const

export type RetensiLabel = typeof MANUAL_ARCHIVE_RETENTION_LABELS[number]

export const PERMANENT_RETENTION_SENTINEL_DATE = '9999-12-31'

const RETENTION_YEARS_BY_LABEL: Record<Exclude<RetensiLabel, 'Permanen'>, number> = {
  '1 Tahun': 1,
  '3 Tahun': 3,
  '5 Tahun': 5,
  '10 Tahun': 10,
}

export function calculateManualArchiveRetentionDates(input: {
  tanggalDiarsipkan: string
  retensiAktif: RetensiLabel
  retensiInaktif: RetensiLabel
}): {
  masaAktifBerakhir: string
  masaInaktifBerakhir: string
} {
  if (!isDateOnlyString(input.tanggalDiarsipkan)) {
    throw new Error('Tanggal arsip harus valid dengan format YYYY-MM-DD')
  }

  if (input.retensiAktif === 'Permanen') {
    return {
      masaAktifBerakhir: PERMANENT_RETENTION_SENTINEL_DATE,
      masaInaktifBerakhir: PERMANENT_RETENTION_SENTINEL_DATE,
    }
  }

  const masaAktifBerakhir = addCalendarYears(
    input.tanggalDiarsipkan,
    RETENTION_YEARS_BY_LABEL[input.retensiAktif],
  )

  if (input.retensiInaktif === 'Permanen') {
    return {
      masaAktifBerakhir,
      masaInaktifBerakhir: PERMANENT_RETENTION_SENTINEL_DATE,
    }
  }

  return {
    masaAktifBerakhir,
    masaInaktifBerakhir: addCalendarYears(
      masaAktifBerakhir,
      RETENTION_YEARS_BY_LABEL[input.retensiInaktif],
    ),
  }
}

export function isDateOnlyString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

function addCalendarYears(dateOnly: string, years: number): string {
  const [year, month, day] = dateOnly.split('-').map(Number)
  const targetYear = year + years
  const clampedDay = Math.min(day, daysInMonth(targetYear, month))

  return [
    String(targetYear).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(clampedDay).padStart(2, '0'),
  ].join('-')
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}
