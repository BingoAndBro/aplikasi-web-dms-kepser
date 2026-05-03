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

        // Fetch without joins (PostgREST schema cache issue)
        const { data, error } = await supabase
          .from('ketua_tim_assignments')
          .select('id, kegiatan_id, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })

        if (error) {
          console.error('[API] /api/ketua-tim/user/$userId GET error:', error)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }

        if (!data || data.length === 0) {
          return Response.json({ assignments: [] })
        }

        // Fetch kegiatan details separately
        const kegiatanIds = [...new Set(data.map(a => a.kegiatan_id).filter(Boolean))]
        const { data: kegiatansData } = await supabase
          .from('master_kegiatan')
          .select('id, nama')
          .in('id', kegiatanIds)

        const kegiatansMap = new Map((kegiatansData || []).map(k => [k.id, k]))

        const assignments = data.map(a => ({
          id: a.id,
          kegiatan_id: a.kegiatan_id,
          created_at: a.created_at,
          kegiatan: kegiatansMap.get(a.kegiatan_id)
        }))

        return Response.json({ assignments })
      }
    }
  }
})