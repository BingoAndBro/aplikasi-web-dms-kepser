import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/components/laporan/HierarchicalFilter.tsx', 'utf8')

describe('RP-04: HierarchicalFilter cascading Selects stay mounted', () => {
  it('hides Kegiatan/Kategori/Detail with `hidden` instead of unmounting them via &&', () => {
    // Same underlying bug as the Ajukan Dokumen Select swap: a Select conditionally rendered via
    // `condition && <Select>` gets force-unmounted (mid-interaction, if its popup is open) whenever an
    // unrelated field resets the condition (e.g. clearing Fungsi while Kegiatan's popup is open).
    expect(source).toContain('hidden={!value.fungsiId}')
    expect(source).toContain('hidden={!value.jenisId}')
    expect(source).toContain('hidden={!value.kategoriId || detailList.length === 0}')
    expect(source).not.toMatch(/\{value\.fungsiId && \(/)
    expect(source).not.toMatch(/\{value\.jenisId && \(/)
    expect(source).not.toMatch(/\{value\.kategoriId && detailList\.length > 0 && \(/)
  })
})
