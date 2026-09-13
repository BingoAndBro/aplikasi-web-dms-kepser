import { createFileRoute } from '@tanstack/react-router'
import { closeBerkasArsip } from '#/lib/archive/berkas-arsip-service'
import {
  berkasArsipErrorResponse,
  parseBerkasIdParam,
  requireBerkasArsipApiSession,
  safeBerkasDto,
} from '#/lib/archive/berkas-arsip-api'
import { closeBerkasMetadataSchema } from '#/lib/schemas/berkas-arsip'
import { requireSameOrigin } from '#/lib/security/same-origin'

export const Route = createFileRoute('/api/kasubag/berkas/$id/close')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const sessionOrResponse = await requireBerkasArsipApiSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        const berkasId = parseBerkasIdParam(params.id)
        if (berkasId instanceof Response) return berkasId

        const parsed = closeBerkasMetadataSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.issues[0]?.message ?? 'Metadata tutup berkas tidak valid' },
            { status: 400 },
          )
        }

        try {
          const berkas = await closeBerkasArsip({
            berkasId,
            actorUserId: sessionOrResponse.user.id,
            metadata: parsed.data,
          })

          return Response.json({ berkas: safeBerkasDto(berkas) })
        } catch (error) {
          return berkasArsipErrorResponse(error)
        }
      },
    },
  },
})
