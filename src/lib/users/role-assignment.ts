import { ROLE_NAMES, ROLES, type RoleName } from '#/lib/constants/roles'

export const SELF_ADMIN_REMOVAL_ERROR = 'Anda tidak dapat menghapus role ADMIN dari akun yang sedang digunakan.'
export const LAST_ACTIVE_ADMIN_ERROR = 'Minimal harus ada satu akun ADMIN aktif.'

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

export function evaluateAdminRoleMutationPolicy(input: {
  actingUserId: string
  targetUserId: string
  currentRoles: RoleName[]
  nextRoles: RoleName[]
  targetIsActive: boolean
  activeAdminCount: number
}): string | null {
  const removesAdmin = input.currentRoles.includes(ROLES.ADMIN) && !input.nextRoles.includes(ROLES.ADMIN)
  if (!removesAdmin) return null

  if (input.actingUserId === input.targetUserId) {
    return SELF_ADMIN_REMOVAL_ERROR
  }

  if (input.targetIsActive && input.activeAdminCount <= 1) {
    return LAST_ACTIVE_ADMIN_ERROR
  }

  return null
}

export function evaluateAdminDeactivationPolicy(input: {
  currentRoles: RoleName[]
  targetIsActive: boolean
  activeAdminCount: number
}): string | null {
  if (
    input.targetIsActive
    && input.currentRoles.includes(ROLES.ADMIN)
    && input.activeAdminCount <= 1
  ) {
    return LAST_ACTIVE_ADMIN_ERROR
  }

  return null
}
