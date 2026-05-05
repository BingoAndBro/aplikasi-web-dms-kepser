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

        // Parse lampiran index
        const index = parseInt(params.lampiranIndex, 10)
        if (isNaN(index) || index < 0 || index >= dok.lampiran_urls.length) {
          return Response.json({ error: 'Lampiran tidak ditemukan' }, { status: 404 })
        }

        const lampiran = dok.lampiran_urls[index]

        // Storage path format variations:
        // 1. [user_id]/[uuid]_[timestamp]_[original_filename] (underscore)
        // 2. [user_id]/[timestamp]-[random]-[original_filename] (dash)
        // Example 1: "user-id/7df5992f-be9a-4e8d-b836-7d677d7976c4_1777969605493_Penilaian_360.pdf"
        // Example 2: "user-id/1777964598700-9d5docxfisv-Penilaian_360.pdf"
        const pathParts = lampiran.url.split('/')
        const filenameWithExt = pathParts[pathParts.length - 1] || 'download'

        // Try to extract original filename based on format
        let originalFilename = filenameWithExt

        // Pattern 1: UUID_timestamp_originalName (underscore format)
        // UUID is 36 chars with dashes, followed by underscore and 13-digit timestamp
        const underscoreMatch = filenameWithExt.match(/^[a-zA-Z0-9-]+_(\d{13})_(.+)$/)
        if (underscoreMatch) {
          originalFilename = underscoreMatch[2]
        }

        // Pattern 2: timestamp-randomName (dash format)
        // Timestamp is 13 digits, followed by dash, then random chars, then dash, then filename
        const dashMatch = filenameWithExt.match(/^(\d{13})-[a-zA-Z0-9]+-(.+)$/)
        if (dashMatch) {
          originalFilename = dashMatch[2]
        }

        // Extract extension from original filename
        const lastDotIdx = originalFilename.lastIndexOf('.')
        let ext = ''
        let nameWithoutExt = originalFilename
        if (lastDotIdx > 0 && lastDotIdx < originalFilename.length - 1) {
          ext = originalFilename.slice(lastDotIdx + 1).toLowerCase()
          nameWithoutExt = originalFilename.slice(0, lastDotIdx)
        }

        const docIdShort = params.id.substring(0, 8)
        const dateStr = dok.tanggal ? `_${dok.tanggal}` : ''
        const downloadFilename = `${docIdShort}_${nameWithoutExt}${dateStr}.${ext}`

        console.log('[download] Generating download:', {
          lampiranUrl: lampiran.url,
          filenameWithExt,
          underscoreMatch: underscoreMatch ? underscoreMatch[2] : null,
          dashMatch: dashMatch ? dashMatch[2] : null,
          originalFilename,
          docIdShort,
          ext,
          nameWithoutExt,
          downloadFilename
        })

        // Generate signed URL with download option (1 hour expiry)
        const supabaseAdmin = createAdminClient()

        const { data, error } = await supabaseAdmin.storage
          .from('dokumen-lampiran')
          .createSignedUrl(lampiran.url, 3600, { download: downloadFilename })

        if (error || !data) {
          console.error('[download] Signed URL error:', error)
          return Response.json({ error: 'Gagal membuat link download' }, { status: 500 })
        }

        return Response.json({ signedUrl: data.signedUrl, filename: downloadFilename })
      },
    },
  },
})
