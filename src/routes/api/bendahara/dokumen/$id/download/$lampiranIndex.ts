import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession as getSession } from '#/lib/auth'
import { getDokumenById } from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/bendahara/dokumen/[id]/download/[lampiranIndex]
// Returns a 1-hour signed URL for downloading a lampiran file
// NOTE: Filename is built client-side using buildStorageFilename()
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/bendahara/dokumen/$id/download/$lampiranIndex')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await supabase.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('BENDAHARA')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        // Fetch dokumen via getDokumenById (includes manual joins for leaf node names)
        const dok = await getDokumenById(supabase, params.id)
        if (!dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        // Check if arsip is DIMUSNAHKAN
        const { data: arsipRecord } = await supabase
          .from('arsip')
          .select('status_arsip')
          .eq('dokumen_id', params.id)
          .single()

        if (arsipRecord?.status_arsip === 'DIMUSNAHKAN') {
          return Response.json({ error: 'File asli tidak tersedia — arsip telah dimusnahkan' }, { status: 410 })
        }

        const lampiranUrls = dok.lampiran_urls
        const index = parseInt(params.lampiranIndex, 10)
        if (isNaN(index) || index < 0 || index >= lampiranUrls.length) {
          return Response.json({ error: 'Lampiran tidak ditemukan' }, { status: 404 })
        }

        const lampiran = lampiranUrls[index]
        const supabaseAdmin = createAdminClient()
        const { data, error } = await supabaseAdmin.storage
          .from('dokumen-lampiran').createSignedUrl(lampiran.url, 3600) // 1 hour

        if (error || !data) {
          if (error?.message === 'Object not found') {
            return Response.json({ error: 'File tidak ditemukan' }, { status: 404 })
          }
          return Response.json({ error: 'Gagal membuat link download' }, { status: 500 })
        }

        return Response.json({ signedUrl: data.signedUrl })
      },
    },
  },
})
