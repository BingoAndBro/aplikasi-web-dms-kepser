import { describe, expect, it, vi } from 'vitest'

import { createClientId } from '#/lib/utils/client-id'

describe('createClientId', () => {
  it('uses crypto.randomUUID when available', () => {
    const id = createClientId('user-custom', {
      randomUUID: () => '11111111-1111-4111-8111-111111111111',
    })

    expect(id).toBe('user-custom-11111111-1111-4111-8111-111111111111')
  })

  it('falls back to getRandomValues when randomUUID is unavailable', () => {
    const id = createClientId('user-custom', {
      getRandomValues: (array) => {
        array.set([
          0x11, 0x11, 0x11, 0x11,
          0x22, 0x22,
          0x33, 0x33,
          0x44, 0x44,
          0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
        ])
        return array
      },
    })

    expect(id).toBe('user-custom-11111111-2222-4333-8444-555555555555')
  })

  it('falls back to timestamp and Math.random only for non-security client identity', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-21T00:00:00.000Z'))
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456789)

    try {
      expect(createClientId('user-custom', {})).toMatch(/^user-custom-tmp-[a-z0-9]+-[a-z0-9]+$/)
    } finally {
      randomSpy.mockRestore()
      vi.useRealTimers()
    }
  })
})
