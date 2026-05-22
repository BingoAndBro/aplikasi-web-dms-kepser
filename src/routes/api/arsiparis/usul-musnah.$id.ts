import { lstat, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db/client'
import { users } from '#/db/schema/auth'
import { arsip as arsipTable, arsipUsulMusnah } from '#/db/schema/arsip'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import {
  masterDetailPermintaan,
  masterFungsi,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
} from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import type { LampiranUrl } from '#/lib/dokumen-helpers'
import {
  assertSafeLogicalStoragePath,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
} from '#/lib/storage/local-storage-paths'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function parseLampiranSnapshot(value: unknown): LampiranUrl[] {
  if (!value) return []
  if (Array.isArray(value)) return value as LampiranUrl[]
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as LampiranUrl[] : []
  } catch {
    return []
  }
}

function displayUserName(user: {
  displayName: string | null
  namaLengkap: string | null
  email: string | null
} | null): string {
  return user?.displayName
    ?? user?.namaLengkap
    ?? user?.email
    ?? '\u2014'
}

type LocalArchiveDeleteCandidate = {
  index: number
  physicalPath: string
}

type LocalArchiveDeleteIssueCode =
  | 'invalid-local-path'
  | 'not-a-file'
  | 'path-outside-root'
  | 'delete-failed'

type LocalArchiveDeleteIssue = {
  index: number
  code: LocalArchiveDeleteIssueCode
}

type LocalArchiveDeletePlan = {
  ok: true
  candidates: LocalArchiveDeleteCandidate[]
  missingCount: number
  skippedLegacyCount: number
} | {
  ok: false
  issue: LocalArchiveDeleteIssue
}

type LocalArchiveDeleteExecutionResult = {
  ok: boolean
  deletedCount: number
  missingCount: number
  skippedLegacyCount: number
  failures: LocalArchiveDeleteIssue[]
}

