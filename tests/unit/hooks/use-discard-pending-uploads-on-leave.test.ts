// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// React 19 act() needs this flag outside a test-library harness.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  requestPendingUploadCleanup: vi.fn(async () => true),
}))

vi.mock('#/lib/storage/pending-upload-cleanup-client', () => ({
  requestPendingUploadCleanup: mocks.requestPendingUploadCleanup,
}))

import { useDiscardPendingUploadsOnLeave } from '#/hooks/useDiscardPendingUploadsOnLeave'

function renderWithUrls(urls: string[]) {
  const ref = { current: new Set(urls) }
  function Harness() {
    useDiscardPendingUploadsOnLeave(ref, 'test-form')
    return null
  }

  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => root.render(createElement(Harness)))

  return {
    ref,
    unmount: () => act(() => root.unmount()),
  }
}

beforeEach(() => {
  mocks.requestPendingUploadCleanup.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useDiscardPendingUploadsOnLeave', () => {
  it('deletes the tracked pending uploads with keepalive when the form unmounts (in-app navigation)', () => {
    const { ref, unmount } = renderWithUrls(['u/a.pdf', 'u/b.pdf'])

    unmount()

    expect(mocks.requestPendingUploadCleanup).toHaveBeenCalledTimes(1)
    expect(mocks.requestPendingUploadCleanup).toHaveBeenCalledWith(['u/a.pdf', 'u/b.pdf'], {
      context: 'test-form:unmount',
      keepalive: true,
    })
    expect(ref.current.size).toBe(0)
  })

  it('deletes them on pagehide (tab closed or reloaded) and not again on unmount', () => {
    const { unmount } = renderWithUrls(['u/a.pdf'])

    window.dispatchEvent(new Event('pagehide'))
    unmount()

    expect(mocks.requestPendingUploadCleanup).toHaveBeenCalledTimes(1)
    expect(mocks.requestPendingUploadCleanup).toHaveBeenCalledWith(['u/a.pdf'], {
      context: 'test-form:pagehide',
      keepalive: true,
    })
  })

  it('sends nothing when every upload was already saved or cancelled (tracking cleared)', () => {
    const { ref, unmount } = renderWithUrls(['u/a.pdf'])

    ref.current = new Set()
    window.dispatchEvent(new Event('pagehide'))
    unmount()

    expect(mocks.requestPendingUploadCleanup).not.toHaveBeenCalled()
  })

  it('reads the latest tracked uploads at leave time, not the ones present at mount', () => {
    const { ref, unmount } = renderWithUrls([])

    ref.current = new Set(['u/late.pdf'])
    unmount()

    expect(mocks.requestPendingUploadCleanup).toHaveBeenCalledWith(['u/late.pdf'], expect.anything())
  })
})
