import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '#/db/client'
import { arsip, manualArsip } from '#/db/schema/arsip'
import {
  planUnifiedArchiveLifecycleTransition,
  type UnifiedArchiveLifecycleRejectReason,
} from '#/lib/archive/unified-archive-lifecycle'
import { ROLES } from '#/lib/constants/roles'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { requireSameOrigin } from '#/lib/security/same-origin'

const archiveIdSchema = z.uuid()
const destructionConfirmationPhrase = 'SETUJUI PEMUSNAHAN ARSIP'
const nonDestructiveLifecycleBodySchema = z.object({
  action: z.enum(['mark_inactive', 'propose_destruction']),
  reason: z.string().trim().max(1000).optional(),
}).strict()
const approveDestructionLifecycleBodySchema = z.object({
  action: z.literal('approve_destruction'),
  confirmation: z.literal(destructionConfirmationPhrase),
  reason: z.string().trim().min(1).max(1000),
}).strict()
const lifecycleBodySchema = z.discriminatedUnion('action', [
  nonDestructiveLifecycleBodySchema,
  approveDestructionLifecycleBodySchema,
])

type CanonicalArchiveRow = {
  id: string
  statusArsip: string
  sourceType: string
}

type ManualSourceRow = {
  id: string
  statusArsip: string
}

class LifecycleConflictError extends Error {
  constructor() {
    super('LIFECYCLE_GUARDED_UPDATE_CONFLICT')
  }
}

export const Route = createFileRoute('/api/arsiparis/arsip/$id/lifecycle')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, ROLES.KEPALA_SUB_BAGIAN_UMUM)) {
          return Response.json({ error: 'Akses ditolak' }, { status: 403 })
        }

        const archiveId = archiveIdSchema.safeParse(params.id)
        if (!archiveId.success) {
          return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })
        }

        const body = lifecycleBodySchema.safeParse(await request.json().catch(() => null))
        if (!body.success) {
          return Response.json({ error: 'Aksi lifecycle arsip tidak valid.' }, { status: 400 })
        }

        let canonical: CanonicalArchiveRow | undefined
        try {
          canonical = await loadCanonicalArchive(archiveId.data)
        } catch {
          console.error('[arsiparis/arsip/:id/lifecycle] canonical lookup error')
          return Response.json({ error: 'Gagal mengubah lifecycle arsip' }, { status: 500 })
        }

        if (!canonical) {
          return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })
        }

        let manualSource: ManualSourceRow | undefined
        if (canonical.sourceType === 'MANUAL') {
          try {
            manualSource = await loadManualSourceArchive(archiveId.data)
          } catch {
            console.error('[arsiparis/arsip/:id/lifecycle] manual source lookup error')
            return Response.json({ error: 'Gagal mengubah lifecycle arsip' }, { status: 500 })
          }
        }

        const plan = planUnifiedArchiveLifecycleTransition({
          action: body.data.action,
          currentStatus: canonical.statusArsip,
          sourceType: canonical.sourceType,
          manualSourceStatus: manualSource?.statusArsip,
        })

        if (plan.status === 'rejected') {
          return Response.json(
            { error: plan.message },
            { status: statusForRejectedPlan(plan.reason) },
          )
        }

        if (
          plan.action === 'approve_destruction'
          && (
            plan.fromStatus !== 'USUL_MUSNAH'
            || plan.toStatus !== 'DIMUSNAHKAN'
            || plan.fileDeletion !== false
          )
        ) {
          return Response.json({ error: 'Perubahan status arsip tidak diizinkan.' }, { status: 409 })
        }

        if (
          plan.action !== 'mark_inactive'
          && plan.action !== 'propose_destruction'
          && plan.action !== 'approve_destruction'
        ) {
          return Response.json({ error: 'Aksi lifecycle arsip tidak valid.' }, { status: 400 })
        }

        try {
          await db.transaction(async (tx) => {
            const canonicalUpdated = await tx
              .update(arsip)
              .set({ statusArsip: plan.toStatus })
              .where(and(
                eq(arsip.id, archiveId.data),
                eq(arsip.statusArsip, plan.fromStatus),
                eq(arsip.sourceType, plan.sourceType),
              ))
              .returning({ id: arsip.id })

            if (canonicalUpdated.length === 0) throw new LifecycleConflictError()

            if (plan.sourceType === 'MANUAL') {
              const manualUpdated = await tx
                .update(manualArsip)
                .set({ statusArsip: plan.toStatus })
                .where(and(
                  eq(manualArsip.id, manualSource?.id ?? ''),
                  eq(manualArsip.canonicalArsipId, archiveId.data),
                  eq(manualArsip.statusArsip, plan.fromStatus),
                ))
                .returning({ id: manualArsip.id })

              if (manualUpdated.length === 0) throw new LifecycleConflictError()
            }
          })
        } catch (error) {
          if (error instanceof LifecycleConflictError) {
            return Response.json({ error: 'Status arsip berubah. Muat ulang data dan coba lagi.' }, { status: 409 })
          }

          console.error('[arsiparis/arsip/:id/lifecycle] transaction error')
          return Response.json({ error: 'Gagal mengubah lifecycle arsip' }, { status: 500 })
        }

        return Response.json({
          ok: true,
          archiveId: archiveId.data,
          fromStatus: plan.fromStatus,
          toStatus: plan.toStatus,
          sourceType: plan.sourceType,
        })
      },
    },
  },
})

async function loadCanonicalArchive(archiveId: string): Promise<CanonicalArchiveRow | undefined> {
  const rows = await db
    .select({
      id: arsip.id,
      statusArsip: arsip.statusArsip,
      sourceType: arsip.sourceType,
    })
    .from(arsip)
    .where(eq(arsip.id, archiveId))
    .limit(1)

  return rows[0]
}

async function loadManualSourceArchive(archiveId: string): Promise<ManualSourceRow | undefined> {
  const rows = await db
    .select({
      id: manualArsip.id,
      statusArsip: manualArsip.statusArsip,
    })
    .from(manualArsip)
    .where(eq(manualArsip.canonicalArsipId, archiveId))
    .limit(1)

  return rows[0]
}

function statusForRejectedPlan(reason: UnifiedArchiveLifecycleRejectReason): number {
  if (reason === 'ARCHIVE_NOT_FOUND') return 404
  if (reason === 'INVALID_ACTION') return 400
  return 409
}
