import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db/client'
import {
  arsip,
  berkasArsip,
  berkasArsipItem,
  masterKlasifikasiArsip,
} from '#/db/schema/arsip'
import type { LampiranSnapshotJson } from '#/db/schema/arsip'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import { masterJenisDokumen, masterKegiatan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import {
  addWorkflowDocumentToOpenBerkas,
  BerkasArsipServiceError,
  getOrCreateOpenBerkasForKlasifikasi,
  type BerkasArsipRepository,
} from '#/lib/archive/berkas-arsip-service'
import { deriveWorkflowNamaArsip } from '#/lib/archive/workflow-nama-arsip'
import { ARCHIVE_SOURCE_TYPE, BERKAS_STATUS } from '#/lib/constants/archive-status'
import { ROLES } from '#/lib/constants/roles'
import { transition } from '#/lib/fsm'
import type { StatusDokumen } from '#/lib/types/fsm'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function toSafeErrorLog(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') return { type: typeof error }

  const candidate = error as {
    code?: unknown
    name?: unknown
  }

  return {
    name: typeof candidate.name === 'string' ? candidate.name : undefined,
    code: typeof candidate.code === 'string' ? candidate.code : undefined,
  }
}

// ---------------------------------------------------------------------------
// POST /api/arsiparis/dokumen/[id]/archive - transitional document classification write
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
          nomor_surat: z.string().trim().optional(),
          klasifikasi_id: z.string({ error: 'Jenis pembayaran wajib dipilih' }).uuid('Jenis pembayaran tidak valid'),
          klasifikasi: z.string().optional(),
          retensi_aktif: z.enum(RETENSI_OPTIONS, { message: 'Retensi aktif tidak valid' }).optional(),
          retensi_inaktif: z.enum(RETENSI_OPTIONS, { message: 'Retensi inaktif tidak valid' }).optional(),
          masa_aktif_berakhir: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD').optional(),
          masa_inaktif_berakhir: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD').optional(),
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
          judul: string | null
          status: string
          created_by: string | null
          jenis_dokumen_nama: string | null
          kegiatan_nama: string | null
          nominal_realisasi: string | null
          lampiran_urls: unknown
        }>
        try {
          dokRows = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              status: dokumenTransaksi.status,
              created_by: dokumenTransaksi.createdBy,
              jenis_dokumen_nama: masterJenisDokumen.nama,
              kegiatan_nama: masterKegiatan.nama,
              nominal_realisasi: dokumenTransaksi.nominalRealisasi,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterJenisDokumen, eq(dokumenTransaksi.jenisDokumenId, masterJenisDokumen.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .where(eq(dokumenTransaksi.id, params.id))
            .limit(1)
        } catch (err) {
          console.error('[archive] dokumen lookup error:', toSafeErrorLog(err))
          return Response.json({ error: 'Gagal mengarsipkan dokumen' }, { status: 500 })
        }

        const dok = dokRows[0]
        if (!dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        if (dok.status !== 'COMPLETED') return Response.json({ error: 'Dokumen belum berada di tahap final' }, { status: 400 })
        if (!dok.created_by) return Response.json({ error: 'Gagal mengarsipkan dokumen' }, { status: 500 })

        let existingArsipRows: Array<{ id: string }>
        try {
          existingArsipRows = await db
            .select({ id: arsip.id })
            .from(arsip)
            .where(eq(arsip.dokumenId, params.id))
            .limit(1)
        } catch (err) {
          console.error('[archive] existing arsip lookup error:', toSafeErrorLog(err))
          return Response.json({ error: 'Gagal mengarsipkan dokumen' }, { status: 500 })
        }

        if (existingArsipRows.length > 0) return Response.json({ error: 'Dokumen sudah diarsipkan' }, { status: 400 })

        let klasifikasiRows: Array<{
          id: string
          kode: string | null
          nama: string
        }>
        try {
          klasifikasiRows = await db
            .select({
              id: masterKlasifikasiArsip.id,
              kode: masterKlasifikasiArsip.kode,
              nama: masterKlasifikasiArsip.nama,
            })
            .from(masterKlasifikasiArsip)
            .where(and(
              eq(masterKlasifikasiArsip.id, data.klasifikasi_id),
              eq(masterKlasifikasiArsip.isActive, true),
            ))
            .limit(1)
        } catch (err) {
          console.error('[archive] klasifikasi lookup error:', toSafeErrorLog(err))
          return Response.json({ error: 'Gagal mengarsipkan dokumen' }, { status: 500 })
        }

        const klasifikasi = klasifikasiRows[0]
        if (!klasifikasi) return Response.json({ error: 'Jenis pembayaran tidak ditemukan' }, { status: 400 })

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

        const namaArsip = deriveWorkflowNamaArsip({
          judul: dok.judul,
          jenisDokumenNama: dok.jenis_dokumen_nama,
          kegiatanNama: dok.kegiatan_nama,
        })

        try {
          await db.transaction(async (tx) => {
            await tx.insert(arsip).values({
              sourceType: 'WORKFLOW',
              dokumenId: params.id,
              namaArsip,
              nomorSurat: data.nomor_surat?.trim() || null,
              klasifikasi: klasifikasi.nama,
              klasifikasiId: klasifikasi.id,
              klasifikasiKodeSnapshot: klasifikasi.kode,
              klasifikasiNamaSnapshot: klasifikasi.nama,
              retensiAktif: data.retensi_aktif ?? null,
              retensiInaktif: data.retensi_inaktif ?? null,
              masaAktifBerakhir: data.masa_aktif_berakhir ?? null,
              masaInaktifBerakhir: data.masa_inaktif_berakhir ?? null,
              catatanArsiparis: data.catatan_arsiparis ?? null,
              archivedBy: session.user.id,
              createdBy: dok.created_by,
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

            const berkasRepository = createWorkflowArchiveBerkasRepository(tx)
            const openBerkas = await getOrCreateOpenBerkasForKlasifikasi({
              klasifikasiId: klasifikasi.id,
              actorUserId: session.user.id,
            }, { repository: berkasRepository })

            await addWorkflowDocumentToOpenBerkas({
              berkasId: openBerkas.id,
              dokumenId: params.id,
              actorUserId: session.user.id,
            }, { repository: berkasRepository })

            await tx.insert(logAktivitas).values({
              dokumenId: params.id,
              userId: session.user.id,
              aksi: 'ARCHIVE',
              catatan: data.catatan_arsiparis ?? null,
              stepUrutan: null,
            })
          })
        } catch (err) {
          if (err instanceof BerkasArsipServiceError) {
            return Response.json(
              { error: err.message },
              { status: statusForBerkasServiceError(err) },
            )
          }

          console.error('[archive] local transaction error:', toSafeErrorLog(err))
          return Response.json({ error: 'Gagal mengarsipkan dokumen' }, { status: 500 })
        }

        return Response.json({ success: true, message: 'Dokumen berhasil diklasifikasikan' })
      },
    },
  },
})

