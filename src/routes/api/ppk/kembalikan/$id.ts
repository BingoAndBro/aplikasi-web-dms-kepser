import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { transition } from '#/lib/fsm'
import type { StatusDokumen } from '#/lib/types/fsm'

const KEMBALIKAN_CATATAN = 'Dikembalikan ke pegawai oleh PPK'

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
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        if (!hasLocalRole(session, 'PPK')) {
          return Response.json({ error: 'Akses ditolak — bukan PPK' }, { status: 403 })
        }

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        let dokRows: Array<{ id: string; status: string; revision_target: string | null }>
        try {
          dokRows = await db
            .select({
              id: dokumenTransaksi.id,
              status: dokumenTransaksi.status,
              revision_target: dokumenTransaksi.revisionTarget,
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

        try {
          await db.transaction(async (tx) => {
            const updatedRows = await tx
              .update(dokumenTransaksi)
              .set({
                status: result.newStatus,
                currentStep: result.newCurrentStep,
                revisionTarget: result.newRevisionTarget,
                revisionNotes: KEMBALIKAN_CATATAN,
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
              aksi: 'PPK_KEMBALIKAN',
              catatan: KEMBALIKAN_CATATAN,
              stepUrutan: result.stepUrutan ?? 1,
            })
          })
        } catch (err) {
          console.error('[API/ppk/kembalikan/:id] local transaction error:', err)
          return Response.json({ error: 'Gagal memperbarui status dokumen' }, { status: 500 })
        }

        return Response.json({ success: true })
      },
    },
  },
})
