import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import {
  buildUnifiedArchiveCsvResponse,
  createUnifiedArchiveCsvExport,
  parseUnifiedArchiveSourceFilter,
  parseUnifiedArchiveStatusFilter,
} from '#/lib/archive/unified-archive-aggregate-export'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { ROLES } from '#/lib/constants/roles'

const exportQuerySchema = z.object({
  status: z.enum(['AKTIF', 'INAKTIF', 'USUL_MUSNAH', 'DIMUSNAHKAN', 'ALL']).optional().nullable(),
  source: z.enum(['WORKFLOW', 'MANUAL', 'ALL']).optional().nullable(),
})

export const Route = createFileRoute('/api/arsiparis/arsip/export')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, ROLES.KEPALA_SUB_BAGIAN_UMUM)) {
          return Response.json({ error: 'Akses ditolak' }, { status: 403 })
        }

        const url = new URL(request.url)
        const query = exportQuerySchema.safeParse({
          status: url.searchParams.get('status'),
          source: url.searchParams.get('source'),
        })
        if (!query.success) {
          return Response.json({ error: 'Filter export arsip tidak valid' }, { status: 400 })
        }

        try {
          const result = await createUnifiedArchiveCsvExport({
            statusArsip: parseUnifiedArchiveStatusFilter(query.data.status),
            sourceType: parseUnifiedArchiveSourceFilter(query.data.source),
          })

          return buildUnifiedArchiveCsvResponse(result)
        } catch {
          console.error('[arsiparis/arsip/export] CSV export query error')
          return Response.json({ error: 'Gagal membuat export arsip' }, { status: 500 })
        }
      },
    },
  },
})
