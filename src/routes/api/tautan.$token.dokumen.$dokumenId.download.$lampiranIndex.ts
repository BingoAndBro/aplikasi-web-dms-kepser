import { createFileRoute } from '@tanstack/react-router'

import { handleTautanDokumenFileRequest } from '#/lib/laporan/tautan'

// Unduh lampiran dokumen alur di dalam Tautan Laporan (file langsung, attachment).
export const Route = createFileRoute('/api/tautan/$token/dokumen/$dokumenId/download/$lampiranIndex')({
  ssr: false,
  server: {
    handlers: {
      GET: ({ request, params }: { request: Request; params: Record<string, string> }) =>
        handleTautanDokumenFileRequest({ request, params, purpose: 'download' }),
    },
  },
})
