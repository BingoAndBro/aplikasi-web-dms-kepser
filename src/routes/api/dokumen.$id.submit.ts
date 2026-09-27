import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { transition } from '#/lib/fsm'
import type { StatusDokumen } from '#/lib/types/fsm'
import { parseLampiranUrls } from '#/lib/dokumen'
import { validateResubmitRequirements } from '#/lib/dokumen/resubmit-validation'
import {
  DokumenTransitionConflictError,
  dokumenTransitionConflictResponse,
} from '#/lib/dokumen/transition-conflict'

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
          kegiatan_jenis_id: string
          is_ketua_tim: boolean
          lampiran_urls: unknown
          nominal_realisasi: string | null
          komponen_id: string | null
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
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              is_ketua_tim: dokumenTransaksi.isKetuaTim,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
              nominal_realisasi: dokumenTransaksi.nominalRealisasi,
              komponen_id: dokumenTransaksi.komponenId,
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

        // Same content rules as the initial SUBMIT (nominal > 0, exact-match
        // required kelengkapan), checked on the revised lampiran/nominal.
        let requirements: Awaited<ReturnType<typeof validateResubmitRequirements>>
        try {
          requirements = await validateResubmitRequirements({
            dokumen: {
              isNonMaterial,
              kegiatanId: dok.kegiatan_jenis_id,
              isKetuaTim: dok.is_ketua_tim,
              komponenId: dok.komponen_id,
              jenisPermintaanId: dok.jenis_permintaan_id,
              kategoriPermintaanId: dok.kategori_permintaan_id,
              detailPermintaanId: dok.detail_permintaan_id,
            },
            lampiranUrls: parseLampiranUrls(dok.lampiran_urls),
            nominalRealisasi: dok.nominal_realisasi,
          })
        } catch (err) {
          console.error('[API/dokumen/:id/submit] local requirement lookup error:', err)
          return Response.json({ error: 'Gagal memperbarui status dokumen' }, { status: 500 })
        }

        if (!requirements.ok) {
          return Response.json({ error: requirements.error }, { status: 400 })
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
              .where(and(
                eq(dokumenTransaksi.id, params.id),
                eq(dokumenTransaksi.status, 'NEED_REVISION'),
                eq(dokumenTransaksi.revisionTarget, 'USER'),
              ))
              .returning({ id: dokumenTransaksi.id })

            if (updatedRows.length === 0) {
              throw new DokumenTransitionConflictError()
            }

            await tx.insert(logAktivitas).values({
              dokumenId: params.id,
              userId: session.user.id,
              aksi: 'RESUBMIT',
              stepUrutan: transitionResult.stepUrutan,
            })
          })
        } catch (err) {
          if (err instanceof DokumenTransitionConflictError) return dokumenTransitionConflictResponse()
          console.error('[API/dokumen/:id/submit] local submit error:', err)
          return Response.json({ error: 'Gagal memperbarui status dokumen' }, { status: 500 })
        }

        return Response.json({ success: true })
      },
    },
  },
})
