import { describe, expect, it } from 'vitest'

import { ROLES } from '#/lib/constants/roles'
import {
  resolveActiveRole,
  resolvePrimaryRole,
  validateAssignedRoles,
} from '#/lib/auth/role-resolution'

describe('local auth role resolution', () => {
  it('prefers PEGAWAI as the primary role when present', () => {
    expect(resolvePrimaryRole([ROLES.PPK, ROLES.PEGAWAI])).toBe(ROLES.PEGAWAI)
  })

  it('uses the first assigned role as primary when PEGAWAI is absent', () => {
    expect(resolvePrimaryRole([ROLES.BENDAHARA, ROLES.KEPALA_SUB_BAGIAN_UMUM])).toBe(ROLES.BENDAHARA)
  })

  it('uses a valid requested active role', () => {
    expect(resolveActiveRole([ROLES.PEGAWAI, ROLES.PPK], ROLES.PPK)).toBe(ROLES.PPK)
  })

  it('falls back to the primary role when the requested active role is missing or invalid', () => {
    expect(resolveActiveRole([ROLES.PEGAWAI, ROLES.BENDAHARA], null)).toBe(ROLES.PEGAWAI)
    expect(resolveActiveRole([ROLES.PEGAWAI, ROLES.BENDAHARA], ROLES.PPK)).toBe(ROLES.PEGAWAI)
  })

  it('rejects users with no assigned roles', () => {
    expect(validateAssignedRoles([])).toEqual({
      ok: false,
      error: 'Akun tidak memiliki role aktif.',
    })
  })

  it('rejects ADMIN combined with any other role', () => {
    expect(validateAssignedRoles([ROLES.ADMIN, ROLES.PEGAWAI])).toEqual({
      ok: false,
      error: 'Konfigurasi role akun tidak valid.',
    })
  })
})
