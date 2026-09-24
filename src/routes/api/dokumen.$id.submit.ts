import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { transition } from '#/lib/fsm'
import type { StatusDokumen } from '#/lib/types/fsm'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

// ---------------------------------------------------------------------------
// POST /api/dokumen/[id]/submit - Resubmit dokumen after PPK rejection (revision_target=USER)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/$id/submit')({
  ssr: false,
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!hasLocalRole(session, 'PEGAWAI')) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        let dokRows: Array<{
          id: string
          created_by: string
          status: string
          revision_target: string | null
          is_non_material: boolean | null
          jenis_permintaan_id: string | null
          kategori_permintaan_id: string | null
          detail_permintaan_id: string | null
        }>

        try {
          dokRows = await db
            .select({
              id: dokumenTransaksi.id,
              created_by: dokumenTransaksi.createdBy,
              status: dokumenTransaksi.status,
              revision_target: dokumenTransaksi.revisionTarget,
              is_non_material: dokumenTransaksi.isNonMaterial,
              jenis_permintaan_id: dokumenTransaksi.jenisPermintaanId,
              kategori_permintaan_id: dokumenTransaksi.kategoriPermintaanId,
              detail_permintaan_id: dokumenTransaksi.detailPermintaanId,
            })
            .from(dokumenTransaksi)
            .where(eq(dokumenTransaksi.id, params.id))
            .limit(1)
        } catch (err) {
          console.error('[API/dokumen/:id/submit] local lookup error:', err)
          return Response.json({ error: 'Gagal memperbarui status dokumen' }, { status: 500 })
        }

        const dok = dokRows[0]
        if (!dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        if (dok.created_by !== session.user.id) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        const isNonMaterial = dok.is_non_material === true ||
          (dok.is_non_material == null && !dok.jenis_permintaan_id && !dok.kategori_permintaan_id && !dok.detail_permintaan_id)

        // Only the revision path lives here; new submissions go through
        // POST /api/dokumen/submit (combined create + submit).
        if (dok.status !== 'NEED_REVISION' || dok.revision_target !== 'USER') {
          return Response.json({
            error: 'Dokumen tidak bisa disubmit dalam status ini',
          }, { status: 400 })
        }

        if (isNonMaterial) {
          return Response.json({
            error: 'Dokumen Non-Material tidak memerlukan revisi',
          }, { status: 400 })
        }

        const transitionResult = transition(dok.status as StatusDokumen, 'RESUBMIT', 'PEGAWAI', dok.revision_target)

        if (!transitionResult.success) {
          return Response.json({ error: transitionResult.error || 'Transisi status gagal' }, { status: 400 })
        }

        try {
          await db.transaction(async (tx) => {
            const updatedRows = await tx
              .update(dokumenTransaksi)
              .set({
                status: transitionResult.newStatus,
                currentStep: transitionResult.newCurrentStep,
                revisionTarget: transitionResult.newRevisionTarget,
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
              aksi: 'RESUBMIT',
              stepUrutan: transitionResult.stepUrutan,
            })
          })
        } catch (err) {
          console.error('[API/dokumen/:id/submit] local submit error:', err)
          return Response.json({ error: 'Gagal memperbarui status dokumen' }, { status: 500 })
        }

        return Response.json({ success: true })
      },
    },
  },
})
