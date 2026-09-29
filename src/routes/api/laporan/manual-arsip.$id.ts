import { createFileRoute } from '@tanstack/react-router'
import { ARCHIVE_STATUS } from '#/lib/constants/archive-status'
import {
  getManualArsipDetail,
  isUuid,
  requireLaporanManualArsipSession,
  toSafeErrorLog,
} from '#/lib/manual-arsip'
import { isManualArsipInDestroyedBerkas } from '#/lib/laporan/manual-realisasi'

// Read-only detail of a manual KSBU document for Laporan Kinerja / Monitoring
// Nominal Realisasi (T-5/D-26) and Laporan Kegiatan (D-28). Laporan Kegiatan
// keeps destroyed documents visible (nominal not counted), so a destroyed
// document still returns its metadata with `dimusnahkan: true` — either its
// own status_arsip or the berkas holding it is DIMUSNAHKAN. Its files answer
// 410 on the preview/download routes.
export const Route = createFileRoute('/api/laporan/manual-arsip/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sessionOrResponse = await requireLaporanManualArsipSession(request, params.id)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen manual tidak ditemukan' }, { status: 404 })
        }

        try {
          const manual_arsip = await getManualArsipDetail(params.id)
          if (!manual_arsip) {
            return Response.json({ error: 'Dokumen manual tidak ditemukan' }, { status: 404 })
          }

          const dimusnahkan = manual_arsip.status_arsip === ARCHIVE_STATUS.DIMUSNAHKAN
            || await isManualArsipInDestroyedBerkas(params.id)

          return Response.json({ manual_arsip: { ...manual_arsip, dimusnahkan } })
        } catch (err) {
          console.error('[laporan/manual-arsip/$id] GET local query error:', toSafeErrorLog(err))
          return Response.json({ error: 'Gagal mengambil detail dokumen manual' }, { status: 500 })
        }
      },
    },
  },
})
