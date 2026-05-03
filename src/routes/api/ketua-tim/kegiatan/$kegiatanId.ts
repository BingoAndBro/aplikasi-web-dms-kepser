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
// GET /api/ketua-tim/kegiatan/$kegiatanId — Get kegiatan's chairman
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ketua-tim/kegiatan/$kegiatanId')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { kegiatanId: string } }) => {
        const supabase = createClient(request)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const isAdmin = await hasRole(supabase, session.user.id, 'ADMIN')
        if (!isAdmin) {
          return Response.json({ error: 'Hanya ADMIN yang bisa mengakses' }, { status: 403 })
        }

        const { kegiatanId } = params
        if (!kegiatanId) {
          return Response.json({ error: 'kegiatanId wajib diisi' }, { status: 400 })
        }

        // Fetch without joins (PostgREST schema cache issue)
        const { data, error } = await supabase
          .from('ketua_tim_assignments')
          .select('id, user_id, created_at')
          .eq('kegiatan_id', kegiatanId)
          .maybeSingle()

        if (error && error.code !== 'PGRST116') {
          console.error('[API] /api/ketua-tim/kegiatan/$kegiatanId GET error:', error)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }

        if (!data) {
          return Response.json({ chairman: null })
        }

        // Fetch user details separately
        const { data: userData } = await supabase
          .from('auth.users')
          .select('id, email, raw_user_meta_data')
          .eq('id', data.user_id)
          .maybeSingle()

        return Response.json({
          chairman: {
            id: data.id,
            user_id: data.user_id,
            user_name: userData?.raw_user_meta_data?.user_name,
            user_email: userData?.email,
          }
        })
      }
    }
  }
})