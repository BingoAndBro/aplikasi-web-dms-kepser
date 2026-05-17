import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { users } from '#/db/schema/auth'
import { ketuaTimAssignments } from '#/db/schema/master'
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

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getKegiatanId(request: Request, params: Record<string, string | undefined>) {
  const pathname = new URL(request.url).pathname
  const pathId = pathname.match(/\/api\/ketua-tim\/kegiatan\/([^/?#]+)/)?.[1]
  return params.kegiatanId ?? params.$kegiatanId ?? pathId
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
              user_email: users.email,
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
              user_email: row.user_email ?? null,
            },
          })
        } catch (err) {
          console.error('[API] /api/ketua-tim/kegiatan/$kegiatanId GET error:', err)
          return Response.json({ error: 'Gagal mengambil ketua tim kegiatan' }, { status: 500 })
        }
      },

      PATCH: async ({ request, params }: { request: Request; params: Record<string, string | undefined> }) => {
        const auth = await requireAdmin(request)
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

        const { user_id } = body as { user_id?: unknown }
        if (typeof user_id !== 'string' || !uuidRegex.test(user_id)) {
          return Response.json({ error: 'user_id wajib UUID valid' }, { status: 400 })
        }

        try {
          const admin = createAdminClient()
          const { data: existing, error: lookupError } = await admin
            .from(TABLES.KETUA_TIM_ASSIGNMENTS)
            .select('id')
            .eq('kegiatan_id', kegiatanId)
            .maybeSingle()

          if (lookupError) {
            console.error('[API] /api/ketua-tim/kegiatan/$kegiatanId PATCH lookup error:', lookupError)
            return Response.json({ error: 'Gagal memeriksa ketua tim kegiatan' }, { status: 500 })
          }

          const query = existing
            ? admin
                .from(TABLES.KETUA_TIM_ASSIGNMENTS)
                .update({
                  user_id,
                  created_by: auth.session.user.id,
                })
                .eq('id', existing.id)
            : admin
                .from(TABLES.KETUA_TIM_ASSIGNMENTS)
                .insert({
                  user_id,
                  kegiatan_id: kegiatanId,
                  created_by: auth.session.user.id,
                })

          const { data, error } = await query
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
            console.error('[API] /api/ketua-tim/kegiatan/$kegiatanId PATCH error:', error)
            return Response.json({ error: 'Gagal mengganti ketua tim kegiatan' }, { status: 500 })
          }

          return Response.json({ assignment: data })
        } catch (err) {
          console.error('[API] /api/ketua-tim/kegiatan/$kegiatanId PATCH error:', err)
          return Response.json({ error: 'Gagal mengganti ketua tim kegiatan' }, { status: 500 })
        }
      },
    },
  },
})
