import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import {
  ManualArsipApiError,
  getManualArsipDetail,
  isUuid,
  requireManualArsipApiSession,
  toSafeErrorLog,
  updateManualArsipRecord,
} from '#/lib/manual-arsip'

export const Route = createFileRoute('/api/arsiparis/manual-arsip/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sessionOrResponse = await requireManualArsipApiSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen manual tidak ditemukan' }, { status: 404 })
        }

        try {
          const manual_arsip = await getManualArsipDetail(params.id)
          if (!manual_arsip) {
            return Response.json({ error: 'Dokumen manual tidak ditemukan' }, { status: 404 })
          }

          return Response.json({ manual_arsip })
        } catch (err) {
          console.error('[arsiparis/manual-arsip/$id] GET local query error:', toSafeErrorLog(err))
          return Response.json({ error: 'Gagal mengambil detail dokumen manual' }, { status: 500 })
        }
      },

      PATCH: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const sessionOrResponse = await requireManualArsipApiSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen manual tidak ditemukan' }, { status: 404 })
        }

        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Body tidak valid' }, { status: 400 })

        try {
          const manual_arsip = await updateManualArsipRecord(params.id, body)
          return Response.json({ manual_arsip })
        } catch (err) {
          if (err instanceof ManualArsipApiError) {
            return Response.json({ error: err.message }, { status: err.status })
          }

          console.error('[arsiparis/manual-arsip/$id] PATCH local query error:', toSafeErrorLog(err))
          return Response.json({ error: 'Gagal memperbarui dokumen manual' }, { status: 500 })
        }
      },
    },
  },
})
