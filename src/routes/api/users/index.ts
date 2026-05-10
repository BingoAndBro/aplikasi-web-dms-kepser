import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { createAdminClient } from '#/lib/supabase-admin'
import { parseUserListResponse, parseUserResponse } from '#/lib/user-response'
import { getUsersWithRoles, createUserWithRoles } from '#/lib/user-helpers'
import { isValidEmail, isValidPassword, isValidNip } from '#/lib/types/user'
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
// GET /api/users — List all users with roles
// POST /api/users — Create new user
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const isAdmin = await hasRole(supabase, session.user.id, 'ADMIN')
        if (!isAdmin) {
          return Response.json({ error: 'Hanya ADMIN yang bisa mengakses' }, { status: 403 })
        }

        try {
          const admin = createAdminClient()
          const users = await getUsersWithRoles(admin)

          return Response.json(parseUserListResponse({
            users,
            total: users.length,
          }))
        } catch (err: any) {
          console.error('[API] /api/users GET error:', err)
          return Response.json({ error: 'Gagal mengambil data user' }, { status: 500 })
        }
      },

      POST: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const isAdmin = await hasRole(supabase, session.user.id, 'ADMIN')
        if (!isAdmin) {
          return Response.json({ error: 'Hanya ADMIN yang bisa membuat user' }, { status: 403 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const { email, password, nama_lengkap, nip_nrp, departemen, roles } = body as any

        // Validation
        if (!email || !isValidEmail(email)) {
          return Response.json({ error: 'Email tidak valid' }, { status: 400 })
        }
        if (!password || !isValidPassword(password)) {
          return Response.json({ error: 'Password minimal 8 karakter' }, { status: 400 })
        }
        if (!nama_lengkap || nama_lengkap.trim().length < 2) {
          return Response.json({ error: 'Nama lengkap minimal 2 karakter' }, { status: 400 })
        }
        if (!nip_nrp || !isValidNip(nip_nrp)) {
          return Response.json({ error: 'NIP/NRP harus numerik 8-20 karakter' }, { status: 400 })
        }
        if (roles && !Array.isArray(roles)) {
          return Response.json({ error: 'Roles harus array' }, { status: 400 })
        }

        // Valid roles check
        const validRoles: RoleName[] = ['PEGAWAI', 'PPK', 'BENDAHARA', 'ARSIPARIS', 'ADMIN']
        const requestedRoles = (roles ?? ['PEGAWAI']) as RoleName[]
        const invalidRoles = requestedRoles.filter(r => !validRoles.includes(r))
        if (invalidRoles.length > 0) {
          return Response.json({ error: `Role tidak valid: ${invalidRoles.join(', ')}` }, { status: 400 })
        }

        try {
          const admin = createAdminClient()
          const result = await createUserWithRoles(admin, {
            email,
            password,
            nama_lengkap: nama_lengkap.trim(),
            nip_nrp: nip_nrp.trim(),
            departemen: departemen?.trim(),
            roles: requestedRoles,
          })

          if (result.error) {
            if (result.error.includes('sudah terdaftar')) {
              return Response.json({ error: result.error }, { status: 409 })
            }
            return Response.json({ error: result.error }, { status: 400 })
          }

          return Response.json(parseUserResponse({ user: result.data }), { status: 201 })
        } catch (err: any) {
          console.error('[API] /api/users POST error:', err)
          return Response.json({ error: 'Gagal membuat user' }, { status: 500 })
        }
      },
    },
  },
})
