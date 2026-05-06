import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession as getSession } from '#/lib/auth'
import { getDokumenById, userHasApproverRole } from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/dokumen/[id]/preview/[lampiranIndex]
// Returns a signed URL for previewing a lampiran file
// NOTE: Filename is built client-side using buildStorageFilename()
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/$id/preview/$lampiranIndex')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const dok = await getDokumenById(supabase, params.id)

        if (!dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        // Check if arsip is DIMUSNAHKAN
        const { data: arsipRecord } = await supabase
          .from('arsip')
          .select('status_arsip, lampiran_snapshot')
          .eq('dokumen_id', params.id)
          .single()

        if (arsipRecord?.status_arsip === 'DIMUSNAHKAN') {
          return Response.json({ error: 'File asli tidak tersedia — arsip telah dimusnahkan' }, { status: 410 })
        }

        // Ownership or approver role check
        const isOwner = dok.created_by === session.user.id
        const isApprover = await userHasApproverRole(supabase, session.user.id)

        if (!isOwner && !isApprover) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        const index = parseInt(params.lampiranIndex, 10)
        if (isNaN(index) || index < 0 || index >= dok.lampiran_urls.length) {
          return Response.json({ error: 'Lampiran tidak ditemukan' }, { status: 404 })
        }

        const lampiran = dok.lampiran_urls[index]

        // Get signed URL (15 minutes, no download flag)
        const supabaseAdmin = createAdminClient()
        const { data, error } = await supabaseAdmin.storage
          .from('dokumen-lampiran')
          .createSignedUrl(lampiran.url, 900) // 15 minutes

        if (error || !data) {
          if (error?.message === 'Object not found') {
            return Response.json({ error: 'File tidak ditemukan' }, { status: 404 })
          }
          console.error('[preview] Signed URL error:', error)
          return Response.json({ error: 'Gagal membuat link pratinjau' }, { status: 500 })
        }

        return Response.json({ signedUrl: data.signedUrl })
      },
    },
  },
})
