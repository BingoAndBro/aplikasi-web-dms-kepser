import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { rejectDokumenSchema } from '#/lib/schemas/dokumen'
import { transition } from '#/lib/fsm'
import type { StatusDokumen } from '#/lib/types/fsm'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

// ---------------------------------------------------------------------------
// POST /api/bendahara/dokumen/[id]/reject
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/bendahara/dokumen/$id/reject')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        if (!hasLocalRole(session, 'BENDAHARA')) {
          return Response.json({ error: 'Akses ditolak - bukan PPSPM' }, { status: 403 })
        }

        let body: unknown
        try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
        const parsed = rejectDokumenSchema.safeParse(body)
        if (!parsed.success) return Response.json({ error: 'Validasi gagal', details: parsed.error.flatten() }, { status: 400 })

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
          console.error('[API/bendahara/dokumen/:id/reject] local lookup error:', err)
          return Response.json({ error: 'Gagal memperbarui status dokumen' }, { status: 500 })
        }

        const dok = dokRows[0]
        if (!dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        // Idempotency: if the document is no longer at Bendahara, preserve the
        // legacy "already actioned" response only when a Bendahara action exists.
        if (dok.status !== 'IN_BENDAHARA_APPROVAL') {
          let existingActionRows: Array<{ id: string }>
          try {
            existingActionRows = await db
              .select({ id: logAktivitas.id })
              .from(logAktivitas)
              .where(and(
                eq(logAktivitas.dokumenId, params.id),
                inArray(logAktivitas.aksi, ['BENDAHARA_APPROVE', 'BENDAHARA_REJECT']),
              ))
              .limit(1)
          } catch (err) {
            console.error('[API/bendahara/dokumen/:id/reject] local audit lookup error:', err)
            return Response.json({ error: 'Gagal memperbarui status dokumen' }, { status: 500 })
          }

          if (existingActionRows.length > 0) return Response.json({ error: 'Dokumen sudah pernah diaksi oleh PPSPM' }, { status: 400 })
          return Response.json({ error: 'Dokumen sudah tidak dalam tahap persetujuan' }, { status: 400 })
        }

        const result = transition(dok.status as StatusDokumen, 'REJECT', 'BENDAHARA', 'PPK')
        if (!result.success) return Response.json({ error: result.error ?? 'Transisi gagal' }, { status: 400 })

        try {
          await db.transaction(async (tx) => {
            const updatedRows = await tx
              .update(dokumenTransaksi)
              .set({
                status: result.newStatus,
                currentStep: result.newCurrentStep,
                revisionTarget: result.newRevisionTarget,
                revisionNotes: parsed.data.catatan,
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
              aksi: 'BENDAHARA_REJECT',
              catatan: parsed.data.catatan,
              stepUrutan: result.stepUrutan ?? 1,
            })
          })
        } catch (err) {
          console.error('[API/bendahara/dokumen/:id/reject] local transaction error:', err)
          return Response.json({ error: 'Gagal memperbarui status dokumen' }, { status: 500 })
        }

        return Response.json({ success: true, message: 'Dokumen dikembalikan ke PPK', redirectTo: '/bendahara/ditolak' })
      },
    },
  },
})
