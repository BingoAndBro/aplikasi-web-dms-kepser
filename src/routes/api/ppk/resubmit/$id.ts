import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import {
  masterDetailPermintaan,
  masterFungsi,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
} from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { transition } from '#/lib/fsm'
import { parseLampiranUrls } from '#/lib/dokumen'
import {
  getDokumenValidationErrorMessage,
  resubmitDokumenSchema,
  type ResubmitDokumen,
} from '#/lib/schemas/dokumen'
import type { LampiranUrl } from '#/lib/dokumen-helpers'
import type { StatusDokumen } from '#/lib/types/fsm'
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
import { cleanupUnreferencedReplacedLocalAttachments } from '#/lib/storage/local-attachment-reference-cleanup'
import { validateResubmitRequirements } from '#/lib/dokumen/resubmit-validation'
import {
  DokumenTransitionConflictError,
  dokumenTransitionConflictResponse,
} from '#/lib/dokumen/transition-conflict'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function normalizeNumericValue(value: string | number | null): number | null {
  if (value === null) return null
  if (typeof value === 'number') return value

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function localAttachmentFailureResponse(
  issue: LocalAttachmentReplacementIssue | undefined,
  messagePrefix = 'Gagal menyimpan perubahan',
): Response {
  if (!issue) {
    return Response.json({ error: `${messagePrefix}: Pemindahan file gagal` }, { status: 500 })
  }

  const message = localAttachmentIssueMessage(issue)
  const status = localAttachmentIssueStatus(issue)

  if (status === 403 || status === 400) {
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

async function prepareAndMoveAttachments({
  ownerUserId,
  dokumenId,
  nextAttachments,
  existingAttachments,
  failurePrefix,
}: {
  ownerUserId: string
  dokumenId: string
  nextAttachments: LampiranUrl[]
  existingAttachments: LampiranUrl[]
  failurePrefix: string
}): Promise<
  | { ok: true; plannedAttachments: LampiranUrl[]; moved: LocalAttachmentMovedFile[] }
  | { ok: false; response: Response }
> {
  const attachmentPlan = await prepareLocalAttachmentReplacement({
    ownerUserId,
    dokumenId,
    nextAttachments,
    existingAttachments,
  })

  if (!attachmentPlan.ok) {
    return { ok: false, response: localAttachmentFailureResponse(attachmentPlan.issues[0], failurePrefix) }
  }

  const movement = await executeLocalAttachmentMovements({
    ownerUserId,
    dokumenId,
    operations: attachmentPlan.operations,
  })

  if (!movement.ok) {
    return {
      ok: false,
      response: Response.json({
        error: `${failurePrefix}: ${localAttachmentIssueMessage(movement.issue)}`,
        details: toSafeLocalAttachmentIssue(movement.issue),
        filesystemMovementExecuted: movement.moved.length > 0,
        partialMovement: movement.moved.length > 0,
        compensationAttempted: movement.rollbackAttempted,
        compensationSucceeded: movement.rollbackOk,
      }, { status: 500 }),
    }
  }

  return {
    ok: true,
    plannedAttachments: attachmentPlan.plannedAttachments,
    moved: movement.moved,
  }
}

// Every PATCH/POST body goes through resubmitDokumenSchema (lampiranUrls and
// nominalRealisasi both optional), not only bodies that carry lampiranUrls.
// An empty/non-JSON body still means "no changes".
async function parseResubmitBody(request: Request): Promise<
  | { ok: true; body: ResubmitDokumen }
  | { ok: false; response: Response }
> {
  let raw: unknown = {}
  try { raw = await request.json() } catch { /* empty body OK */ }

  const parsed = resubmitDokumenSchema.safeParse(raw ?? {})
  if (!parsed.success) {
    return {
      ok: false,
      response: Response.json({
        error: getDokumenValidationErrorMessage(parsed.error),
        details: parsed.error.flatten(),
      }, { status: 400 }),
    }
  }

  return { ok: true, body: parsed.data }
}

// ---------------------------------------------------------------------------
// GET /api/ppk/resubmit/[id] - get dokumen detail for resubmit page
// PATCH /api/ppk/resubmit/[id] - save lampiran (no FSM transition)
// POST /api/ppk/resubmit/[id] - resubmit after Ppspm rejection (FSM transition)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ppk/resubmit/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        if (!hasLocalRole(session, 'PPK')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        let rows: Array<Record<string, unknown>>
        try {
          rows = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              fungsi_id: dokumenTransaksi.fungsiId,
              fungsi_nama: masterFungsi.nama,
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              kegiatan_nama: masterKegiatan.nama,
              is_ketua_tim: dokumenTransaksi.isKetuaTim,
              status: dokumenTransaksi.status,
              revision_target: dokumenTransaksi.revisionTarget,
              revision_notes: dokumenTransaksi.revisionNotes,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
              tahun: dokumenTransaksi.tahun,
              tanggal: dokumenTransaksi.tanggal,
              created_at: dokumenTransaksi.createdAt,
              updated_at: dokumenTransaksi.updatedAt,
              nominal_realisasi: dokumenTransaksi.nominalRealisasi,
              is_non_material: dokumenTransaksi.isNonMaterial,
              komponen_id: dokumenTransaksi.komponenId,
              jenis_permintaan_id: dokumenTransaksi.jenisPermintaanId,
              kategori_permintaan_id: dokumenTransaksi.kategoriPermintaanId,
              detail_permintaan_id: dokumenTransaksi.detailPermintaanId,
              jenis_permintaan_nama: masterJenisPermintaan.nama,
              kategori_permintaan_nama: masterKategoriPermintaan.nama,
              detail_permintaan_nama: masterDetailPermintaan.nama,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .leftJoin(masterJenisPermintaan, eq(dokumenTransaksi.jenisPermintaanId, masterJenisPermintaan.id))
            .leftJoin(masterKategoriPermintaan, eq(dokumenTransaksi.kategoriPermintaanId, masterKategoriPermintaan.id))
            .leftJoin(masterDetailPermintaan, eq(dokumenTransaksi.detailPermintaanId, masterDetailPermintaan.id))
            .where(eq(dokumenTransaksi.id, params.id))
            .limit(1)
        } catch (err) {
          console.error('[API/ppk/resubmit/:id] GET local query error:', err)
          return Response.json({ error: 'Gagal mengambil dokumen' }, { status: 500 })
        }

        const dok = rows[0]
        if (!dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        if (dok.status !== 'NEED_REVISION' || dok.revision_target !== 'PPK') {
          return Response.json({ error: 'Dokumen ini tidak memerlukan revisi oleh PPK' }, { status: 400 })
        }

        const isNonMaterial = dok.is_non_material === true ||
          (!dok.jenis_permintaan_id && !dok.kategori_permintaan_id && !dok.detail_permintaan_id)

        return Response.json({
          dokumen: {
            id: dok.id,
            judul: dok.judul,
            fungsi_id: dok.fungsi_id,
            fungsi_nama: dok.fungsi_nama ?? '-',
            kegiatan_jenis_id: dok.kegiatan_jenis_id,
            kegiatan_nama: dok.kegiatan_nama ?? '-',
            is_ketua_tim: dok.is_ketua_tim,
            status: dok.status,
            revision_notes: dok.revision_notes,
            lampiran_urls: parseLampiranUrls(dok.lampiran_urls),
            tahun: dok.tahun,
            tanggal: dok.tanggal,
            created_at: dok.created_at,
            updated_at: dok.updated_at,
            nominal_realisasi: normalizeNumericValue(dok.nominal_realisasi as string | number | null),
            is_non_material: isNonMaterial,
            komponen_id: dok.komponen_id,
            jenis_permintaan_id: dok.jenis_permintaan_id,
            kategori_permintaan_id: dok.kategori_permintaan_id,
            detail_permintaan_id: dok.detail_permintaan_id,
            jenis_permintaan_nama: dok.jenis_permintaan_nama,
            kategori_permintaan_nama: dok.kategori_permintaan_nama,
            detail_permintaan_nama: dok.detail_permintaan_nama,
          },
        })
      },

      PATCH: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        if (!hasLocalRole(session, 'PPK')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const bodyResult = await parseResubmitBody(request)
        if (!bodyResult.ok) return bodyResult.response
        const body = bodyResult.body

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        let dokRows: Array<{
          id: string
          status: string
          revision_target: string | null
          lampiran_urls: unknown
        }>
        try {
          dokRows = await db
            .select({
              id: dokumenTransaksi.id,
              status: dokumenTransaksi.status,
              revision_target: dokumenTransaksi.revisionTarget,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
            })
            .from(dokumenTransaksi)
            .where(eq(dokumenTransaksi.id, params.id))
            .limit(1)
        } catch (err) {
          console.error('[API/ppk/resubmit/:id] PATCH local lookup error:', err)
          return Response.json({ error: 'Gagal menyimpan' }, { status: 500 })
        }

        const dok = dokRows[0]
        if (!dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        if (dok.status !== 'NEED_REVISION' || dok.revision_target !== 'PPK') {
          return Response.json({ error: 'Dokumen ini tidak memerlukan revisi oleh PPK' }, { status: 400 })
        }

        const existingLampirans = parseLampiranUrls(dok.lampiran_urls)
        let updatedLampirans = body.lampiranUrls ?? existingLampirans
        let movedAttachments: LocalAttachmentMovedFile[] = []

        if (body.lampiranUrls && Array.isArray(body.lampiranUrls)) {
          const movement = await prepareAndMoveAttachments({
            ownerUserId: session.userId,
            dokumenId: params.id,
            nextAttachments: body.lampiranUrls,
            existingAttachments: existingLampirans,
            failurePrefix: 'Gagal menyimpan perubahan',
          })

          if (!movement.ok) return movement.response

          updatedLampirans = movement.plannedAttachments
          movedAttachments = movement.moved
        }

        try {
          const updatePayload: Partial<typeof dokumenTransaksi.$inferInsert> = {
            lampiranUrls: updatedLampirans,
            updatedAt: new Date(),
          }

          if (body.nominalRealisasi !== undefined) {
            updatePayload.nominalRealisasi =
              body.nominalRealisasi === null ? null : String(body.nominalRealisasi)
          }

          const updatedRows = await db
            .update(dokumenTransaksi)
            .set(updatePayload)
            .where(eq(dokumenTransaksi.id, params.id))
            .returning({ id: dokumenTransaksi.id })

          if (updatedRows.length === 0) {
            throw new Error('DOCUMENT_SAVE_NOT_FOUND')
          }
        } catch (err) {
          console.error('[API/ppk/resubmit/:id] PATCH local update error:', err)
          const rollbackOk = await rollbackMovedAttachmentsForDbFailure(movedAttachments)
          if (!rollbackOk) {
            return Response.json({
              error: 'Gagal menyimpan setelah file dipindahkan; pemulihan file gagal',
              code: 'local-file-compensation-failed',
              compensationRequired: true,
            }, { status: 500 })
          }

          return Response.json({ error: 'Gagal menyimpan' }, { status: 500 })
        }

        if (body.lampiranUrls && Array.isArray(body.lampiranUrls)) {
          await cleanupUnreferencedReplacedLocalAttachments({
            context: 'ppk-resubmit-save',
            dokumenId: params.id,
            oldAttachments: existingLampirans,
            newAttachments: updatedLampirans,
          })
        }

        return Response.json({ success: true })
      },

      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        if (!hasLocalRole(session, 'PPK')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const bodyResult = await parseResubmitBody(request)
        if (!bodyResult.ok) return bodyResult.response
        const body = bodyResult.body

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        let dokRows: Array<{
          id: string
          status: string
          revision_target: string | null
          lampiran_urls: unknown
          nominal_realisasi: string | null
          is_non_material: boolean | null
          kegiatan_jenis_id: string
          is_ketua_tim: boolean
          komponen_id: string | null
          jenis_permintaan_id: string | null
          kategori_permintaan_id: string | null
          detail_permintaan_id: string | null
        }>
        try {
          dokRows = await db
            .select({
              id: dokumenTransaksi.id,
              status: dokumenTransaksi.status,
              revision_target: dokumenTransaksi.revisionTarget,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
              nominal_realisasi: dokumenTransaksi.nominalRealisasi,
              is_non_material: dokumenTransaksi.isNonMaterial,
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              is_ketua_tim: dokumenTransaksi.isKetuaTim,
              komponen_id: dokumenTransaksi.komponenId,
              jenis_permintaan_id: dokumenTransaksi.jenisPermintaanId,
              kategori_permintaan_id: dokumenTransaksi.kategoriPermintaanId,
              detail_permintaan_id: dokumenTransaksi.detailPermintaanId,
            })
            .from(dokumenTransaksi)
            .where(eq(dokumenTransaksi.id, params.id))
            .limit(1)
        } catch (err) {
          console.error('[API/ppk/resubmit/:id] local lookup error:', err)
          return Response.json({ error: 'Gagal resubmit' }, { status: 500 })
        }

        const dok = dokRows[0]
        if (!dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        if (dok.status !== 'NEED_REVISION' || dok.revision_target !== 'PPK') {
          return Response.json({ error: 'Dokumen ini tidak memerlukan revisi oleh PPK' }, { status: 400 })
        }

        const result = transition(dok.status as StatusDokumen, 'RESUBMIT_PPK', 'PPK', dok.revision_target)
        if (!result.success) return Response.json({ error: result.error || 'Transisi gagal' }, { status: 400 })

        const existingLampirans = parseLampiranUrls(dok.lampiran_urls)

        // Same content rules as the initial SUBMIT, checked on what the document
        // will carry after this resubmit, before any file is moved.
        let requirements: Awaited<ReturnType<typeof validateResubmitRequirements>>
        try {
          requirements = await validateResubmitRequirements({
            dokumen: {
              isNonMaterial: dok.is_non_material === true
                || (!dok.jenis_permintaan_id && !dok.kategori_permintaan_id && !dok.detail_permintaan_id),
              kegiatanId: dok.kegiatan_jenis_id,
              isKetuaTim: dok.is_ketua_tim,
              komponenId: dok.komponen_id,
              jenisPermintaanId: dok.jenis_permintaan_id,
              kategoriPermintaanId: dok.kategori_permintaan_id,
              detailPermintaanId: dok.detail_permintaan_id,
            },
            lampiranUrls: body.lampiranUrls ?? existingLampirans,
            nominalRealisasi: body.nominalRealisasi !== undefined ? body.nominalRealisasi : dok.nominal_realisasi,
          })
        } catch (err) {
          console.error('[API/ppk/resubmit/:id] local requirement lookup error:', err)
          return Response.json({ error: 'Gagal resubmit' }, { status: 500 })
        }

        if (!requirements.ok) {
          return Response.json({ error: requirements.error }, { status: 400 })
        }

        let updatedLampirans: LampiranUrl[] | undefined = body.lampiranUrls
        let movedAttachments: LocalAttachmentMovedFile[] = []

        if (body.lampiranUrls && Array.isArray(body.lampiranUrls)) {
          const movement = await prepareAndMoveAttachments({
            ownerUserId: session.userId,
            dokumenId: params.id,
            nextAttachments: body.lampiranUrls,
            existingAttachments: existingLampirans,
            failurePrefix: 'Gagal resubmit',
          })

          if (!movement.ok) return movement.response

          updatedLampirans = movement.plannedAttachments
          movedAttachments = movement.moved
        }

        try {
          await db.transaction(async (tx) => {
            const updatePayload: Partial<typeof dokumenTransaksi.$inferInsert> = {
              status: result.newStatus,
              currentStep: result.newCurrentStep,
              revisionTarget: result.newRevisionTarget,
              // The PPSPM reason stays in log_aktivitas (PPSPM_REJECT).
              revisionNotes: null,
              updatedAt: new Date(),
            }

            if (updatedLampirans) {
              updatePayload.lampiranUrls = updatedLampirans
            }

            if (body.nominalRealisasi !== undefined) {
              updatePayload.nominalRealisasi =
                body.nominalRealisasi === null
                  ? null
                  : String(body.nominalRealisasi)
            }

            const updatedRows = await tx
              .update(dokumenTransaksi)
              .set(updatePayload)
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
              aksi: 'RESUBMIT_PPK',
              stepUrutan: result.stepUrutan,
            })
          })
        } catch (err) {
          const isConflict = err instanceof DokumenTransitionConflictError
          if (!isConflict) console.error('[API/ppk/resubmit/:id] local transaction error:', err)
          const rollbackOk = await rollbackMovedAttachmentsForDbFailure(movedAttachments)
          if (!rollbackOk) {
            return Response.json({
              error: 'Gagal resubmit setelah file dipindahkan; pemulihan file gagal',
              code: 'local-file-compensation-failed',
              compensationRequired: true,
            }, { status: 500 })
          }

          if (isConflict) return dokumenTransitionConflictResponse()
          return Response.json({ error: 'Gagal resubmit' }, { status: 500 })
        }

        if (updatedLampirans) {
          await cleanupUnreferencedReplacedLocalAttachments({
            context: 'ppk-resubmit-submit',
            dokumenId: params.id,
            oldAttachments: existingLampirans,
            newAttachments: updatedLampirans,
          })
        }

        return Response.json({ success: true })
      },
    },
  },
})
