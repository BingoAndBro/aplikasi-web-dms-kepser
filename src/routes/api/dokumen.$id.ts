import { lstat, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { berkasArsipItem } from '#/db/schema/arsip'
import { auditLog } from '#/db/schema/audit'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import {
  ketuaTimAssignments,
  masterDetailPermintaan,
  masterFungsi,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
  masterKomponen,
} from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { ARCHIVE_SOURCE_TYPE } from '#/lib/constants/archive-status'
import { getDokumenValidationErrorMessage, updateDokumenSchema } from '#/lib/schemas/dokumen'
import { type LampiranUrl } from '#/lib/dokumen-helpers'
import { parseDokumen, parseDokumenWithNames, parseLampiranUrls } from '#/lib/dokumen'
import { deriveLocalSubmitDisplayName } from '#/lib/dokumen/local-submit-write-bridge'
import {
  assertSafeLogicalStoragePath,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
} from '#/lib/storage/local-storage-paths'
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function normalizeNumericValue(value: string | number | null): number | null {
  if (value === null) return null
  if (typeof value === 'number') return value

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function canSessionReadDokumen(
  session: Awaited<ReturnType<typeof getLocalServerSession>>,
  dokumen: { created_by: string; status: string; revision_target: string | null; kegiatan_jenis_id: string },
): Promise<boolean> {
  if (!session) return false
  if (dokumen.created_by === session.user.id) return true

  // Tiap cabang peran MEMBERI izin, bukan menolak: satu user bisa memegang
  // beberapa peran sekaligus (ada role switcher), jadi cabang yang tidak
  // cocok harus jatuh ke pengecekan berikutnya -- bukan `return false` yang
  // memotong jalur ketua tim di bawah.
  if (hasLocalRole(session, 'PPK') && [
    'IN_PPK_VALIDATION',
    'IN_PPSPM_APPROVAL',
    'NEED_REVISION',
    'COMPLETED',
  ].includes(dokumen.status)) {
    return true
  }
  if (hasLocalRole(session, 'PPSPM') && (
    dokumen.status === 'IN_PPSPM_APPROVAL'
    || dokumen.status === 'COMPLETED'
    || (dokumen.status === 'NEED_REVISION' && dokumen.revision_target === 'PPK')
  )) {
    return true
  }
  if (hasLocalRole(session, 'KEPALA_SUB_BAGIAN_UMUM') && dokumen.status === 'COMPLETED') {
    return true
  }

  // Ketua tim kegiatan ini boleh membaca metadata dokumen apa pun (termasuk
  // yang bukan miliknya) di kegiatan yang ia pimpin -- selaras dengan
  // "Laporan Kegiatan" & "Pembersihan Dokumen" yang sudah menampilkan
  // dokumen ini ke ketua tim. Read-only: guard PATCH/DELETE tidak berubah.
  const assignment = await db
    .select({ id: ketuaTimAssignments.id })
    .from(ketuaTimAssignments)
    .where(and(
      eq(ketuaTimAssignments.userId, session.user.id),
      eq(ketuaTimAssignments.kegiatanId, dokumen.kegiatan_jenis_id),
    ))
    .limit(1)

  return assignment.length > 0
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

type LocalDeleteCandidate = {
  index: number
  physicalPath: string
}

type LocalDeleteIssueCode =
  | 'invalid-local-path'
  | 'not-a-file'
  | 'path-outside-root'
  | 'delete-failed'

type LocalDeleteIssue = {
  index: number
  code: LocalDeleteIssueCode
}

type LocalDeletePlan = {
  ok: true
  candidates: LocalDeleteCandidate[]
  missingCount: number
  skippedLegacyCount: number
} | {
  ok: false
  issue: LocalDeleteIssue
}

type LocalDeleteExecutionResult = {
  ok: boolean
  deletedCount: number
  missingCount: number
  skippedLegacyCount: number
  failures: LocalDeleteIssue[]
}

async function prepareDocumentAttachmentDeletePlan(
  lampiranUrls: LampiranUrl[],
): Promise<LocalDeletePlan> {
  const candidates: LocalDeleteCandidate[] = []
  let missingCount = 0
  let skippedLegacyCount = 0
  const storageRoot = getLocalStorageRoot()

  for (const [index, lampiran] of lampiranUrls.entries()) {
    const rawPath = lampiran.url
    if (!rawPath) continue

    if (isUrlLikeStoragePath(rawPath)) {
      skippedLegacyCount += 1
      continue
    }

    let logicalPath: string
    let physicalPath: string

    try {
      logicalPath = assertSafeLogicalStoragePath(rawPath)
      physicalPath = resolvePhysicalStoragePath(storageRoot, logicalPath)
    } catch {
      return { ok: false, issue: { index, code: 'invalid-local-path' } }
    }

    const inspection = await inspectDeletableLocalFile(storageRoot, physicalPath)

    if (inspection === 'missing') {
      missingCount += 1
      continue
    }

    if (inspection !== 'ok') {
      return { ok: false, issue: { index, code: inspection } }
    }

    candidates.push({ index, physicalPath })
  }

  return { ok: true, candidates, missingCount, skippedLegacyCount }
}

async function deleteDocumentAttachmentFiles(
  plan: Extract<LocalDeletePlan, { ok: true }>,
): Promise<LocalDeleteExecutionResult> {
  let deletedCount = 0
  let missingCount = plan.missingCount
  const failures: LocalDeleteIssue[] = []
  const storageRoot = getLocalStorageRoot()

  for (const candidate of plan.candidates) {
    const inspection = await inspectDeletableLocalFile(storageRoot, candidate.physicalPath)

    if (inspection === 'missing') {
      missingCount += 1
      continue
    }

    if (inspection !== 'ok') {
      failures.push({ index: candidate.index, code: inspection })
      continue
    }

    try {
      await unlink(candidate.physicalPath)
      deletedCount += 1
    } catch (error) {
      if (isNodeErrorCode(error, 'ENOENT')) {
        missingCount += 1
        continue
      }

      failures.push({ index: candidate.index, code: 'delete-failed' })
    }
  }

  return {
    ok: failures.length === 0,
    deletedCount,
    missingCount,
    skippedLegacyCount: plan.skippedLegacyCount,
    failures,
  }
}

async function inspectDeletableLocalFile(
  storageRoot: string,
  physicalPath: string,
): Promise<'ok' | 'missing' | 'not-a-file' | 'path-outside-root'> {
  try {
    const stats = await lstat(physicalPath)
    if (!stats.isFile()) return 'not-a-file'

    const [resolvedRoot, resolvedFile] = await Promise.all([
      realpath(storageRoot),
      realpath(physicalPath),
    ])

    return isPhysicalPathInsideRoot(resolvedRoot, resolvedFile)
      ? 'ok'
      : 'path-outside-root'
  } catch (error) {
    if (isNodeErrorCode(error, 'ENOENT')) return 'missing'
    return 'not-a-file'
  }
}

function isPhysicalPathInsideRoot(storageRoot: string, physicalPath: string): boolean {
  const relativePath = path.relative(storageRoot, physicalPath)

  return relativePath !== ''
    && !relativePath.startsWith('..')
    && !path.isAbsolute(relativePath)
}

function isUrlLikeStoragePath(storagePath: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(storagePath.trim())
}

function localDeletePreconditionResponse(issue: LocalDeleteIssue): Response {
  if (issue.code === 'invalid-local-path') {
    return Response.json({ error: 'Path lampiran tidak valid' }, { status: 400 })
  }

  return Response.json({
    error: 'File lampiran tidak aman untuk dihapus',
    details: { code: issue.code, index: issue.index },
  }, { status: 500 })
}

function localDeleteFailureResponse(result: LocalDeleteExecutionResult): Response {
  return Response.json({
    error: 'Dokumen terhapus, tetapi sebagian file lampiran gagal dihapus',
    documentDeleted: true,
    fileDeletion: {
      deletedCount: result.deletedCount,
      missingCount: result.missingCount,
      skippedLegacyCount: result.skippedLegacyCount,
      failedCount: result.failures.length,
      failures: result.failures,
    },
    compensationRequired: true,
  }, { status: 500 })
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === code
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
              keterangan_detail: dokumenTransaksi.keteranganDetail,
              created_at: dokumenTransaksi.createdAt,
              updated_at: dokumenTransaksi.updatedAt,
              jenis_permintaan_id: dokumenTransaksi.jenisPermintaanId,
              kategori_permintaan_id: dokumenTransaksi.kategoriPermintaanId,
              detail_permintaan_id: dokumenTransaksi.detailPermintaanId,
              komponen_id: dokumenTransaksi.komponenId,
              nama_dokumen: dokumenTransaksi.namaDokumen,
              lampiran_dibersihkan_at: dokumenTransaksi.lampiranDibersihkanAt,
              lampiran_dibersihkan_alasan: dokumenTransaksi.lampiranDibersihkanAlasan,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
              komponen_nama: masterKomponen.nama,
              jenis_permintaan_nama: masterJenisPermintaan.nama,
              kategori_permintaan_nama: masterKategoriPermintaan.nama,
              detail_permintaan_nama: masterDetailPermintaan.nama,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .leftJoin(masterKomponen, eq(dokumenTransaksi.komponenId, masterKomponen.id))
            .leftJoin(masterJenisPermintaan, eq(dokumenTransaksi.jenisPermintaanId, masterJenisPermintaan.id))
            .leftJoin(masterKategoriPermintaan, eq(dokumenTransaksi.kategoriPermintaanId, masterKategoriPermintaan.id))
            .leftJoin(masterDetailPermintaan, eq(dokumenTransaksi.detailPermintaanId, masterDetailPermintaan.id))
            .where(eq(dokumenTransaksi.id, params.id))
            .limit(1)

          const row = rows[0]
          if (!row) {
            return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
          }

          if (!(await canSessionReadDokumen(session, row))) {
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
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = updateDokumenSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({
            error: getDokumenValidationErrorMessage(parsed.error),
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
          tahun: number
          nama_dokumen: string | null
          lampiran_dibersihkan_at: Date | null
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
              tahun: dokumenTransaksi.tahun,
              nama_dokumen: dokumenTransaksi.namaDokumen,
              lampiran_dibersihkan_at: dokumenTransaksi.lampiranDibersihkanAt,
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
        // 1. Non-Material with TERSIMPAN status, lampiran belum dibersihkan
        // 2. Material with NEED_REVISION target=USER
        const canEditNonMaterial = isNonMaterial
          && dok.status === 'TERSIMPAN'
          && dok.lampiran_dibersihkan_at === null
        const canEditMaterial = !isNonMaterial && dok.status === 'NEED_REVISION' && dok.revision_target === 'USER'

        if (!canEditNonMaterial && !canEditMaterial) {
          if (isNonMaterial && dok.lampiran_dibersihkan_at !== null) {
            return Response.json({ error: 'Dokumen Non-Material tidak bisa diedit — lampiran sudah dibersihkan' }, { status: 400 })
          }
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
            if (parsed.data.komponenId !== undefined) {
              updatePayload.komponenId = parsed.data.komponenId
            }
            if (parsed.data.namaDokumen !== undefined) {
              updatePayload.namaDokumen = parsed.data.namaDokumen
              // Non-Material judul mirrors resolveLocalSubmitLeafName's leaf priority:
              // `{namaDokumen} {tahun} {displayName}`. Recompute only when namaDokumen changes.
              if (isNonMaterial && parsed.data.namaDokumen) {
                updatePayload.judul = `${parsed.data.namaDokumen} ${dok.tahun} ${deriveLocalSubmitDisplayName(session)}`
              }
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

        if (parsed.data.lampiranUrls !== undefined) {
          await cleanupUnreferencedReplacedLocalAttachments({
            context: 'dokumen-update',
            dokumenId: params.id,
            oldAttachments: storedLampirans,
            newAttachments: processedLampirans,
          })
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
              keterangan_detail: dokumenTransaksi.keteranganDetail,
              komponen_id: dokumenTransaksi.komponenId,
              nama_dokumen: dokumenTransaksi.namaDokumen,
              created_at: dokumenTransaksi.createdAt,
              updated_at: dokumenTransaksi.updatedAt,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
              komponen_nama: masterKomponen.nama,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .leftJoin(masterKomponen, eq(dokumenTransaksi.komponenId, masterKomponen.id))
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
          judul: string
          nama_dokumen: string | null
          created_by: string
          kegiatan_jenis_id: string
          status: string
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
              judul: dokumenTransaksi.judul,
              nama_dokumen: dokumenTransaksi.namaDokumen,
              created_by: dokumenTransaksi.createdBy,
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              status: dokumenTransaksi.status,
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
          console.error('[API/dokumen/:id] DELETE local lookup error:', err)
          return Response.json({ error: 'Gagal menghapus dokumen' }, { status: 500 })
        }

        const dok = dokRows[0]

        if (!dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        // Check if owner
        if (dok.created_by !== session.user.id) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        const isNonMaterial = dok.is_non_material === true
          && !dok.jenis_permintaan_id
          && !dok.kategori_permintaan_id
          && !dok.detail_permintaan_id

        if (!isNonMaterial || dok.status !== 'TERSIMPAN') {
          return Response.json({ error: 'Dokumen tidak bisa dihapus' }, { status: 400 })
        }

        let archiveRows: Array<{ id: string }>
        try {
          archiveRows = await db
            .select({
              id: berkasArsipItem.id,
            })
            .from(berkasArsipItem)
            .where(and(
              eq(berkasArsipItem.dokumenId, params.id),
              eq(berkasArsipItem.sourceType, ARCHIVE_SOURCE_TYPE.WORKFLOW),
            ))
            .limit(1)
        } catch (err) {
          console.error('[API/dokumen/:id] DELETE archive lookup error:', err)
          return Response.json({ error: 'Gagal menghapus dokumen' }, { status: 500 })
        }

        if (archiveRows.length > 0) {
          return Response.json({ error: 'Dokumen tidak bisa dihapus' }, { status: 400 })
        }

        const lampiranUrls = parseLampiranUrls(dok.lampiran_urls)
        let deletePlan: LocalDeletePlan
        try {
          deletePlan = await prepareDocumentAttachmentDeletePlan(lampiranUrls)
        } catch {
          console.error('[API/dokumen/:id] DELETE local file preflight error')
          return Response.json({ error: 'Gagal menghapus dokumen' }, { status: 500 })
        }

        if (!deletePlan.ok) {
          return localDeletePreconditionResponse(deletePlan.issue)
        }

        try {
          await db.transaction(async (tx) => {
            // Jejak audit ditulis SEBELUM baris dihapus, di tabel TANPA FK ke
            // dokumen (audit.audit_log) -- log_aktivitas di bawah ini ikut
            // cascade-terhapus sedetik kemudian bersama dokumennya, jadi
            // bukan jejak yang bisa diandalkan setelah hard delete.
            await tx.insert(auditLog).values({
              entityType: 'DOKUMEN',
              entityId: params.id,
              aksi: 'DOKUMEN_DIHAPUS_PERMANEN',
              actorUserId: session.user.id,
              metadataSnapshot: {
                judul: dok.judul,
                nama_dokumen: dok.nama_dokumen,
                pemilik_id: dok.created_by,
                kegiatan_id: dok.kegiatan_jenis_id,
                jumlah_lampiran: lampiranUrls.length,
              },
            })

            await tx.insert(logAktivitas).values({
              dokumenId: params.id,
              userId: session.user.id,
              aksi: 'DELETE',
              stepUrutan: null,
            })

            const deletedRows = await tx
              .delete(dokumenTransaksi)
              .where(eq(dokumenTransaksi.id, params.id))
              .returning({ id: dokumenTransaksi.id })

            if (deletedRows.length === 0) {
              throw new Error('DOCUMENT_DELETE_NOT_FOUND')
            }
          })
        } catch (err) {
          console.error('[API/dokumen/:id] DELETE local DB error:', err)
          return Response.json({ error: 'Gagal menghapus dokumen' }, { status: 500 })
        }

        let deleteResult: LocalDeleteExecutionResult
        try {
          deleteResult = await deleteDocumentAttachmentFiles(deletePlan)
        } catch {
          console.error('[API/dokumen/:id] DELETE local file cleanup error')
          return localDeleteFailureResponse({
            ok: false,
            deletedCount: 0,
            missingCount: deletePlan.missingCount,
            skippedLegacyCount: deletePlan.skippedLegacyCount,
            failures: [{ index: -1, code: 'delete-failed' }],
          })
        }

        if (!deleteResult.ok) {
          console.warn('[API/dokumen/:id] DELETE local file cleanup incomplete:', {
            dokumenId: params.id,
            deletedCount: deleteResult.deletedCount,
            missingCount: deleteResult.missingCount,
            skippedLegacyCount: deleteResult.skippedLegacyCount,
            failedCount: deleteResult.failures.length,
          })
          return localDeleteFailureResponse(deleteResult)
        }

        return Response.json({ success: true })
      },
    },
  },
})
