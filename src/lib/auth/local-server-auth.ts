// Server-only module. Do not import from client components.
import { type RoleName } from '#/lib/constants/roles'
import {
  resolveActiveRole,
  validateAssignedRoles,
} from './role-resolution'
import { SESSION_COOKIE_NAME } from './session-constants'
import {
  findSessionByTokenHash,
  type SessionWithUserAndRoles,
} from './session-repository'
import { hashSessionToken } from './session-token'
import {
  getActiveRoleCookieValue,
  getCookieValue,
} from './session-cookies'

export type LocalServerSession = {
  user: {
    id: string
    email: string
    userName?: string
  }
  userId: string
  email: string
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

export async function requireLocalServerSession(
  request: Request,
): Promise<LocalServerSession> {
  const session = await getLocalServerSession(request)
  if (!session) {
    throw createUnauthorizedResponse()
  }

  return session
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

export async function requireLocalRole(
  request: Request,
  role: RoleName,
): Promise<LocalServerSession> {
  const session = await requireLocalServerSession(request)
  if (!hasLocalRole(session, role)) {
    throw createForbiddenResponse()
  }

  return session
}

export async function requireAnyLocalRole(
  request: Request,
  roles: RoleName[],
): Promise<LocalServerSession> {
  const session = await requireLocalServerSession(request)
  if (!hasAnyLocalRole(session, roles)) {
    throw createForbiddenResponse()
  }

  return session
}

export function getLocalActiveRole(
  request: Request,
  session: LocalServerSession,
): RoleName | null {
  return resolveActiveRole(
    session.roles,
    getActiveRoleCookieValue(request.headers.get('cookie')),
  )
}

export function createUnauthorizedResponse(
  message = 'Not authenticated',
): Response {
  return Response.json({ error: message }, { status: 401 })
}

export function createForbiddenResponse(
  message = 'Forbidden',
): Response {
  return Response.json({ error: message }, { status: 403 })
}

function toLocalServerSession(
  currentSession: SessionWithUserAndRoles,
  activeRole: RoleName,
): LocalServerSession {
  const userName =
    currentSession.user.displayName
    ?? currentSession.user.namaLengkap
    ?? undefined

  return {
    user: {
      id: currentSession.user.id,
      email: currentSession.user.email,
      userName,
    },
    userId: currentSession.user.id,
    email: currentSession.user.email,
    roles: currentSession.roles,
    activeRole,
    sessionId: currentSession.session.id,
  }
}
