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
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAdmin = await hasRole(supabase, session.user.id, 'ADMIN')
  if (!isAdmin) {
    return Response.json({ error: 'Hanya ADMIN yang bisa mengakses' }, { status: 403 })
  }

  return null
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const Route = createFileRoute('/api/ketua-tim/user/$userId')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { userId: string } }) => {
        const authError = await requireAdmin(request)
        if (authError) return authError

        const { userId } = params
        if (!uuidRegex.test(userId)) {
          return Response.json({ error: 'User ID tidak valid' }, { status: 400 })
        }

        try {
          const admin = createAdminClient()
          const { data, error } = await admin
            .from(TABLES.KETUA_TIM_ASSIGNMENTS)
            .select(`
              id,
              user_id,
              kegiatan_id,
              created_at,
              kegiatan:master_kegiatan(id, nama)
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

          if (error) {
            console.error('[API] /api/ketua-tim/user/$userId GET error:', error)
            return Response.json({ error: 'Gagal mengambil data ketua tim user' }, { status: 500 })
          }

          return Response.json({ assignments: data ?? [] })
        } catch (err) {
          console.error('[API] /api/ketua-tim/user/$userId GET error:', err)
          return Response.json({ error: 'Gagal mengambil data ketua tim user' }, { status: 500 })
        }
      },
    },
  },
})
