import { createFileRoute } from '@tanstack/react-router'
import { ARCHIVE_STATUS } from '#/lib/constants/archive-status'
import {
  getManualArsipDetail,
  isUuid,
  requireLaporanManualArsipSession,
  toSafeErrorLog,
} from '#/lib/manual-arsip'

// Read-only detail of a manual KSBU document for Laporan Kinerja / Monitoring
// Nominal Realisasi (T-5/D-26). A DIMUSNAHKAN document is not listed by
// /api/laporan/kinerja either, so it is reported as not found here.
export const Route = createFileRoute('/api/laporan/manual-arsip/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sessionOrResponse = await requireLaporanManualArsipSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen manual tidak ditemukan' }, { status: 404 })
        }

        try {
          const manual_arsip = await getManualArsipDetail(params.id)
          if (!manual_arsip || manual_arsip.status_arsip === ARCHIVE_STATUS.DIMUSNAHKAN) {
            return Response.json({ error: 'Dokumen manual tidak ditemukan' }, { status: 404 })
          }

          return Response.json({ manual_arsip })
        } catch (err) {
          console.error('[laporan/manual-arsip/$id] GET local query error:', toSafeErrorLog(err))
          return Response.json({ error: 'Gagal mengambil detail dokumen manual' }, { status: 500 })
        }
      },
    },
  },
})
