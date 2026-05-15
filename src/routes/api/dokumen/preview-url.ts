import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'
import { canAccessStoragePath } from '#/lib/dokumen-helpers'
import { getFileTokenSecret } from '#/lib/storage/internal-file-access'
import { createInternalFileAccessUrl } from '#/lib/storage/internal-file-access-url'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/dokumen/preview-url?url=xxx
// Returns a signed URL for any dokumen-lampiran URL (used by edit page)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/preview-url')({
  ssr: false,
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const searchParams = new URL(request.url).searchParams
        const url = searchParams.get('url')
        if (!url) {
          return Response.json({ error: 'URL parameter required' }, { status: 400 })
        }

        const canAccess = await canAccessStoragePath(supabase, session.user.id, url)
        if (!canAccess) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        // Extract filename from path
        const parts = url.split('/')
        const filename = parts[parts.length - 1].split(/[_-]/).slice(2).join('_') || 'dokumen'

        if (searchParams.get('useInternal') === 'true') {
          try {
            const issuedAt = Date.now()
            const internalUrl = createInternalFileAccessUrl({
              secret: getFileTokenSecret(),
              payload: {
                version: 1,
                purpose: 'preview',
                logicalPath: url,
                contentDisposition: 'inline',
                issuedAt,
                expiresAt: issuedAt + 900 * 1000,
              },
            })

            return Response.json({ signedUrl: internalUrl, filename })
          } catch {
            return Response.json({ error: 'Gagal membuat URL preview' }, { status: 500 })
          }
        }

        const supabaseAdmin = createAdminClient()
        const { data, error } = await supabaseAdmin.storage
          .from('dokumen-lampiran')
          .createSignedUrl(url, 900)

        if (error || !data) {
          console.error('[preview-url] Signed URL error:', error)
          return Response.json({ error: 'Gagal membuat link pratinjau' }, { status: 500 })
        }

        return Response.json({ signedUrl: data.signedUrl, filename })
      },
    },
  },
})
