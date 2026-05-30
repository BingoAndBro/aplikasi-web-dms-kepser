import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { transitionBerkasArchiveStatus } from '#/lib/archive/berkas-arsip-service'
import { BERKAS_DESTRUCTION_CONFIRMATION_PHRASE } from '#/lib/archive/berkas-arsip-page-format'
import {
  berkasArsipErrorResponse,
  parseBerkasIdParam,
  requireBerkasArsipApiSession,
  safeBerkasDto,
} from '#/lib/archive/berkas-arsip-api'
import { requireSameOrigin } from '#/lib/security/same-origin'

const nonDestructiveLifecycleBodySchema = z
  .object({
    action: z.enum(['mark_inactive', 'propose_destruction']),
  })
  .strict()
const approveDestructionLifecycleBodySchema = z
  .object({
    action: z.literal('approve_destruction'),
    confirmation: z.literal(BERKAS_DESTRUCTION_CONFIRMATION_PHRASE),
  })
  .strict()
const lifecycleBodySchema = z.discriminatedUnion('action', [
  nonDestructiveLifecycleBodySchema,
  approveDestructionLifecycleBodySchema,
])

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
