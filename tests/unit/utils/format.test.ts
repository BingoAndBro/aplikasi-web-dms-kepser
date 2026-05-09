import { describe, it, expect } from 'vitest'
import { formatDate, formatDateTime } from '#/lib/utils/format'

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
})
