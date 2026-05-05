import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'
import { getDokumenSelesaiByUser } from '#/lib/dokumen-helpers'

// ---------------------------------------------------------------------------
// Helper: buat Supabase client dengan cookie
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
// GET /api/laporan/saya — Dokumen COMPLETED milik user yang login
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/laporan/saya')({
  ssr: false,
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const list = await getDokumenSelesaiByUser(supabase, session.user.id)
        return Response.json({ dokumen: list })
      },
    },
  },
})
