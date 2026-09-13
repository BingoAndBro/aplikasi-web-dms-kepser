import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db/client'
import {
  berkasArsip,
  berkasArsipActivity,
  berkasArsipItem,
  masterKlasifikasiArsip,
} from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import {
  addWorkflowDocumentToOpenBerkas,
  BerkasArsipServiceError,
  getOrCreateOpenBerkasForKlasifikasi,
  type BerkasArsipRepository,
} from '#/lib/archive/berkas-arsip-service'
import { BERKAS_STATUS } from '#/lib/constants/archive-status'
import { ROLES } from '#/lib/constants/roles'

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
// POST /api/arsiparis/dokumen/[id]/archive - workflow classification into an OPEN berkas
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
          status: string
        }>
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
          console.error('[archive] dokumen lookup error:', toSafeErrorLog(err))
          return Response.json({ error: 'Gagal mengarsipkan dokumen' }, { status: 500 })
        }

        const dok = dokRows[0]
        if (!dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        if (dok.status === 'ARCHIVED') return Response.json({ error: 'Dokumen sudah diarsipkan' }, { status: 400 })
        if (dok.status !== 'COMPLETED') return Response.json({ error: 'Dokumen belum berada di tahap final' }, { status: 400 })

        try {
          await db.transaction(async (tx) => {
            const berkasRepository = createWorkflowArchiveBerkasRepository(tx, data.klasifikasi_id)
            const openBerkas = await getOrCreateOpenBerkasForKlasifikasi({
              klasifikasiId: data.klasifikasi_id,
              actorUserId: session.user.id,
            }, { repository: berkasRepository })

            await addWorkflowDocumentToOpenBerkas({
              berkasId: openBerkas.id,
              dokumenId: params.id,
              actorUserId: session.user.id,
            }, { repository: berkasRepository })
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
  workflowKlasifikasiId: string,
): BerkasArsipRepository {
  return {
    async findKlasifikasiForOperationalSelection(id) {
      const [row] = await tx
        .select({
          id: masterKlasifikasiArsip.id,
          kode: masterKlasifikasiArsip.kode,
          nama: masterKlasifikasiArsip.nama,
          isActive: masterKlasifikasiArsip.isActive,
        })
        .from(masterKlasifikasiArsip)
        .where(eq(masterKlasifikasiArsip.id, id))
        .limit(1)

      if (!row) return null

      const [child] = await tx
        .select({ id: masterKlasifikasiArsip.id })
        .from(masterKlasifikasiArsip)
        .where(eq(masterKlasifikasiArsip.parentId, id))
        .limit(1)

      return {
        ...row,
        hasChildren: Boolean(child),
      }
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

    async findBerkasByKlasifikasiId(klasifikasiId) {
      return tx
        .select()
        .from(berkasArsip)
        .where(eq(berkasArsip.klasifikasiId, klasifikasiId))
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
          klasifikasiId: sql<string>`${workflowKlasifikasiId}`,
        })
        .from(dokumenTransaksi)
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

    async updateBerkasArchiveStatus() {
      throw new Error('BERKAS_LIFECYCLE_NOT_SUPPORTED_IN_WORKFLOW_ARCHIVE_ROUTE')
    },

    async updateActiveBerkasMetadata() {
      throw new Error('BERKAS_METADATA_NOT_SUPPORTED_IN_WORKFLOW_ARCHIVE_ROUTE')
    },

    async appendBerkasActivity(input) {
      await tx
        .insert(berkasArsipActivity)
        .values({
          berkasId: input.berkasId,
          eventType: input.eventType,
          actorUserId: input.actorUserId,
          sourceType: input.sourceType ?? null,
          workflowDocumentId: input.workflowDocumentId ?? null,
          manualDocumentId: input.manualDocumentId ?? null,
          catatan: input.catatan ?? null,
          metadataSnapshot: input.metadataSnapshot ?? null,
        })
    },
  }
}

function statusForBerkasServiceError(error: BerkasArsipServiceError): number {
  switch (error.code) {
    case 'KLASIFIKASI_NOT_FOUND':
    case 'KLASIFIKASI_INACTIVE':
    case 'KLASIFIKASI_PARENT':
    case 'SOURCE_KLASIFIKASI_MISMATCH':
    case 'INVALID_CLOSE_METADATA':
      return 400
    case 'BERKAS_NOT_FOUND':
    case 'SOURCE_NOT_FOUND':
      return 404
    case 'SOURCE_KLASIFIKASI_UNAVAILABLE':
    case 'BERKAS_CLOSED':
    case 'BERKAS_KLASIFIKASI_CLOSED':
    case 'BERKAS_KLASIFIKASI_CONFLICT':
    case 'BERKAS_NOT_OPEN':
    case 'BERKAS_EMPTY':
    case 'CONFLICT':
      return 409
  }
}
