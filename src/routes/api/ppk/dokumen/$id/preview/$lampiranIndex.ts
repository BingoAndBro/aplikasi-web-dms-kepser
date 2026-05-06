import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'
import { getDokumenById } from '#/lib/dokumen-helpers'

function createAuthClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/ppk/dokumen/[id]/preview/[lampiranIndex]
// Returns a 15-minute signed URL for in-browser preview
// NOTE: Filename is built client-side using buildStorageFilename()
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ppk/dokumen/$id/preview/$lampiranIndex')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const authClient = createAuthClient(request)
        const session = await getServerSession(authClient)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Role check
        const { data: rolesData } = await authClient
          .from('user_roles')
          .select('role:roles(nama)')
          .eq('user_id', session.user.id)

        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('PPK')) {
          return Response.json({ error: 'Akses ditolak' }, { status: 403 })
        }

        // Fetch dokumen via getDokumenById (includes manual joins for leaf node names)
        const dok = await getDokumenById(authClient, params.id)

        if (!dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        // Check if arsip is DIMUSNAHKAN
        const { data: arsipRecord } = await authClient
          .from('arsip')
          .select('status_arsip')
          .eq('dokumen_id', params.id)
          .single()

        if (arsipRecord?.status_arsip === 'DIMUSNAHKAN') {
          return Response.json({ error: 'File asli tidak tersedia — arsip telah dimusnahkan' }, { status: 410 })
        }

        // lampiran_urls sudah di-parse oleh getDokumenById
        const lampiranUrls = dok.lampiran_urls

        const index = parseInt(params.lampiranIndex, 10)
        if (isNaN(index) || index < 0 || index >= lampiranUrls.length) {
          return Response.json({ error: 'Lampiran tidak ditemukan' }, { status: 404 })
        }

        const lampiran = lampiranUrls[index]

        // Generate signed URL (15 minutes, no download flag)
        const admin = createAdminClient()
        const { data, error } = await admin.storage
          .from('dokumen-lampiran')
          .createSignedUrl(lampiran.url, 900) // 15 minutes

        if (error || !data) {
          if (error?.message === 'Object not found') {
            return Response.json({ error: 'File asli tidak tersedia — arsip telah dimusnahkan' }, { status: 410 })
          }
          console.error('[ppk/preview] Signed URL error:', error)
          return Response.json({ error: 'Gagal membuat link pratinjau' }, { status: 500 })
        }

        return Response.json({ signedUrl: data.signedUrl })
      },
    },
  },
})