async function prepareArchiveSnapshotDeletePlan(
  lampiranUrls: LampiranUrl[],
): Promise<LocalArchiveDeletePlan> {
  const candidates: LocalArchiveDeleteCandidate[] = []
  let missingCount = 0
  let skippedLegacyCount = 0
  const storageRoot = getLocalStorageRoot()

  for (const [index, lampiran] of lampiranUrls.entries()) {
    const rawPath = (lampiran as { url?: unknown }).url
    if (!rawPath) continue
    if (typeof rawPath !== 'string') {
      return { ok: false, issue: { index, code: 'invalid-local-path' } }
    }

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

async function deleteArchiveSnapshotFiles(
  plan: Extract<LocalArchiveDeletePlan, { ok: true }>,
): Promise<LocalArchiveDeleteExecutionResult> {
  let deletedCount = 0
  let missingCount = plan.missingCount
  const failures: LocalArchiveDeleteIssue[] = []
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

function localArchiveDeletePreconditionResponse(issue: LocalArchiveDeleteIssue): Response {
  if (issue.code === 'invalid-local-path') {
    return Response.json({ error: 'Path lampiran arsip tidak valid' }, { status: 400 })
  }

  return Response.json({
    error: 'File lampiran arsip tidak aman untuk dimusnahkan',
    details: { code: issue.code, index: issue.index },
  }, { status: 500 })
}

function localArchiveDeleteFailureResponse(result: LocalArchiveDeleteExecutionResult): Response {
  return Response.json({
    error: 'Arsip dimusnahkan, tetapi sebagian file lampiran gagal dihapus',
    archiveDestroyed: true,
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
// GET  /api/arsiparis/usul-musnah/[id]   - detail usul musnah
// PATCH /api/arsiparis/usul-musnah/[id]  - setuju musnah (destroy)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/usul-musnah/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, 'KEPALA_SUB_BAGIAN_UMUM')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        if (!isUuid(params.id)) return Response.json({ error: 'Usul musnah tidak ditemukan' }, { status: 404 })

        try {
          const rows = await db
            .select({
              musnah_id: arsipUsulMusnah.id,
              musnah_arsip_id: arsipUsulMusnah.arsipId,
              musnah_status: arsipUsulMusnah.status,
              musnah_catatan: arsipUsulMusnah.catatan,
              musnah_created_at: arsipUsulMusnah.createdAt,
              diusulkan_oleh: arsipUsulMusnah.diusulkanOleh,
              arsip_id: arsipTable.id,
              nomor_surat: arsipTable.nomorSurat,
              klasifikasi: arsipTable.klasifikasi,
              retensi_aktif: arsipTable.retensiAktif,
              retensi_inaktif: arsipTable.retensiInaktif,
              masa_aktif_berakhir: arsipTable.masaAktifBerakhir,
              masa_inaktif_berakhir: arsipTable.masaInaktifBerakhir,
              status_arsip: arsipTable.statusArsip,
              archived_at: arsipTable.archivedAt,
              archived_by: arsipTable.archivedBy,
              lampiran_snapshot: arsipTable.lampiranSnapshot,
              musnah_at: arsipTable.musnahAt,
              musnah_by: arsipTable.musnahBy,
              arsip_musnah_catatan: arsipTable.musnahCatatan,
              dokumen_id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
              jenis_permintaan_nama: masterJenisPermintaan.nama,
              kategori_permintaan_nama: masterKategoriPermintaan.nama,
              detail_permintaan_nama: masterDetailPermintaan.nama,
              tahun: dokumenTransaksi.tahun,
            })
            .from(arsipUsulMusnah)
            .innerJoin(arsipTable, eq(arsipUsulMusnah.arsipId, arsipTable.id))
            .leftJoin(dokumenTransaksi, eq(arsipTable.dokumenId, dokumenTransaksi.id))
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .leftJoin(masterJenisPermintaan, eq(dokumenTransaksi.jenisPermintaanId, masterJenisPermintaan.id))
            .leftJoin(masterKategoriPermintaan, eq(dokumenTransaksi.kategoriPermintaanId, masterKategoriPermintaan.id))
            .leftJoin(masterDetailPermintaan, eq(dokumenTransaksi.detailPermintaanId, masterDetailPermintaan.id))
            .where(eq(arsipUsulMusnah.id, params.id))
            .limit(1)

          const row = rows[0]
          if (!row) return Response.json({ error: 'Usul musnah tidak ditemukan' }, { status: 404 })

          const userIds = [
            row.diusulkan_oleh,
            row.archived_by,
            row.musnah_by,
          ].filter(Boolean) as string[]
          const userRows = userIds.length > 0
            ? await db
                .select({
                  id: users.id,
                  displayName: users.displayName,
                  namaLengkap: users.namaLengkap,
                  email: users.email,
                })
                .from(users)
                .where(inArray(users.id, userIds))
            : []
          const userMap = new Map(userRows.map((user) => [user.id, user]))

          return Response.json({
            musnah: {
              id: row.musnah_id,
              arsip_id: row.musnah_arsip_id,
              status: row.musnah_status,
              catatan: row.musnah_catatan,
              created_at: row.musnah_created_at,
              diusulkan_oleh: row.diusulkan_oleh,
              diusulkan_oleh_nama: displayUserName(row.diusulkan_oleh ? userMap.get(row.diusulkan_oleh) ?? null : null),
            },
            arsip: {
              id: row.arsip_id,
              nomor_surat: row.nomor_surat ?? '\u2014',
              klasifikasi: row.klasifikasi ?? '\u2014',
              retensi_aktif: row.retensi_aktif ?? '\u2014',
              retensi_inaktif: row.retensi_inaktif ?? '\u2014',
              masa_aktif_berakhir: row.masa_aktif_berakhir,
              masa_inaktif_berakhir: row.masa_inaktif_berakhir,
              status_arsip: row.status_arsip,
              archived_at: row.archived_at,
              archived_by: row.archived_by,
              archived_by_nama: displayUserName(row.archived_by ? userMap.get(row.archived_by) ?? null : null),
              dokumen_id: row.dokumen_id ?? '\u2014',
              lampiran_urls: parseLampiranSnapshot(row.lampiran_snapshot),
              lampiran_snapshot: row.lampiran_snapshot,
              musnah_at: row.musnah_at,
              musnah_by: row.musnah_by,
              musnah_by_nama: row.musnah_by ? displayUserName(userMap.get(row.musnah_by) ?? null) : '\u2014',
              musnah_catatan: row.arsip_musnah_catatan,
              dokumen: row.dokumen_id ? {
                id: row.dokumen_id,
                judul: row.judul,
                fungsi_nama: row.fungsi_nama ?? '\u2014',
                kegiatan_nama: row.kegiatan_nama ?? '\u2014',
                jenis_permintaan: row.jenis_permintaan_nama ?? '\u2014',
                kategori_permintaan: row.kategori_permintaan_nama ?? '\u2014',
                detail_permintaan: row.detail_permintaan_nama ?? '\u2014',
                tahun: row.tahun,
              } : null,
            },
          })
        } catch (err) {
          console.error('[usul-musnah/:id] GET local query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },

      PATCH: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, 'KEPALA_SUB_BAGIAN_UMUM')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        if (!isUuid(params.id)) return Response.json({ error: 'Usul musnah tidak ditemukan' }, { status: 404 })

        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Body tidak valid' }, { status: 400 })

        const parsed = z.object({
          aksi: z.literal('SETUJUI', { message: 'Aksi harus SETUJUI' }),
        }).safeParse(body)

        if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })

        let musnahRows: Array<{
          musnah_id: string
          musnah_arsip_id: string
          musnah_status: string
          musnah_catatan: string | null
        }>

        try {
          musnahRows = await db
            .select({
              musnah_id: arsipUsulMusnah.id,
              musnah_arsip_id: arsipUsulMusnah.arsipId,
              musnah_status: arsipUsulMusnah.status,
              musnah_catatan: arsipUsulMusnah.catatan,
            })
            .from(arsipUsulMusnah)
            .where(eq(arsipUsulMusnah.id, params.id))
            .limit(1)
        } catch (err) {
          console.error('[usul-musnah-patch] local musnah lookup error:', err)
          return Response.json({ error: 'Gagal memperbarui usul musnah' }, { status: 500 })
        }

        const musnahRow = musnahRows[0]
        if (!musnahRow) return Response.json({ error: 'Usul musnah tidak ditemukan' }, { status: 404 })
        if (musnahRow.musnah_status !== 'MENUNGGU') return Response.json({ error: 'Usul musnah sudah diputuskan' }, { status: 400 })

        let arsipRows: Array<{
          arsip_id: string
          dokumen_id: string
          status_arsip: string
          lampiran_snapshot: unknown
        }>

        try {
          arsipRows = await db
            .select({
              arsip_id: arsipTable.id,
              dokumen_id: arsipTable.dokumenId,
              status_arsip: arsipTable.statusArsip,
              lampiran_snapshot: arsipTable.lampiranSnapshot,
            })
            .from(arsipTable)
            .where(eq(arsipTable.id, musnahRow.musnah_arsip_id))
            .limit(1)
        } catch (err) {
          console.error('[usul-musnah-patch] local arsip lookup error:', err)
          return Response.json({ error: 'Gagal memperbarui status arsip' }, { status: 500 })
        }

        const row = arsipRows[0]
        if (!row) return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })
        if (row.status_arsip !== 'USUL_MUSNAH') return Response.json({ error: 'Arsip bukan dalam status usul musnah' }, { status: 400 })

        const lampiranUrls = parseLampiranSnapshot(row.lampiran_snapshot)
        let deletePlan: LocalArchiveDeletePlan
        try {
          deletePlan = await prepareArchiveSnapshotDeletePlan(lampiranUrls)
        } catch {
          console.error('[usul-musnah-patch] local file preflight error')
          return Response.json({ error: 'Gagal memproses file arsip' }, { status: 500 })
        }

        if (!deletePlan.ok) {
          return localArchiveDeletePreconditionResponse(deletePlan.issue)
        }

        try {
          await db.transaction(async (tx) => {
            const decidedAt = new Date()

            const updatedMusnahRows = await tx
              .update(arsipUsulMusnah)
              .set({
                status: 'DISETUJUI',
                decidedBy: session.user.id,
                decidedAt,
              })
              .where(and(
                eq(arsipUsulMusnah.id, musnahRow.musnah_id),
                eq(arsipUsulMusnah.status, 'MENUNGGU'),
              ))
              .returning({ id: arsipUsulMusnah.id })

            if (updatedMusnahRows.length === 0) {
              throw new Error('USUL_MUSNAH_UPDATE_NOT_FOUND')
            }

            const updatedArsipRows = await tx
              .update(arsipTable)
              .set({
                statusArsip: 'DIMUSNAHKAN',
                lampiranSnapshot: [],
                musnahAt: decidedAt,
                musnahBy: session.user.id,
                musnahCatatan: musnahRow.musnah_catatan ?? null,
              })
              .where(and(
                eq(arsipTable.id, row.arsip_id),
                eq(arsipTable.statusArsip, 'USUL_MUSNAH'),
              ))
              .returning({ id: arsipTable.id })

            if (updatedArsipRows.length === 0) {
              throw new Error('ARSIP_UPDATE_NOT_FOUND')
            }

            await tx.insert(logAktivitas).values({
              dokumenId: row.dokumen_id,
              userId: session.user.id,
              aksi: 'USUL_MUSNAH_SETUJUI',
              catatan: null,
              stepUrutan: null,
            })
          })
        } catch (err) {
          console.error('[usul-musnah-patch] local transaction error:', err)
          return Response.json({ error: 'Gagal memperbarui status arsip' }, { status: 500 })
        }

        let deleteResult: LocalArchiveDeleteExecutionResult
        try {
          deleteResult = await deleteArchiveSnapshotFiles(deletePlan)
        } catch {
          console.error('[usul-musnah-patch] local file cleanup error')
          return localArchiveDeleteFailureResponse({
            ok: false,
            deletedCount: 0,
            missingCount: deletePlan.missingCount,
            skippedLegacyCount: deletePlan.skippedLegacyCount,
            failures: [{ index: -1, code: 'delete-failed' }],
          })
        }

        if (!deleteResult.ok) {
          console.warn('[usul-musnah-patch] local file cleanup incomplete:', {
            usulMusnahId: params.id,
            arsipId: row.arsip_id,
            deletedCount: deleteResult.deletedCount,
            missingCount: deleteResult.missingCount,
            skippedLegacyCount: deleteResult.skippedLegacyCount,
            failedCount: deleteResult.failures.length,
          })
          return localArchiveDeleteFailureResponse(deleteResult)
        }

        return Response.json({ success: true, message: 'Arsip berhasil dimusnahkan' })
      },
    },
  },
})
