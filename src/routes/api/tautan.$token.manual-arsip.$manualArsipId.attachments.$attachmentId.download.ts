import { createFileRoute } from '@tanstack/react-router'

import { handleTautanManualFileRequest } from '#/lib/laporan/tautan'

// Unduh lampiran dokumen tambahan KSBU di dalam Tautan Laporan.
export const Route = createFileRoute('/api/tautan/$token/manual-arsip/$manualArsipId/attachments/$attachmentId/download')({
  ssr: false,
  server: {
    handlers: {
      GET: ({ request, params }: { request: Request; params: Record<string, string> }) =>
        handleTautanManualFileRequest({ request, params, purpose: 'download' }),
    },
  },
})
