import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'
import { canAccessStoragePath } from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/dokumen/download-url?url=xxx
// Returns a signed download URL for any dokumen-lampiran URL (used by edit page)
// Query params:
//   - url: storage path (required)
//   - docId: dokumen ID for naming (required)
//   - docDate: dokumen tanggal (optional, format YYYY-MM-DD)
//   - lampName: nama kelengkapan lampiran (required)
//   - lampIndex: index lampiran (optional, for uniqueness)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/download-url')({
  ssr: false,
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url).searchParams.get('url')
        if (!url) {
          return Response.json({ error: 'URL parameter required' }, { status: 400 })
        }

        const canAccess = await canAccessStoragePath(supabase, session.user.id, url)
        if (!canAccess) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        const docId = new URL(request.url).searchParams.get('docId')
        const docDate = new URL(request.url).searchParams.get('docDate')
        const lampName = new URL(request.url).searchParams.get('lampName')

        if (!docId || !lampName) {
          return Response.json({ error: 'docId and lampName parameters required' }, { status: 400 })
        }

        // Build filename: docId_namaKelengkapan_tanggal.ext
        // Storage path format variations:
        // 1. [user_id]/[uuid]_[timestamp]_[original_filename] (underscore)
        // 2. [user_id]/[timestamp]-[random]-[original_filename] (dash)
        // Example 1: "user-id/7df5992f-be9a-4e8d-b836-7d677d7976c4_1777969605493_Penilaian_360.pdf"
        // Example 2: "user-id/1777964598700-9d5docxfisv-Penilaian_360.pdf"
        const pathParts = url.split('/')
        const filenameWithExt = pathParts[pathParts.length - 1] || 'download'

        // Try to extract original filename based on format
        let originalFilename = filenameWithExt

        // Pattern 1: UUID_timestamp_originalName (underscore format)
        const underscoreMatch = filenameWithExt.match(/^[a-zA-Z0-9-]+_(\d{13})_(.+)$/)
        if (underscoreMatch) {
          originalFilename = underscoreMatch[2]
        }

        // Pattern 2: timestamp-randomName (dash format)
        const dashMatch = filenameWithExt.match(/^(\d{13})-[a-zA-Z0-9]+-(.+)$/)
        if (dashMatch) {
          originalFilename = dashMatch[2]
        }

        // Extract extension
        const lastDotIdx = originalFilename.lastIndexOf('.')
        let ext = ''
        let nameWithoutExt = originalFilename
        if (lastDotIdx > 0 && lastDotIdx < originalFilename.length - 1) {
          ext = originalFilename.slice(lastDotIdx + 1).toLowerCase()
          nameWithoutExt = originalFilename.slice(0, lastDotIdx)
        }

        const docIdShort = docId.substring(0, 8)
        const dateStr = docDate ? `_${docDate}` : ''
        const downloadFilename = `${docIdShort}_${nameWithoutExt}${dateStr}.${ext}`

        console.log('[download-url] Generating download URL:', {
          url,
          filenameWithExt,
          underscoreMatch: underscoreMatch ? underscoreMatch[2] : null,
          dashMatch: dashMatch ? dashMatch[2] : null,
          originalFilename,
          docIdShort,
          ext,
          nameWithoutExt,
          downloadFilename
        })

        const supabaseAdmin = createAdminClient()
        const { data, error } = await supabaseAdmin.storage
          .from('dokumen-lampiran')
          .createSignedUrl(url, 900, { download: downloadFilename })

        if (error || !data) {
          console.error('[download-url] Signed URL error:', error)
          return Response.json({ error: 'Gagal membuat link unduh' }, { status: 500 })
        }

        return Response.json({ signedUrl: data.signedUrl })
      },
    },
  },
})
