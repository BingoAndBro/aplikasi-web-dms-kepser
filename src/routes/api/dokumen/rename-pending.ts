import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'
import { getDokumenById, storagePathBelongsToUser } from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// POST /api/dokumen/rename-pending
// Rename pending file to formal storage path.
//
// Body: { dokId: string, lampiranUrls: LampiranUrl[], userId: string }
// Response: { success: true, renamed: { oldPath: string, newPath: string }[] }
//           or { error: string } with status 500
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/rename-pending')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getServerSession(supabase)
        if (!session) {
          console.error('[API/dokumen/rename-pending] Unauthorized')
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        let body: { dokId: string; lampiranUrls: any[]; userId: string }
        try {
          body = await request.json()
        } catch (e) {
          console.error('[API/dokumen/rename-pending] Invalid JSON body:', e)
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const { dokId, lampiranUrls, userId } = body

        if (!dokId || !lampiranUrls || !Array.isArray(lampiranUrls)) {
          console.error('[API/dokumen/rename-pending] Missing required fields:', { dokId, lampiranUrls })
          return Response.json({ error: 'Missing dokId or lampiranUrls' }, { status: 400 })
        }

        if (userId !== session.user.id) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        console.log('[API/dokumen/rename-pending] Processing dokId:', dokId, 'lampiranCount:', lampiranUrls.length)

        // Helper: check if path is PENDING format
        function isPendingPath(url: string): boolean {
          const pathParts = url.split('/')
          const filenameWithExt = pathParts[pathParts.length - 1] || ''
          return /^\d{13}-[a-zA-Z0-9]+-.+$/.test(filenameWithExt)
        }

        // Helper: extract extension
        function extractExtension(url: string): string {
          const filename = url.split('/').pop() || ''
          const parts = filename.split('.')
          return parts.length > 1 ? parts[parts.length - 1] : ''
        }

        // Helper: build formal path
        function buildFormalPath(lamp: any): string {
          const ext = extractExtension(lamp.url)
          const uuid = crypto.randomUUID()
          return `${userId}/${dokId}/${uuid}.${ext}`
        }

        const admin = createAdminClient()
        const dokumen = await getDokumenById(admin, dokId)
        if (!dokumen) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }
        if (dokumen.created_by !== session.user.id) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        const renamed: { oldPath: string; newPath: string }[] = []
        const errors: { path: string; error: string }[] = []

        for (const lamp of lampiranUrls) {
          if (!lamp.url || !isPendingPath(lamp.url)) {
            console.log('[API/dokumen/rename-pending] Skipping non-pending:', lamp.url)
            continue
          }

          const oldPath = lamp.url
          if (!storagePathBelongsToUser(oldPath, session.user.id)) {
            return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
          }

          const newPath = buildFormalPath(lamp)

          console.log('[API/dokumen/rename-pending] Renaming:', { oldPath, newPath })

          const { data, error } = await admin.storage
            .from('dokumen-lampiran')
            .move(oldPath, newPath)

          if (error) {
            console.error('[API/dokumen/rename-pending] Move failed for:', oldPath, 'error:', error.message)
            errors.push({ path: oldPath, error: error.message })
            // Option 1: Fail entire operation if any rename fails
            return Response.json({
              error: `Gagal memproses file: ${error.message}`,
              details: {
                failedPath: oldPath,
                newPath: newPath,
                reason: error.message,
              },
            }, { status: 500 })
          }

          console.log('[API/dokumen/rename-pending] Move success:', oldPath, '->', newPath)
          renamed.push({ oldPath, newPath })
        }

        console.log('[API/dokumen/rename-pending] Done. Renamed:', renamed.length, 'errors:', errors.length)

        return Response.json({
          success: true,
          renamed,
          errors: errors.length > 0 ? errors : undefined,
        })
      },
    },
  },
})
