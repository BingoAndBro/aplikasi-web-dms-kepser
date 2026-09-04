// Server-only module. Do not import from client components.
import { buildFormalFilename } from '#/lib/file-helpers'
import type { DokumenRow } from '#/lib/dokumen/types'
import {
  loadDocumentAccessContextForExport,
  resolveDocumentLampiranReferenceFromContext,
} from '#/lib/storage/document-file-access'
import { sanitizeStoragePathSegment } from '#/lib/storage/local-storage-paths'
import {
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
