import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  kelengkapanSelectionFromDokumen,
  matchesKelengkapanSelection,
  type KelengkapanMatchRow,
} from '#/lib/kelengkapan-match'
import { buildRequiredKelengkapanCondition } from '#/lib/dokumen/local-submit-drizzle-adapter'

// D-1: the checklist shown on Ajukan, Revisi (Pegawai) and Kirim Ulang (PPK)
// must be the exact six-column match the server enforces.

const KEGIATAN = 'keg-1'
const KOMPONEN = 'kom-1'
const JENIS = 'jen-1'
const KATEGORI = 'kat-1'
const DETAIL = 'det-1'

function row(overrides: Partial<KelengkapanMatchRow> = {}): KelengkapanMatchRow {
  return {
    kegiatan_id: KEGIATAN,
    is_ketua_tim: false,
    komponen_permintaan_id: KOMPONEN,
    jenis_permintaan_id: JENIS,
    kategori_permintaan_id: KATEGORI,
    detail_permintaan_id: null,
    ...overrides,
  }
}

const leafKategori = {
  kegiatanId: KEGIATAN,
  isKetuaTim: false,
  komponenId: KOMPONEN,
  jenisPermintaanId: JENIS,
  kategoriPermintaanId: KATEGORI,
  detailPermintaanId: null,
}

describe('matchesKelengkapanSelection', () => {
  it('matches the exact six-column combination', () => {
    expect(matchesKelengkapanSelection(row(), leafKategori)).toBe(true)
  })

  it.each([
    ['kegiatan', { kegiatan_id: 'keg-2' }],
    ['is_ketua_tim', { is_ketua_tim: true }],
    ['komponen', { komponen_permintaan_id: 'kom-2' }],
    ['jenis', { jenis_permintaan_id: 'jen-2' }],
    ['kategori', { kategori_permintaan_id: 'kat-2' }],
  ])('rejects a row that differs in %s', (_label, overrides) => {
    expect(matchesKelengkapanSelection(row(overrides), leafKategori)).toBe(false)
  })

  it('does not inherit parent-level rows (unselected level must be NULL)', () => {
    // A row defined at komponen level only does not apply to a document that also picked jenis/kategori.
    const komponenOnly = row({ jenis_permintaan_id: null, kategori_permintaan_id: null })
    expect(matchesKelengkapanSelection(komponenOnly, leafKategori)).toBe(false)
  })

  it('does not match a detail-level row when the document stops at kategori', () => {
    expect(matchesKelengkapanSelection(row({ detail_permintaan_id: DETAIL }), leafKategori)).toBe(false)
  })

  it('matches a detail-level row only through all six columns (old chain match checked detail alone)', () => {
    const selection = { ...leafKategori, detailPermintaanId: DETAIL }
    expect(matchesKelengkapanSelection(row({ detail_permintaan_id: DETAIL }), selection)).toBe(true)
    // Same detail id but another komponen: the removed matchesCurrentChain accepted this.
    expect(matchesKelengkapanSelection(
      row({ detail_permintaan_id: DETAIL, komponen_permintaan_id: 'kom-2' }),
      selection,
    )).toBe(false)
  })

  it('an empty chain matches only rows whose four chain columns are NULL (old chain match returned every row)', () => {
    const selection = { kegiatanId: KEGIATAN, isKetuaTim: false }
    expect(matchesKelengkapanSelection(row(), selection)).toBe(false)
    expect(matchesKelengkapanSelection(row({
      komponen_permintaan_id: null,
      jenis_permintaan_id: null,
      kategori_permintaan_id: null,
    }), selection)).toBe(true)
  })

  it('treats undefined and empty string as NULL', () => {
    expect(matchesKelengkapanSelection(
      { kegiatan_id: KEGIATAN, is_ketua_tim: true },
      { kegiatanId: KEGIATAN, isKetuaTim: true, komponenId: '', jenisPermintaanId: undefined },
    )).toBe(true)
  })

  it('builds the selection from a stored dokumen row, including komponen', () => {
    expect(kelengkapanSelectionFromDokumen({
      kegiatan_jenis_id: KEGIATAN,
      is_ketua_tim: true,
      komponen_id: KOMPONEN,
      jenis_permintaan_id: JENIS,
      kategori_permintaan_id: null,
      detail_permintaan_id: null,
    })).toEqual({
      kegiatanId: KEGIATAN,
      isKetuaTim: true,
      komponenId: KOMPONEN,
      jenisPermintaanId: JENIS,
      kategoriPermintaanId: null,
      detailPermintaanId: null,
    })
  })

  it('uses the same six columns as the server SQL condition', () => {
    const { sql } = new PgDialect().sqlToQuery(buildRequiredKelengkapanCondition({
      kegiatanId: KEGIATAN,
      isKetuaTim: false,
      komponenId: KOMPONEN,
      jenisPermintaanId: JENIS,
      kategoriPermintaanId: KATEGORI,
      detailPermintaanId: null,
    }))
    for (const column of ['kegiatan_id', 'is_ketua_tim', 'komponen_id', 'jenis_permintaan_id', 'kategori_permintaan_id']) {
      expect(sql).toContain(`"${column}" = $`)
    }
    expect(sql).toContain('"detail_permintaan_id" is null')
  })
})

describe('checklist pages use the shared matcher', () => {
  it.each([
    'src/routes/pegawai/dokumen/$id/revisi.tsx',
    'src/routes/ppk/dokumen/$id/resubmit.tsx',
    'src/components/dokumen/KelengkapanChecklist.tsx',
  ])('%s', (path) => {
    const source = readFileSync(path, 'utf8')
    expect(source).toContain("from '#/lib/kelengkapan-match'")
    expect(source).toContain('matchesKelengkapanSelection(')
    expect(source).not.toContain('matchesCurrentChain')
    expect(source).not.toMatch(/function matchesCurrentSelection/)
  })

  it('PPK resubmit GET returns komponen_id so the PPK page can match komponen', () => {
    const source = readFileSync('src/routes/api/ppk/resubmit/$id.ts', 'utf8')
    expect(source).toContain('komponen_id: dok.komponen_id')
  })
})
