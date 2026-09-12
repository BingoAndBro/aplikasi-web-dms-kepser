// Server-only module. Do not import from client components.
//
// Pembersihan LAMPIRAN FISIK dokumen non-material oleh ketua tim. `status`
// dan `lampiran_urls` TIDAK diubah -- lihat docs/planning/pembersihan-non-material/rencana.md.
// Pola injeksi repository meniru `berkas-arsip-physical-destruction.ts`
// (default lazy `await import('#/db/client')`) agar unit test murni tanpa DB.
import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { berkasArsipItem, manualArsipAttachment } from '#/db/schema/arsip'
import { auditLog } from '#/db/schema/audit'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { ARCHIVE_SOURCE_TYPE } from '#/lib/constants/archive-status'
import { parseLampiranUrls } from '#/lib/dokumen/parse'
import { PEMBERSIHAN_BATCH_LIMIT } from '#/lib/dokumen/pembersihan'
import {
  assertSafeLogicalStoragePath,
} from '#/lib/storage/local-storage-paths'
import {
  deleteLogicalFilesSafely,
  type LogicalFileDeletionOutcome,
} from '#/lib/storage/logical-file-deletion'

export type PembersihanCandidateRow = {
  id: string
  judul: string
  nama_dokumen: string | null
  created_by: string
  status: string
  is_non_material: boolean | null
  jenis_permintaan_id: string | null
  kategori_permintaan_id: string | null
  detail_permintaan_id: string | null
  kegiatan_jenis_id: string
  lampiran_dibersihkan_at: string | Date | null
  lampiran_urls: unknown
}

export type PembersihanRejectReason =
  | 'NOT_FOUND'
  | 'NOT_NON_MATERIAL'
  | 'NOT_TERSIMPAN'
  | 'NOT_LED_BY_ACTOR'
  | 'ALREADY_CLEANED'
  | 'IN_BERKAS_ARSIP'

export type PembersihanPlanItem =
  | { dokumen_id: string; eligible: true }
  | { dokumen_id: string; eligible: false; reason: PembersihanRejectReason }

/**
 * Fungsi murni -- menyaring dokumen mana yang boleh dibersihkan lampirannya.
 * Tidak melempar; setiap dokumen yang ditolak diberi alasannya sendiri
 * (idempoten: dokumen yang sudah bersih di-skip dengan 'ALREADY_CLEANED',
 * bukan error).
 */
export function buildPembersihanPlan(
  requestedDokumenIds: readonly string[],
  rows: readonly PembersihanCandidateRow[],
  options: {
    actorKegiatanIds: ReadonlySet<string>
    dokumenIdsInBerkasArsip: ReadonlySet<string>
  },
): PembersihanPlanItem[] {
  const rowsById = new Map(rows.map((row) => [row.id, row]))

  return requestedDokumenIds.map((dokumenId): PembersihanPlanItem => {
    const row = rowsById.get(dokumenId)
    if (!row) return { dokumen_id: dokumenId, eligible: false, reason: 'NOT_FOUND' }

    const isPureNonMaterial = row.is_non_material === true
      && !row.jenis_permintaan_id
      && !row.kategori_permintaan_id
      && !row.detail_permintaan_id

    if (!isPureNonMaterial) {
      return { dokumen_id: dokumenId, eligible: false, reason: 'NOT_NON_MATERIAL' }
    }

    if (row.status !== 'TERSIMPAN') {
      return { dokumen_id: dokumenId, eligible: false, reason: 'NOT_TERSIMPAN' }
    }

    if (!options.actorKegiatanIds.has(row.kegiatan_jenis_id)) {
      return { dokumen_id: dokumenId, eligible: false, reason: 'NOT_LED_BY_ACTOR' }
    }

    if (row.lampiran_dibersihkan_at !== null) {
      return { dokumen_id: dokumenId, eligible: false, reason: 'ALREADY_CLEANED' }
    }

    // Jaring pengaman: dokumen non-material tidak pernah masuk berkas hari
    // ini (endpoint klasifikasi arsip mensyaratkan status COMPLETED), tapi
    // dicek ulang agar guard tidak diam-diam lolos bila alur berubah nanti.
    if (options.dokumenIdsInBerkasArsip.has(dokumenId)) {
      return { dokumen_id: dokumenId, eligible: false, reason: 'IN_BERKAS_ARSIP' }
    }

    return { dokumen_id: dokumenId, eligible: true }
  })
}

export type PembersihanItemOutcome =
  | { dokumen_id: string; outcome: 'cleaned' }
  | { dokumen_id: string; outcome: 'skipped'; reason: PembersihanRejectReason }
  | { dokumen_id: string; outcome: 'failed' }

export type PembersihanExecutionReport = {
  requested_count: number
  cleaned_count: number
  skipped_count: number
  failed_count: number
  items: PembersihanItemOutcome[]
}

