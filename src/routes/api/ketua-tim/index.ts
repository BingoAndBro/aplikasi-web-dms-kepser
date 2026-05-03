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
// GET /api/ketua-tim — List all assignments
// POST /api/ketua-tim — Create new assignment
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ketua-tim/')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const isAdmin = await hasRole(supabase, session.user.id, 'ADMIN')
        if (!isAdmin) {
          return Response.json({ error: 'Hanya ADMIN yang bisa mengakses' }, { status: 403 })
        }

        const { data, error } = await supabase
          .from('ketua_tim_assignments')
          .select(`
            id,
            user_id,
            kegiatan_id,
            created_at,
            created_by,
            user:auth_users!user_id(id, email, raw_user_meta_data),
            kegiatan:master_kegiatan(id, nama)
          `)
          .order('created_at', { ascending: false })

        if (error) {
          console.error('[API] /api/ketua-tim GET error:', error)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }

        return Response.json({ assignments: data })
      },

      POST: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const isAdmin = await hasRole(supabase, session.user.id, 'ADMIN')
        if (!isAdmin) {
          return Response.json({ error: 'Hanya ADMIN yang bisa mengakses' }, { status: 403 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const { user_id, kegiatan_id } = body as { user_id?: string; kegiatan_id?: string }

        if (!user_id) {
          return Response.json({ error: 'user_id wajib diisi' }, { status: 400 })
        }
        if (!kegiatan_id) {
          return Response.json({ error: 'kegiatan_id wajib diisi' }, { status: 400 })
        }

        // Check if kegiatan already has a chairman
        const { data: existingChair } = await supabase
          .from('ketua_tim_assignments')
          .select('id, user:auth_users!user_id(id, raw_user_meta_data)')
          .eq('kegiatan_id', kegiatan_id)
          .maybeSingle()

        if (existingChair) {
          return Response.json({
            error: 'Kegiatan sudah memiliki chairman',
            existing_chairman: {
              id: existingChair.user?.id,
              name: existingChair.user?.raw_user_meta_data?.user_name,
            }
          }, { status: 409 })
        }

        // Insert new assignment
        const { data, error } = await supabase
          .from('ketua_tim_assignments')
          .insert({
            user_id,
            kegiatan_id,
            created_by: session.user.id,
          })
          .select()
          .single()

        if (error) {
          console.error('[API] /api/ketua-tim POST error:', error)
          return Response.json({ error: 'Gagal membuat assignment' }, { status: 500 })
        }

        return Response.json({ assignment: data }, { status: 201 })
      }
    }
  }
})