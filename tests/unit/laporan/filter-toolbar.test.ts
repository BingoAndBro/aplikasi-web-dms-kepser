import { describe, expect, it } from 'vitest'

import { buildPersonOptions } from '#/components/laporan/FilterToolbar'

describe('buildPersonOptions', () => {
  it('dedupes by id, skips rows without id, and sorts by nama (id-ID)', () => {
    const rows = [
      { id: 'u2', nama: 'Budi' },
      { id: null, nama: 'Tanpa ID' },
      { id: 'u1', nama: 'Andi' },
      { id: 'u2', nama: 'Budi' },
      { id: 'u3', nama: 'citra' },
    ]

    const options = buildPersonOptions(rows, row => row.id, row => row.nama)

    expect(options).toEqual([
      { id: 'u1', nama: 'Andi' },
      { id: 'u2', nama: 'Budi' },
      { id: 'u3', nama: 'citra' },
    ])
  })

  it('returns an empty list for no rows', () => {
    expect(buildPersonOptions([], () => 'x', () => 'x')).toEqual([])
  })
})
