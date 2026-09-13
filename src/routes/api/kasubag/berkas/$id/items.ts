import { createFileRoute } from '@tanstack/react-router'
import {
  addManualDocumentToOpenBerkas,
  addWorkflowDocumentToOpenBerkas,
} from '#/lib/archive/berkas-arsip-service'
import {
  berkasArsipErrorResponse,
  parseBerkasIdParam,
  requireBerkasArsipApiSession,
  safeBerkasItemDto,
} from '#/lib/archive/berkas-arsip-api'
import { addBerkasItemRequestSchema } from '#/lib/schemas/berkas-arsip'
import { requireSameOrigin } from '#/lib/security/same-origin'

export const Route = createFileRoute('/api/arsiparis/berkas/$id/items')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const sessionOrResponse = await requireBerkasArsipApiSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        const berkasId = parseBerkasIdParam(params.id)
        if (berkasId instanceof Response) return berkasId

        const parsed = addBerkasItemRequestSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.issues[0]?.message ?? 'Body item berkas tidak valid' },
            { status: 400 },
          )
        }

        try {
          const item = parsed.data.source_type === 'WORKFLOW'
            ? await addWorkflowDocumentToOpenBerkas({
              berkasId,
              dokumenId: parsed.data.dokumen_id,
              actorUserId: sessionOrResponse.user.id,
            })
            : await addManualDocumentToOpenBerkas({
              berkasId,
              manualArsipId: parsed.data.manual_arsip_id,
              actorUserId: sessionOrResponse.user.id,
            })

          return Response.json({ item: safeBerkasItemDto(item) }, { status: 201 })
        } catch (error) {
          return berkasArsipErrorResponse(error)
        }
      },
    },
  },
})
