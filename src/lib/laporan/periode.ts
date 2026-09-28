export type PeriodeMode = 'BULANAN' | 'TRIWULAN' | 'TAHUNAN' | 'SEMUA' | 'KUSTOM'

export type Bulan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export type PeriodeValue = {
  mode: PeriodeMode
  tahun?: number
  triwulan?: 1 | 2 | 3 | 4
  bulan?: Bulan
  dari?: string
  sampai?: string
}

export type TriwulanOption = {
  value: 1 | 2 | 3 | 4
  label: string
  mulai: string
  akhir: string
}

export const TRIWULAN_OPTIONS: readonly TriwulanOption[] = [
  { value: 1, label: 'TW1 · Jan–Mar', mulai: '01-01', akhir: '03-31' },
  { value: 2, label: 'TW2 · Apr–Jun', mulai: '04-01', akhir: '06-30' },
  { value: 3, label: 'TW3 · Jul–Sep', mulai: '07-01', akhir: '09-30' },
  { value: 4, label: 'TW4 · Okt–Des', mulai: '10-01', akhir: '12-31' },
]

export const BULAN_OPTIONS: readonly { value: Bulan; label: string }[] = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
]

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MIN_TAHUN = 2000
const MAX_TAHUN = 2100

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

function triwulanFromMonth(month: number): 1 | 2 | 3 | 4 {
  if (month <= 3) return 1
  if (month <= 6) return 2
  if (month <= 9) return 3
  return 4
}

function triwulanOption(triwulan: 1 | 2 | 3 | 4): TriwulanOption {
  return TRIWULAN_OPTIONS[triwulan - 1]
}

function lastDayOfMonth(tahun: number, bulan: Bulan): number {
  // Day 0 of the next month is the last day of `bulan` (handles leap years).
  return new Date(Date.UTC(tahun, bulan, 0)).getUTCDate()
}

export function currentPeriode(now: Date = new Date()): PeriodeValue {
  const tahun = now.getFullYear()
  const triwulan = triwulanFromMonth(now.getMonth() + 1)
  return { mode: 'TRIWULAN', tahun, triwulan }
}

export function currentBulan(now: Date = new Date()): PeriodeValue {
  return { mode: 'BULANAN', tahun: now.getFullYear(), bulan: (now.getMonth() + 1) as Bulan }
}

/**
 * Today's periode in the given default mode. Monitoring Realisasi, Laporan
 * Kinerja and Laporan Kegiatan open on the current triwulan; Laporan Saya
 * opens on the current month.
 */
export function defaultPeriode(mode: 'TRIWULAN' | 'BULANAN' = 'TRIWULAN', now: Date = new Date()): PeriodeValue {
  return mode === 'BULANAN' ? currentBulan(now) : currentPeriode(now)
}

export function resolvePeriodeRange(periode: PeriodeValue): { dari: string | null; sampai: string | null } {
  switch (periode.mode) {
    case 'BULANAN': {
      if (!periode.tahun || !periode.bulan) return { dari: null, sampai: null }
      return {
        dari: `${periode.tahun}-${pad2(periode.bulan)}-01`,
        sampai: `${periode.tahun}-${pad2(periode.bulan)}-${pad2(lastDayOfMonth(periode.tahun, periode.bulan))}`,
      }
    }
    case 'TRIWULAN': {
      if (!periode.tahun || !periode.triwulan) return { dari: null, sampai: null }
      const option = triwulanOption(periode.triwulan)
      return {
        dari: `${periode.tahun}-${option.mulai}`,
        sampai: `${periode.tahun}-${option.akhir}`,
      }
    }
    case 'TAHUNAN': {
      if (!periode.tahun) return { dari: null, sampai: null }
      return { dari: `${periode.tahun}-01-01`, sampai: `${periode.tahun}-12-31` }
    }
    case 'SEMUA':
      return { dari: null, sampai: null }
    case 'KUSTOM':
      return { dari: periode.dari ?? null, sampai: periode.sampai ?? null }
    default:
      return { dari: null, sampai: null }
  }
}

/**
 * Client-side counterpart of the API's start_date/end_date bounds, for pages
 * that load every document once and filter in the browser (Laporan Saya,
 * Laporan Kegiatan). `tanggal` is compared on its YYYY-MM-DD prefix.
 */
export function isTanggalInPeriode(tanggal: string, range: { dari: string | null; sampai: string | null }): boolean {
  const day = tanggal.slice(0, 10)
  if (range.dari && day < range.dari) return false
  if (range.sampai && day > range.sampai) return false
  return true
}

