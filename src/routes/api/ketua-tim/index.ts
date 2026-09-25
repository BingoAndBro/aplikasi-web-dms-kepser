import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { desc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { ketuaTimAssignments, masterKegiatan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { assignKetuaTimSchema } from '#/lib/schemas/ketua-tim'

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

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidRegex.test(value)
}

export const Route = createFileRoute('/api/ketua-tim/')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const auth = await requireLocalAdmin(request)
        if ('error' in auth) return auth.error

        try {
          const rows = await db
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
            .orderBy(desc(ketuaTimAssignments.createdAt))

          return Response.json({
            assignments: rows.map((row) => ({
              id: row.id,
              user_id: row.user_id,
              kegiatan_id: row.kegiatan_id,
              created_at: row.created_at,
              created_by: row.created_by,
              kegiatan: row.kegiatan_id_join
                ? { id: row.kegiatan_id_join, nama: row.kegiatan_nama }
                : null,
            })),
          })
        } catch (err) {
          console.error('[API] /api/ketua-tim GET error:', err)
          return Response.json({ error: 'Gagal mengambil data ketua tim' }, { status: 500 })
        }
      },

      POST: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const auth = await requireLocalAdmin(request)
        if ('error' in auth) return auth.error

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = assignKetuaTimSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
        }
        const { user_id, kegiatan_id } = parsed.data

        try {
          const [saved] = await db
            .insert(ketuaTimAssignments)
            .values({
              userId: user_id,
              kegiatanId: kegiatan_id,
              createdBy: auth.session.user.id,
            })
            .onConflictDoUpdate({
              target: ketuaTimAssignments.kegiatanId,
              set: {
                userId: user_id,
                createdBy: auth.session.user.id,
              },
            })
            .returning({ id: ketuaTimAssignments.id })

          const assignment = saved ? await getAssignmentResponse(saved.id) : null
          if (!assignment) {
            return Response.json({ error: 'Gagal menyimpan assignment ketua tim' }, { status: 500 })
          }

          return Response.json({ assignment }, { status: 201 })
        } catch (err) {
          console.error('[API] /api/ketua-tim POST error:', err)
          return Response.json({ error: 'Gagal menyimpan assignment ketua tim' }, { status: 500 })
        }
      },

      DELETE: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const auth = await requireLocalAdmin(request)
        if ('error' in auth) return auth.error

        const id = new URL(request.url).searchParams.get('id')
        if (!isUuid(id)) {
          return Response.json({ error: 'ID assignment tidak valid' }, { status: 400 })
        }

        try {
          const deleted = await db
            .delete(ketuaTimAssignments)
            .where(eq(ketuaTimAssignments.id, id))
            .returning({ id: ketuaTimAssignments.id })

          if (deleted.length === 0) {
            return Response.json({ error: 'Assignment ketua tim tidak ditemukan' }, { status: 404 })
          }

          return Response.json({ success: true })
        } catch (err) {
          console.error('[API] /api/ketua-tim DELETE error:', err)
          return Response.json({ error: 'Gagal menghapus assignment ketua tim' }, { status: 500 })
        }
      },
    },
  },
})
