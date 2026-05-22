import { afterEach, describe, expect, it } from 'vitest'

import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  createLoginRateLimitKey,
  getLoginRateLimitTrackedKeyCount,
  LOGIN_RATE_LIMIT_COOLDOWN_MS,
  LOGIN_RATE_LIMIT_MAX_FAILED_ATTEMPTS,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  recordFailedLoginAttempt,
  resetLoginRateLimitForTests,
} from '#/lib/auth/login-rate-limit'

describe('login rate-limit helper', () => {
  afterEach(() => {
    resetLoginRateLimitForTests()
  })

  it('normalizes identifier and IP when building keys', () => {
    expect(createLoginRateLimitKey({
      identifier: ' User@Example.TEST ',
      ipAddress: ' 192.0.2.10 ',
    })).toBe('id:user@example.test|ip:192.0.2.10')
  })

  it('uses identifier-only and IP-only fallback keys without passwords', () => {
    expect(createLoginRateLimitKey({
      identifier: 'user@example.test',
      ipAddress: null,
    })).toBe('id:user@example.test')

    expect(createLoginRateLimitKey({
      identifier: null,
      ipAddress: '192.0.2.20',
    })).toBe('ip:192.0.2.20')
  })

  it('allows attempts before the threshold and then applies cooldown', () => {
    const key = createLoginRateLimitKey({ identifier: 'user@example.test' })
    const now = Date.UTC(2026, 4, 21, 8, 0, 0)

    for (let i = 1; i < LOGIN_RATE_LIMIT_MAX_FAILED_ATTEMPTS; i += 1) {
      expect(recordFailedLoginAttempt(key, now + i)).toEqual({ allowed: true })
      expect(checkLoginRateLimit(key, now + i)).toEqual({ allowed: true })
    }

    const limited = recordFailedLoginAttempt(key, now + LOGIN_RATE_LIMIT_MAX_FAILED_ATTEMPTS)

    expect(limited.allowed).toBe(false)
    expect(checkLoginRateLimit(key, now + LOGIN_RATE_LIMIT_MAX_FAILED_ATTEMPTS + 1))
      .toMatchObject({
        allowed: false,
        retryAfterSeconds: Math.ceil((LOGIN_RATE_LIMIT_COOLDOWN_MS - 1) / 1000),
      })
  })

  it('does not globally block unrelated identifier keys', () => {
    const firstKey = createLoginRateLimitKey({ identifier: 'first@example.test' })
    const secondKey = createLoginRateLimitKey({ identifier: 'second@example.test' })
    const now = Date.UTC(2026, 4, 21, 8, 0, 0)

    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_FAILED_ATTEMPTS; i += 1) {
      recordFailedLoginAttempt(firstKey, now + i)
    }

    expect(checkLoginRateLimit(firstKey, now + 10).allowed).toBe(false)
    expect(checkLoginRateLimit(secondKey, now + 10)).toEqual({ allowed: true })
  })

  it('clears failed attempts after a successful login before the threshold', () => {
    const key = createLoginRateLimitKey({ identifier: 'user@example.test' })
    const now = Date.UTC(2026, 4, 21, 8, 0, 0)

    recordFailedLoginAttempt(key, now)
    recordFailedLoginAttempt(key, now + 1)
    clearLoginRateLimit(key)

    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_FAILED_ATTEMPTS - 1; i += 1) {
      expect(recordFailedLoginAttempt(key, now + 100 + i)).toEqual({ allowed: true })
    }
  })

  it('expires old attempts and expired cooldown state', () => {
    const key = createLoginRateLimitKey({ identifier: 'user@example.test' })
    const now = Date.UTC(2026, 4, 21, 8, 0, 0)

    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_FAILED_ATTEMPTS; i += 1) {
      recordFailedLoginAttempt(key, now + i)
    }

    expect(checkLoginRateLimit(key, now + 10).allowed).toBe(false)

    const afterCooldown = now + LOGIN_RATE_LIMIT_COOLDOWN_MS + LOGIN_RATE_LIMIT_WINDOW_MS + 1
    expect(checkLoginRateLimit(key, afterCooldown)).toEqual({ allowed: true })
    expect(getLoginRateLimitTrackedKeyCount()).toBe(0)
  })
})
