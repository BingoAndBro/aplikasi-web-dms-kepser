import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { transitionBerkasArchiveStatus } from '#/lib/archive/berkas-arsip-service'
import { BERKAS_DESTRUCTION_CONFIRMATION_PHRASE } from '#/lib/archive/berkas-arsip-page-format'
import {
  BERKAS_PHYSICAL_DESTRUCTION_CONFIRMATION_PHRASE,
  executeBerkasPhysicalFileDestruction,
  type BerkasPhysicalDestructionReport,
} from '#/lib/archive/berkas-arsip-physical-destruction'
import {
  berkasArsipErrorResponse,
  parseBerkasIdParam,
  requireBerkasArsipApiSession,
  safeBerkasDto,
} from '#/lib/archive/berkas-arsip-api'
import { requireSameOrigin } from '#/lib/security/same-origin'

const nonDestructiveLifecycleBodySchema = z
  .object({
    // RP-01: mark_inactive dibuang; cancel_proposal ditambahkan.
    action: z.enum(['propose_destruction', 'cancel_proposal']),
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
          const physicalDeletion = parsed.data.action === 'approve_destruction'
            ? await executePhysicalDeletionAfterLifecycle(berkasId)
            : undefined

          return Response.json({
            berkas: safeBerkasDto(berkas),
            ...(physicalDeletion ? { physical_deletion: physicalDeletion } : {}),
          })
        } catch (error) {
          return berkasArsipErrorResponse(error)
        }
      },
    },
  },
})

async function executePhysicalDeletionAfterLifecycle(
  berkasId: string,
): Promise<BerkasPhysicalDestructionReport> {
  try {
    return await executeBerkasPhysicalFileDestruction({
      berkasId,
      confirmation: BERKAS_PHYSICAL_DESTRUCTION_CONFIRMATION_PHRASE,
    })
  } catch {
    return failedPhysicalDeletionReport()
  }
}

function failedPhysicalDeletionReport(): BerkasPhysicalDestructionReport {
  return {
    status: 'failed',
    total_items: 0,
    workflow_attachment_candidates: 0,
    manual_attachment_candidates: 0,
    deleted_count: 0,
    already_missing_count: 0,
    skipped_unsafe_count: 0,
    skipped_duplicate_count: 0,
    failed_count: 1,
    physical_deletion_performed: false,
    errors: ['PHYSICAL_FILE_DELETE_FAILED'],
  }
}
