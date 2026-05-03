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
// GET /api/users/me/is-ketua-tim/$kegiatanId — Check if user is chairman for kegiatan
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/me/is-ketua-tim/$kegiatanId')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { kegiatanId: string } }) => {
        const supabase = createClient(request)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { kegiatanId } = params

        if (!kegiatanId) {
          return Response.json({ error: 'kegiatanId wajib diisi' }, { status: 400 })
        }

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (!uuidRegex.test(kegiatanId)) {
          return Response.json({ error: 'Format kegiatanId tidak valid' }, { status: 400 })
        }

        // Use function is_user_chairman(user_id, kegiatan_id)
        const { data, error } = await supabase
          .rpc('is_user_chairman', {
            p_user_id: session.user.id,
            p_kegiatan_id: kegiatanId
          })

        if (error) {
          console.error('[API] /api/users/me/is-ketua-tim/$kegiatanId GET error:', error)
          return Response.json({ error: 'Gagal memeriksa status chairman' }, { status: 500 })
        }

        return Response.json({
          is_ketua_tim: data === true,
        })
      }
    }
  }
})