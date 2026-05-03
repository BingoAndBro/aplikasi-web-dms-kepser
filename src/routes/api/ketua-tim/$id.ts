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
// DELETE /api/ketua-tim/$id — Remove assignment
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ketua-tim/$id')({
  server: {
    handlers: {
      DELETE: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const supabase = createClient(request)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const isAdmin = await hasRole(supabase, session.user.id, 'ADMIN')
        if (!isAdmin) {
          return Response.json({ error: 'Hanya ADMIN yang bisa mengakses' }, { status: 403 })
        }

        const { id } = params
        if (!id) {
          return Response.json({ error: 'ID wajib diisi' }, { status: 400 })
        }

        // Check if assignment exists
        const { data: existing } = await supabase
          .from('ketua_tim_assignments')
          .select('id')
          .eq('id', id)
          .maybeSingle()

        if (!existing) {
          return Response.json({ error: 'Assignment tidak ditemukan' }, { status: 404 })
        }

        const { error } = await supabase
          .from('ketua_tim_assignments')
          .delete()
          .eq('id', id)

        if (error) {
          console.error('[API] /api/ketua-tim/$id DELETE error:', error)
          return Response.json({ error: 'Gagal menghapus assignment' }, { status: 500 })
        }

        return Response.json({ success: true })
      }
    }
  }
})