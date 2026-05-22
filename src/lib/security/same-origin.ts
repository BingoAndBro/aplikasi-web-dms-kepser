// Server-only same-origin guard for cookie-authenticated unsafe API methods.

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const FORBIDDEN_BODY = { error: 'Permintaan tidak diizinkan' }
const APP_URL_ENV = 'APP_URL'

export function isUnsafeMethod(method: string): boolean {
  return UNSAFE_METHODS.has(method.toUpperCase())
}

export function requireSameOrigin(request: Request): Response | null {
  if (!isUnsafeMethod(request.method)) return null

  const allowedOrigins = getAllowedOrigins(request)
  const origin = parseOriginHeader(request.headers.get('origin'))

  if (origin) {
    return allowedOrigins.has(origin) ? null : forbiddenSameOriginResponse()
  }

  const refererOrigin = parseRefererOrigin(request.headers.get('referer'))
  if (refererOrigin && allowedOrigins.has(refererOrigin)) return null

  return forbiddenSameOriginResponse()
}

export function assertSameOriginRequest(request: Request): void {
  const response = requireSameOrigin(request)
  if (response) throw response
}

function forbiddenSameOriginResponse(): Response {
  return Response.json(FORBIDDEN_BODY, { status: 403 })
}

function getAllowedOrigins(request: Request): Set<string> {
  const origins = new Set<string>()
  addUrlOrigin(origins, request.url)
  addUrlOrigin(origins, process.env[APP_URL_ENV])
  addForwardedOrigin(origins, request)
  addHostOrigin(origins, request)
  return origins
}

function addUrlOrigin(origins: Set<string>, value: string | undefined): void {
  if (!value) return

  try {
    origins.add(new URL(value).origin)
  } catch {
    // Invalid runtime configuration must not leak into responses.
  }
}

function addForwardedOrigin(origins: Set<string>, request: Request): void {
  const host = getFirstHeaderValue(request.headers.get('x-forwarded-host'))
  if (!host) return

  const proto =
    getFirstHeaderValue(request.headers.get('x-forwarded-proto'))
    ?? inferProtocol(request.url)

  addUrlOrigin(origins, `${proto}://${host}`)
}

function addHostOrigin(origins: Set<string>, request: Request): void {
  const host = getFirstHeaderValue(request.headers.get('host'))
  if (!host) return

  addUrlOrigin(origins, `${inferProtocol(request.url)}://${host}`)
}

function parseOriginHeader(value: string | null): string | null {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed === 'null') return 'invalid-origin'

  try {
    return new URL(trimmed).origin
  } catch {
    return 'invalid-origin'
  }
}

function parseRefererOrigin(value: string | null): string | null {
  if (!value) return null

  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function getFirstHeaderValue(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null
}

function inferProtocol(requestUrl: string): 'http' | 'https' {
  try {
    return new URL(requestUrl).protocol === 'https:' ? 'https' : 'http'
  } catch {
    return 'http'
  }
}
