import { describe, expect, it } from 'vitest'

import { isUnsafeMethod, requireSameOrigin } from '#/lib/security/same-origin'

describe('same-origin unsafe method guard', () => {
  it('allows same Origin for unsafe methods', async () => {
    const response = requireSameOrigin(request('POST', {
      Origin: 'http://localhost',
    }))

    expect(response).toBeNull()
  })

  it('allows same-origin Referer when Origin is absent', async () => {
    const response = requireSameOrigin(request('PATCH', {
      Referer: 'http://localhost/profile',
    }))

    expect(response).toBeNull()
  })

  it('rejects cross-origin Origin for unsafe methods', async () => {
    const response = requireSameOrigin(request('POST', {
      Origin: 'https://evil.example',
    }))

    expect(response?.status).toBe(403)
    expect(await response?.json()).toEqual({ error: 'Permintaan tidak diizinkan' })
  })

  it('rejects explicit null Origin even if Referer is same-origin', async () => {
    const response = requireSameOrigin(request('POST', {
      Origin: 'null',
      Referer: 'http://localhost/profile',
    }))

    expect(response?.status).toBe(403)
    expect(await response?.json()).toEqual({ error: 'Permintaan tidak diizinkan' })
  })

  it('rejects unsafe methods without Origin or Referer', async () => {
    const response = requireSameOrigin(request('DELETE'))

    expect(response?.status).toBe(403)
    expect(await response?.json()).toEqual({ error: 'Permintaan tidak diizinkan' })
  })

  it('allows safe methods without Origin', () => {
    expect(requireSameOrigin(request('GET'))).toBeNull()
    expect(requireSameOrigin(request('HEAD'))).toBeNull()
    expect(requireSameOrigin(request('OPTIONS'))).toBeNull()
  })

  it('allows configured APP_URL origin without exposing the value', () => {
    const previousAppUrl = process.env.APP_URL
    process.env.APP_URL = 'https://dms.example.test/app'

    try {
      const response = requireSameOrigin(request('POST', {
        Origin: 'https://dms.example.test',
      }))

      expect(response).toBeNull()
    } finally {
      if (previousAppUrl === undefined) {
        delete process.env.APP_URL
      } else {
        process.env.APP_URL = previousAppUrl
      }
    }
  })

  it('allows forwarded host/proto origin for reverse-proxy-compatible requests', () => {
    const response = requireSameOrigin(request('POST', {
      Origin: 'https://dms.example.test',
      'X-Forwarded-Host': 'dms.example.test',
      'X-Forwarded-Proto': 'https',
    }))

    expect(response).toBeNull()
  })

  it('classifies only unsafe mutation methods as unsafe', () => {
    expect(isUnsafeMethod('post')).toBe(true)
    expect(isUnsafeMethod('PATCH')).toBe(true)
    expect(isUnsafeMethod('DELETE')).toBe(true)
    expect(isUnsafeMethod('GET')).toBe(false)
  })
})

function request(method: string, headers: HeadersInit = {}): Request {
  return new Request('http://localhost/api/example', {
    method,
    headers,
  })
}
