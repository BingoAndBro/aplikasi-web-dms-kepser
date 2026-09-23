import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { users } from '#/db/schema/auth'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { isAllowedProfileAvatarResponseMimeType, readProfileAvatarContent } from '#/lib/storage/profile-avatar'
import { isValidUserId } from '#/lib/users/local-user-mutations'

// ---------------------------------------------------------------------------
// GET /api/users/[id]/avatar — Serve a user's profile avatar (ADMIN only)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/$id/avatar')({
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

        const [profile] = await db
          .select({
            avatarStorageKey: users.avatarStorageKey,
            avatarMimeType: users.avatarMimeType,
          })
          .from(users)
          .where(eq(users.id, id))
          .limit(1)

        if (!profile?.avatarStorageKey || !isAllowedProfileAvatarResponseMimeType(profile.avatarMimeType)) {
          return Response.json({ error: 'Foto profil belum tersedia' }, { status: 404 })
        }

        let content: Buffer | null
        try {
          content = await readProfileAvatarContent(profile.avatarStorageKey)
        } catch {
          return Response.json({ error: 'Foto profil belum tersedia' }, { status: 404 })
        }
        if (!content) {
          return Response.json({ error: 'Foto profil belum tersedia' }, { status: 404 })
        }

        return new Response(new Uint8Array(content), {
          headers: {
            'Content-Type': profile.avatarMimeType,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      },
    },
  },
})