type WorkflowArchiveTransaction = Pick<typeof db, 'select' | 'insert' | 'update'>

function createWorkflowArchiveBerkasRepository(
  tx: WorkflowArchiveTransaction,
): BerkasArsipRepository {
  return {
    async findActiveKlasifikasi(id) {
      const [row] = await tx
        .select({
          id: masterKlasifikasiArsip.id,
          kode: masterKlasifikasiArsip.kode,
          nama: masterKlasifikasiArsip.nama,
        })
        .from(masterKlasifikasiArsip)
        .where(and(
          eq(masterKlasifikasiArsip.id, id),
          eq(masterKlasifikasiArsip.isActive, true),
        ))
        .limit(1)

      return row ?? null
    },

    async findOpenBerkasByKlasifikasiId(klasifikasiId) {
      const [row] = await tx
        .select()
        .from(berkasArsip)
        .where(and(
          eq(berkasArsip.klasifikasiId, klasifikasiId),
          eq(berkasArsip.statusBerkas, BERKAS_STATUS.OPEN),
        ))
        .limit(1)

      return row ?? null
    },

    async insertOpenBerkas(input) {
      const [row] = await tx
        .insert(berkasArsip)
        .values({
          klasifikasiId: input.klasifikasi.id,
          klasifikasiKodeSnapshot: input.klasifikasi.kode,
          klasifikasiNamaSnapshot: input.klasifikasi.nama,
          statusBerkas: BERKAS_STATUS.OPEN,
          createdBy: input.actorUserId,
        })
        .returning()

      if (!row) throw new Error('BERKAS_OPEN_CREATE_FAILED')
      return row
    },

    async findBerkasById(id) {
      const [row] = await tx
        .select()
        .from(berkasArsip)
        .where(eq(berkasArsip.id, id))
        .limit(1)

      return row ?? null
    },

    async findWorkflowSource(dokumenId) {
      const [row] = await tx
        .select({
          id: dokumenTransaksi.id,
          canonicalArsipId: arsip.id,
          klasifikasiId: arsip.klasifikasiId,
        })
        .from(dokumenTransaksi)
        .leftJoin(
          arsip,
          and(
            eq(arsip.dokumenId, dokumenTransaksi.id),
            eq(arsip.sourceType, ARCHIVE_SOURCE_TYPE.WORKFLOW),
          ),
        )
        .where(eq(dokumenTransaksi.id, dokumenId))
        .limit(1)

      return row ?? null
    },

    async findManualSource() {
      throw new Error('MANUAL_SOURCE_NOT_SUPPORTED_IN_WORKFLOW_ARCHIVE_ROUTE')
    },

    async insertBerkasItem(input) {
      const [row] = await tx
        .insert(berkasArsipItem)
        .values({
          berkasId: input.berkasId,
          sourceType: input.sourceType,
          dokumenId: input.dokumenId,
          manualArsipId: input.manualArsipId,
          canonicalArsipId: input.canonicalArsipId,
          addedBy: input.actorUserId,
        })
        .returning()

      if (!row) throw new Error('BERKAS_ITEM_CREATE_FAILED')
      return row
    },

    async countBerkasItems(berkasId) {
      const [row] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(berkasArsipItem)
        .where(eq(berkasArsipItem.berkasId, berkasId))

      return Number(row?.count ?? 0)
    },

    async closeOpenBerkas(input) {
      const [row] = await tx
        .update(berkasArsip)
        .set({
          statusBerkas: BERKAS_STATUS.CLOSED,
          nomorSpm: input.plan.nomorSpm,
          retensiAktif: input.plan.retensiAktif,
          retensiInaktif: input.plan.retensiInaktif,
          masaAktifBerakhir: input.plan.masaAktifBerakhir,
          masaInaktifBerakhir: input.plan.masaInaktifBerakhir,
          closedAt: input.plan.closedAt,
          closedBy: input.actorUserId,
          updatedAt: new Date(),
        })
        .where(and(
          eq(berkasArsip.id, input.berkasId),
          eq(berkasArsip.statusBerkas, BERKAS_STATUS.OPEN),
        ))
        .returning()

      return row ?? null
    },
  }
}

function statusForBerkasServiceError(error: BerkasArsipServiceError): number {
  switch (error.code) {
    case 'KLASIFIKASI_NOT_FOUND':
    case 'SOURCE_KLASIFIKASI_MISMATCH':
    case 'INVALID_CLOSE_METADATA':
      return 400
    case 'BERKAS_NOT_FOUND':
    case 'SOURCE_NOT_FOUND':
      return 404
    case 'BERKAS_CLOSED':
    case 'BERKAS_NOT_OPEN':
    case 'BERKAS_EMPTY':
    case 'CONFLICT':
      return 409
  }
}
