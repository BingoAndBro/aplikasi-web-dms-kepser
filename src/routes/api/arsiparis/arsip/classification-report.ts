import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import {
  getUnifiedArchiveClassificationReport,
  parseClassificationReportSourceFilter,
  parseClassificationReportStatusFilter,
} from '#/lib/archive/unified-archive-classification-report'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { ROLES } from '#/lib/constants/roles'

const classificationReportQuerySchema = z.object({
  status: z.enum(['AKTIF', 'INAKTIF', 'USUL_MUSNAH', 'DIMUSNAHKAN', 'ALL']).optional().nullable(),
  source: z.enum(['WORKFLOW', 'MANUAL', 'ALL']).optional().nullable(),
})

export const Route = createFileRoute('/api/arsiparis/arsip/classification-report')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, ROLES.KEPALA_SUB_BAGIAN_UMUM)) {
          return Response.json({ error: 'Akses ditolak' }, { status: 403 })
        }

        const url = new URL(request.url)
        const query = classificationReportQuerySchema.safeParse({
          status: url.searchParams.get('status'),
          source: url.searchParams.get('source'),
        })
        if (!query.success) {
          return Response.json({ error: 'Filter laporan klasifikasi arsip tidak valid' }, { status: 400 })
        }

        try {
          const report = await getUnifiedArchiveClassificationReport({
            statusArsip: parseClassificationReportStatusFilter(query.data.status),
            sourceType: parseClassificationReportSourceFilter(query.data.source),
          })

          return Response.json({ report })
        } catch {
          console.error('[arsiparis/arsip/classification-report] report query error')
          return Response.json({ error: 'Gagal mengambil laporan klasifikasi arsip' }, { status: 500 })
        }
      },
    },
  },
})
