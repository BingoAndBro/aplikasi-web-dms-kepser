import { createFileRoute } from '@tanstack/react-router'
import { parseUserListResponse, parseUserResponse } from '#/lib/user-response'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { getLocalUsersWithRoles } from '#/lib/users/local-user-queries'
import {
  createLocalUserWithRoles,
  findInvalidCanonicalRoles,
  hasAdminMixedWithNonAdmin,
  normalizeAdminRolePayload,
} from '#/lib/users/local-user-mutations'
import { createUserRequestBoundarySchema } from '#/lib/schemas/user'
import { isValidEmail, isValidPassword, isValidNip } from '#/lib/types/user'
import type { RoleName } from '#/lib/types/auth'

// ---------------------------------------------------------------------------
// GET /api/users — List all users with roles
// POST /api/users — Create new user
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!hasLocalRole(session, 'ADMIN')) {
          return Response.json({ error: 'Hanya ADMIN yang bisa mengakses' }, { status: 403 })
        }

        try {
          const users = await getLocalUsersWithRoles()

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
        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!hasLocalRole(session, 'ADMIN')) {
          return Response.json({ error: 'Hanya ADMIN yang bisa membuat user' }, { status: 403 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsedBody = createUserRequestBoundarySchema.safeParse(body)
        if (!parsedBody.success) {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const { email, password, nama_lengkap, nip_nrp, departemen, roles } = parsedBody.data as any

        // Validation
        if (typeof email !== 'string' || !email || !isValidEmail(email)) {
          return Response.json({ error: 'Email tidak valid' }, { status: 400 })
        }
        if (typeof password !== 'string' || !password || !isValidPassword(password)) {
          return Response.json({ error: 'Password minimal 8 karakter' }, { status: 400 })
        }
        if (typeof nama_lengkap !== 'string' || !nama_lengkap || nama_lengkap.trim().length < 2) {
          return Response.json({ error: 'Nama lengkap minimal 2 karakter' }, { status: 400 })
        }
        if (typeof nip_nrp !== 'string' || !nip_nrp || !isValidNip(nip_nrp)) {
          return Response.json({ error: 'NIP/NRP harus numerik 8-20 karakter' }, { status: 400 })
        }
        if (departemen !== undefined && typeof departemen !== 'string') {
          return Response.json({ error: 'Departemen tidak valid' }, { status: 400 })
        }
        if (roles !== undefined && !Array.isArray(roles)) {
          return Response.json({ error: 'Roles harus array' }, { status: 400 })
        }

        const requestedRolesInput = (roles ?? ['PEGAWAI']) as unknown[]
        const invalidRoles = findInvalidCanonicalRoles(requestedRolesInput)
        if (invalidRoles.length > 0) {
          return Response.json({ error: `Role tidak valid: ${invalidRoles.join(', ')}` }, { status: 400 })
        }

        const requestedRoles = requestedRolesInput as RoleName[]
        const normalizedRoles = normalizeAdminRolePayload(requestedRoles)
        if (hasAdminMixedWithNonAdmin(normalizedRoles)) {
          return Response.json({ error: 'ADMIN tidak boleh digabung dengan role lain' }, { status: 400 })
        }

        try {
          const result = await createLocalUserWithRoles({
            email,
            password,
            nama_lengkap: nama_lengkap.trim(),
            nip_nrp: nip_nrp.trim(),
            departemen: departemen?.trim(),
            roles: normalizedRoles,
          })

          if (result.error) {
            return Response.json({ error: result.error }, { status: result.status })
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
