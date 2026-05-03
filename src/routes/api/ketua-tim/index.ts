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
            created_by
          `)
          .order('created_at', { ascending: false })

        if (error) {
          console.error('[API] /api/ketua-tim GET error:', error)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }

        // Fetch user details and kegiatan details separately
        const userIds = [...new Set(data.map(a => a.user_id).filter(Boolean))]
        const kegiatanIds = [...new Set(data.map(a => a.kegiatan_id).filter(Boolean))]

        const [usersResult, kegiatansResult] = await Promise.all([
          userIds.length > 0
            ? supabase.from('auth.users').select('id, email, raw_user_meta_data').in('id', userIds)
            : { data: [], error: null },
          kegiatanIds.length > 0
            ? supabase.from('master_kegiatan').select('id, nama').in('id', kegiatanIds)
            : { data: [], error: null }
        ])

        const usersMap = new Map((usersResult.data || []).map(u => [u.id, u]))
        const kegiatansMap = new Map((kegiatansResult.data || []).map(k => [k.id, k]))

        const assignments = data.map(a => ({
          ...a,
          user: usersMap.get(a.user_id),
          kegiatan: kegiatansMap.get(a.kegiatan_id)
        }))

        return Response.json({ assignments })
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
        const { data: existingChairData } = await supabase
          .from('ketua_tim_assignments')
          .select('id, user_id')
          .eq('kegiatan_id', kegiatan_id)
          .maybeSingle()

        if (existingChairData) {
          // Fetch user details separately
          const { data: existingUser } = await supabase
            .from('auth.users')
            .select('id, raw_user_meta_data')
            .eq('id', existingChairData.user_id)
            .maybeSingle()

          return Response.json({
            error: 'Kegiatan sudah memiliki chairman',
            existing_chairman: {
              id: existingUser?.id,
              name: existingUser?.raw_user_meta_data?.user_name,
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