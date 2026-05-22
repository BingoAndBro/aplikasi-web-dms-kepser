import { describe, expect, it } from 'vitest'

import { ROLES } from '#/lib/constants/roles'
import {
  LAST_ACTIVE_ADMIN_ERROR,
  SELF_ADMIN_REMOVAL_ERROR,
  evaluateAdminDeactivationPolicy,
  evaluateAdminRoleMutationPolicy,
  findInvalidCanonicalRoles,
  normalizeAdminRolePayload,
  normalizeAdminRoleToggle,
} from '#/lib/users/role-assignment'

describe('admin user role assignment normalization', () => {
  it('selecting ADMIN from PEGAWAI + PPK results in ADMIN only', () => {
    expect(normalizeAdminRoleToggle([ROLES.PEGAWAI, ROLES.PPK], ROLES.ADMIN)).toEqual([
      ROLES.ADMIN,
    ])
  })

  it('selecting PPK from ADMIN results in PEGAWAI + PPK', () => {
    expect(normalizeAdminRoleToggle([ROLES.ADMIN], ROLES.PPK)).toEqual([
      ROLES.PEGAWAI,
      ROLES.PPK,
    ])
  })

  it('keeps PEGAWAI for non-admin role combinations', () => {
    expect(normalizeAdminRoleToggle([ROLES.PEGAWAI, ROLES.BENDAHARA], ROLES.PENANGGUNG_JAWAB_KINERJA)).toEqual([
      ROLES.PEGAWAI,
      ROLES.BENDAHARA,
      ROLES.PENANGGUNG_JAWAB_KINERJA,
    ])
  })

  it('adds PEGAWAI to submitted non-admin payloads that omit it', () => {
    expect(normalizeAdminRolePayload([ROLES.KEPALA_SUB_BAGIAN_UMUM])).toEqual([
      ROLES.PEGAWAI,
      ROLES.KEPALA_SUB_BAGIAN_UMUM,
    ])
  })

  it('normalizes mixed ADMIN submissions to ADMIN only', () => {
    expect(normalizeAdminRolePayload([ROLES.ADMIN, ROLES.PEGAWAI])).toEqual([
      ROLES.ADMIN,
    ])
    expect(normalizeAdminRolePayload([ROLES.ADMIN, ROLES.PENANGGUNG_JAWAB_KINERJA])).toEqual([
      ROLES.ADMIN,
    ])
  })

  it('deduplicates submitted roles before persistence', () => {
    expect(normalizeAdminRolePayload([ROLES.PPK, ROLES.PPK])).toEqual([
      ROLES.PEGAWAI,
      ROLES.PPK,
    ])
  })

  it('identifies unknown submitted role names before normalization', () => {
    expect(findInvalidCanonicalRoles([ROLES.PEGAWAI, 'ARSIPARIS', 123])).toEqual([
      'ARSIPARIS',
      '123',
    ])
  })

  it('rejects self admin demotion', () => {
    expect(evaluateAdminRoleMutationPolicy({
      actingUserId: 'admin-a',
      targetUserId: 'admin-a',
      currentRoles: [ROLES.ADMIN],
      nextRoles: [ROLES.PEGAWAI, ROLES.PPK],
      targetIsActive: true,
      activeAdminCount: 2,
    })).toBe(SELF_ADMIN_REMOVAL_ERROR)
  })

  it('allows an admin to demote another admin when another active admin remains', () => {
    expect(evaluateAdminRoleMutationPolicy({
      actingUserId: 'admin-a',
      targetUserId: 'admin-b',
      currentRoles: [ROLES.ADMIN],
      nextRoles: [ROLES.PEGAWAI, ROLES.PPK],
      targetIsActive: true,
      activeAdminCount: 2,
    })).toBeNull()
  })

  it('rejects removing ADMIN from the last active admin account', () => {
    expect(evaluateAdminRoleMutationPolicy({
      actingUserId: 'admin-a',
      targetUserId: 'admin-b',
      currentRoles: [ROLES.ADMIN],
      nextRoles: [ROLES.PEGAWAI, ROLES.PPK],
      targetIsActive: true,
      activeAdminCount: 1,
    })).toBe(LAST_ACTIVE_ADMIN_ERROR)
  })

  it('rejects deactivating the last active admin account', () => {
    expect(evaluateAdminDeactivationPolicy({
      currentRoles: [ROLES.ADMIN],
      targetIsActive: true,
      activeAdminCount: 1,
    })).toBe(LAST_ACTIVE_ADMIN_ERROR)
  })
})
