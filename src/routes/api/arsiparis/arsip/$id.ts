import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { getUnifiedArchiveDetail } from '#/lib/archive/unified-archive-detail'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { ROLES } from '#/lib/constants/roles'

const archiveIdSchema = z.uuid()

export const Route = createFileRoute('/api/arsiparis/arsip/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, ROLES.KEPALA_SUB_BAGIAN_UMUM)) {
          return Response.json({ error: 'Akses ditolak' }, { status: 403 })
        }

        const archiveId = archiveIdSchema.safeParse(params.id)
        if (!archiveId.success) {
          return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })
        }

        try {
          const result = await getUnifiedArchiveDetail(archiveId.data)
          if (result.status === 'not_found') {
            return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })
          }

          return Response.json({ arsip: result.detail })
        } catch {
          console.error('[arsiparis/arsip/:id] unified detail query error')
          return Response.json({ error: 'Gagal mengambil data arsip' }, { status: 500 })
        }
      },
    },
  },
})
