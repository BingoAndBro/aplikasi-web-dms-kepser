// Server-only module. Do not import from client components.
import { eq } from 'drizzle-orm'

import { db } from '#/db/client'
import { roles as rolesTable, userRoles, users } from '#/db/schema/auth'
import { ROLE_NAMES, type RoleName } from '#/lib/constants/roles'
import { verifyPassword } from './password'
import { resolvePrimaryRole, validateAssignedRoles } from './role-resolution'
import {
  REMEMBER_ME_DURATION_SECONDS,
  SESSION_DURATION_SECONDS,
} from './session-constants'
import { createSessionRecord } from './session-repository'
import { generateSessionToken, hashSessionToken } from './session-token'

export type LocalAuthUser = {
  id: string
  email: string
  userName?: string
}

export type LocalLoginResult =
  | {
    ok: true
    user: LocalAuthUser
    roles: RoleName[]
    activeRole: RoleName
    rawToken: string
    sessionMaxAgeSeconds: number
  }
  | {
    ok: false
    status: 401 | 403
    error: string
    code?: string
  }

type LoginOptions = {
  email: string
  password: string
  rememberMe?: boolean
  userAgent?: string | null
  ipAddress?: string | null
}

type UserWithRoles = {
  user: {
    id: string
    email: string
    passwordHash: string
    displayName: string | null
    namaLengkap: string | null
    isActive: boolean
  }
  roles: RoleName[]
}

const GENERIC_CREDENTIAL_ERROR = 'Email atau password salah'

export async function loginWithLocalCredentials(
  options: LoginOptions,
): Promise<LocalLoginResult> {
  const email = normalizeEmail(options.email)
  const found = await findUserWithRolesByEmail(email)

  if (!found) {
    return invalidCredentials()
  }

  if (!found.user.isActive) {
    return {
      ok: false,
      status: 403,
      error: 'Akun Anda tidak aktif. Hubungi Administrator.',
    }
  }

  const passwordMatches = await verifyPassword(found.user.passwordHash, options.password)
  if (!passwordMatches) {
    return invalidCredentials()
  }

  const roleValidation = validateAssignedRoles(found.roles)
  if (!roleValidation.ok) {
    return {
      ok: false,
      status: 403,
      error: roleValidation.error,
    }
  }

  const activeRole = resolvePrimaryRole(found.roles)
  const rawToken = generateSessionToken()
  const tokenHash = hashSessionToken(rawToken)
  const sessionMaxAgeSeconds = options.rememberMe
    ? REMEMBER_ME_DURATION_SECONDS
    : SESSION_DURATION_SECONDS

  await createSessionRecord({
    userId: found.user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + sessionMaxAgeSeconds * 1000),
    rememberMe: Boolean(options.rememberMe),
    userAgent: options.userAgent,
    ipAddress: options.ipAddress,
  })

  return {
    ok: true,
    user: toLocalAuthUser(found.user),
    roles: found.roles,
    activeRole,
    rawToken,
    sessionMaxAgeSeconds,
  }
}

export function toLocalAuthUser(user: {
  id: string
  email: string
  displayName?: string | null
  namaLengkap?: string | null
}): LocalAuthUser {
  return {
    id: user.id,
    email: user.email,
    userName: user.displayName ?? user.namaLengkap ?? undefined,
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

async function findUserWithRolesByEmail(email: string): Promise<UserWithRoles | null> {
  const rows = await db
    .select({
      user: {
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        displayName: users.displayName,
        namaLengkap: users.namaLengkap,
        isActive: users.isActive,
      },
      roleName: rolesTable.nama,
    })
    .from(users)
    .leftJoin(userRoles, eq(users.id, userRoles.userId))
    .leftJoin(rolesTable, eq(userRoles.roleId, rolesTable.id))
    .where(eq(users.email, email))

  if (rows.length === 0) return null

  const first = rows[0]
  if (!first) return null

  return {
    user: first.user,
    roles: rows
      .map((row) => row.roleName)
      .filter(isRoleName),
  }
}

function invalidCredentials(): LocalLoginResult {
  return {
    ok: false,
    status: 401,
    error: GENERIC_CREDENTIAL_ERROR,
    code: 'invalid_credentials',
  }
}

function isRoleName(value: string | null): value is RoleName {
  return typeof value === 'string' && ROLE_NAMES.includes(value as RoleName)
}
