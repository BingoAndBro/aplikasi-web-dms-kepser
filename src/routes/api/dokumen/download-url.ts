import { createFileRoute } from '@tanstack/react-router'
import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import {
  canAccessLogicalFilePath,
  getFileTokenSecret,
} from '#/lib/storage/internal-file-access'
import { createInternalFileAccessUrl } from '#/lib/storage/internal-file-access-url'
import { assertSafeLogicalStoragePath } from '#/lib/storage/local-storage-paths'

const DOWNLOAD_TOKEN_EXPIRES_IN_SECONDS = 3600
const ABSOLUTE_PATH_PREFIX_PATTERN = /^[\\/]+/

// ---------------------------------------------------------------------------
// GET /api/dokumen/download-url?url=xxx
// Returns an internal signed download URL for any local logical path.
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

        const docId = searchParams.get('docId')
        const docDate = searchParams.get('docDate')
        const lampName = searchParams.get('lampName')

        if (!docId || !lampName) {
          return Response.json({ error: 'docId and lampName parameters required' }, { status: 400 })
        }

        // Build filename: docId_namaKelengkapan_tanggal.ext
        // Storage path format variations:
        // 1. [user_id]/[uuid]_[timestamp]_[original_filename] (underscore)
        // 2. [user_id]/[timestamp]-[random]-[original_filename] (dash)
        // Example 1: "user-id/7df5992f-be9a-4e8d-b836-7d677d7976c4_1777969605493_Penilaian_360.pdf"
        // Example 2: "user-id/1777964598700-9d5docxfisv-Penilaian_360.pdf"
        const pathParts = logicalPath.split('/')
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

        try {
          const issuedAt = Date.now()
          const internalUrl = createInternalFileAccessUrl({
            secret: getFileTokenSecret(),
            payload: {
              version: 1,
              purpose: 'download',
              logicalPath,
              contentDisposition: 'attachment',
              downloadFilename,
              issuedAt,
              expiresAt: issuedAt + DOWNLOAD_TOKEN_EXPIRES_IN_SECONDS * 1000,
            },
          })

          return Response.json({ signedUrl: internalUrl })
        } catch {
          return Response.json({ error: 'Gagal membuat link unduh' }, { status: 500 })
        }
      },
    },
  },
})
