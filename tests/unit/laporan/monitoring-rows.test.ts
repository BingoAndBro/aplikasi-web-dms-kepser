import { describe, expect, it } from 'vitest'

import {
  buildFungsiRows,
  buildKegiatanRows,
  buildKomponenRows,
  countKegiatan,
  totalNominal,
  type LaporanKinerjaRow,
} from '#/lib/laporan/monitoring-rows'

function row(overrides: Partial<LaporanKinerjaRow> = {}): LaporanKinerjaRow {
  return {
    id: 'doc-1',
    judul: 'Dokumen',
    status: 'COMPLETED',
    fungsi_nama: 'Fungsi A',
    kegiatan_nama: 'Kegiatan A',
    komponen_id: 'komponen-1',
    komponen_nama: 'Komponen A',
    tahun: 2026,
    tanggal: '2026-05-10',
    pengaju_id: 'user-1',
    pengaju_nama: 'Pegawai Satu',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-10T00:00:00.000Z',
    nominal_realisasi: 1_000_000,
    ...overrides,
  }
}

describe('buildKomponenRows', () => {
  it('groups documents by komponen name', () => {
    const rows = [
      row({ id: 'a', komponen_nama: 'Komponen A' }),
      row({ id: 'b', komponen_nama: 'Komponen A' }),
      row({ id: 'c', komponen_nama: 'Komponen B' }),
    ]

    const result = buildKomponenRows('fungsi-1', 'kegiatan-1', 'Kegiatan A', 'Fungsi A', rows)

    expect(result).toHaveLength(2)
    const komponenA = result.find(r => r.nama === 'Komponen A')
    const komponenB = result.find(r => r.nama === 'Komponen B')
    expect(komponenA?.dokumen).toHaveLength(2)
    expect(komponenB?.dokumen).toHaveLength(1)
  })

  it('buckets documents with a null komponen_nama under Tanpa Komponen', () => {
    const rows = [
      row({ id: 'a', komponen_id: null, komponen_nama: null }),
      row({ id: 'b', komponen_id: null, komponen_nama: null }),
    ]

    const result = buildKomponenRows('fungsi-1', 'kegiatan-1', 'Kegiatan A', 'Fungsi A', rows)

    expect(result).toHaveLength(1)
    expect(result[0].nama).toBe('Tanpa Komponen')
    expect(result[0].dokumen).toHaveLength(2)
  })

  it('excludes documents with a null nominal_realisasi from totalNominal', () => {
    const rows = [
      row({ id: 'a', nominal_realisasi: 500_000 }),
      row({ id: 'b', nominal_realisasi: null }),
    ]

    const result = buildKomponenRows('fungsi-1', 'kegiatan-1', 'Kegiatan A', 'Fungsi A', rows)

    expect(result[0].totalNominal).toBe(500_000)
  })

  it('produces a stable id independent of document order', () => {
    const rowsA = [row({ id: 'a', komponen_nama: 'Komponen X' })]
    const rowsB = [row({ id: 'b', komponen_nama: 'Komponen X' })]

    const resultA = buildKomponenRows('fungsi-1', 'kegiatan-1', 'Kegiatan A', 'Fungsi A', rowsA)
    const resultB = buildKomponenRows('fungsi-1', 'kegiatan-1', 'Kegiatan A', 'Fungsi A', rowsB)

    expect(resultA[0].id).toBe(resultB[0].id)
  })

  it('carries the parent fungsi and kegiatan identity for header use without prop drilling', () => {
    const result = buildKomponenRows('fungsi-1', 'kegiatan-1', 'Kegiatan A', 'Fungsi A', [row()])

    expect(result[0].kegiatanId).toBe('kegiatan-1')
    expect(result[0].fungsiId).toBe('fungsi-1')
    expect(result[0].kegiatanNama).toBe('Kegiatan A')
    expect(result[0].fungsiNama).toBe('Fungsi A')
  })
})

describe('buildKegiatanRows regression (post-extraction)', () => {
  it('still groups by kegiatan name and nests komponen rows', () => {
    const rows = [
      row({ id: 'a', kegiatan_nama: 'Kegiatan A', komponen_nama: 'Komponen 1' }),
      row({ id: 'b', kegiatan_nama: 'Kegiatan A', komponen_nama: 'Komponen 2' }),
      row({ id: 'c', kegiatan_nama: 'Kegiatan B', komponen_nama: 'Komponen 3' }),
    ]

    const result = buildKegiatanRows('fungsi-1', 'Fungsi A', rows)

    expect(result).toHaveLength(2)
    const kegiatanA = result.find(r => r.nama === 'Kegiatan A')
    expect(kegiatanA?.dokumen).toHaveLength(2)
    expect(kegiatanA?.komponen).toHaveLength(2)
  })

  it('buckets documents with a null kegiatan_nama under Tanpa Kegiatan', () => {
    const result = buildKegiatanRows('fungsi-1', 'Fungsi A', [row({ kegiatan_nama: null })])
    expect(result[0].nama).toBe('Tanpa Kegiatan')
  })
})

describe('buildFungsiRows regression (post-extraction)', () => {
  it('nests kegiatan rows and computes totals per fungsi', () => {
    const rows = [
      row({ id: 'a', fungsi_nama: 'Fungsi A', nominal_realisasi: 100 }),
      row({ id: 'b', fungsi_nama: 'Fungsi A', nominal_realisasi: 200 }),
      row({ id: 'c', fungsi_nama: 'Fungsi B', nominal_realisasi: 300 }),
    ]

    const result = buildFungsiRows(rows)

    expect(result).toHaveLength(2)
    const fungsiA = result.find(r => r.nama === 'Fungsi A')
    expect(fungsiA?.totalNominal).toBe(300)
    expect(countKegiatan(result)).toBeGreaterThan(0)
  })
})

describe('totalNominal', () => {
  it('sums every document with a non-null nominal', () => {
    const rows = [
      row({ nominal_realisasi: 100 }),
      row({ status: 'ARCHIVED', nominal_realisasi: 200 }),
      row({ nominal_realisasi: null }),
    ]
    expect(totalNominal(rows)).toBe(300)
  })
})
