import { describe, expect, it } from 'vitest'

import {
  generateSessionToken,
  hashSessionToken,
  isLikelySessionToken,
  isLikelySessionTokenHash,
} from '#/lib/auth/session-token'

describe('session token utility', () => {
  it('generates a non-empty base64url-like token', () => {
    const token = generateSessionToken()

    expect(token).toHaveLength(43)
    expect(isLikelySessionToken(token)).toBe(true)
  })

  it('generates different token values', () => {
    const first = generateSessionToken()
    const second = generateSessionToken()

    expect(first).not.toBe(second)
  })

  it('hashes tokens deterministically', () => {
    const token = 'A'.repeat(43)

    expect(hashSessionToken(token)).toBe(hashSessionToken(token))
  })

  it('returns a hash that differs from the raw token', () => {
    const token = 'B'.repeat(43)
    const tokenHash = hashSessionToken(token)

    expect(tokenHash).not.toBe(token)
    expect(isLikelySessionTokenHash(tokenHash)).toBe(true)
  })

  it('rejects empty token input', () => {
    expect(() => hashSessionToken('')).toThrow('Session token must be a non-empty string.')
    expect(() => hashSessionToken('   ')).toThrow('Session token must be a non-empty string.')
  })

  it('validates token and hash shapes without authorizing them', () => {
    expect(isLikelySessionToken('C'.repeat(43))).toBe(true)
    expect(isLikelySessionTokenHash('D'.repeat(43))).toBe(true)

    expect(isLikelySessionToken('C'.repeat(42))).toBe(false)
    expect(isLikelySessionTokenHash('D'.repeat(44))).toBe(false)
    expect(isLikelySessionToken('not+base64url/shape=')).toBe(false)
    expect(isLikelySessionTokenHash('not+base64url/shape=')).toBe(false)
  })
})

