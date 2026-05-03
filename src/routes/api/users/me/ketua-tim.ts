import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession } from '#/lib/auth'

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
// GET /api/users/me/ketua-tim — Get current user's chairman kegiatan
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/me/ketua-tim')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Use function get_user_chairman_kegiatan(user_id)
        const { data, error } = await supabase
          .rpc('get_user_chairman_kegiatan', { p_user_id: session.user.id })

        if (error) {
          console.error('[API] /api/users/me/ketua-tim GET error:', error)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }

        const kegiatan = (data ?? []).map((row: { kegiatan_id: string; kegiatan_nama: string }) => ({
          id: row.kegiatan_id,
          nama: row.kegiatan_nama,
        }))

        return Response.json({
          is_ketua_tim: kegiatan.length > 0,
          kegiatan,
        })
      }
    }
  }
})