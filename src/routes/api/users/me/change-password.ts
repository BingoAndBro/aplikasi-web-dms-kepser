import { createFileRoute } from '@tanstack/react-router'

import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import {
  appendSetCookieHeaders,
  clearActiveRoleCookieHeader,
  clearSessionCookieHeader,
} from '#/lib/auth/session-cookies'
import { changePasswordRequestBoundarySchema } from '#/lib/schemas/user'
import { isValidPassword } from '#/lib/types/user'
import { changeLocalUserPassword } from '#/lib/users/local-user-passwords'

// ---------------------------------------------------------------------------
// POST /api/users/me/change-password - Change password
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/me/change-password')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsedBody = changePasswordRequestBoundarySchema.safeParse(body)
        const currentPassword = parsedBody.success ? parsedBody.data.currentPassword : undefined
        const newPassword = parsedBody.success ? parsedBody.data.newPassword : undefined

        if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
          return Response.json({ error: 'Password lama wajib diisi' }, { status: 400 })
        }
        if (typeof newPassword !== 'string' || newPassword.length === 0) {
          return Response.json({ error: 'Password baru wajib diisi' }, { status: 400 })
        }
        if (!isValidPassword(newPassword)) {
          return Response.json({ error: 'Password baru minimal 8 karakter' }, { status: 400 })
        }

        try {
          const result = await changeLocalUserPassword(session.user.id, currentPassword, newPassword)

          if (!result.success) {
            return Response.json({ error: result.error }, { status: result.status })
          }

          const headers = appendSetCookieHeaders(new Headers(), [
            clearSessionCookieHeader(request),
            clearActiveRoleCookieHeader(),
          ])

          return Response.json({ success: true, message: 'Password berhasil diubah' }, {
            headers,
          })
        } catch {
          return Response.json({ error: 'Gagal mengubah password' }, { status: 500 })
        }
      },
    },
  },
})
