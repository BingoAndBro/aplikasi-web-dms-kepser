import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import {
  masterDetailPermintaan,
  masterFungsi,
  masterJenisDokumen,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
} from '#/db/schema/master'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { updateDokumenSchema } from '#/lib/schemas/dokumen'
import {
  getDokumenById,
  insertLog,
  type LampiranUrl,
} from '#/lib/dokumen-helpers'
import { parseDokumen, parseDokumenWithNames, parseLampiranUrls } from '#/lib/dokumen'
import {
  executeLocalAttachmentMovements,
  localAttachmentIssueMessage,
  localAttachmentIssueStatus,
  prepareLocalAttachmentReplacement,
  rollbackLocalAttachmentMovements,
  toSafeLocalAttachmentIssue,
  type LocalAttachmentMovedFile,
  type LocalAttachmentReplacementIssue,
} from '#/lib/storage/local-attachment-replacement'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function normalizeNumericValue(value: string | number | null): number | null {
  if (value === null) return null
  if (typeof value === 'number') return value

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function canSessionReadDokumen(
  session: Awaited<ReturnType<typeof getLocalServerSession>>,
  dokumen: { created_by: string; status: string; revision_target: string | null },
): boolean {
  if (!session) return false
  if (dokumen.created_by === session.user.id) return true
  if (hasLocalRole(session, 'PPK')) {
    return [
      'IN_PPK_VALIDATION',
      'IN_BENDAHARA_APPROVAL',
      'NEED_REVISION',
      'COMPLETED',
      'ARCHIVED',
    ].includes(dokumen.status)
  }
  if (hasLocalRole(session, 'BENDAHARA')) {
    return dokumen.status === 'IN_BENDAHARA_APPROVAL'
      || dokumen.status === 'COMPLETED'
      || dokumen.status === 'ARCHIVED'
      || (dokumen.status === 'NEED_REVISION' && dokumen.revision_target === 'PPK')
  }
  if (hasLocalRole(session, 'ARSIPARIS')) {
    return dokumen.status === 'COMPLETED' || dokumen.status === 'ARCHIVED'
  }

  return false
}

function localAttachmentFailureResponse(
  issue: LocalAttachmentReplacementIssue | undefined,
  messagePrefix = 'Gagal memproses file',
): Response {
  if (!issue) {
    return Response.json({ error: `${messagePrefix}: Pemindahan file gagal` }, { status: 500 })
  }

  const message = localAttachmentIssueMessage(issue)
  const status = localAttachmentIssueStatus(issue)

  if (status === 403) {
    return Response.json({ error: message }, { status })
  }

  if (status === 400) {
    return Response.json({ error: message }, { status })
  }

  return Response.json({
    error: `${messagePrefix}: ${message}`,
    details: toSafeLocalAttachmentIssue(issue),
  }, { status })
}

async function rollbackMovedAttachmentsForDbFailure(
  moved: LocalAttachmentMovedFile[],
): Promise<boolean> {
  if (moved.length === 0) return true

  const rollback = await rollbackLocalAttachmentMovements(moved)
  return rollback.ok
}

// ---------------------------------------------------------------------------
// GET /api/dokumen/[id] — Get dokumen detail
// PATCH /api/dokumen/[id] — Update lampiran_urls (NEED_REVISION target=USER only)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        try {
          const rows = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              fungsi_id: dokumenTransaksi.fungsiId,
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              is_ketua_tim: dokumenTransaksi.isKetuaTim,
              status: dokumenTransaksi.status,
              current_step: dokumenTransaksi.currentStep,
              revision_target: dokumenTransaksi.revisionTarget,
              revision_notes: dokumenTransaksi.revisionNotes,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
              tahun: dokumenTransaksi.tahun,
              tanggal: dokumenTransaksi.tanggal,
              created_by: dokumenTransaksi.createdBy,
              nominal_realisasi: dokumenTransaksi.nominalRealisasi,
              is_non_material: dokumenTransaksi.isNonMaterial,
              jenis_dokumen_id: dokumenTransaksi.jenisDokumenId,
              keterangan_detail: dokumenTransaksi.keteranganDetail,
              created_at: dokumenTransaksi.createdAt,
              updated_at: dokumenTransaksi.updatedAt,
              jenis_permintaan_id: dokumenTransaksi.jenisPermintaanId,
              kategori_permintaan_id: dokumenTransaksi.kategoriPermintaanId,
              detail_permintaan_id: dokumenTransaksi.detailPermintaanId,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
              jenis_permintaan_nama: masterJenisPermintaan.nama,
              kategori_permintaan_nama: masterKategoriPermintaan.nama,
              detail_permintaan_nama: masterDetailPermintaan.nama,
              jenis_dokumen_nama: masterJenisDokumen.nama,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .leftJoin(masterJenisPermintaan, eq(dokumenTransaksi.jenisPermintaanId, masterJenisPermintaan.id))
            .leftJoin(masterKategoriPermintaan, eq(dokumenTransaksi.kategoriPermintaanId, masterKategoriPermintaan.id))
            .leftJoin(masterDetailPermintaan, eq(dokumenTransaksi.detailPermintaanId, masterDetailPermintaan.id))
            .leftJoin(masterJenisDokumen, eq(dokumenTransaksi.jenisDokumenId, masterJenisDokumen.id))
            .where(eq(dokumenTransaksi.id, params.id))
            .limit(1)

          const row = rows[0]
          if (!row) {
            return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
          }

          if (!canSessionReadDokumen(session, row)) {
            return Response.json({ error: 'Anda tidak memiliki akses ke dokumen ini' }, { status: 403 })
          }

          return Response.json({
            dokumen: parseDokumen({
              ...row,
              nominal_realisasi: normalizeNumericValue(row.nominal_realisasi),
            }),
          })
        } catch (err) {
          console.error('[API/dokumen/:id] GET local query error:', err)
          return Response.json({ error: 'Gagal mengambil dokumen' }, { status: 500 })
        }
      },

      PATCH: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = updateDokumenSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: parsed.error.flatten(),
          }, { status: 400 })
        }

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
            })
            .from(dokumenTransaksi)
            .where(eq(dokumenTransaksi.id, params.id))
            .limit(1)
        } catch (err) {
          console.error('[API/dokumen/:id] PATCH local lookup error:', err)
          return Response.json({ error: 'Gagal memperbarui dokumen' }, { status: 500 })
        }

        const dok = dokRows[0]
        if (!dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        if (dok.created_by !== session.user.id) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        // Check if Non-Material
        const isNonMaterial = dok.is_non_material === true ||
          (!dok.jenis_permintaan_id && !dok.kategori_permintaan_id && !dok.detail_permintaan_id)

        // Allow edit for:
        // 1. Non-Material with TERSIMPAN status
        // 2. Material with NEED_REVISION target=USER
        const canEditNonMaterial = isNonMaterial && dok.status === 'TERSIMPAN'
        const canEditMaterial = !isNonMaterial && dok.status === 'NEED_REVISION' && dok.revision_target === 'USER'

        if (!canEditNonMaterial && !canEditMaterial) {
          if (isNonMaterial) {
            return Response.json({ error: 'Dokumen Non-Material hanya bisa diedit jika status Tersimpan' }, { status: 400 })
          }
          return Response.json({ error: 'Dokumen tidak bisa diedit — status bukan NEED_REVISION' }, { status: 400 })
        }

        const storedLampirans = parseLampiranUrls(dok.lampiran_urls)
        let processedLampirans: LampiranUrl[] = parsed.data.lampiranUrls ?? storedLampirans
        let movedAttachments: LocalAttachmentMovedFile[] = []

        if (parsed.data.lampiranUrls !== undefined) {
          const attachmentPlan = await prepareLocalAttachmentReplacement({
            ownerUserId: session.userId,
            dokumenId: params.id,
            nextAttachments: parsed.data.lampiranUrls,
            existingAttachments: storedLampirans,
          })

          if (!attachmentPlan.ok) {
            return localAttachmentFailureResponse(attachmentPlan.issues[0])
          }

          const movement = await executeLocalAttachmentMovements({
            ownerUserId: session.userId,
            dokumenId: params.id,
            operations: attachmentPlan.operations,
          })

          if (!movement.ok) {
            return Response.json({
              error: `Gagal memproses file: ${localAttachmentIssueMessage(movement.issue)}`,
              details: toSafeLocalAttachmentIssue(movement.issue),
              filesystemMovementExecuted: movement.moved.length > 0,
              partialMovement: movement.moved.length > 0,
              compensationAttempted: movement.rollbackAttempted,
              compensationSucceeded: movement.rollbackOk,
            }, { status: 500 })
          }

          processedLampirans = attachmentPlan.plannedAttachments
          movedAttachments = movement.moved
        }

        try {
          await db.transaction(async (tx) => {
            const updatePayload: Partial<typeof dokumenTransaksi.$inferInsert> = {
              updatedAt: new Date(),
              lampiranUrls: processedLampirans,
            }

            if (parsed.data.judul !== undefined) updatePayload.judul = parsed.data.judul
            if (parsed.data.tahun !== undefined) updatePayload.tahun = parsed.data.tahun
            if (parsed.data.fungsiId !== undefined) updatePayload.fungsiId = parsed.data.fungsiId
            if (parsed.data.kegiatanId !== undefined) updatePayload.kegiatanJenisId = parsed.data.kegiatanId
            if (parsed.data.tanggal !== undefined) updatePayload.tanggal = parsed.data.tanggal
            if (parsed.data.nominalRealisasi !== undefined) {
              updatePayload.nominalRealisasi =
                parsed.data.nominalRealisasi === null
                  ? null
                  : String(parsed.data.nominalRealisasi)
            }
            if (parsed.data.keteranganDetail !== undefined) {
              updatePayload.keteranganDetail = parsed.data.keteranganDetail
            }

            const updatedRows = await tx
              .update(dokumenTransaksi)
              .set(updatePayload)
              .where(eq(dokumenTransaksi.id, params.id))
              .returning({ id: dokumenTransaksi.id })

            if (updatedRows.length === 0) {
              throw new Error('DOCUMENT_UPDATE_NOT_FOUND')
            }

            if (isNonMaterial) {
              await tx.insert(logAktivitas).values({
                dokumenId: params.id,
                userId: session.user.id,
                aksi: 'UPDATE',
                stepUrutan: null,
              })
            }
          })
        } catch (err) {
          console.error('[API/dokumen/:id] PATCH local update error:', err)
          const rollbackOk = await rollbackMovedAttachmentsForDbFailure(movedAttachments)
          if (!rollbackOk) {
            return Response.json({
              error: 'Gagal memperbarui dokumen setelah file dipindahkan; pemulihan file gagal',
              code: 'local-file-compensation-failed',
              compensationRequired: true,
            }, { status: 500 })
          }

          return Response.json({ error: 'Gagal memperbarui dokumen' }, { status: 500 })
        }

        let updatedRows: Array<Record<string, unknown>>
        try {
          updatedRows = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              fungsi_id: dokumenTransaksi.fungsiId,
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              is_ketua_tim: dokumenTransaksi.isKetuaTim,
              status: dokumenTransaksi.status,
              current_step: dokumenTransaksi.currentStep,
              revision_target: dokumenTransaksi.revisionTarget,
              revision_notes: dokumenTransaksi.revisionNotes,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
              tahun: dokumenTransaksi.tahun,
              tanggal: dokumenTransaksi.tanggal,
              created_by: dokumenTransaksi.createdBy,
              nominal_realisasi: dokumenTransaksi.nominalRealisasi,
              is_non_material: dokumenTransaksi.isNonMaterial,
              jenis_dokumen_id: dokumenTransaksi.jenisDokumenId,
              keterangan_detail: dokumenTransaksi.keteranganDetail,
              created_at: dokumenTransaksi.createdAt,
              updated_at: dokumenTransaksi.updatedAt,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .where(eq(dokumenTransaksi.id, params.id))
            .limit(1)
        } catch (err) {
          console.error('[API/dokumen/:id] PATCH local response lookup error:', err)
          return Response.json({ error: 'Gagal memperbarui dokumen' }, { status: 500 })
        }

        const updated = updatedRows[0] as { nominal_realisasi: string | number | null } & Record<string, unknown>
        if (!updated) {
          return Response.json({ error: 'Gagal memperbarui dokumen' }, { status: 500 })
        }

        return Response.json({
          dokumen: parseDokumenWithNames({
            ...updated,
            nominal_realisasi: normalizeNumericValue(updated.nominal_realisasi),
          }, {}, {}),
        })
      },

      DELETE: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Use admin client to bypass RLS
        const admin = createAdminClient()
        const dok = await getDokumenById(admin, params.id)

        if (!dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        // Check if owner
        if (dok.created_by !== session.user.id) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        // Check if Non-Material and TERSIMPAN
        const isNonMaterial = dok.is_non_material === true ||
          (!dok.jenis_permintaan_id && !dok.kategori_permintaan_id && !dok.detail_permintaan_id)

        if (!isNonMaterial || dok.status !== 'TERSIMPAN') {
          return Response.json({ error: 'Dokumen tidak bisa dihapus' }, { status: 400 })
        }

        // Get lampiran URLs for file deletion
        const lampiranUrls = dok.lampiran_urls || []
        console.log('[DELETE] Deleting dokumen:', {
          dokumenId: params.id,
          judul: dok.judul,
          lampiranFiles: lampiranUrls.map(l => l.url)
        })

        // Insert log before delete (so it records who deleted)
        await insertLog(admin, {
          dokumenId: params.id,
          userId: session.user.id,
          aksi: 'DELETE',
          stepUrutan: null,
        })

        // Delete dokumen from database
        const { error: deleteError } = await admin
          .from('dokumen_transaksi')
          .delete()
          .eq('id', params.id)

        if (deleteError) {
          console.error('[API/dokumen/:id] DELETE error:', deleteError)
          return Response.json({ error: 'Gagal menghapus dokumen' }, { status: 500 })
        }

        console.log('[DELETE] Dokumen metadata deleted from database:', params.id)

        // Delete files from storage
        for (const lamp of lampiranUrls) {
          console.log('[DELETE] Deleting file from storage:', lamp.url)
          admin.storage.from('dokumen-lampiran').remove([lamp.url]).then(({ error }) => {
            if (error) console.warn('[dokumen] Failed to delete file:', lamp.url, error.message)
            else console.log('[DELETE] File deleted from storage:', lamp.url)
          })
        }

        console.log('[DELETE] Complete:', {
          dokumenId: params.id,
          judul: dok.judul,
          filesDeleted: lampiranUrls.length
        })

        return Response.json({ success: true })
      },
    },
  },
})
