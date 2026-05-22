import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db/client'
import { arsip } from '#/db/schema/arsip'
import type { LampiranSnapshotJson } from '#/db/schema/arsip'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { ROLES } from '#/lib/constants/roles'
import { transition } from '#/lib/fsm'
import type { StatusDokumen } from '#/lib/types/fsm'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

// ---------------------------------------------------------------------------
// POST /api/arsiparis/dokumen/[id]/archive - arsipkan dokumen
// ---------------------------------------------------------------------------

const RETENSI_OPTIONS = ['1 Tahun', '3 Tahun', '5 Tahun', '10 Tahun', 'Permanen'] as const

export const Route = createFileRoute('/api/arsiparis/dokumen/$id/archive')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        if (!hasLocalRole(session, ROLES.KEPALA_SUB_BAGIAN_UMUM)) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Body tidak valid' }, { status: 400 })

        const schema = z.object({
          nomor_surat: z.string().min(1, 'Nomor surat wajib diisi'),
          klasifikasi: z.string().min(1, 'Klasifikasi wajib diisi'),
          retensi_aktif: z.enum(RETENSI_OPTIONS, { message: 'Retensi aktif tidak valid' }),
          retensi_inaktif: z.enum(RETENSI_OPTIONS, { message: 'Retensi inaktif tidak valid' }),
          masa_aktif_berakhir: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
          masa_inaktif_berakhir: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
          catatan_arsiparis: z.string().optional(),
        })

        const parsed = schema.safeParse(body)
        if (!parsed.success) {
          return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
        }

        const data = parsed.data

        if (!isUuid(params.id)) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        let dokRows: Array<{
          id: string
          status: string
          nominal_realisasi: string | null
          lampiran_urls: unknown
        }>
        try {
          dokRows = await db
            .select({
              id: dokumenTransaksi.id,
              status: dokumenTransaksi.status,
              nominal_realisasi: dokumenTransaksi.nominalRealisasi,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
            })
            .from(dokumenTransaksi)
            .where(eq(dokumenTransaksi.id, params.id))
            .limit(1)
        } catch (err) {
          console.error('[archive] dokumen lookup error:', err)
          return Response.json({ error: 'Gagal mengarsipkan dokumen' }, { status: 500 })
        }

        const dok = dokRows[0]
        if (!dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        if (dok.status !== 'COMPLETED') return Response.json({ error: 'Dokumen belum berada di tahap final' }, { status: 400 })

        let existingArsipRows: Array<{ id: string }>
        try {
          existingArsipRows = await db
            .select({ id: arsip.id })
            .from(arsip)
            .where(eq(arsip.dokumenId, params.id))
            .limit(1)
        } catch (err) {
          console.error('[archive] existing arsip lookup error:', err)
          return Response.json({ error: 'Gagal mengarsipkan dokumen' }, { status: 500 })
        }

        if (existingArsipRows.length > 0) return Response.json({ error: 'Dokumen sudah diarsipkan' }, { status: 400 })

        let lampiranSnapshot: LampiranSnapshotJson = []
        if (dok.lampiran_urls) {
          if (typeof dok.lampiran_urls === 'string') {
            lampiranSnapshot = JSON.parse(dok.lampiran_urls) as LampiranSnapshotJson
          } else {
            lampiranSnapshot = Array.isArray(dok.lampiran_urls)
              ? dok.lampiran_urls as LampiranSnapshotJson
              : []
          }
        }

        const fsResult = transition(dok.status as StatusDokumen, 'ARCHIVE', ROLES.KEPALA_SUB_BAGIAN_UMUM)
        if (!fsResult.success) {
          return Response.json({ error: fsResult.error ?? 'Transisi status gagal' }, { status: 400 })
        }

        try {
          await db.transaction(async (tx) => {
            await tx.insert(arsip).values({
              dokumenId: params.id,
              nomorSurat: data.nomor_surat,
              klasifikasi: data.klasifikasi,
              retensiAktif: data.retensi_aktif,
              retensiInaktif: data.retensi_inaktif,
              masaAktifBerakhir: data.masa_aktif_berakhir,
              masaInaktifBerakhir: data.masa_inaktif_berakhir,
              catatanArsiparis: data.catatan_arsiparis ?? null,
              archivedBy: session.user.id,
              statusArsip: 'AKTIF',
              lampiranSnapshot,
              nominalRealisasi: dok.nominal_realisasi ?? null,
            })

            const updatedRows = await tx
              .update(dokumenTransaksi)
              .set({
                status: fsResult.newStatus,
                currentStep: fsResult.newCurrentStep,
                revisionTarget: fsResult.newRevisionTarget,
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
              aksi: 'ARCHIVE',
              catatan: data.catatan_arsiparis ?? null,
              stepUrutan: null,
            })
          })
        } catch (err) {
          console.error('[archive] local transaction error:', err)
          return Response.json({ error: 'Gagal mengarsipkan dokumen' }, { status: 500 })
        }

        return Response.json({ success: true, message: 'Dokumen berhasil diarsipkan' })
      },
    },
  },
})
