import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { createAdminClient } from '#/lib/supabase-admin'
import { updateUserWithRoles } from '#/lib/user-helpers'
import { parseUserResponse } from '#/lib/user-response'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { getLocalUserWithRoles } from '#/lib/users/local-user-queries'
import type { RoleName } from '#/lib/types/auth'

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
// GET /api/users/[id] — Get single user
// PATCH /api/users/[id] — Update user metadata & roles
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const Route = createFileRoute('/api/users/$id')({
  server: {
    handlers: {
      GET: async ({ params, request }: { params: Record<string, string>; request: Request }) => {
        const { id } = params

        if (!id || typeof id !== 'string' || !UUID_RE.test(id)) {
          return Response.json({ error: 'User ID tidak valid' }, { status: 400 })
        }

        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!hasLocalRole(session, 'ADMIN')) {
          return Response.json({ error: 'Hanya ADMIN yang bisa mengakses' }, { status: 403 })
        }

        try {
          const user = await getLocalUserWithRoles(id)

          if (!user) {
            return Response.json({ error: 'User tidak ditemukan' }, { status: 404 })
          }

          return Response.json(parseUserResponse({ user }))
        } catch (err: any) {
          console.error('[API] /api/users/[id] GET error:', err)
          return Response.json({ error: 'Gagal mengambil data user' }, { status: 500 })
        }
      },

      PATCH: async ({ params, request }: { params: Record<string, string>; request: Request }) => {
        const { id } = params

        if (!id || typeof id !== 'string') {
          return Response.json({ error: 'User ID tidak valid' }, { status: 400 })
        }

        const supabase = createClient(request)
        const session = await getSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const isAdmin = await hasRole(supabase, session.user.id, 'ADMIN')
        if (!isAdmin) {
          return Response.json({ error: 'Hanya ADMIN yang bisa mengubah user' }, { status: 403 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const { nama_lengkap, nip_nrp, departemen, roles } = body as any

        // Validation
        if (nama_lengkap !== undefined && nama_lengkap.trim().length < 2) {
          return Response.json({ error: 'Nama lengkap minimal 2 karakter' }, { status: 400 })
        }
        if (nip_nrp !== undefined) {
          const nipRegex = /^\d{8,20}$/
          if (!nipRegex.test(nip_nrp.trim())) {
            return Response.json({ error: 'NIP/NRP harus numerik 8-20 karakter' }, { status: 400 })
          }
        }
        if (roles !== undefined) {
          if (!Array.isArray(roles)) {
            return Response.json({ error: 'Roles harus array' }, { status: 400 })
          }
          const validRoles: RoleName[] = ['PEGAWAI', 'PPK', 'BENDAHARA', 'ARSIPARIS', 'ADMIN']
          const invalidRoles = (roles as string[]).filter(r => !validRoles.includes(r as RoleName))
          if (invalidRoles.length > 0) {
            return Response.json({ error: `Role tidak valid: ${invalidRoles.join(', ')}` }, { status: 400 })
          }
        }

        try {
          const admin = createAdminClient()
          const result = await updateUserWithRoles(admin, id, {
            nama_lengkap: nama_lengkap?.trim(),
            nip_nrp: nip_nrp?.trim(),
            departemen: departemen?.trim(),
            roles,
          })

          if (result.error) {
            if (result.error.includes('tidak ditemukan')) {
              return Response.json({ error: result.error }, { status: 404 })
            }
            return Response.json({ error: result.error }, { status: 400 })
          }

          return Response.json(parseUserResponse({ user: result.data }))
        } catch (err: any) {
          console.error('[API] /api/users/[id] PATCH error:', err)
          return Response.json({ error: 'Gagal mengupdate user' }, { status: 500 })
        }
      },
    },
  },
})
