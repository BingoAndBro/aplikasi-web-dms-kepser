import { createFileRoute } from '@tanstack/react-router'
import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import {
  canAccessLogicalFilePath,
  getFileTokenSecret,
} from '#/lib/storage/internal-file-access'
import { createInternalFileAccessUrl } from '#/lib/storage/internal-file-access-url'
import { assertSafeLogicalStoragePath } from '#/lib/storage/local-storage-paths'

const PREVIEW_TOKEN_EXPIRES_IN_SECONDS = 900
const ABSOLUTE_PATH_PREFIX_PATTERN = /^[\\/]+/

// ---------------------------------------------------------------------------
// GET /api/dokumen/preview-url?url=xxx
// Returns an internal signed URL for any local logical dokumen-lampiran path.
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/preview-url')({
  ssr: false,
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const searchParams = new URL(request.url).searchParams
        const url = searchParams.get('url')
        if (!url) {
          return Response.json({ error: 'URL parameter required' }, { status: 400 })
        }

        if (ABSOLUTE_PATH_PREFIX_PATTERN.test(url.trim())) {
          return Response.json({ error: 'URL tidak valid' }, { status: 400 })
        }

        let logicalPath: string
        try {
          logicalPath = assertSafeLogicalStoragePath(url)
        } catch {
          return Response.json({ error: 'URL tidak valid' }, { status: 400 })
        }

        if (!canAccessLogicalFilePath(session, logicalPath)) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        // Preserve the legacy visible filename derivation for raw preview.
        const parts = logicalPath.split('/')
        const filename = parts[parts.length - 1].split(/[_-]/).slice(2).join('_') || 'dokumen'

        try {
          const issuedAt = Date.now()
          const internalUrl = createInternalFileAccessUrl({
            secret: getFileTokenSecret(),
            payload: {
              version: 1,
              purpose: 'preview',
              logicalPath,
              contentDisposition: 'inline',
              issuedAt,
              expiresAt: issuedAt + PREVIEW_TOKEN_EXPIRES_IN_SECONDS * 1000,
            },
          })

          return Response.json({ signedUrl: internalUrl, filename })
        } catch {
          return Response.json({ error: 'Gagal membuat link pratinjau' }, { status: 500 })
        }
      },
    },
  },
})
