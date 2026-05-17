import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import { masterKelengkapanDokumen } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { transition } from '#/lib/fsm'
import { parseLampiranUrls } from '#/lib/dokumen'
import type { StatusDokumen, TransitionResult } from '#/lib/types/fsm'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

// ---------------------------------------------------------------------------
// POST /api/dokumen/[id]/submit - Submit or Resubmit dokumen
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/$id/submit')({
  ssr: false,
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
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
          lampiran_urls: unknown
          is_non_material: boolean | null
          jenis_permintaan_id: string | null
          kategori_permintaan_id: string | null
          detail_permintaan_id: string | null
          kegiatan_jenis_id: string
          is_ketua_tim: boolean
        }>

        try {
          dokRows = await db
            .select({
              id: dokumenTransaksi.id,
              created_by: dokumenTransaksi.createdBy,
              status: dokumenTransaksi.status,
              revision_target: dokumenTransaksi.revisionTarget,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
              is_non_material: dokumenTransaksi.isNonMaterial,
              jenis_permintaan_id: dokumenTransaksi.jenisPermintaanId,
              kategori_permintaan_id: dokumenTransaksi.kategoriPermintaanId,
              detail_permintaan_id: dokumenTransaksi.detailPermintaanId,
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              is_ketua_tim: dokumenTransaksi.isKetuaTim,
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
        const lampiranUrls = parseLampiranUrls(dok.lampiran_urls)

        let transitionResult: TransitionResult
        let aksi: string

        if (dok.status === 'DRAFT') {
          if (!isNonMaterial) {
            let requiredItems: Array<{ id: string; nama_dokumen: string; required: boolean }>
            try {
              requiredItems = await db
                .select({
                  id: masterKelengkapanDokumen.id,
                  nama_dokumen: masterKelengkapanDokumen.namaDokumen,
                  required: masterKelengkapanDokumen.required,
                })
                .from(masterKelengkapanDokumen)
                .where(and(
                  eq(masterKelengkapanDokumen.kegiatanId, dok.kegiatan_jenis_id),
                  eq(masterKelengkapanDokumen.isKetuaTim, dok.is_ketua_tim),
                ))
            } catch (err) {
              console.error('[API/dokumen/:id/submit] local kelengkapan lookup error:', err)
              return Response.json({ error: 'Gagal memperbarui status dokumen' }, { status: 500 })
            }

            const uploadedIds = lampiranUrls.map(l => l.kelengkapan_id)
            const missing = requiredItems.filter(r => r.required && !uploadedIds.includes(r.id))

            if (missing.length > 0) {
              return Response.json({
                error: `Lampiran wajib belum lengkap: ${missing.map(m => m.nama_dokumen).join(', ')}`,
              }, { status: 400 })
            }
          }

          if (lampiranUrls.length === 0) {
            return Response.json({
              error: 'Minimal upload satu lampiran sebelum mengajukan dokumen',
            }, { status: 400 })
          }

          if (isNonMaterial) {
            transitionResult = {
              success: true,
              newStatus: 'COMPLETED',
              newCurrentStep: null,
              newRevisionTarget: null,
              stepUrutan: 1,
            }
          } else {
            transitionResult = transition(dok.status as StatusDokumen, 'SUBMIT', 'PEGAWAI')
          }
          aksi = 'SUBMIT'
        } else if (dok.status === 'NEED_REVISION' && dok.revision_target === 'USER') {
          if (isNonMaterial) {
            return Response.json({
              error: 'Dokumen Non-Material tidak memerlukan revisi',
            }, { status: 400 })
          }
          transitionResult = transition(dok.status as StatusDokumen, 'RESUBMIT', 'PEGAWAI', dok.revision_target)
          aksi = 'RESUBMIT'
        } else {
          return Response.json({
            error: 'Dokumen tidak bisa disubmit dalam status ini',
          }, { status: 400 })
        }

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
              aksi,
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
