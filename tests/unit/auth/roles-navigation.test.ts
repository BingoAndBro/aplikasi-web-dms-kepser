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

  it('uses the Penanggung Jawab Kinerja dashboard as the role default route', () => {
    expect(ROLE_DEFAULT_ROUTE[ROLES.PENANGGUNG_JAWAB_KINERJA]).toBe(
      ROUTES.PENANGGUNG_JAWAB_KINERJA.ROOT,
    )
  })

  it('exposes dashboard, Laporan Kinerja, and deferred system navigation for the role', () => {
    const groups = NAV_CONFIG[ROLES.PENANGGUNG_JAWAB_KINERJA]

    expect(groups).toHaveLength(3)
    expect(groups.find((group) => group.title === 'GENERAL')?.items).toContainEqual(
      expect.objectContaining({
        id: 'dashboard',
        label: 'Dashboard',
        to: ROUTES.PENANGGUNG_JAWAB_KINERJA.ROOT,
      }),
    )
    expect(groups.find((group) => group.title === 'KINERJA')?.items).toContainEqual(
      expect.objectContaining({
        id: 'laporan_kinerja',
        label: 'Laporan Kinerja',
        to: ROUTES.PENANGGUNG_JAWAB_KINERJA.LAPORAN_KINERJA,
      }),
    )
    expect(groups.find((group) => group.title === 'SYSTEM')?.items).toContainEqual(
      expect.objectContaining({
        id: 'profile',
        label: 'Profil',
        to: ROUTES.PROFILE,
      }),
    )
    const activityLogItem = groups
      .find((group) => group.title === 'SYSTEM')
      ?.items.find((item) => item.id === 'history')

    expect(activityLogItem).toEqual(expect.objectContaining({ label: 'Activity Log' }))
    expect(activityLogItem).not.toHaveProperty('to')
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
    expect(pemberkasanGroup?.items).not.toContainEqual(
      expect.objectContaining({
        id: 'arsip_aktif',
        to: '/arsiparis/aktif',
      }),
    )
    expect(ROUTES.KEPALA_SUB_BAGIAN_UMUM.BERKAS_AKTIF).toBe('/arsiparis/berkas')
    expect(ROUTES.KEPALA_SUB_BAGIAN_UMUM).not.toHaveProperty('AKTIF')
  })

  it('does not expose the legacy global archive search route in role navigation', () => {
    const allItems = Object.values(NAV_CONFIG).flatMap((groups) => groups.flatMap((group) => group.items))

    expect(allItems).not.toContainEqual(
      expect.objectContaining({
        label: 'Cari Arsip',
      }),
    )
    expect(allItems).not.toContainEqual(
      expect.objectContaining({
        label: 'Pencarian Arsip',
      }),
    )
    expect(allItems).not.toContainEqual(
      expect.objectContaining({
        to: '/arsiparis/search',
      }),
    )
    expect(ROUTES.KEPALA_SUB_BAGIAN_UMUM).not.toHaveProperty('SEARCH')
  })

  it('does not expose the removed Laporan Klasifikasi archive report surface in role navigation', () => {
    const allItems = Object.values(NAV_CONFIG).flatMap((groups) => groups.flatMap((group) => group.items))

    expect(allItems).not.toContainEqual(
      expect.objectContaining({
        id: 'laporan_klasifikasi',
      }),
    )
    expect(allItems).not.toContainEqual(
      expect.objectContaining({
        label: 'Laporan Klasifikasi Arsip',
      }),
    )
    expect(allItems).not.toContainEqual(
      expect.objectContaining({
        to: '/arsiparis/laporan-klasifikasi',
      }),
    )
    expect(ROUTES.KEPALA_SUB_BAGIAN_UMUM).not.toHaveProperty('LAPORAN_KLASIFIKASI')
  })
})
