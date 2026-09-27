import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { transition } from '#/lib/fsm'
import type { StatusDokumen } from '#/lib/types/fsm'
import {
  DokumenTransitionConflictError,
  dokumenTransitionConflictResponse,
} from '#/lib/dokumen/transition-conflict'

const KEMBALIKAN_CATATAN = 'Dikembalikan ke pegawai oleh PPK'

// The document is in NEED_REVISION/PPK only after a PPSPM rejection, so its
// revision_notes still hold the PPSPM reason. Keep it in the automatic note so
// the Pegawai reads the original reason, not just "returned by PPK".
function buildKembalikanRevisionNotes(ppspmNotes: string | null): string {
  const reason = ppspmNotes?.trim()
  if (!reason) return KEMBALIKAN_CATATAN
  return `${KEMBALIKAN_CATATAN}. Alasan penolakan PPSPM: ${reason}`
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

// ---------------------------------------------------------------------------
// POST /api/ppk/kembalikan/[id] - Return document to Pegawai
// Transitions from NEED_REVISION (target=PPK) back to Pegawai for revision
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ppk/kembalikan/$id')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        if (!hasLocalRole(session, 'PPK')) {
          return Response.json({ error: 'Akses ditolak — bukan PPK' }, { status: 403 })
        }

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        let dokRows: Array<{
          id: string
          status: string
          revision_target: string | null
          revision_notes: string | null
        }>
        try {
          dokRows = await db
            .select({
              id: dokumenTransaksi.id,
              status: dokumenTransaksi.status,
              revision_target: dokumenTransaksi.revisionTarget,
              revision_notes: dokumenTransaksi.revisionNotes,
            })
            .from(dokumenTransaksi)
            .where(eq(dokumenTransaksi.id, params.id))
            .limit(1)
        } catch (err) {
          console.error('[API/ppk/kembalikan/:id] local lookup error:', err)
          return Response.json({ error: 'Gagal memperbarui status dokumen' }, { status: 500 })
        }

        const dok = dokRows[0]
        if (!dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        if (dok.status !== 'NEED_REVISION' || dok.revision_target !== 'PPK') {
          return Response.json({ error: 'Dokumen ini tidak dalam status revisi PPK' }, { status: 400 })
        }

        // FSM transition: NEED_REVISION:KEMBALIKAN with target=USER
        // Returns document to Pegawai for revision (from revision page)
        const result = transition(dok.status as StatusDokumen, 'KEMBALIKAN', 'PPK', 'USER')
        if (!result.success) return Response.json({ error: result.error || 'Transisi gagal' }, { status: 400 })

        const revisionNotes = buildKembalikanRevisionNotes(dok.revision_notes)

        try {
          await db.transaction(async (tx) => {
            const updatedRows = await tx
              .update(dokumenTransaksi)
              .set({
                status: result.newStatus,
                currentStep: result.newCurrentStep,
                revisionTarget: result.newRevisionTarget,
                revisionNotes,
                updatedAt: new Date(),
              })
              .where(and(
                eq(dokumenTransaksi.id, params.id),
                eq(dokumenTransaksi.status, 'NEED_REVISION'),
                eq(dokumenTransaksi.revisionTarget, 'PPK'),
              ))
              .returning({ id: dokumenTransaksi.id })

            if (updatedRows.length === 0) {
              throw new DokumenTransitionConflictError()
            }

            await tx.insert(logAktivitas).values({
              dokumenId: params.id,
              userId: session.user.id,
              aksi: 'PPK_KEMBALIKAN',
              catatan: KEMBALIKAN_CATATAN,
              stepUrutan: result.stepUrutan ?? 1,
            })
          })
        } catch (err) {
          if (err instanceof DokumenTransitionConflictError) return dokumenTransitionConflictResponse()
          console.error('[API/ppk/kembalikan/:id] local transaction error:', err)
          return Response.json({ error: 'Gagal memperbarui status dokumen' }, { status: 500 })
        }

        return Response.json({ success: true })
      },
    },
  },
})
