import { ROLE_NAMES, ROLES, type RoleName } from '#/lib/constants/roles'

export function normalizeAdminRolePayload(input: RoleName[]): RoleName[] {
  const uniqueRoles = [...new Set(input)]

  if (uniqueRoles.includes(ROLES.ADMIN)) {
    return [ROLES.ADMIN]
  }

  return uniqueRoles.includes(ROLES.PEGAWAI)
    ? uniqueRoles
    : [ROLES.PEGAWAI, ...uniqueRoles]
}

export function normalizeAdminRoleToggle(currentRoles: RoleName[], toggledRole: RoleName): RoleName[] {
  if (toggledRole === ROLES.ADMIN) {
    return currentRoles.includes(ROLES.ADMIN) ? [ROLES.PEGAWAI] : [ROLES.ADMIN]
  }

  const nonAdminRoles = currentRoles.filter((role) => role !== ROLES.ADMIN)

  if (toggledRole === ROLES.PEGAWAI) {
    return normalizeAdminRolePayload(nonAdminRoles)
  }

  const nextRoles = nonAdminRoles.includes(toggledRole)
    ? nonAdminRoles.filter((role) => role !== toggledRole)
    : [...nonAdminRoles, toggledRole]

  return normalizeAdminRolePayload(nextRoles)
}

export function findInvalidCanonicalRoles(input: unknown[]): string[] {
  return input
    .filter((role) => typeof role !== 'string' || !ROLE_NAMES.includes(role as RoleName))
    .map((role) => typeof role === 'string' ? role : String(role))
}

export function hasAdminMixedWithNonAdmin(input: RoleName[]): boolean {
  const uniqueRoles = new Set(input)
  return uniqueRoles.has(ROLES.ADMIN) && uniqueRoles.size > 1
}