export type PembersihanExecutionRepository = {
  listCandidatesByIds(dokumenIds: string[]): Promise<PembersihanCandidateRow[]>
  listDokumenIdsInBerkasArsip(dokumenIds: string[]): Promise<string[]>
  /** Path yang masih dirujuk baris LAIN (di luar `excludeDokumenIds`) + seluruh lampiran manual arsip. */
  loadProtectedLogicalPaths(excludeDokumenIds: string[]): Promise<Set<string>>
  applyCleanup(input: {
    actorUserId: string
    entries: Array<{
      dokumenId: string
      metadataSnapshot: Record<string, unknown>
    }>
  }): Promise<void>
}

const isUrlLikeStoragePath = (value: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(value.trim())

export async function executePembersihanLampiran(
  input: {
    dokumenIds: readonly string[]
    actorUserId: string
    actorKegiatanIds: ReadonlySet<string>
  },
  deps: {
    repository?: PembersihanExecutionRepository
    root?: string
  } = {},
): Promise<PembersihanExecutionReport> {
  const repository = deps.repository ?? defaultPembersihanExecutionRepository
  const requestedDokumenIds = unique(input.dokumenIds).slice(0, PEMBERSIHAN_BATCH_LIMIT)

  const rows = await repository.listCandidatesByIds(requestedDokumenIds)
  const dokumenIdsInBerkasArsip = new Set(await repository.listDokumenIdsInBerkasArsip(requestedDokumenIds))

  const plan = buildPembersihanPlan(requestedDokumenIds, rows, {
    actorKegiatanIds: input.actorKegiatanIds,
    dokumenIdsInBerkasArsip,
  })

  const rowsById = new Map(rows.map((row) => [row.id, row]))
  const eligibleIds = plan
    .filter((item): item is { dokumen_id: string; eligible: true } => item.eligible)
    .map((item) => item.dokumen_id)

  if (eligibleIds.length === 0) {
    return summarize(plan, {})
  }

  const protectedLogicalPaths = await repository.loadProtectedLogicalPaths(eligibleIds)

  // Ratakan seluruh entri lampiran milik dokumen yang lolos jadi satu batch,
  // sambil tetap melacak entri itu milik dokumen mana.
  const flatEntries: Array<{ dokumenId: string; logicalPath: string }> = []
  const legacyOnlyIds = new Set<string>() // dokumen yang seluruh entrinya legacy URL (tidak ada file lokal)

  for (const dokumenId of eligibleIds) {
    const row = rowsById.get(dokumenId)
    if (!row) continue

    const attachments = parseLampiranUrls(row.lampiran_urls)
    if (attachments.length === 0) {
      legacyOnlyIds.add(dokumenId)
      continue
    }

    let hasLocalEntry = false
    for (const attachment of attachments) {
      if (isUrlLikeStoragePath(attachment.url)) continue // data legacy (URL Supabase lama) -- bukan file lokal
      hasLocalEntry = true
      flatEntries.push({ dokumenId, logicalPath: attachment.url })
    }
    if (!hasLocalEntry) legacyOnlyIds.add(dokumenId)
  }

  const deletionReport = flatEntries.length > 0
    ? await deleteLogicalFilesSafely(flatEntries.map((entry) => entry.logicalPath), {
      root: deps.root,
      protectedLogicalPaths,
    })
    : null

  const outcomeByIndex = new Map(deletionReport?.items.map((item) => [item.index, item.outcome]) ?? [])
  const cleanedIds: string[] = []
  const failedIds = new Set<string>()

  for (const dokumenId of eligibleIds) {
    if (legacyOnlyIds.has(dokumenId)) {
      // Tidak ada file lokal untuk dibersihkan -- anggap bersih (nothing to do).
      cleanedIds.push(dokumenId)
      continue
    }

    const outcomesForDoc = flatEntries
      .map((entry, index) => (entry.dokumenId === dokumenId ? outcomeByIndex.get(index) : undefined))
      .filter((outcome): outcome is LogicalFileDeletionOutcome => outcome !== undefined)

    const isFullyResolved = outcomesForDoc.every((outcome) =>
      outcome === 'deleted' || outcome === 'already_missing' || outcome === 'duplicate_skipped')

    if (isFullyResolved) {
      cleanedIds.push(dokumenId)
    } else {
      failedIds.add(dokumenId)
    }
  }

  if (cleanedIds.length > 0) {
    await repository.applyCleanup({
      actorUserId: input.actorUserId,
      entries: cleanedIds.map((dokumenId) => {
        const row = rowsById.get(dokumenId)!
        return {
          dokumenId,
          metadataSnapshot: {
            judul: row.judul,
            nama_dokumen: row.nama_dokumen,
            pemilik_id: row.created_by,
            kegiatan_id: row.kegiatan_jenis_id,
            jumlah_lampiran: parseLampiranUrls(row.lampiran_urls).length,
          },
        }
      }),
    })
  }

  return summarize(plan, { cleanedIds: new Set(cleanedIds), failedIds })
}

function summarize(
  plan: PembersihanPlanItem[],
  result: { cleanedIds?: Set<string>; failedIds?: Set<string> },
): PembersihanExecutionReport {
  const cleanedIds = result.cleanedIds ?? new Set<string>()
  const failedIds = result.failedIds ?? new Set<string>()

  const items: PembersihanItemOutcome[] = plan.map((item) => {
    if (!item.eligible) return { dokumen_id: item.dokumen_id, outcome: 'skipped', reason: item.reason }
    if (failedIds.has(item.dokumen_id)) return { dokumen_id: item.dokumen_id, outcome: 'failed' }
    if (cleanedIds.has(item.dokumen_id)) return { dokumen_id: item.dokumen_id, outcome: 'cleaned' }
    return { dokumen_id: item.dokumen_id, outcome: 'failed' }
  })

  return {
    requested_count: items.length,
    cleaned_count: items.filter((item) => item.outcome === 'cleaned').length,
    skipped_count: items.filter((item) => item.outcome === 'skipped').length,
    failed_count: items.filter((item) => item.outcome === 'failed').length,
    items,
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

const defaultPembersihanExecutionRepository: PembersihanExecutionRepository = {
  async listCandidatesByIds(dokumenIds) {
    if (dokumenIds.length === 0) return []
    const database = await getDatabase()

    return database
      .select({
        id: dokumenTransaksi.id,
        judul: dokumenTransaksi.judul,
        nama_dokumen: dokumenTransaksi.namaDokumen,
        created_by: dokumenTransaksi.createdBy,
        status: dokumenTransaksi.status,
        is_non_material: dokumenTransaksi.isNonMaterial,
        jenis_permintaan_id: dokumenTransaksi.jenisPermintaanId,
        kategori_permintaan_id: dokumenTransaksi.kategoriPermintaanId,
        detail_permintaan_id: dokumenTransaksi.detailPermintaanId,
        kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
        lampiran_dibersihkan_at: dokumenTransaksi.lampiranDibersihkanAt,
        lampiran_urls: dokumenTransaksi.lampiranUrls,
      })
      .from(dokumenTransaksi)
      .where(inArray(dokumenTransaksi.id, dokumenIds)) as Promise<PembersihanCandidateRow[]>
  },

  async listDokumenIdsInBerkasArsip(dokumenIds) {
    if (dokumenIds.length === 0) return []
    const database = await getDatabase()

    const rows = await database
      .select({ dokumen_id: berkasArsipItem.dokumenId })
      .from(berkasArsipItem)
      .where(and(
        eq(berkasArsipItem.sourceType, ARCHIVE_SOURCE_TYPE.WORKFLOW),
        inArray(berkasArsipItem.dokumenId, dokumenIds),
      ))

    return rows.map((row) => row.dokumen_id).filter((id): id is string => id !== null)
  },

  async loadProtectedLogicalPaths(excludeDokumenIds) {
    const database = await getDatabase()
    const protectedPaths = new Set<string>()

    const otherDocumentRowsQuery = database
      .select({ lampiranUrls: dokumenTransaksi.lampiranUrls })
      .from(dokumenTransaksi)

    const [otherDocumentRows, manualAttachmentRows] = await Promise.all([
      excludeDokumenIds.length > 0
        ? otherDocumentRowsQuery.where(notInArray(dokumenTransaksi.id, excludeDokumenIds))
        : otherDocumentRowsQuery,
      database
        .select({ logicalPath: manualArsipAttachment.logicalPath })
        .from(manualArsipAttachment),
    ])

    for (const row of otherDocumentRows) {
      for (const attachment of parseLampiranUrls(row.lampiranUrls)) {
        addSafeLogicalPath(protectedPaths, attachment.url)
      }
    }

    for (const row of manualAttachmentRows) {
      addSafeLogicalPath(protectedPaths, row.logicalPath)
    }

    return protectedPaths
  },

  async applyCleanup({ actorUserId, entries }) {
    if (entries.length === 0) return
    const database = await getDatabase()
    const now = new Date()

    await database.transaction(async (tx) => {
      for (const entry of entries) {
        await tx
          .update(dokumenTransaksi)
          .set({
            lampiranDibersihkanAt: now,
            lampiranDibersihkanBy: actorUserId,
            lampiranDibersihkanAlasan: 'PEMBERSIHAN_NON_MATERIAL',
          })
          .where(eq(dokumenTransaksi.id, entry.dokumenId))

        await tx.insert(auditLog).values({
          entityType: 'DOKUMEN',
          entityId: entry.dokumenId,
          aksi: 'DOKUMEN_LAMPIRAN_DIBERSIHKAN',
          actorUserId,
          metadataSnapshot: entry.metadataSnapshot,
        })
      }
    })
  },
}

function addSafeLogicalPath(target: Set<string>, value: unknown): void {
  if (typeof value !== 'string') return
  try {
    target.add(assertSafeLogicalStoragePath(value))
  } catch {
    // Metadata tidak aman/legacy -- tidak boleh melindungi apa pun.
  }
}

async function getDatabase() {
  const client = await import('#/db/client')
  return client.db
}
