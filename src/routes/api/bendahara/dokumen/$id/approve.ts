import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { approveDokumenSchema } from '#/lib/schemas/dokumen'
import { transition } from '#/lib/fsm'
import type { StatusDokumen } from '#/lib/types/fsm'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

// ---------------------------------------------------------------------------
// POST /api/bendahara/dokumen/[id]/approve
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/bendahara/dokumen/$id/approve')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        if (!hasLocalRole(session, 'BENDAHARA')) {
          return Response.json({ error: 'Akses ditolak — bukan Bendahara' }, { status: 403 })
        }

        let body: unknown = {}
        try { body = await request.json() } catch { /* empty ok */ }
        const parsed = approveDokumenSchema.safeParse(body)
        if (!parsed.success) return Response.json({ error: 'Validasi gagal' }, { status: 400 })

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        let dokRows: Array<{ id: string; status: string }>
        try {
          dokRows = await db
            .select({
              id: dokumenTransaksi.id,
              status: dokumenTransaksi.status,
            })
            .from(dokumenTransaksi)
            .where(eq(dokumenTransaksi.id, params.id))
            .limit(1)
        } catch (err) {
          console.error('[API/bendahara/dokumen/:id/approve] local lookup error:', err)
          return Response.json({ error: 'Gagal memperbarui status dokumen' }, { status: 500 })
        }

        const dok = dokRows[0]
        if (!dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        if (dok.status !== 'IN_BENDAHARA_APPROVAL') return Response.json({ error: 'Dokumen sudah tidak dalam tahap persetujuan' }, { status: 400 })

        // Preserve legacy duplicate approval guard.
        let existingApproveRows: Array<{ id: string }>
        try {
          existingApproveRows = await db
            .select({ id: logAktivitas.id })
            .from(logAktivitas)
            .where(and(
              eq(logAktivitas.dokumenId, params.id),
              eq(logAktivitas.aksi, 'BENDAHARA_APPROVE'),
            ))
            .limit(1)
        } catch (err) {
          console.error('[API/bendahara/dokumen/:id/approve] local audit lookup error:', err)
          return Response.json({ error: 'Gagal memperbarui status dokumen' }, { status: 500 })
        }
        if (existingApproveRows.length > 0) return Response.json({ error: 'Dokumen sudah pernah disetujui' }, { status: 400 })

        const result = transition(dok.status as StatusDokumen, 'APPROVE', 'BENDAHARA')
        if (!result.success) return Response.json({ error: result.error ?? 'Transisi gagal' }, { status: 400 })

        try {
          await db.transaction(async (tx) => {
            const updatedRows = await tx
              .update(dokumenTransaksi)
              .set({
                status: result.newStatus,
                currentStep: result.newCurrentStep,
                revisionTarget: result.newRevisionTarget,
                revisionNotes: null,
                updatedAt: new Date(),
              })
              .where(eq(dokumenTransaksi.id, params.id))
              .returning({ id: dokumenTransaksi.id })

            if (updatedRows.length === 0) {
              throw new Error('DOCUMENT_STATUS_UPDATE_NOT_FOUND')
            }

            await tx.insert(logAktivitas).values({
              dokumenId: params.id,
              userId: session.user.id,
              aksi: 'BENDAHARA_APPROVE',
              stepUrutan: result.stepUrutan ?? 2,
            })
          })
        } catch (err) {
          console.error('[API/bendahara/dokumen/:id/approve] local transaction error:', err)
          return Response.json({ error: 'Gagal memperbarui status dokumen' }, { status: 500 })
        }

        return Response.json({ success: true, message: 'Dokumen disetujui', redirectTo: '/bendahara/selesai' })
      },
    },
  },
})
