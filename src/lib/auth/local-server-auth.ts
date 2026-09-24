// Server-only module. Do not import from client components.
import { type RoleName } from '#/lib/constants/roles'
import {
  resolveActiveRole,
  validateAssignedRoles,
} from './role-resolution'
import { SESSION_COOKIE_NAME } from './session-constants'
import type { SessionWithUserAndRoles } from './session-repository'
import { hashSessionToken } from './session-token'
import {
  getActiveRoleCookieValue,
  getCookieValue,
} from './session-cookies'

export type LocalServerSession = {
  user: {
    id: string
    username: string
    displayName?: string
  }
  userId: string
  roles: RoleName[]
  activeRole: RoleName
  sessionId: string
}

export async function getLocalServerSession(
  request: Request,
): Promise<LocalServerSession | null> {
  const cookieHeader = request.headers.get('cookie')
  const rawToken = getCookieValue(cookieHeader, SESSION_COOKIE_NAME)

  if (!rawToken) return null

  let currentSession: SessionWithUserAndRoles | null
  try {
    const { findSessionByTokenHash } = await import('./session-repository')
    currentSession = await findSessionByTokenHash(hashSessionToken(rawToken))
  } catch {
    currentSession = null
  }

  if (!currentSession) return null

  const roleValidation = validateAssignedRoles(currentSession.roles)
  if (!roleValidation.ok) return null

  const activeRole = resolveActiveRole(
    currentSession.roles,
    getActiveRoleCookieValue(cookieHeader),
  )

  if (!activeRole) return null

  return toLocalServerSession(currentSession, activeRole)
}

export function hasLocalRole(
  session: LocalServerSession,
  role: RoleName,
): boolean {
  return session.roles.includes(role)
}

export function hasAnyLocalRole(
  session: LocalServerSession,
  roles: RoleName[],
): boolean {
  if (roles.length === 0) return false
  return roles.some((role) => session.roles.includes(role))
}

export function createUnauthorizedResponse(
  message = 'Not authenticated',
): Response {
  return Response.json({ error: message }, { status: 401 })
}

function toLocalServerSession(
  currentSession: SessionWithUserAndRoles,
  activeRole: RoleName,
): LocalServerSession {
  const displayName =
    currentSession.user.displayName
    ?? currentSession.user.namaLengkap
    ?? undefined

  return {
    user: {
      id: currentSession.user.id,
      username: currentSession.user.username,
      displayName,
    },
    userId: currentSession.user.id,
    roles: currentSession.roles,
    activeRole,
    sessionId: currentSession.session.id,
  }
}
