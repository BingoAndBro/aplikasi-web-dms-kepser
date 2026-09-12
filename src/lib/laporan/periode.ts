export type PeriodeMode = 'TRIWULAN' | 'TAHUNAN' | 'SEMUA' | 'KUSTOM'

export type PeriodeValue = {
  mode: PeriodeMode
  tahun?: number
  triwulan?: 1 | 2 | 3 | 4
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

export function currentPeriode(now: Date = new Date()): PeriodeValue {
  const tahun = now.getFullYear()
  const triwulan = triwulanFromMonth(now.getMonth() + 1)
  return { mode: 'TRIWULAN', tahun, triwulan }
}

export function resolvePeriodeRange(periode: PeriodeValue): { dari: string | null; sampai: string | null } {
  switch (periode.mode) {
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

export function periodeLabel(periode: PeriodeValue): string {
  switch (periode.mode) {
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

function isValidTahun(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_TAHUN && value <= MAX_TAHUN
}

function isValidTriwulan(value: unknown): value is 1 | 2 | 3 | 4 {
  return value === 1 || value === 2 || value === 3 || value === 4
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_PATTERN.test(value)
}

export function periodeForMode(mode: PeriodeMode, current: PeriodeValue, tahunOptions: readonly number[] = []): PeriodeValue {
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

export function normalizePeriodeSearch(search: unknown): PeriodeValue {
  if (!search || typeof search !== 'object') return currentPeriode()

  const raw = search as Record<string, unknown>
  const mode = raw.mode

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

  return currentPeriode()
}
