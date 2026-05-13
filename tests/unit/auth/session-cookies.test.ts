import { describe, expect, it } from 'vitest'

import { ROLES } from '#/lib/constants/roles'
import {
  clearActiveRoleCookieHeader,
  clearSessionCookieHeader,
  createActiveRoleCookieHeader,
  createSessionCookieHeader,
  getActiveRoleCookieValue,
  getCookieValue,
} from '#/lib/auth/session-cookies'

describe('session cookie helpers', () => {
  it('reads named cookie values from a cookie header', () => {
    expect(getCookieValue('a=1; dms_session=abc123; theme=light', 'dms_session')).toBe('abc123')
    expect(getCookieValue('a=1; theme=light', 'dms_session')).toBeNull()
  })

  it('creates an HttpOnly session cookie without Secure on local HTTP', () => {
    const request = new Request('http://localhost/api/auth/login')
    const cookie = createSessionCookieHeader(request, 'opaque-token', 28_800)

    expect(cookie).toContain('dms_session=opaque-token')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('Max-Age=28800')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).not.toContain('Secure')
  })

  it('keeps the active role cookie readable by omitting HttpOnly', () => {
    const cookie = createActiveRoleCookieHeader(ROLES.PPK)

    expect(cookie).toContain('dms_active_role=PPK')
    expect(cookie).toContain('Max-Age=2592000')
    expect(cookie).not.toContain('HttpOnly')
  })

  it('reads only canonical active role cookie values', () => {
    expect(getActiveRoleCookieValue('dms_active_role=BENDAHARA')).toBe(ROLES.BENDAHARA)
    expect(getActiveRoleCookieValue('dms_active_role=INVALID')).toBeNull()
  })

  it('clears both compatibility cookies', () => {
    const request = new Request('http://localhost/api/auth/logout')

    expect(clearSessionCookieHeader(request)).toContain('dms_session=; Path=/; Max-Age=0')
    expect(clearActiveRoleCookieHeader()).toContain('dms_active_role=; Path=/; Max-Age=0')
  })
})
