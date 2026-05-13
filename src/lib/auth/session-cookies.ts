// Server-only module. Do not import from client components.
import { ROLE_NAMES, type RoleName } from '#/lib/constants/roles'
import {
  ACTIVE_ROLE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from './session-constants'

const ACTIVE_ROLE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

type CookieOptions = {
  httpOnly?: boolean
  maxAge?: number
  sameSite?: 'Lax' | 'Strict' | 'None'
  secure?: boolean
  path?: string
}

export function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null

  for (const cookie of cookieHeader.split(';')) {
    const trimmed = cookie.trim()
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue

    const cookieName = trimmed.slice(0, separatorIndex)
    if (cookieName !== name) continue

    return safeDecodeCookieValue(trimmed.slice(separatorIndex + 1))
  }

  return null
}

export function getActiveRoleCookieValue(cookieHeader: string | null): RoleName | null {
  const role = getCookieValue(cookieHeader, ACTIVE_ROLE_COOKIE_NAME)
  return isRoleName(role) ? role : null
}

export function createSessionCookieHeader(
  request: Request,
  rawToken: string,
  maxAgeSeconds: number,
): string {
  return serializeCookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    maxAge: maxAgeSeconds,
    sameSite: 'Lax',
    secure: shouldUseSecureCookies(request),
    path: '/',
  })
}

export function createActiveRoleCookieHeader(role: RoleName): string {
  return serializeCookie(ACTIVE_ROLE_COOKIE_NAME, role, {
    maxAge: ACTIVE_ROLE_MAX_AGE_SECONDS,
    sameSite: 'Lax',
    path: '/',
  })
}

export function clearSessionCookieHeader(request: Request): string {
  return serializeCookie(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    maxAge: 0,
    sameSite: 'Lax',
    secure: shouldUseSecureCookies(request),
    path: '/',
  })
}

export function clearActiveRoleCookieHeader(): string {
  return serializeCookie(ACTIVE_ROLE_COOKIE_NAME, '', {
    maxAge: 0,
    sameSite: 'Lax',
    path: '/',
  })
}

export function appendSetCookieHeaders(headers: Headers, cookies: string[]): Headers {
  for (const cookie of cookies) {
    headers.append('Set-Cookie', cookie)
  }
  return headers
}

function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]

  if (options.path) parts.push(`Path=${options.path}`)
  if (typeof options.maxAge === 'number') parts.push(`Max-Age=${options.maxAge}`)
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`)
  if (options.secure) parts.push('Secure')
  if (options.httpOnly) parts.push('HttpOnly')

  return parts.join('; ')
}

function shouldUseSecureCookies(request: Request): boolean {
  if (process.env.NODE_ENV === 'production') return true

  const forwardedProto = request.headers.get('x-forwarded-proto')
  if (forwardedProto?.split(',')[0]?.trim() === 'https') return true

  try {
    return new URL(request.url).protocol === 'https:'
  } catch {
    return false
  }
}

function safeDecodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function isRoleName(value: string | null): value is RoleName {
  return typeof value === 'string' && ROLE_NAMES.includes(value as RoleName)
}
