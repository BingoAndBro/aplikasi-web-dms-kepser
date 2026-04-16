import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'
import { createAdminClient } from '#/lib/supabase-admin'
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
// GET /api/dokumen/[id]/download/[lampiranIndex]
// Returns a signed URL for downloading a lampiran file
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/$id/download/$lampiranIndex')({
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

        // Ownership or approver role check
        const isOwner = dok.created_by === session.user.id
        const isApprover = await userHasApproverRole(supabase, session.user.id)

        if (!isOwner && !isApprover) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        // Parse lampiran index
        const index = parseInt(params.lampiranIndex, 10)
        if (isNaN(index) || index < 0 || index >= dok.lampiran_urls.length) {
          return Response.json({ error: 'Lampiran tidak ditemukan' }, { status: 404 })
        }

        const lampiran = dok.lampiran_urls[index]

        // Generate signed URL (1 hour expiry)
        const supabaseAdmin = createAdminClient()

        const { data, error } = await supabaseAdmin.storage
          .from('dokumen-lampiran')
          .createSignedUrl(lampiran.url, 3600) // 1 hour = 3600 seconds

        if (error || !data) {
          console.error('[download] Signed URL error:', error)
          return Response.json({ error: 'Gagal membuat link download' }, { status: 500 })
        }

        // Extract original filename from storage path: [user_id]/[kelengkapan_id]_[timestamp]_[filename]
        const urlParts = lampiran.url.split('_')
        const filename = urlParts.slice(2).join('_') || lampiran.nama

        return Response.json({ signedUrl: data.signedUrl, filename })
      },
    },
  },
})
