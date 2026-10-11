import { createFileRoute } from '@tanstack/react-router'

import { handleTautanDokumenFileRequest } from '#/lib/laporan/tautan'

// Pratinjau lampiran dokumen alur di dalam Tautan Laporan (file langsung, inline).
export const Route = createFileRoute('/api/tautan/$token/dokumen/$dokumenId/preview/$lampiranIndex')({
  ssr: false,
  server: {
    handlers: {
      GET: ({ request, params }: { request: Request; params: Record<string, string> }) =>
        handleTautanDokumenFileRequest({ request, params, purpose: 'preview' }),
    },
  },
})
