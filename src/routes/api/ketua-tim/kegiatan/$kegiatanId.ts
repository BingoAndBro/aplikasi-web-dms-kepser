import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession, hasRole } from '#/lib/auth'
import { TABLES } from '#/lib/constants/tables'

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

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getKegiatanId(request: Request, params: Record<string, string | undefined>) {
  const pathname = new URL(request.url).pathname
  const pathId = pathname.match(/\/api\/ketua-tim\/kegiatan\/([^/?#]+)/)?.[1]
  return params.kegiatanId ?? params.$kegiatanId ?? pathId
}

async function getUserSummary(userId: string) {
  const admin = createAdminClient()
  const { data } = await admin.auth.admin.getUserById(userId)
  const metadata = data.user?.user_metadata

  return {
    user_name: metadata?.nama_lengkap ?? metadata?.user_name ?? null,
    user_email: data.user?.email ?? null,
  }
}

export const Route = createFileRoute('/api/ketua-tim/kegiatan/$kegiatanId')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string | undefined> }) => {
        const auth = await requireAdmin(request)
        if ('error' in auth) return auth.error

        const kegiatanId = getKegiatanId(request, params)
        if (!kegiatanId || !uuidRegex.test(kegiatanId)) {
          return Response.json({ error: 'Kegiatan ID tidak valid' }, { status: 400 })
        }

        try {
          const admin = createAdminClient()
          const { data, error } = await admin
            .from(TABLES.KETUA_TIM_ASSIGNMENTS)
            .select('id, user_id, kegiatan_id, created_at')
            .eq('kegiatan_id', kegiatanId)
            .maybeSingle()

          if (error) {
            console.error('[API] /api/ketua-tim/kegiatan/$kegiatanId GET error:', error)
            return Response.json({ error: 'Gagal mengambil ketua tim kegiatan' }, { status: 500 })
          }

          if (!data) {
            return Response.json({ chairman: null })
          }

          const user = await getUserSummary(data.user_id)
          return Response.json({
            chairman: {
              id: data.id,
              user_id: data.user_id,
              kegiatan_id: data.kegiatan_id,
              created_at: data.created_at,
              ...user,
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
