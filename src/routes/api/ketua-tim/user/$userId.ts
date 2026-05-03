import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession, hasRole } from '#/lib/auth'

// ---------------------------------------------------------------------------
// Helper: create Supabase client with cookie
// ---------------------------------------------------------------------------

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/ketua-tim/user/$userId — Get user's chairman assignments
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ketua-tim/user/$userId')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { userId: string } }) => {
        const supabase = createClient(request)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const isAdmin = await hasRole(supabase, session.user.id, 'ADMIN')
        if (!isAdmin) {
          return Response.json({ error: 'Hanya ADMIN yang bisa mengakses' }, { status: 403 })
        }

        const { userId } = params
        if (!userId) {
          return Response.json({ error: 'userId wajib diisi' }, { status: 400 })
        }

        const { data, error } = await supabase
          .from('ketua_tim_assignments')
          .select(`
            id,
            kegiatan_id,
            created_at,
            kegiatan:master_kegiatan(id, nama)
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })

        if (error) {
          console.error('[API] /api/ketua-tim/user/$userId GET error:', error)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }

        return Response.json({ assignments: data })
      }
    }
  }
})