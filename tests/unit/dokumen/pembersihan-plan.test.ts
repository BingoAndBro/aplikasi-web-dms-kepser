import { describe, expect, it } from 'vitest'
import { buildPembersihanPlan, type PembersihanCandidateRow } from '#/lib/dokumen/pembersihan-service'

const KEGIATAN_LED = 'kegiatan-led-by-actor'
const KEGIATAN_OTHER = 'kegiatan-other'

function baseRow(overrides: Partial<PembersihanCandidateRow> = {}): PembersihanCandidateRow {
  return {
    id: 'dok-1',
    judul: 'Laporan Bulanan',
    nama_dokumen: 'Laporan Bulanan Januari',
    created_by: 'user-1',
    status: 'TERSIMPAN',
    is_non_material: true,
    jenis_permintaan_id: null,
    kategori_permintaan_id: null,
    detail_permintaan_id: null,
    kegiatan_jenis_id: KEGIATAN_LED,
    lampiran_dibersihkan_at: null,
    lampiran_urls: [],
    ...overrides,
  }
}

const defaultOptions = {
  actorKegiatanIds: new Set([KEGIATAN_LED]),
  dokumenIdsInBerkasArsip: new Set<string>(),
}

describe('buildPembersihanPlan', () => {
  it('accepts a pure non-material TERSIMPAN document led by the actor', () => {
    const plan = buildPembersihanPlan(['dok-1'], [baseRow()], defaultOptions)

    expect(plan).toEqual([{ dokumen_id: 'dok-1', eligible: true }])
  })

  it('rejects a document that is not in the fetched rows', () => {
    const plan = buildPembersihanPlan(['missing-id'], [], defaultOptions)

    expect(plan).toEqual([{ dokumen_id: 'missing-id', eligible: false, reason: 'NOT_FOUND' }])
  })

  it('rejects material documents even when is_non_material is true but a permintaan chain is set', () => {
    const plan = buildPembersihanPlan(
      ['dok-1'],
      [baseRow({ jenis_permintaan_id: 'jenis-1' })],
      defaultOptions,
    )

    expect(plan).toEqual([{ dokumen_id: 'dok-1', eligible: false, reason: 'NOT_NON_MATERIAL' }])
  })

  it('rejects documents where is_non_material is false or null', () => {
    expect(buildPembersihanPlan(['dok-1'], [baseRow({ is_non_material: false })], defaultOptions))
      .toEqual([{ dokumen_id: 'dok-1', eligible: false, reason: 'NOT_NON_MATERIAL' }])

    expect(buildPembersihanPlan(['dok-1'], [baseRow({ is_non_material: null })], defaultOptions))
      .toEqual([{ dokumen_id: 'dok-1', eligible: false, reason: 'NOT_NON_MATERIAL' }])
  })

  it('rejects documents not in TERSIMPAN status', () => {
    const plan = buildPembersihanPlan(['dok-1'], [baseRow({ status: 'COMPLETED' })], defaultOptions)

    expect(plan).toEqual([{ dokumen_id: 'dok-1', eligible: false, reason: 'NOT_TERSIMPAN' }])
  })

  it('rejects documents from a kegiatan the actor does not lead', () => {
    const plan = buildPembersihanPlan(
      ['dok-1'],
      [baseRow({ kegiatan_jenis_id: KEGIATAN_OTHER })],
      defaultOptions,
    )

    expect(plan).toEqual([{ dokumen_id: 'dok-1', eligible: false, reason: 'NOT_LED_BY_ACTOR' }])
  })

  it('skips (does not error on) documents already cleaned', () => {
    const plan = buildPembersihanPlan(
      ['dok-1'],
      [baseRow({ lampiran_dibersihkan_at: new Date('2026-01-01') })],
      defaultOptions,
    )

    expect(plan).toEqual([{ dokumen_id: 'dok-1', eligible: false, reason: 'ALREADY_CLEANED' }])
  })

  it('rejects documents that are somehow already part of a berkas arsip (safety net)', () => {
    const plan = buildPembersihanPlan(['dok-1'], [baseRow()], {
      ...defaultOptions,
      dokumenIdsInBerkasArsip: new Set(['dok-1']),
    })

    expect(plan).toEqual([{ dokumen_id: 'dok-1', eligible: false, reason: 'IN_BERKAS_ARSIP' }])
  })

  it('evaluates a mixed batch independently, preserving request order', () => {
    const rows = [
      baseRow({ id: 'dok-1' }),
      baseRow({ id: 'dok-2', status: 'COMPLETED' }),
      baseRow({ id: 'dok-3', kegiatan_jenis_id: KEGIATAN_OTHER }),
    ]

    const plan = buildPembersihanPlan(['dok-1', 'dok-2', 'dok-3', 'dok-4'], rows, defaultOptions)

    expect(plan).toEqual([
      { dokumen_id: 'dok-1', eligible: true },
      { dokumen_id: 'dok-2', eligible: false, reason: 'NOT_TERSIMPAN' },
      { dokumen_id: 'dok-3', eligible: false, reason: 'NOT_LED_BY_ACTOR' },
      { dokumen_id: 'dok-4', eligible: false, reason: 'NOT_FOUND' },
    ])
  })
})
