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

/**
 * RP-01: satu field "Masa Simpan Minimal". Menghitung satu tanggal jatuh tempo
 * dari `closedAt + masaSimpan`. "Permanen" -> sentinel `9999-12-31` (tak pernah
 * jatuh tempo). Nilai ini disimpan di kolom warisan `masa_aktif_berakhir`.
 */
export function calculateBerkasDueDate(input: {
  closedAt: string
  masaSimpan: RetensiLabel
}): string {
  if (!isDateOnlyString(input.closedAt)) {
    throw new Error('Tanggal tutup berkas harus valid dengan format YYYY-MM-DD')
  }

  if (input.masaSimpan === 'Permanen') {
    return PERMANENT_RETENTION_SENTINEL_DATE
  }

  return addCalendarYears(input.closedAt, RETENTION_YEARS_BY_LABEL[input.masaSimpan])
}

/**
 * RP-01: "Umur Berkas" + badge "Jatuh Tempo" dihitung saat dibaca (tanpa scheduler).
 * Perbandingan dilakukan date-only untuk menghindari off-by-one zona waktu.
 */
export function computeBerkasAging(input: {
  closedAt: string | Date | null | undefined
  dueDate: string | null | undefined
  now?: Date
}): { umurHari: number | null; jatuhTempo: boolean; tanggalJatuhTempo: string | null } {
  // `now` is always a Date -> toDateOnly never returns null for this path.
  const nowDateOnly = toDateOnly(input.now ?? new Date()) as string
  const closedDateOnly = toDateOnly(input.closedAt)
  const dueDateOnly = toDateOnly(input.dueDate)

  const umurHari = closedDateOnly
    ? Math.max(0, diffCalendarDays(closedDateOnly, nowDateOnly))
    : null

  const jatuhTempo = Boolean(
    dueDateOnly
      && dueDateOnly !== PERMANENT_RETENTION_SENTINEL_DATE
      && nowDateOnly >= dueDateOnly,
  )

  return { umurHari, jatuhTempo, tanggalJatuhTempo: dueDateOnly }
}

function toDateOnly(value: string | Date | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) {
    return [
      String(value.getUTCFullYear()).padStart(4, '0'),
      String(value.getUTCMonth() + 1).padStart(2, '0'),
      String(value.getUTCDate()).padStart(2, '0'),
    ].join('-')
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value)
  return match ? match[1] : null
}

function diffCalendarDays(fromDateOnly: string, toDateOnlyValue: string): number {
  const [fy, fm, fd] = fromDateOnly.split('-').map(Number)
  const [ty, tm, td] = toDateOnlyValue.split('-').map(Number)
  const fromMs = Date.UTC(fy, fm - 1, fd)
  const toMs = Date.UTC(ty, tm - 1, td)
  return Math.round((toMs - fromMs) / 86_400_000)
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
