import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession } from '#/lib/auth'
import { isValidPassword } from '#/lib/types/user'

// ---------------------------------------------------------------------------
// Helper: create Supabase client with cookie
// ---------------------------------------------------------------------------

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// POST /api/users/me/change-password — Change password
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/me/change-password')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const { currentPassword, newPassword } = body as any

        // Validation
        if (!currentPassword) {
          return Response.json({ error: 'Password lama wajib diisi' }, { status: 400 })
        }
        if (!newPassword) {
          return Response.json({ error: 'Password baru wajib diisi' }, { status: 400 })
        }
        if (!isValidPassword(newPassword)) {
          return Response.json({ error: 'Password baru minimal 8 karakter' }, { status: 400 })
        }
        if (currentPassword === newPassword) {
          return Response.json({ error: 'Password baru harus berbeda dari password lama' }, { status: 400 })
        }

        // Verify old password
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: session.user.email ?? '',
          password: currentPassword,
        })

        if (signInError) {
          return Response.json({ error: 'Password lama salah' }, { status: 400 })
        }

        // Update password
        const { error: updateError } = await supabase.auth.updateUser({
          password: newPassword,
        })

        if (updateError) {
          console.error('[API] /api/users/me/change-password error:', updateError)
          return Response.json({ error: 'Gagal mengubah password' }, { status: 500 })
        }

        return Response.json({ success: true, message: 'Password berhasil diubah' })
      },
    },
  },
})
