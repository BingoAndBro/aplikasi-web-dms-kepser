import { describe, expect, it } from 'vitest'

import { NAV_CONFIG } from '#/config/navigation'
import { ROLE_DEFAULT_ROUTE, ROUTES } from '#/lib/constants/routes'
import { ROLE_DISPLAY, ROLE_NAMES, ROLES } from '#/lib/constants/roles'

describe('PENANGGUNG_JAWAB_KINERJA role foundation', () => {
  it('defines the canonical role and display label', () => {
    expect(ROLE_NAMES).toContain(ROLES.PENANGGUNG_JAWAB_KINERJA)
    expect(ROLE_DISPLAY[ROLES.PENANGGUNG_JAWAB_KINERJA]).toBe('Penanggung Jawab Kinerja')
  })

  it('keeps BENDAHARA internal value while displaying PPSPM', () => {
    expect(ROLES.BENDAHARA).toBe('BENDAHARA')
    expect(ROLE_DISPLAY[ROLES.BENDAHARA]).toBe('PPSPM')
  })

  it('uses Laporan Kinerja as the role default route', () => {
    expect(ROLE_DEFAULT_ROUTE[ROLES.PENANGGUNG_JAWAB_KINERJA]).toBe(
      ROUTES.PENANGGUNG_JAWAB_KINERJA.LAPORAN_KINERJA,
    )
  })

  it('exposes only the Laporan Kinerja navigation item for the role', () => {
    expect(NAV_CONFIG[ROLES.PENANGGUNG_JAWAB_KINERJA]).toEqual([
      {
        title: 'LAPORAN',
        items: [
          expect.objectContaining({
            id: 'laporan_kinerja',
            label: 'Laporan Kinerja',
            to: ROUTES.PENANGGUNG_JAWAB_KINERJA.LAPORAN_KINERJA,
          }),
        ],
      },
    ])
  })

  it('keeps ADMIN as a separate dedicated role', () => {
    expect(ROLES.ADMIN).toBe('ADMIN')
    expect(ROLES.ADMIN).not.toBe(ROLES.PENANGGUNG_JAWAB_KINERJA)
    expect(ROLE_DEFAULT_ROUTE[ROLES.ADMIN]).toBe(ROUTES.ADMIN.ROOT)
  })

  it('points Kepala Sub Bagian Umum active archive navigation to folder-first berkas page', () => {
    const pemberkasanGroup = NAV_CONFIG[ROLES.KEPALA_SUB_BAGIAN_UMUM].find((group) => group.title === 'PEMBERKASAN')

    expect(pemberkasanGroup?.items).toContainEqual(
      expect.objectContaining({
        id: 'arsip_aktif',
        label: 'Pemberkasan Arsip Aktif',
        to: ROUTES.KEPALA_SUB_BAGIAN_UMUM.BERKAS_AKTIF,
      }),
    )
    expect(ROUTES.KEPALA_SUB_BAGIAN_UMUM.AKTIF).toBe('/arsiparis/aktif')
  })
})
