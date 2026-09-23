import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/components/laporan/HierarchicalFilter.tsx', 'utf8')

describe('RP-04: HierarchicalFilter cascading Selects stay mounted', () => {
  it('hides Kegiatan/Komponen/Kategori/Detail with `hidden` instead of unmounting them via &&', () => {
    // Same underlying bug as the Ajukan Dokumen Select swap: a Select conditionally rendered via
    // `condition && <Select>` gets force-unmounted (mid-interaction, if its popup is open) whenever an
    // unrelated field resets the condition (e.g. clearing Fungsi while Kegiatan's popup is open).
    //
    // Fungsi → Kegiatan → Komponen and Jenis → Kategori → Detail are two independent branches, so
    // Jenis itself is always visible (not gated on Komponen).
    expect(source).toContain('hidden={!value.fungsiId}')
    expect(source).toContain('hidden={!value.kegiatanId}')
    expect(source).toContain('hidden={!value.jenisId}')
    expect(source).toContain('hidden={!value.kategoriId || detailList.length === 0}')
    expect(source).not.toMatch(/\{value\.fungsiId && \(/)
    expect(source).not.toMatch(/\{value\.kegiatanId && \(/)
    expect(source).not.toMatch(/\{value\.komponenId && \(/)
    expect(source).not.toMatch(/\{value\.jenisId && \(/)
    expect(source).not.toMatch(/\{value\.kategoriId && detailList\.length > 0 && \(/)
  })
})
