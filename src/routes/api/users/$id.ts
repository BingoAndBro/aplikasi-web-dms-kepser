import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { parseUserResponse } from '#/lib/user-response'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { getLocalUserWithRoles } from '#/lib/users/local-user-queries'
import {
  findInvalidCanonicalRoles,
  hasAdminMixedWithNonAdmin,
  isValidUserId,
  normalizeAdminRolePayload,
  updateLocalUserWithRoles,
} from '#/lib/users/local-user-mutations'
import { updateUserRequestBoundarySchema } from '#/lib/schemas/user'
import type { RoleName } from '#/lib/types/auth'

// ---------------------------------------------------------------------------
// GET /api/users/[id] — Get single user
// PATCH /api/users/[id] — Update user metadata & roles
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/$id')({
  server: {
    handlers: {
      GET: async ({ params, request }: { params: Record<string, string>; request: Request }) => {
        const { id } = params

        if (!isValidUserId(id)) {
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
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const { id } = params

        if (!isValidUserId(id)) {
          return Response.json({ error: 'User ID tidak valid' }, { status: 400 })
        }

        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!hasLocalRole(session, 'ADMIN')) {
          return Response.json({ error: 'Hanya ADMIN yang bisa mengubah user' }, { status: 403 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsedBody = updateUserRequestBoundarySchema.safeParse(body)
        if (!parsedBody.success) {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const { nama_lengkap, nip_nrp, departemen, roles } = parsedBody.data as any

        // Validation
        if (nama_lengkap !== undefined && (
          typeof nama_lengkap !== 'string' || nama_lengkap.trim().length < 2
        )) {
          return Response.json({ error: 'Nama lengkap minimal 2 karakter' }, { status: 400 })
        }
        if (nip_nrp !== undefined) {
          const nipRegex = /^\d{8,20}$/
          if (typeof nip_nrp !== 'string' || !nipRegex.test(nip_nrp.trim())) {
            return Response.json({ error: 'NIP/NRP harus numerik 8-20 karakter' }, { status: 400 })
          }
        }
        if (departemen !== undefined && typeof departemen !== 'string') {
          return Response.json({ error: 'Departemen tidak valid' }, { status: 400 })
        }
        if (roles !== undefined) {
          if (!Array.isArray(roles)) {
            return Response.json({ error: 'Roles harus array' }, { status: 400 })
          }
          const invalidRoles = findInvalidCanonicalRoles(roles)
          if (invalidRoles.length > 0) {
            return Response.json({ error: `Role tidak valid: ${invalidRoles.join(', ')}` }, { status: 400 })
          }
          const normalizedRoles = normalizeAdminRolePayload(roles as RoleName[])
          if (hasAdminMixedWithNonAdmin(normalizedRoles)) {
            return Response.json({ error: 'ADMIN tidak boleh digabung dengan role lain' }, { status: 400 })
          }
        }

        try {
          const normalizedRoles = roles === undefined
            ? undefined
            : normalizeAdminRolePayload(roles as RoleName[])
          const result = await updateLocalUserWithRoles(id, {
            nama_lengkap: nama_lengkap?.trim(),
            nip_nrp: nip_nrp?.trim(),
            departemen: departemen?.trim(),
            roles: normalizedRoles,
          })

          if (result.error) {
            return Response.json({ error: result.error }, { status: result.status })
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
