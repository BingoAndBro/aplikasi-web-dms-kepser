import { createFileRoute } from '@tanstack/react-router'
import {
  createManualArsipAttachmentFileResponse,
  isUuid,
  requireLaporanManualArsipSession,
  toSafeErrorLog,
} from '#/lib/manual-arsip'
import { isManualArsipInDestroyedBerkas } from '#/lib/laporan/manual-realisasi'

export const Route = createFileRoute('/api/laporan/manual-arsip/$id/attachments/$attachmentId/preview')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sessionOrResponse = await requireLaporanManualArsipSession(request, params.id)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        if (!isUuid(params.id) || !isUuid(params.attachmentId)) {
          return Response.json({ error: 'Lampiran dokumen manual tidak ditemukan' }, { status: 404 })
        }

        try {
          // Pemusnahan terjadi di tingkat berkas; status_arsip dokumen manual
          // sendiri diperiksa di createManualArsipAttachmentFileResponse.
          if (await isManualArsipInDestroyedBerkas(params.id)) {
            return Response.json(
              { error: 'File lampiran tidak tersedia - arsip telah dimusnahkan' },
              { status: 410, headers: { 'Cache-Control': 'no-store' } },
            )
          }

          return await createManualArsipAttachmentFileResponse({
            manualArsipId: params.id,
            attachmentId: params.attachmentId,
            purpose: 'preview',
          })
        } catch (err) {
          console.error(
            '[laporan/manual-arsip/$id/attachments/$attachmentId/preview] GET local file error:',
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
