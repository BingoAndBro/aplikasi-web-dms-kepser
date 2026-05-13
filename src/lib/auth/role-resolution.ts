// Server-only module. Do not import from client components.
import { ROLES, type RoleName } from '#/lib/constants/roles'

export function resolvePrimaryRole(roles: RoleName[]): RoleName {
  if (roles.includes(ROLES.PEGAWAI)) return ROLES.PEGAWAI
  return roles[0] ?? ROLES.PEGAWAI
}

export function resolveActiveRole(
  roles: RoleName[],
  requestedRole: RoleName | null,
): RoleName | null {
  if (roles.length === 0) return null
  return requestedRole && roles.includes(requestedRole)
    ? requestedRole
    : resolvePrimaryRole(roles)
}

export function validateAssignedRoles(assignedRoles: RoleName[]): { ok: true } | { ok: false; error: string } {
  const uniqueRoles = new Set(assignedRoles)

  if (uniqueRoles.size === 0) {
    return { ok: false, error: 'Akun tidak memiliki role aktif.' }
  }

  if (uniqueRoles.has(ROLES.ADMIN) && uniqueRoles.size > 1) {
    return { ok: false, error: 'Konfigurasi role akun tidak valid.' }
  }

  return { ok: true }
}
