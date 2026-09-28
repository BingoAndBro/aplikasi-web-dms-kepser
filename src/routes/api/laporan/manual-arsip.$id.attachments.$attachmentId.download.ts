import { createFileRoute } from '@tanstack/react-router'
import {
  createManualArsipAttachmentFileResponse,
  isUuid,
  requireLaporanManualArsipSession,
  toSafeErrorLog,
} from '#/lib/manual-arsip'

export const Route = createFileRoute('/api/laporan/manual-arsip/$id/attachments/$attachmentId/download')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sessionOrResponse = await requireLaporanManualArsipSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        if (!isUuid(params.id) || !isUuid(params.attachmentId)) {
          return Response.json({ error: 'Lampiran dokumen manual tidak ditemukan' }, { status: 404 })
        }

        try {
          return await createManualArsipAttachmentFileResponse({
            manualArsipId: params.id,
            attachmentId: params.attachmentId,
            purpose: 'download',
          })
        } catch (err) {
          console.error(
            '[laporan/manual-arsip/$id/attachments/$attachmentId/download] GET local file error:',
            toSafeErrorLog(err),
          )
          return Response.json(
            { error: 'Gagal mengakses file lampiran' },
            {
              status: 500,
              headers: { 'Cache-Control': 'no-store' },
            },
          )
        }
      },
    },
  },
})
