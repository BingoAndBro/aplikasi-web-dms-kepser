import { createFileRoute } from '@tanstack/react-router'

import { getUnifiedArchiveAggregate } from '#/lib/archive/unified-archive-aggregate-export'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { ROLES } from '#/lib/constants/roles'

export const Route = createFileRoute('/api/arsiparis/arsip/aggregate')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, ROLES.KEPALA_SUB_BAGIAN_UMUM)) {
          return Response.json({ error: 'Akses ditolak' }, { status: 403 })
        }

        try {
          const aggregate = await getUnifiedArchiveAggregate()

          return Response.json({ aggregate })
        } catch {
          console.error('[arsiparis/arsip/aggregate] aggregate query error')
          return Response.json({ error: 'Gagal mengambil ringkasan arsip' }, { status: 500 })
        }
      },
    },
  },
})
