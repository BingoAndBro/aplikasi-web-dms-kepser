import { describe, expect, it } from 'vitest'

import {
  currentPeriode,
  normalizePeriodeSearch,
  periodeForMode,
  periodeLabel,
  resolvePeriodeRange,
  shiftTriwulan,
} from '#/lib/laporan/periode'

describe('resolvePeriodeRange', () => {
  it('resolves each triwulan to its exact calendar boundaries', () => {
    expect(resolvePeriodeRange({ mode: 'TRIWULAN', tahun: 2026, triwulan: 1 }))
      .toEqual({ dari: '2026-01-01', sampai: '2026-03-31' })
    expect(resolvePeriodeRange({ mode: 'TRIWULAN', tahun: 2026, triwulan: 2 }))
      .toEqual({ dari: '2026-04-01', sampai: '2026-06-30' })
    expect(resolvePeriodeRange({ mode: 'TRIWULAN', tahun: 2026, triwulan: 3 }))
      .toEqual({ dari: '2026-07-01', sampai: '2026-09-30' })
    expect(resolvePeriodeRange({ mode: 'TRIWULAN', tahun: 2026, triwulan: 4 }))
      .toEqual({ dari: '2026-10-01', sampai: '2026-12-31' })
  })

  it('resolves tahunan to the full calendar year', () => {
    expect(resolvePeriodeRange({ mode: 'TAHUNAN', tahun: 2025 }))
      .toEqual({ dari: '2025-01-01', sampai: '2025-12-31' })
  })

  it('resolves semua to no date bounds', () => {
    expect(resolvePeriodeRange({ mode: 'SEMUA' })).toEqual({ dari: null, sampai: null })
  })

  it('passes kustom range through unchanged', () => {
    expect(resolvePeriodeRange({ mode: 'KUSTOM', dari: '2026-02-10', sampai: '2026-02-20' }))
      .toEqual({ dari: '2026-02-10', sampai: '2026-02-20' })
  })

  it('returns null bounds for an incomplete triwulan/tahunan value', () => {
    expect(resolvePeriodeRange({ mode: 'TRIWULAN' })).toEqual({ dari: null, sampai: null })
    expect(resolvePeriodeRange({ mode: 'TAHUNAN' })).toEqual({ dari: null, sampai: null })
  })
})

describe('currentPeriode', () => {
  it('derives triwulan from an injected date', () => {
    expect(currentPeriode(new Date('2026-01-15'))).toEqual({ mode: 'TRIWULAN', tahun: 2026, triwulan: 1 })
    expect(currentPeriode(new Date('2026-04-01'))).toEqual({ mode: 'TRIWULAN', tahun: 2026, triwulan: 2 })
    expect(currentPeriode(new Date('2026-09-12'))).toEqual({ mode: 'TRIWULAN', tahun: 2026, triwulan: 3 })
    expect(currentPeriode(new Date('2026-12-31'))).toEqual({ mode: 'TRIWULAN', tahun: 2026, triwulan: 4 })
  })
})

describe('shiftTriwulan', () => {
  it('moves forward within the same year', () => {
    expect(shiftTriwulan({ mode: 'TRIWULAN', tahun: 2026, triwulan: 1 }, 1))
      .toEqual({ mode: 'TRIWULAN', tahun: 2026, triwulan: 2 })
  })

  it('crosses into the next year from TW4', () => {
    expect(shiftTriwulan({ mode: 'TRIWULAN', tahun: 2025, triwulan: 4 }, 1))
      .toEqual({ mode: 'TRIWULAN', tahun: 2026, triwulan: 1 })
  })

  it('crosses into the previous year from TW1', () => {
    expect(shiftTriwulan({ mode: 'TRIWULAN', tahun: 2026, triwulan: 1 }, -1))
      .toEqual({ mode: 'TRIWULAN', tahun: 2025, triwulan: 4 })
  })

  it('is a no-op outside triwulan mode', () => {
    const value: Parameters<typeof shiftTriwulan>[0] = { mode: 'TAHUNAN', tahun: 2026 }
    expect(shiftTriwulan(value, 1)).toBe(value)
  })
})

describe('periodeLabel', () => {
  it('formats each mode', () => {
    expect(periodeLabel({ mode: 'TRIWULAN', tahun: 2026, triwulan: 3 })).toBe('TW3 2026 (Jul–Sep)')
    expect(periodeLabel({ mode: 'TAHUNAN', tahun: 2026 })).toBe('TA 2026')
    expect(periodeLabel({ mode: 'SEMUA' })).toBe('Seluruh Periode')
    expect(periodeLabel({ mode: 'KUSTOM', dari: '2026-01-01', sampai: '2026-03-15' }))
      .toBe('2026-01-01 – 2026-03-15')
  })
})

