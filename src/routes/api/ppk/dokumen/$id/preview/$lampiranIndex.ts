import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

function createAdminClient() {
  const { createClient } = require('#/lib/supabase-admin')
  return createClient()
}

// ---------------------------------------------------------------------------
// GET /api/ppk/dokumen/[id]/preview/[lampiranIndex]
// Returns a 15-minute signed URL for in-browser preview
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ppk/dokumen/$id/preview/$lampiranIndex')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Role check
        const { data: rolesData } = await supabase
          .from('user_roles')
          .select('role:roles(nama)')
          .eq('user_id', session.user.id)

        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('PPK')) {
          return Response.json({ error: 'Akses ditolak' }, { status: 403 })
        }

        // Fetch dokumen
        const { data: dok, error: dokError } = await supabase
          .from('dokumen_transaksi')
          .select('lampiran_urls, created_by')
          .eq('id', params.id)
          .single()

        if (dokError || !dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        // Parse lampiran_urls
        let lampiranUrls: any[] = []
        if (dok.lampiran_urls) {
          lampiranUrls = typeof dok.lampiran_urls === 'string'
            ? JSON.parse(dok.lampiran_urls)
            : dok.lampiran_urls
        }

        const index = parseInt(params.lampiranIndex, 10)
        if (isNaN(index) || index < 0 || index >= lampiranUrls.length) {
          return Response.json({ error: 'Lampiran tidak ditemukan' }, { status: 404 })
        }

        const lampiran = lampiranUrls[index]

        // 15-minute signed URL for preview
        const supabaseAdmin = createAdminClient()
        const { data, error } = await supabaseAdmin.storage
          .from('dokumen-lampiran')
          .createSignedUrl(lampiran.url, 900) // 15 minutes = 900 seconds

        if (error || !data) {
          console.error('[ppk/preview] Signed URL error:', error)
          return Response.json({ error: 'Gagal membuat link pratinjau' }, { status: 500 })
        }

        return Response.json({ signedUrl: data.signedUrl, filename: lampiran.nama })
      },
    },
  },
})