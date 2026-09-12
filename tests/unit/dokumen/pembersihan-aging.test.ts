import { describe, expect, it } from 'vitest'
import { computeDokumenAging, NON_MATERIAL_STALE_DAYS } from '#/lib/dokumen/pembersihan'

describe('computeDokumenAging', () => {
  it('returns null umurHari and isStale=false when tanggal is missing', () => {
    expect(computeDokumenAging({ tanggal: null })).toEqual({ umurHari: null, isStale: false })
    expect(computeDokumenAging({ tanggal: undefined })).toEqual({ umurHari: null, isStale: false })
  })

  it('computes umurHari as a date-only difference, ignoring time-of-day', () => {
    const result = computeDokumenAging({
      tanggal: '2026-01-01T23:59:59Z',
      now: new Date('2026-01-02T00:00:01Z'),
    })

    expect(result.umurHari).toBe(1)
  })

  it('is not stale exactly at the threshold, but is stale just past it', () => {
    const boundary = addDaysUtc('2026-01-01', NON_MATERIAL_STALE_DAYS)
    const boundaryResult = computeDokumenAging({ tanggal: '2026-01-01', now: boundary })
    expect(boundaryResult.umurHari).toBe(NON_MATERIAL_STALE_DAYS)
    expect(boundaryResult.isStale).toBe(false)

    const overBoundary = addDaysUtc('2026-01-01', NON_MATERIAL_STALE_DAYS + 1)
    const overResult = computeDokumenAging({ tanggal: '2026-01-01', now: overBoundary })
    expect(overResult.umurHari).toBe(NON_MATERIAL_STALE_DAYS + 1)
    expect(overResult.isStale).toBe(true)
  })

  it('never returns a negative umurHari for future-dated documents', () => {
    const result = computeDokumenAging({
      tanggal: '2026-12-31',
      now: new Date('2026-01-01T00:00:00Z'),
    })

    expect(result.umurHari).toBe(0)
    expect(result.isStale).toBe(false)
  })

  it('accepts a custom staleDays threshold', () => {
    const result = computeDokumenAging({
      tanggal: '2026-01-01',
      now: addDaysUtc('2026-01-01', 31),
      staleDays: 30,
    })

    expect(result.isStale).toBe(true)
  })
})

function addDaysUtc(dateOnly: string, days: number): Date {
  const [year, month, day] = dateOnly.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days))
}
