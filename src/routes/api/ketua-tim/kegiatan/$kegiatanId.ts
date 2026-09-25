import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { users } from '#/db/schema/auth'
import { ketuaTimAssignments, masterKegiatan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { updateKetuaTimSchema } from '#/lib/schemas/ketua-tim'

async function requireLocalAdmin(request: Request) {
  const session = await getLocalServerSession(request)

  if (!session) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  if (!hasLocalRole(session, 'ADMIN')) {
    return { error: Response.json({ error: 'Hanya ADMIN yang bisa mengakses' }, { status: 403 }) }
  }

  return { session }
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getKegiatanId(request: Request, params: Record<string, string | undefined>) {
  const pathname = new URL(request.url).pathname
  const pathId = pathname.match(/\/api\/ketua-tim\/kegiatan\/([^/?#]+)/)?.[1]
  return params.kegiatanId ?? params.$kegiatanId ?? pathId
}

async function getAssignmentResponse(id: string) {
  const [row] = await db
    .select({
      id: ketuaTimAssignments.id,
      user_id: ketuaTimAssignments.userId,
      kegiatan_id: ketuaTimAssignments.kegiatanId,
      created_at: ketuaTimAssignments.createdAt,
      created_by: ketuaTimAssignments.createdBy,
      kegiatan_id_join: masterKegiatan.id,
      kegiatan_nama: masterKegiatan.nama,
    })
    .from(ketuaTimAssignments)
    .leftJoin(masterKegiatan, eq(ketuaTimAssignments.kegiatanId, masterKegiatan.id))
    .where(eq(ketuaTimAssignments.id, id))
    .limit(1)

  if (!row) return null

  return {
    id: row.id,
    user_id: row.user_id,
    kegiatan_id: row.kegiatan_id,
    created_at: row.created_at,
    created_by: row.created_by,
    kegiatan: row.kegiatan_id_join
      ? { id: row.kegiatan_id_join, nama: row.kegiatan_nama }
      : null,
  }
}

export const Route = createFileRoute('/api/ketua-tim/kegiatan/$kegiatanId')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string | undefined> }) => {
        const auth = await requireLocalAdmin(request)
        if ('error' in auth) return auth.error

        const kegiatanId = getKegiatanId(request, params)
        if (!kegiatanId || !uuidRegex.test(kegiatanId)) {
          return Response.json({ error: 'Kegiatan ID tidak valid' }, { status: 400 })
        }

        try {
          const [row] = await db
            .select({
              id: ketuaTimAssignments.id,
              user_id: ketuaTimAssignments.userId,
              kegiatan_id: ketuaTimAssignments.kegiatanId,
              created_at: ketuaTimAssignments.createdAt,
              user_name: users.namaLengkap,
              user_display_name: users.displayName,
              user_username: users.username,
            })
            .from(ketuaTimAssignments)
            .leftJoin(users, eq(ketuaTimAssignments.userId, users.id))
            .where(eq(ketuaTimAssignments.kegiatanId, kegiatanId))
            .limit(1)

          if (!row) {
            return Response.json({ chairman: null })
          }

          return Response.json({
            chairman: {
              id: row.id,
              user_id: row.user_id,
              kegiatan_id: row.kegiatan_id,
              created_at: row.created_at,
              user_name: row.user_name ?? row.user_display_name ?? null,
              user_username: row.user_username ?? null,
            },
          })
        } catch (err) {
          console.error('[API] /api/ketua-tim/kegiatan/$kegiatanId GET error:', err)
          return Response.json({ error: 'Gagal mengambil ketua tim kegiatan' }, { status: 500 })
        }
      },

      PATCH: async ({ request, params }: { request: Request; params: Record<string, string | undefined> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const auth = await requireLocalAdmin(request)
        if ('error' in auth) return auth.error

        const kegiatanId = getKegiatanId(request, params)
        if (!kegiatanId || !uuidRegex.test(kegiatanId)) {
          return Response.json({ error: 'Kegiatan ID tidak valid' }, { status: 400 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = updateKetuaTimSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
        }
        const { user_id } = parsed.data

        try {
          const [saved] = await db.transaction(async (tx) => {
            const [existing] = await tx
              .select({ id: ketuaTimAssignments.id })
              .from(ketuaTimAssignments)
              .where(eq(ketuaTimAssignments.kegiatanId, kegiatanId))
              .limit(1)

            if (existing) {
              return tx
                .update(ketuaTimAssignments)
                .set({
                  userId: user_id,
                  createdBy: auth.session.user.id,
                })
                .where(eq(ketuaTimAssignments.id, existing.id))
                .returning({ id: ketuaTimAssignments.id })
            }

            return tx
              .insert(ketuaTimAssignments)
              .values({
                userId: user_id,
                kegiatanId,
                createdBy: auth.session.user.id,
              })
              .returning({ id: ketuaTimAssignments.id })
          })

          const assignment = saved ? await getAssignmentResponse(saved.id) : null
          if (!assignment) {
            return Response.json({ error: 'Gagal mengganti ketua tim kegiatan' }, { status: 500 })
          }

          return Response.json({ assignment })
        } catch (err) {
          console.error('[API] /api/ketua-tim/kegiatan/$kegiatanId PATCH error:', err)
          return Response.json({ error: 'Gagal mengganti ketua tim kegiatan' }, { status: 500 })
        }
      },
    },
  },
})
