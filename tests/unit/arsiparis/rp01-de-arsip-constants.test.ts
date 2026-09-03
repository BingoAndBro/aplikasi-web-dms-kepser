import { describe, expect, it } from 'vitest'

import {
  ARCHIVE_STATUS_VALUES,
  BERKAS_RESTING_STATUS,
} from '#/lib/constants/archive-status'
import { ROUTES } from '#/lib/constants/routes'
import {
  BERKAS_ACTIVITY_EVENT_LABELS,
  BERKAS_ACTIVITY_EVENT_TYPES,
} from '#/lib/archive/berkas-arsip-activity'

describe('RP-01 — konstanta & tipe', () => {
  it('menyediakan BERKAS_RESTING_STATUS = AKTIF', () => {
    expect(BERKAS_RESTING_STATUS).toBe('AKTIF')
  })

  it('rute KSBU: PEMBERSIHAN menggantikan USUL_MUSNAH', () => {
    expect(ROUTES.KEPALA_SUB_BAGIAN_UMUM.PEMBERSIHAN).toBe('/arsiparis/pembersihan')
    expect(
      (ROUTES.KEPALA_SUB_BAGIAN_UMUM as Record<string, string>).USUL_MUSNAH,
    ).toBeUndefined()
  })

  it('rute KSBU: BERKAS_TERTUTUP ditambahkan, INAKTIF dihapus', () => {
    expect(ROUTES.KEPALA_SUB_BAGIAN_UMUM.BERKAS_TERTUTUP).toBe('/arsiparis/berkas/tertutup')
    expect(ROUTES.KEPALA_SUB_BAGIAN_UMUM.BERKAS_AKTIF).toBe('/arsiparis/berkas')
    expect(
      (ROUTES.KEPALA_SUB_BAGIAN_UMUM as Record<string, string>).INAKTIF,
    ).toBeUndefined()
  })

  it('label activity di-relabel ke istilah pembersihan', () => {
    expect(BERKAS_ACTIVITY_EVENT_LABELS.BERKAS_DIPINDAHKAN_KE_USUL_MUSNAH).toBe(
      'Berkas diusulkan untuk pembersihan',
    )
    expect(BERKAS_ACTIVITY_EVENT_LABELS.BERKAS_DIMUSNAHKAN).toBe('File berkas dibersihkan')
  })

  it('regression: ARCHIVE_STATUS_VALUES tetap utuh (dipakai DB CHECK)', () => {
    expect([...ARCHIVE_STATUS_VALUES]).toEqual([
      'AKTIF',
      'INAKTIF',
      'USUL_MUSNAH',
      'DIMUSNAHKAN',
    ])
  })

  it('regression: BERKAS_ACTIVITY_EVENT_TYPES tetap utuh (dipakai DB CHECK)', () => {
    expect([...BERKAS_ACTIVITY_EVENT_TYPES]).toEqual([
      'BERKAS_DIBUKA',
      'DOKUMEN_PERSETUJUAN_DIKLASIFIKASIKAN',
      'DOKUMEN_MANUAL_DITAMBAHKAN',
      'BERKAS_DITUTUP',
      'METADATA_ARSIP_AKTIF_DIPERBARUI',
      'BERKAS_DIPINDAHKAN_KE_INAKTIF',
      'BERKAS_DIPINDAHKAN_KE_USUL_MUSNAH',
      'BERKAS_DIMUSNAHKAN',
    ])
  })
})
