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

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getAssignmentId(request: Request, params: Record<string, string | undefined>) {
  const pathname = new URL(request.url).pathname
  const pathId = pathname.match(/\/api\/ketua-tim\/([^/?#]+)/)?.[1]
  return params.id ?? params.$id ?? pathId
}

export const Route = createFileRoute('/api/ketua-tim/$id')({
  server: {
    handlers: {
      DELETE: async ({ request, params }: { request: Request; params: Record<string, string | undefined> }) => {
        const authError = await requireAdmin(request)
        if (authError) return authError

        const id = getAssignmentId(request, params)
        if (!id || !uuidRegex.test(id)) {
          console.error('[API] /api/ketua-tim/$id DELETE invalid id:', {
            id,
            params,
            pathname: new URL(request.url).pathname,
          })
          return Response.json({ error: 'ID assignment tidak valid' }, { status: 400 })
        }

        try {
          const admin = createAdminClient()
          const { error, count } = await admin
            .from(TABLES.KETUA_TIM_ASSIGNMENTS)
            .delete({ count: 'exact' })
            .eq('id', id)

          if (error) {
            console.error('[API] /api/ketua-tim/$id DELETE error:', error)
            return Response.json({ error: 'Gagal menghapus assignment ketua tim' }, { status: 500 })
          }

          if (count === 0) {
            return Response.json({ error: 'Assignment ketua tim tidak ditemukan' }, { status: 404 })
          }

          return Response.json({ success: true })
        } catch (err) {
          console.error('[API] /api/ketua-tim/$id DELETE error:', err)
          return Response.json({ error: 'Gagal menghapus assignment ketua tim' }, { status: 500 })
        }
      },
    },
  },
})
