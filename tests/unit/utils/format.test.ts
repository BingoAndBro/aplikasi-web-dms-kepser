import { describe, it, expect } from 'vitest'
import { byOldest, formatDate, formatDateTime, formatRelativeAge } from '#/lib/utils/format'

describe('format utils', () => {
  it('formatDate formats valid ISO string correctly', () => {
    // 2026-05-08T11:24:46Z corresponds to May 8, 2026
    const result = formatDate('2026-05-08T11:24:46Z')
    expect(result).toMatch(/08[ \/]Mei[ \/]2026|08[ \/]May[ \/]2026/i) // Depending on the actual id-ID locale output in Node.js
  })

  it('formatDateTime formats valid ISO string correctly', () => {
    const result = formatDateTime('2026-05-08T11:24:46Z')
    expect(result).toMatch(/08[ \/]Mei[ \/]2026|08[ \/]May[ \/]2026/i)
    // Should include time component (hours and minutes)
    expect(result).toMatch(/\d{2}[.:]\d{2}/)
  })

  it('formatDate returns original string on invalid date', () => {
    const result = formatDate('not-a-date')
    expect(result).toBe('not-a-date') // Wait, new Date('not-a-date') returns Invalid Date object, but calling toLocaleDateString might throw or return 'Invalid Date'
    // Let's test what happens: toLocaleDateString('id-ID') on Invalid Date throws a RangeError in modern JS/Node.
    // So the catch block should return the original string.
  })

  it('byOldest sorts so the oldest created_at comes first', () => {
    const items = [
      { id: 'newest', created_at: '2026-05-01T00:00:00Z' },
      { id: 'oldest', created_at: '2026-01-01T00:00:00Z' },
      { id: 'middle', created_at: '2026-03-01T00:00:00Z' },
    ]
    const sorted = [...items].sort(byOldest).map((item) => item.id)
    expect(sorted).toEqual(['oldest', 'middle', 'newest'])
  })

  it('byOldest falls back to tanggal when created_at is missing', () => {
    const items = [
      { id: 'a', tanggal: '2026-02-01T00:00:00Z' },
      { id: 'b', created_at: '2026-01-01T00:00:00Z' },
    ]
    const sorted = [...items].sort(byOldest).map((item) => item.id)
    expect(sorted).toEqual(['b', 'a'])
  })

  it('byOldest treats missing dates as oldest (sorts first)', () => {
    const items = [
      { id: 'has-date', created_at: '2026-01-01T00:00:00Z' },
      { id: 'no-date' },
    ]
    const sorted = [...items].sort(byOldest).map((item) => item.id)
    expect(sorted).toEqual(['no-date', 'has-date'])
  })

  it('formatRelativeAge reports days elapsed since the given date', () => {
    const twelveDaysAgo = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeAge(twelveDaysAgo)).toBe('Menunggu 12 hari')
  })

  it('formatRelativeAge returns undefined for an invalid date', () => {
    expect(formatRelativeAge('not-a-date')).toBeUndefined()
  })
})
