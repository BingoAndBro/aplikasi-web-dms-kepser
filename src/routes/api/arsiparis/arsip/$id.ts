import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { getUnifiedArchiveDetail } from '#/lib/archive/unified-archive-detail'
import {
  createUnifiedArchiveAttachmentFileResponse,
  type UnifiedArchiveFileActionPurpose,
} from '#/lib/archive/unified-archive-file-actions'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { ROLES } from '#/lib/constants/roles'

const archiveIdSchema = z.uuid()
const fileActionSchema = z.enum(['preview', 'download'])
const attachmentRefSchema = z.string().regex(
  /^(?:workflow-[1-9]\d*|manual-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
)

export const Route = createFileRoute('/api/arsiparis/arsip/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, ROLES.KEPALA_SUB_BAGIAN_UMUM)) {
          return Response.json({ error: 'Akses ditolak' }, { status: 403 })
        }

        const url = new URL(request.url)
        const rawAction = url.searchParams.get('action')
        const rawAttachmentRef = url.searchParams.get('attachmentRef')
        const archiveId = archiveIdSchema.safeParse(params.id)
        if (!archiveId.success) {
          return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })
        }

        if (rawAction !== null || rawAttachmentRef !== null) {
          const action = fileActionSchema.safeParse(rawAction)
          const attachmentRef = attachmentRefSchema.safeParse(rawAttachmentRef)
          if (!action.success || !attachmentRef.success) {
            return Response.json({ error: 'Lampiran arsip tidak ditemukan' }, { status: 404 })
          }

          try {
            return await createUnifiedArchiveAttachmentFileResponse({
              archiveId: archiveId.data,
              attachmentRef: attachmentRef.data,
              purpose: action.data as UnifiedArchiveFileActionPurpose,
            })
          } catch {
            console.error('[arsiparis/arsip/:id] unified file action error')
            return Response.json(
              { error: 'Gagal mengakses file arsip' },
              {
                status: 500,
                headers: { 'Cache-Control': 'no-store' },
              },
            )
          }
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
