import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyTextToClipboard } from '#/lib/clipboard'

// Lingkungan tes 'node': objek browser yang dipakai copyTextToClipboard di-stub
// seperlunya. Kasus penting: http://<IP-LAN>:3000 bukan secure context, jadi
// navigator.clipboard tidak ada dan penyalinan harus lewat execCommand.

function fakeElement() {
  return {
    value: '',
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    focus: vi.fn(),
    select: vi.fn(),
    setSelectionRange: vi.fn(),
  }
}

function stubBrowser({
  isSecureContext,
  writeText,
  execCommandResult = true,
}: {
  isSecureContext: boolean
  writeText?: (text: string) => Promise<void>
  execCommandResult?: boolean | 'throw'
}) {
  const textarea = fakeElement()
  const body = { appendChild: vi.fn(), removeChild: vi.fn() }
  const execCommand = vi.fn(() => {
    if (execCommandResult === 'throw') throw new Error('not allowed')
    return execCommandResult
  })

  vi.stubGlobal('window', { isSecureContext })
  vi.stubGlobal('navigator', writeText ? { clipboard: { writeText: vi.fn(writeText) } } : {})
  vi.stubGlobal('HTMLElement', class {})
  vi.stubGlobal('document', {
    body,
    activeElement: null,
    createElement: vi.fn(() => textarea),
    execCommand,
  })

  return { textarea, body, execCommand }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('copyTextToClipboard', () => {
  it('uses the async Clipboard API in a secure context', async () => {
    const writeText = vi.fn(async () => undefined)
    const { execCommand } = stubBrowser({ isSecureContext: true, writeText })

    await expect(copyTextToClipboard('https://x/tautan/abc')).resolves.toBe(true)

    expect(execCommand).not.toHaveBeenCalled()
  })

  it('falls back to execCommand over plain HTTP on the LAN (no secure context)', async () => {
    const { textarea, body, execCommand } = stubBrowser({ isSecureContext: false })

    await expect(copyTextToClipboard('http://10.72.214.55:3000/tautan/abc')).resolves.toBe(true)

    expect(textarea.value).toBe('http://10.72.214.55:3000/tautan/abc')
    expect(textarea.select).toHaveBeenCalled()
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(body.appendChild).toHaveBeenCalledWith(textarea)
    expect(body.removeChild).toHaveBeenCalledWith(textarea)
  })

  it('falls back when the Clipboard API rejects (e.g. permission denied)', async () => {
    const { execCommand } = stubBrowser({
      isSecureContext: true,
      writeText: async () => { throw new Error('denied') },
    })

    await expect(copyTextToClipboard('x')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('mounts the fallback textarea inside the given container (dialog focus trap)', async () => {
    const { textarea, body } = stubBrowser({ isSecureContext: false })
    const container = { appendChild: vi.fn(), removeChild: vi.fn() }

    await copyTextToClipboard('x', { container: container as unknown as HTMLElement })

    expect(container.appendChild).toHaveBeenCalledWith(textarea)
    expect(container.removeChild).toHaveBeenCalledWith(textarea)
    expect(body.appendChild).not.toHaveBeenCalled()
  })

  it('reports failure so the caller can ask for a manual Ctrl+C', async () => {
    stubBrowser({ isSecureContext: false, execCommandResult: false })
    await expect(copyTextToClipboard('x')).resolves.toBe(false)

    vi.unstubAllGlobals()
    const { body } = stubBrowser({ isSecureContext: false, execCommandResult: 'throw' })
    await expect(copyTextToClipboard('x')).resolves.toBe(false)
    expect(body.removeChild).toHaveBeenCalled()
  })
})
