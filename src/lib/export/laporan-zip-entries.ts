// Server-only module. Do not import from client components.
import { and, asc, eq, inArray } from 'drizzle-orm'

import { db } from '#/db/client'
import { manualArsip, manualArsipAttachment } from '#/db/schema/arsip'
import { masterKegiatan, masterKomponen } from '#/db/schema/master'
import { sanitizeBerkasAttachmentFilename } from '#/lib/archive/berkas-arsip-attachment-names'
import { buildManualArsipAttachmentFilename } from '#/lib/archive/manual-arsip-attachment-filename'
import { manualArsipEffectiveStatusArsip } from '#/lib/archive/manual-arsip-effective-status'
import { ARCHIVE_STATUS } from '#/lib/constants/archive-status'
import { buildFormalFilename } from '#/lib/file-helpers'
import type { DokumenRow } from '#/lib/dokumen/types'
import {
  loadDocumentAccessContextForExport,
  resolveDocumentLampiranReferenceFromContext,
} from '#/lib/storage/document-file-access'
import { sanitizeStoragePathSegment } from '#/lib/storage/local-storage-paths'
import {
  buildManualDocumentFolderName,
  buildWorkflowDocumentFolderName,
  type DocumentZipEntry,
} from '#/lib/export/document-zip'

/**
 * Shared by both RP-05 export endpoints (laporan/saya, laporan/kegiatan):
 * resolves each already-authorized document's attachments into ZIP entries.
 * Memoizes the per-document access context (one context load reused across
 * all of that document's lampiran indexes) instead of re-querying per index.
 */
export async function buildLaporanZipEntries(rows: DokumenRow[]): Promise<DocumentZipEntry[]> {
  const entries: DocumentZipEntry[] = []

  for (const row of rows) {
    const context = await loadDocumentAccessContextForExport(row.id)
    const files: DocumentZipEntry['files'] = []

    row.lampiran_urls.forEach((lampiran, lampiranIndex) => {
      if (!context) return

      const reference = resolveDocumentLampiranReferenceFromContext(context, lampiranIndex)
      if (reference.ok) {
        files.push({ namaAman: buildFormalFilename(row, lampiran), logicalPath: reference.logicalPath })
      }
    })

    entries.push({
      folderPath: buildWorkflowDocumentFolderName({ id: row.id, judul: row.judul, tanggal: row.tanggal }),
      files,
    })
  }

  return entries
}

export type ManualArsipExportRow = {
  id: string
  nama: string
  tanggal: string
  kegiatan_nama: string | null
  komponen_nama: string | null
  status_arsip: string
}

/**
 * D-29: dokumen tambahan KSBU untuk ekspor ZIP Laporan Kegiatan. Hanya id yang
 * kegiatannya dipimpin pemanggil yang dikembalikan (otorisasi di server; id
 * lain diabaikan diam-diam, sama seperti dokumen alur). `status_arsip` adalah
 * status efektif, yaitu status berkas penaungnya.
 */
export async function loadManualArsipExportRows({
  manualArsipIds,
  kegiatanIds,
}: {
  manualArsipIds: readonly string[]
  kegiatanIds: readonly string[]
}): Promise<ManualArsipExportRow[]> {
  if (manualArsipIds.length === 0 || kegiatanIds.length === 0) return []

  return db
    .select({
      id: manualArsip.id,
      nama: manualArsip.nama,
      tanggal: manualArsip.tanggal,
      kegiatan_nama: masterKegiatan.nama,
      komponen_nama: masterKomponen.nama,
      status_arsip: manualArsipEffectiveStatusArsip,
    })
    .from(manualArsip)
    .leftJoin(masterKegiatan, eq(manualArsip.kegiatanId, masterKegiatan.id))
    .leftJoin(masterKomponen, eq(manualArsip.komponenId, masterKomponen.id))
    .where(and(
      inArray(manualArsip.id, [...manualArsipIds]),
      inArray(manualArsip.kegiatanId, [...kegiatanIds]),
    ))
}

/**
 * Satu folder "[Manual] …" per dokumen tambahan KSBU, dengan nama file formal
 * yang sama seperti ekspor berkas KSBU. Dokumen yang berkasnya dimusnahkan
 * tetap dicatat di daftar isi, tanpa file (lampirannya sudah dihapus).
 */
export async function buildManualArsipZipEntries(rows: ManualArsipExportRow[]): Promise<DocumentZipEntry[]> {
  const entries: DocumentZipEntry[] = []

  for (const row of rows) {
    const folderPath = buildManualDocumentFolderName({ id: row.id, judul: row.nama })

    if (row.status_arsip === ARCHIVE_STATUS.DIMUSNAHKAN) {
      entries.push({ folderPath, files: [], skipReason: 'berkas dimusnahkan, lampiran sudah dihapus' })
      continue
    }

    const attachments = await db
      .select({
        logical_path: manualArsipAttachment.logicalPath,
        judul_lampiran: manualArsipAttachment.judulLampiran,
        original_filename: manualArsipAttachment.originalFilename,
        content_type: manualArsipAttachment.contentType,
      })
      .from(manualArsipAttachment)
      .where(eq(manualArsipAttachment.manualArsipId, row.id))
      .orderBy(asc(manualArsipAttachment.createdAt), asc(manualArsipAttachment.id))

    entries.push({
      folderPath,
      files: attachments.map((attachment) => ({
        logicalPath: attachment.logical_path,
        namaAman: sanitizeBerkasAttachmentFilename(
          buildManualArsipAttachmentFilename(attachment, {
            nama: row.nama,
            tanggal: row.tanggal,
            komponen_nama: row.komponen_nama,
          }),
        ) ?? attachment.judul_lampiran,
      })),
    })
  }

  return entries
}

export function buildLaporanExportZipFilename(prefix: string, identity: string): string {
  const datePart = new Date().toISOString().slice(0, 10)

  return `${prefix}_${safeFilenameSegment(identity)}_${datePart}.zip`
}

export function resolveKegiatanFilenamePart(rows: Array<{ kegiatan_nama?: string | null }>): string {
  const uniqueNames = new Set(
    rows.map(row => row.kegiatan_nama).filter((nama): nama is string => Boolean(nama)),
  )

  return uniqueNames.size === 1 ? [...uniqueNames][0] : 'Kegiatan'
}

function safeFilenameSegment(value: string): string {
  try {
    return sanitizeStoragePathSegment(value)
  } catch {
    return 'Ekspor'
  }
}
