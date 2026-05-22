// Server-only module. In-memory foundation for local single-process login abuse protection.

export const LOGIN_RATE_LIMIT_MAX_FAILED_ATTEMPTS = 5
export const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
export const LOGIN_RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000

const MAX_TRACKED_LOGIN_RATE_LIMIT_KEYS = 10_000

type LoginRateLimitState = {
  failedAt: number[]
  cooldownUntil: number | null
  updatedAt: number
}

export type LoginRateLimitDecision =
  | { allowed: true }
  | {
    allowed: false
    retryAfterSeconds: number
    cooldownUntil: number
  }

export type LoginRateLimitKeyInput = {
  identifier?: string | null
  ipAddress?: string | null
}

const attemptsByKey = new Map<string, LoginRateLimitState>()

export function createLoginRateLimitKey(input: LoginRateLimitKeyInput): string {
  const identifier = normalizeIdentifier(input.identifier)
  const ipAddress = normalizeIpAddress(input.ipAddress)

  if (identifier && ipAddress) {
    return `id:${identifier}|ip:${ipAddress}`
  }

  if (identifier) {
    return `id:${identifier}`
  }

  if (ipAddress) {
    return `ip:${ipAddress}`
  }

  return 'anonymous'
}

export function checkLoginRateLimit(
  key: string,
  now = Date.now(),
): LoginRateLimitDecision {
  pruneLoginRateLimitState(now)

  const state = attemptsByKey.get(key)
  if (!state) {
    return { allowed: true }
  }

  const normalized = normalizeState(state, now)
  if (!normalized) {
    attemptsByKey.delete(key)
    return { allowed: true }
  }

  attemptsByKey.set(key, normalized)

  if (normalized.cooldownUntil && normalized.cooldownUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: secondsUntil(normalized.cooldownUntil, now),
      cooldownUntil: normalized.cooldownUntil,
    }
  }

  return { allowed: true }
}

export function recordFailedLoginAttempt(
  key: string,
  now = Date.now(),
): LoginRateLimitDecision {
  pruneLoginRateLimitState(now)

  const current = normalizeState(attemptsByKey.get(key), now) ?? {
    failedAt: [],
    cooldownUntil: null,
    updatedAt: now,
  }

  const failedAt = [...current.failedAt, now].filter(
    (timestamp) => timestamp > now - LOGIN_RATE_LIMIT_WINDOW_MS,
  )
  const cooldownUntil = failedAt.length >= LOGIN_RATE_LIMIT_MAX_FAILED_ATTEMPTS
    ? now + LOGIN_RATE_LIMIT_COOLDOWN_MS
    : current.cooldownUntil

  const next = {
    failedAt,
    cooldownUntil,
    updatedAt: now,
  }

  attemptsByKey.set(key, next)
  enforceMaxTrackedKeys()

  if (cooldownUntil && cooldownUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: secondsUntil(cooldownUntil, now),
      cooldownUntil,
    }
  }

  return { allowed: true }
}

export function clearLoginRateLimit(key: string): void {
  attemptsByKey.delete(key)
}

export function getLoginRateLimitTrackedKeyCount(): number {
  return attemptsByKey.size
}

export function resetLoginRateLimitForTests(): void {
  attemptsByKey.clear()
}

function normalizeState(
  state: LoginRateLimitState | undefined,
  now: number,
): LoginRateLimitState | null {
  if (!state) return null

  const failedAt = state.failedAt.filter(
    (timestamp) => timestamp > now - LOGIN_RATE_LIMIT_WINDOW_MS,
  )
  const cooldownUntil = state.cooldownUntil && state.cooldownUntil > now
    ? state.cooldownUntil
    : null

  if (failedAt.length === 0 && !cooldownUntil) {
    return null
  }

  return {
    failedAt,
    cooldownUntil,
    updatedAt: state.updatedAt,
  }
}

function pruneLoginRateLimitState(now: number): void {
  for (const [key, state] of attemptsByKey.entries()) {
    if (!normalizeState(state, now)) {
      attemptsByKey.delete(key)
    }
  }
}

function enforceMaxTrackedKeys(): void {
  if (attemptsByKey.size <= MAX_TRACKED_LOGIN_RATE_LIMIT_KEYS) {
    return
  }

  const sortedEntries = [...attemptsByKey.entries()]
    .sort(([, a], [, b]) => a.updatedAt - b.updatedAt)
  const removeCount = attemptsByKey.size - MAX_TRACKED_LOGIN_RATE_LIMIT_KEYS

  for (const [key] of sortedEntries.slice(0, removeCount)) {
    attemptsByKey.delete(key)
  }
}

function normalizeIdentifier(identifier: string | null | undefined): string | null {
  const normalized = identifier?.trim().toLowerCase()
  return normalized ? normalized : null
}

function normalizeIpAddress(ipAddress: string | null | undefined): string | null {
  const normalized = ipAddress?.trim().toLowerCase()
  return normalized ? normalized : null
}

function secondsUntil(timestamp: number, now: number): number {
  return Math.max(1, Math.ceil((timestamp - now) / 1000))
}
