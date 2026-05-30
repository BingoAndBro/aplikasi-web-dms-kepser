import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { transitionBerkasArchiveStatus } from '#/lib/archive/berkas-arsip-service'
import {
  berkasArsipErrorResponse,
  parseBerkasIdParam,
  requireBerkasArsipApiSession,
  safeBerkasDto,
} from '#/lib/archive/berkas-arsip-api'
import { requireSameOrigin } from '#/lib/security/same-origin'

const lifecycleBodySchema = z
  .object({
    action: z.enum(['mark_inactive', 'propose_destruction', 'approve_destruction']),
  })
  .strict()

export const Route = createFileRoute('/api/arsiparis/berkas/$id/lifecycle')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const sessionOrResponse = await requireBerkasArsipApiSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        const berkasId = parseBerkasIdParam(params.id)
        if (berkasId instanceof Response) return berkasId

        const parsed = lifecycleBodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          return Response.json({ error: 'Aksi lifecycle berkas tidak valid' }, { status: 400 })
        }

        try {
          const berkas = await transitionBerkasArchiveStatus({
            berkasId,
            actorUserId: sessionOrResponse.user.id,
            action: parsed.data.action,
          })

          return Response.json({ berkas: safeBerkasDto(berkas) })
        } catch (error) {
          return berkasArsipErrorResponse(error)
        }
      },
    },
  },
})