describe('periodeForMode', () => {
  it('returns today\'s actual triwulan when re-entering Triwulan mode from Tahunan, not TW1', () => {
    const fromTahunan: Parameters<typeof periodeForMode>[1] = { mode: 'TAHUNAN', tahun: 2024 }
    expect(periodeForMode('TRIWULAN', fromTahunan)).toEqual(currentPeriode())
  })

  it('returns today\'s actual triwulan when re-entering Triwulan mode from Semua', () => {
    expect(periodeForMode('TRIWULAN', { mode: 'SEMUA' })).toEqual(currentPeriode())
  })

  it('returns today\'s actual triwulan when re-entering Triwulan mode from Kustom', () => {
    expect(periodeForMode('TRIWULAN', { mode: 'KUSTOM', dari: '2020-01-01', sampai: '2020-03-01' }))
      .toEqual(currentPeriode())
  })

  it('leaves an already-Triwulan value untouched', () => {
    const value: Parameters<typeof periodeForMode>[1] = { mode: 'TRIWULAN', tahun: 2024, triwulan: 2 }
    expect(periodeForMode('TRIWULAN', value)).toBe(value)
  })

  it('keeps the current tahun when switching into Tahunan', () => {
    const value: Parameters<typeof periodeForMode>[1] = { mode: 'TRIWULAN', tahun: 2024, triwulan: 2 }
    expect(periodeForMode('TAHUNAN', value)).toEqual({ mode: 'TAHUNAN', tahun: 2024 })
  })

  it('falls back to the first available tahun option when switching into Tahunan with no current tahun', () => {
    expect(periodeForMode('TAHUNAN', { mode: 'SEMUA' }, [2023, 2022])).toEqual({ mode: 'TAHUNAN', tahun: 2023 })
  })

  it('switches into Semua with no extra fields', () => {
    expect(periodeForMode('SEMUA', { mode: 'TRIWULAN', tahun: 2024, triwulan: 2 })).toEqual({ mode: 'SEMUA' })
  })

  it('carries dari/sampai over when switching into Kustom', () => {
    const value: Parameters<typeof periodeForMode>[1] = { mode: 'KUSTOM', dari: '2026-01-01', sampai: '2026-02-01' }
    expect(periodeForMode('KUSTOM', value)).toEqual(value)
  })
})

describe('normalizePeriodeSearch', () => {
  it('accepts a valid triwulan value', () => {
    expect(normalizePeriodeSearch({ mode: 'TRIWULAN', tahun: 2026, triwulan: 2 }))
      .toEqual({ mode: 'TRIWULAN', tahun: 2026, triwulan: 2 })
  })

  it('falls back to the current triwulan when triwulan is out of range', () => {
    const result = normalizePeriodeSearch({ mode: 'TRIWULAN', tahun: 2026, triwulan: 0 })
    expect(result.mode).toBe('TRIWULAN')
    expect(result).toEqual(currentPeriode())
  })

  it('falls back to the current triwulan when triwulan is above 4', () => {
    const result = normalizePeriodeSearch({ mode: 'TRIWULAN', tahun: 2026, triwulan: 5 })
    expect(result).toEqual(currentPeriode())
  })

  it('rejects an out-of-range tahun', () => {
    const result = normalizePeriodeSearch({ mode: 'TRIWULAN', tahun: 1899, triwulan: 1 })
    expect(result).toEqual(currentPeriode())
  })

  it('drops a malformed kustom date instead of throwing', () => {
    expect(normalizePeriodeSearch({ mode: 'KUSTOM', dari: 'not-a-date', sampai: '2026-03-15' }))
      .toEqual({ mode: 'KUSTOM', dari: undefined, sampai: '2026-03-15' })
  })

  it('defaults to the current triwulan for missing/unknown input', () => {
    expect(normalizePeriodeSearch(undefined)).toEqual(currentPeriode())
    expect(normalizePeriodeSearch({})).toEqual(currentPeriode())
    expect(normalizePeriodeSearch({ mode: 'NOT_A_MODE' })).toEqual(currentPeriode())
  })

  it('passes through semua and tahunan', () => {
    expect(normalizePeriodeSearch({ mode: 'SEMUA' })).toEqual({ mode: 'SEMUA' })
    expect(normalizePeriodeSearch({ mode: 'TAHUNAN', tahun: 2025 })).toEqual({ mode: 'TAHUNAN', tahun: 2025 })
  })
})
