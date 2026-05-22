import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revokeSessionByTokenHash: vi.fn(),
  getLocalServerSession: vi.fn(),
  changeLocalUserPassword: vi.fn(),
}))

vi.mock('#/lib/auth/session-repository', () => ({
  revokeSessionByTokenHash: mocks.revokeSessionByTokenHash,
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
}))

vi.mock('#/lib/users/local-user-passwords', () => ({
  changeLocalUserPassword: mocks.changeLocalUserPassword,
}))

import { Route as LogoutRoute } from '#/routes/api/auth/logout'
import { Route as ChangePasswordRoute } from '#/routes/api/users/me/change-password'

type SimplePostHandler = (args: { request: Request }) => Promise<Response>

const logoutHandler = (LogoutRoute as unknown as {
  options: { server: { handlers: { POST: SimplePostHandler } } }
}).options.server.handlers.POST

const changePasswordHandler = (ChangePasswordRoute as unknown as {
  options: { server: { handlers: { POST: SimplePostHandler } } }
}).options.server.handlers.POST

describe('same-origin protection on auth/account mutation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getLocalServerSession.mockResolvedValue({
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'user@example.test',
      },
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'user@example.test',
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
      sessionId: 'test-session-id',
    })
    mocks.changeLocalUserPassword.mockResolvedValue({ success: true })
  })

  it('rejects cross-origin logout before session revocation', async () => {
    const response = await logoutHandler({
      request: new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: {
          Origin: 'https://evil.example',
          Cookie: 'dms_session=opaque-token',
        },
      }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Permintaan tidak diizinkan' })
    expect(mocks.revokeSessionByTokenHash).not.toHaveBeenCalled()
  })

  it('allows same-origin logout and preserves success response', async () => {
    const response = await logoutHandler({
      request: new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost',
          Cookie: 'dms_session=opaque-token',
        },
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(mocks.revokeSessionByTokenHash).toHaveBeenCalledTimes(1)
  })

  it('rejects cross-origin password change before auth and mutation', async () => {
    const response = await changePasswordHandler({
      request: changePasswordRequest('https://evil.example'),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Permintaan tidak diizinkan' })
    expect(mocks.getLocalServerSession).not.toHaveBeenCalled()
    expect(mocks.changeLocalUserPassword).not.toHaveBeenCalled()
  })

  it('allows same-origin password change and preserves success response', async () => {
    const response = await changePasswordHandler({
      request: changePasswordRequest('http://localhost'),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      message: 'Password berhasil diubah',
    })
    expect(mocks.changeLocalUserPassword).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'old-password',
      'new-password',
    )
  })
})

function changePasswordRequest(origin: string): Request {
  return new Request('http://localhost/api/users/me/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify({
      currentPassword: 'old-password',
      newPassword: 'new-password',
    }),
  })
}
