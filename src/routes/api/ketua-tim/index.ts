import { createFileRoute } from '@tanstack/react-router'
import { desc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { ketuaTimAssignments, masterKegiatan } from '#/db/schema/master'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession, hasRole } from '#/lib/auth'
import { TABLES } from '#/lib/constants/tables'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

async function requireAdmin(request: Request) {
  const supabase = createClient(request)
  const session = await getServerSession(supabase)

  if (!session) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const isAdmin = await hasRole(supabase, session.user.id, 'ADMIN')
  if (!isAdmin) {
    return { error: Response.json({ error: 'Hanya ADMIN yang bisa mengakses' }, { status: 403 }) }
  }

  return { session }
}

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
        const auth = await requireAdmin(request)
        if ('error' in auth) return auth.error

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const { user_id, kegiatan_id } = body as { user_id?: unknown; kegiatan_id?: unknown }
        if (!isUuid(user_id) || !isUuid(kegiatan_id)) {
          return Response.json({ error: 'user_id dan kegiatan_id wajib UUID valid' }, { status: 400 })
        }

        try {
          const admin = createAdminClient()
          const { data, error } = await admin
            .from(TABLES.KETUA_TIM_ASSIGNMENTS)
            .upsert({
              user_id,
              kegiatan_id,
              created_by: auth.session.user.id,
            }, {
              onConflict: 'kegiatan_id',
            })
            .select(`
              id,
              user_id,
              kegiatan_id,
              created_at,
              created_by,
              kegiatan:master_kegiatan(id, nama)
            `)
            .single()

          if (error) {
            console.error('[API] /api/ketua-tim POST error:', error)
            return Response.json({ error: 'Gagal menyimpan assignment ketua tim' }, { status: 500 })
          }

          return Response.json({ assignment: data }, { status: 201 })
        } catch (err) {
          console.error('[API] /api/ketua-tim POST error:', err)
          return Response.json({ error: 'Gagal menyimpan assignment ketua tim' }, { status: 500 })
        }
      },

      DELETE: async ({ request }: { request: Request }) => {
        const auth = await requireAdmin(request)
        if ('error' in auth) return auth.error

        const id = new URL(request.url).searchParams.get('id')
        if (!isUuid(id)) {
          return Response.json({ error: 'ID assignment tidak valid' }, { status: 400 })
        }

        try {
          const admin = createAdminClient()
          const { error, count } = await admin
            .from(TABLES.KETUA_TIM_ASSIGNMENTS)
            .delete({ count: 'exact' })
            .eq('id', id)

          if (error) {
            console.error('[API] /api/ketua-tim DELETE error:', error)
            return Response.json({ error: 'Gagal menghapus assignment ketua tim' }, { status: 500 })
          }

          if (count === 0) {
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
