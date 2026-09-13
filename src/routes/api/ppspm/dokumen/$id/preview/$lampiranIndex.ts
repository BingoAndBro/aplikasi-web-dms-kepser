import { createFileRoute } from '@tanstack/react-router'

import { getFileTokenSecret } from '#/lib/storage/internal-file-access'
import { createDocumentLampiranAccessUrlResponse } from '#/lib/storage/document-file-access'

// ---------------------------------------------------------------------------
// GET /api/ppspm/dokumen/[id]/preview/[lampiranIndex]
// Returns an internal signed URL for in-browser preview.
// NOTE: Filename is built client-side using buildStorageFilename().
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ppspm/dokumen/$id/preview/$lampiranIndex')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        try {
          return await createDocumentLampiranAccessUrlResponse({
            request,
            params,
            mode: 'ppspm',
            purpose: 'preview',
            secret: getFileTokenSecret(),
          })
        } catch {
          return Response.json({ error: 'Gagal membuat link pratinjau' }, { status: 500 })
        }
      },
    },
  },
})
