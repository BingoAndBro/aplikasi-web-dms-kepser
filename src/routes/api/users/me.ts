import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { users } from '#/db/schema/auth'
import {
  createUnauthorizedResponse,
  getLocalServerSession,
} from '#/lib/auth/local-server-auth'
import { parseUserProfileResponse } from '#/lib/user-response'
import { parseUserMetadata } from '#/lib/user-metadata'

// ---------------------------------------------------------------------------
// GET /api/users/me — Get current user profile
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/me')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)

        if (!session) {
          return createUnauthorizedResponse('Unauthorized')
        }

        const [profile] = await db
          .select({
            namaLengkap: users.namaLengkap,
            nipNrp: users.nipNrp,
            departemen: users.departemen,
          })
          .from(users)
          .where(eq(users.id, session.user.id))
          .limit(1)

        if (!profile) {
          return createUnauthorizedResponse('Unauthorized')
        }

        return Response.json(parseUserProfileResponse({
          user: {
            id: session.user.id,
            email: session.user.email,
            metadata: parseUserMetadata({
              nama_lengkap: profile.namaLengkap,
              nip_nrp: profile.nipNrp,
              departemen: profile.departemen,
            }),
            roles: session.roles,
          },
        }))
      },
    },
  },
})
