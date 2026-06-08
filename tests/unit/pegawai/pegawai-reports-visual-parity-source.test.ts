import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()

function readSource(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

describe('pegawai report visual parity source guard', () => {
  it('keeps laporan saya document-first with approved list controls and document detail action', () => {
    const source = readSource('src/routes/pegawai/laporan/saya.tsx')

    expect(source).toContain("apiFetch<LaporanSayaResponse>('/laporan/saya')")
    expect(source).toContain('Filter Lanjutan')
    expect(source).toContain('Tanggal terbaru')
    expect(source).toContain('Cari nama dokumen atau kegiatan...')
    expect(source).toContain('rounded-[26px] border border-zinc-200/80 bg-[#FFFDF9]')
    expect(source).toContain('to="/pegawai/dokumen/$id"')
    expect(source).toContain('Detail Dokumen')
    expect(source).not.toContain('/arsiparis')
    expect(source).not.toContain('berkas')
  })

  it('keeps laporan kegiatan kegiatan-first with same-route detail and document actions', () => {
    const source = readSource('src/routes/pegawai/laporan/kegiatan.tsx')

    expect(source).toContain("apiFetch<LaporanKegiatanResponse>('/laporan/kegiatan')")
    expect(source).toContain("apiFetch<KetuaTimKegiatanResponse>('/users/me/ketua-tim')")
    expect(source).toContain('buildKegiatanRows')
    expect(source).toContain('Route.useSearch()')
    expect(source).toContain('selectKegiatan')
    expect(source).toContain('KegiatanAdvancedFilter')
    expect(source).toContain('matchesKegiatanListFilter')
    expect(source).toContain('Detail Kegiatan')
    expect(source).toContain('Detail Dokumen')
    expect(source).toContain('Total Nominal Realisasi')
    expect(source).toContain('to="/pegawai/dokumen/$id"')
    expect(source).not.toContain('<HierarchicalFilter')
    expect(source).not.toContain('filter.kegiatanId')
    expect(source).not.toContain('filter.jenisId')
    expect(source).not.toContain('filter.kategoriId')
    expect(source).not.toContain('filter.detailId')
    expect(source).not.toContain('getKegiatanIdFromUrl')
    expect(source).not.toContain('window.history.pushState')
    expect(source).not.toContain('/arsiparis')
    expect(source).not.toContain('approve_destruction')
  })
})
