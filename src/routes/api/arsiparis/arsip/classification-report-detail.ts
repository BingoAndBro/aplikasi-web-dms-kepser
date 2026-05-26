import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import {
  getUnifiedArchiveClassificationDetail,
} from '#/lib/archive/unified-archive-classification-detail'
import {
  parseClassificationReportSourceFilter,
  parseClassificationReportStatusFilter,
} from '#/lib/archive/unified-archive-classification-report'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { ROLES } from '#/lib/constants/roles'

const classificationReportDetailQuerySchema = z.object({
  klasifikasiId: z.string().uuid().optional().nullable(),
  missing: z.enum(['true']).optional().nullable(),
  status: z.enum(['AKTIF', 'INAKTIF', 'USUL_MUSNAH', 'DIMUSNAHKAN', 'ALL']).optional().nullable(),
  source: z.enum(['WORKFLOW', 'MANUAL', 'ALL']).optional().nullable(),
}).refine(
  (query) => Boolean(query.klasifikasiId) !== (query.missing === 'true'),
  { message: 'Pilih klasifikasi atau missing classification' },
)

export const Route = createFileRoute('/api/arsiparis/arsip/classification-report-detail')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, ROLES.KEPALA_SUB_BAGIAN_UMUM)) {
          return Response.json({ error: 'Akses ditolak' }, { status: 403 })
        }

        const url = new URL(request.url)
        const query = classificationReportDetailQuerySchema.safeParse({
          klasifikasiId: url.searchParams.get('klasifikasiId'),
          missing: url.searchParams.get('missing'),
          status: url.searchParams.get('status'),
          source: url.searchParams.get('source'),
        })
        if (!query.success) {
          return Response.json({ error: 'Filter detail laporan klasifikasi arsip tidak valid' }, { status: 400 })
        }

        try {
          const detail = await getUnifiedArchiveClassificationDetail({
            klasifikasiId: query.data.klasifikasiId ?? undefined,
            missing: query.data.missing === 'true',
            statusArsip: parseClassificationReportStatusFilter(query.data.status),
            sourceType: parseClassificationReportSourceFilter(query.data.source),
          })

          return Response.json(detail)
        } catch {
          console.error('[arsiparis/arsip/classification-report-detail] detail query error')
          return Response.json({ error: 'Gagal mengambil detail laporan klasifikasi arsip' }, { status: 500 })
        }
      },
    },
  },
})
