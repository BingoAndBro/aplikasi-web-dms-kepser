import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { berkasArsip, berkasArsipItem } from '#/db/schema/arsip'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { ARCHIVE_SOURCE_TYPE, ARCHIVE_STATUS } from '#/lib/constants/archive-status'
import { DOC_STATUS } from '#/lib/constants/document-status'
import { updateNominalSchema, validateNominalForMaterial } from '#/lib/schemas/dokumen'

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)
}

function normalizeNumericValue(value: string | number | null | undefined): number | null | undefined {
  if (value === null || value === undefined) return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

// ---------------------------------------------------------------------------
// PATCH /api/dokumen/$id/nominal — Update nominal_realisasi
// Allowed: non-admin creator, KEPALA_SUB_BAGIAN_UMUM
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/$id/nominal')({
  server: {
    handlers: {
      PATCH: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        // 1. Auth check
        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        // 2. Get dokumen
        let dokRows: Array<{
          id: string
          created_by: string
          status: string
          is_non_material: boolean | null
          nominal_realisasi: string | null
        }>

        try {
          dokRows = await db
            .select({
              id: dokumenTransaksi.id,
              created_by: dokumenTransaksi.createdBy,
              status: dokumenTransaksi.status,
              is_non_material: dokumenTransaksi.isNonMaterial,
              nominal_realisasi: dokumenTransaksi.nominalRealisasi,
            })
            .from(dokumenTransaksi)
            .where(eq(dokumenTransaksi.id, params.id))
            .limit(1)
        } catch (err) {
          console.error('[dokumen-nominal] local lookup error:', err)
          return Response.json({ error: 'Update gagal' }, { status: 500 })
        }

        const dok = dokRows[0]
        if (!dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        // 3. Authorization check
        const isAdmin = hasLocalRole(session, 'ADMIN')
        const isCreator = !isAdmin && dok.created_by === session.user.id
        const isKEPALA_SUB_BAGIAN_UMUM = hasLocalRole(session, 'KEPALA_SUB_BAGIAN_UMUM')

        if (!isCreator && !isKEPALA_SUB_BAGIAN_UMUM) {
          return Response.json({ error: 'Akses ditolak' }, { status: 403 })
        }

        // 4. Parse body
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = updateNominalSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: parsed.error.flatten(),
          }, { status: 400 })
        }

        // 5. Check status — final material workflow documents cannot be updated
        if (dok.is_non_material !== true && dok.status === DOC_STATUS.COMPLETED) {
          return Response.json(
            { error: 'Tidak bisa update dokumen yang sudah selesai' },
            { status: 400 },
          )
        }

        let archiveRows: Array<{ status_arsip: string }>
        try {
          archiveRows = await db
            .select({
              status_arsip: berkasArsip.statusArsip,
            })
            .from(berkasArsipItem)
            .leftJoin(berkasArsip, eq(berkasArsipItem.berkasId, berkasArsip.id))
            .where(and(
              eq(berkasArsipItem.dokumenId, params.id),
              eq(berkasArsipItem.sourceType, ARCHIVE_SOURCE_TYPE.WORKFLOW),
            ))
            .limit(1)
        } catch (err) {
          console.error('[dokumen-nominal] archive lookup error:', err)
          return Response.json({ error: 'Update gagal' }, { status: 500 })
        }

        if (archiveRows.some((row) => row.status_arsip === ARCHIVE_STATUS.DIMUSNAHKAN)) {
          return Response.json(
            { error: 'Tidak bisa update dokumen yang sudah dimusnahkan' },
            { status: 400 },
          )
        }

        // 6. Validate material requirement
        const isNonMaterial = dok.is_non_material === true
        const nominalRealisasi = parsed.data.nominal_realisasi ?? dok.nominal_realisasi

        if (isNonMaterial && parsed.data.nominal_realisasi !== undefined && parsed.data.nominal_realisasi !== null) {
          return Response.json(
            { error: 'Dokumen Non-Material tidak memiliki nominal_realisasi' },
            { status: 400 },
          )
        }

        const validation = validateNominalForMaterial(
          isNonMaterial,
          normalizeNumericValue(nominalRealisasi),
        )
        if (!validation.valid) {
          return Response.json({ error: validation.error }, { status: 400 })
        }

        // 7. Update
        // Nothing to update
        if (parsed.data.nominal_realisasi === undefined) {
          return Response.json({ success: true, message: 'Tidak ada perubahan' })
        }

        try {
          await db.transaction(async (tx) => {
            const updatedRows = await tx
              .update(dokumenTransaksi)
              .set({
                nominalRealisasi: parsed.data.nominal_realisasi === null
                  ? null
                  : String(parsed.data.nominal_realisasi),
              })
              .where(eq(dokumenTransaksi.id, params.id))
              .returning({ id: dokumenTransaksi.id })

            if (updatedRows.length === 0) {
              throw new Error('DOCUMENT_NOMINAL_UPDATE_NOT_FOUND')
            }

            await tx.insert(logAktivitas).values({
              dokumenId: params.id,
              userId: session.user.id,
              aksi: 'UPDATE_NOMINAL',
              catatan: `Update nominal: ${nominalRealisasi}`,
              stepUrutan: null,
            })
          })
        } catch (err) {
          console.error('[dokumen-nominal] local transaction error:', err)
          return Response.json({ error: 'Update gagal' }, { status: 500 })
        }

        return Response.json({ success: true })
      },
    },
  },
})
