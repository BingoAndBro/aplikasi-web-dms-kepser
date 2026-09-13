import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { createBerkasArsipItemAttachmentFileResponse } from '#/lib/archive/berkas-arsip-file-access'
import {
  parseBerkasIdParam,
  requireBerkasArsipApiSession,
} from '#/lib/archive/berkas-arsip-api'

const uuidParamSchema = z.uuid()
const lampiranIndexSchema = z.coerce.number().int().min(0)

export const Route = createFileRoute('/api/kasubag/berkas/$id/items/$itemId/download/$lampiranIndex')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sessionOrResponse = await requireBerkasArsipApiSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        const parsed = parseFileAccessParams(params)
        if (parsed instanceof Response) return parsed

        try {
          return await createBerkasArsipItemAttachmentFileResponse({
            ...parsed,
            purpose: 'download',
          })
        } catch {
          console.error('[arsiparis/berkas/:id/items/:itemId/download/:lampiranIndex] file access error')
          return Response.json(
            { error: 'Gagal mengakses file berkas' },
            {
              status: 500,
              headers: { 'Cache-Control': 'no-store' },
            },
          )
        }
      },
    },
  },
})

function parseFileAccessParams(params: Record<string, string>): {
  berkasId: string
  itemId: string
  lampiranIndex: number
} | Response {
  const berkasId = parseBerkasIdParam(params.id)
  if (berkasId instanceof Response) return berkasId

  const itemId = uuidParamSchema.safeParse(params.itemId)
  if (!itemId.success) {
    return Response.json({ error: 'Lampiran berkas tidak ditemukan' }, { status: 404 })
  }

  const lampiranIndex = lampiranIndexSchema.safeParse(params.lampiranIndex)
  if (!lampiranIndex.success) {
    return Response.json({ error: 'Lampiran berkas tidak ditemukan' }, { status: 404 })
  }

  return {
    berkasId,
    itemId: itemId.data,
    lampiranIndex: lampiranIndex.data,
  }
}