export function periodeLabel(periode: PeriodeValue): string {
  switch (periode.mode) {
    case 'BULANAN': {
      if (!periode.tahun || !periode.bulan) return 'Bulanan'
      return `${BULAN_OPTIONS[periode.bulan - 1].label} ${periode.tahun}`
    }
    case 'TRIWULAN': {
      if (!periode.tahun || !periode.triwulan) return 'Triwulan'
      const option = triwulanOption(periode.triwulan)
      const [, mulaiBulan] = option.label.split('·')
      return `TW${periode.triwulan} ${periode.tahun} (${mulaiBulan.trim()})`
    }
    case 'TAHUNAN':
      return periode.tahun ? `TA ${periode.tahun}` : 'Tahunan'
    case 'SEMUA':
      return 'Seluruh Periode'
    case 'KUSTOM': {
      if (periode.dari && periode.sampai) return `${periode.dari} – ${periode.sampai}`
      if (periode.dari) return `Mulai ${periode.dari}`
      if (periode.sampai) return `Sampai ${periode.sampai}`
      return 'Kustom'
    }
    default:
      return ''
  }
}

export function shiftTriwulan(periode: PeriodeValue, delta: -1 | 1): PeriodeValue {
  if (periode.mode !== 'TRIWULAN' || !periode.tahun || !periode.triwulan) {
    return periode
  }

  let triwulan = periode.triwulan + delta
  let tahun = periode.tahun

  if (triwulan < 1) {
    triwulan = 4
    tahun -= 1
  } else if (triwulan > 4) {
    triwulan = 1
    tahun += 1
  }

  return { mode: 'TRIWULAN', tahun, triwulan: triwulan as 1 | 2 | 3 | 4 }
}

export function shiftBulan(periode: PeriodeValue, delta: -1 | 1): PeriodeValue {
  if (periode.mode !== 'BULANAN' || !periode.tahun || !periode.bulan) {
    return periode
  }

  let bulan = periode.bulan + delta
  let tahun = periode.tahun

  if (bulan < 1) {
    bulan = 12
    tahun -= 1
  } else if (bulan > 12) {
    bulan = 1
    tahun += 1
  }

  return { mode: 'BULANAN', tahun, bulan: bulan as Bulan }
}

/** Steps a Bulanan or Triwulan periode by one unit; other modes are returned unchanged. */
export function shiftPeriode(periode: PeriodeValue, delta: -1 | 1): PeriodeValue {
  if (periode.mode === 'BULANAN') return shiftBulan(periode, delta)
  if (periode.mode === 'TRIWULAN') return shiftTriwulan(periode, delta)
  return periode
}

function isValidTahun(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_TAHUN && value <= MAX_TAHUN
}

function isValidTriwulan(value: unknown): value is 1 | 2 | 3 | 4 {
  return value === 1 || value === 2 || value === 3 || value === 4
}

function isValidBulan(value: unknown): value is Bulan {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_PATTERN.test(value)
}

export function periodeForMode(mode: PeriodeMode, current: PeriodeValue, tahunOptions: readonly number[] = []): PeriodeValue {
  if (mode === 'BULANAN') {
    // Same rule as Triwulan: re-entering lands on today's actual month.
    return current.mode === 'BULANAN' ? current : currentBulan()
  }

  if (mode === 'TRIWULAN') {
    // Re-entering Triwulan mode always lands on today's actual quarter rather
    // than reusing a stray triwulan/tahun left over from another mode.
    return current.mode === 'TRIWULAN' ? current : currentPeriode()
  }

  const fallbackTahun = current.tahun ?? tahunOptions[0] ?? new Date().getFullYear()

  if (mode === 'TAHUNAN') {
    return { mode: 'TAHUNAN', tahun: fallbackTahun }
  }
  if (mode === 'SEMUA') {
    return { mode: 'SEMUA' }
  }
  return { mode: 'KUSTOM', dari: current.dari, sampai: current.sampai }
}

export function normalizePeriodeSearch(
  search: unknown,
  defaultMode: 'TRIWULAN' | 'BULANAN' = 'TRIWULAN',
): PeriodeValue {
  if (!search || typeof search !== 'object') return defaultPeriode(defaultMode)

  const raw = search as Record<string, unknown>
  const mode = raw.mode

  if (mode === 'BULANAN') {
    if (isValidTahun(raw.tahun) && isValidBulan(raw.bulan)) {
      return { mode: 'BULANAN', tahun: raw.tahun, bulan: raw.bulan }
    }
    return currentBulan()
  }

  if (mode === 'SEMUA') {
    return { mode: 'SEMUA' }
  }

  if (mode === 'TAHUNAN') {
    if (isValidTahun(raw.tahun)) return { mode: 'TAHUNAN', tahun: raw.tahun }
    return { ...currentPeriode(), mode: 'TAHUNAN' }
  }

  if (mode === 'KUSTOM') {
    const dari = isValidIsoDate(raw.dari) ? raw.dari : undefined
    const sampai = isValidIsoDate(raw.sampai) ? raw.sampai : undefined
    return { mode: 'KUSTOM', dari, sampai }
  }

  if (mode === 'TRIWULAN' && isValidTahun(raw.tahun) && isValidTriwulan(raw.triwulan)) {
    return { mode: 'TRIWULAN', tahun: raw.tahun, triwulan: raw.triwulan }
  }

  return defaultPeriode(defaultMode)
}
