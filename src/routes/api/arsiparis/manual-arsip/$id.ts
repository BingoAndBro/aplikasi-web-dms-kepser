import { createFileRoute } from '@tanstack/react-router'
import {
  getManualArsipDetail,
  isUuid,
  requireManualArsipApiSession,
  toSafeErrorLog,
} from '#/lib/manual-arsip'

export const Route = createFileRoute('/api/arsiparis/manual-arsip/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sessionOrResponse = await requireManualArsipApiSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Arsip manual tidak ditemukan' }, { status: 404 })
        }

        try {
          const manual_arsip = await getManualArsipDetail(params.id)
          if (!manual_arsip) {
            return Response.json({ error: 'Arsip manual tidak ditemukan' }, { status: 404 })
          }

          return Response.json({ manual_arsip })
        } catch (err) {
          console.error('[arsiparis/manual-arsip/$id] GET local query error:', toSafeErrorLog(err))
          return Response.json({ error: 'Gagal mengambil detail arsip manual' }, { status: 500 })
        }
      },
    },
  },
})
