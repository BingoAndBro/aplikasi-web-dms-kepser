// Server-only module. Do not import from client components.
//
// Membuka lampiran yang akan disalin ke Drive dengan status TERKINI: dokumen
// alur lewat resolver ekspor yang sama dengan ZIP (menolak lampiran yang
// dibersihkan / berkasnya dimusnahkan), dokumen tambahan KSBU bila status
// arsip efektifnya bukan DIMUSNAHKAN dan baris lampirannya masih ada. File
// fisik harus ada, berupa file biasa, dan <= 5 MB (D15). Path fisik tidak
// pernah keluar dari modul ini; stream baru dibuka saat benar-benar diunggah.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

import { ARCHIVE_STATUS } from '#/lib/constants/archive-status'
import { DRIVE_MAX_FILE_BYTES } from '#/lib/google-drive/config'
import type { BarisFileUnggah } from '#/lib/google-drive/tautan-drive-repository'
import { getLocalStorageRoot, resolvePhysicalStoragePath } from '#/lib/storage/local-storage-paths'

export type FileUntukUnggah =
  | { ok: true; size: number; buka: () => NodeJS.ReadableStream }
  | { ok: false }

export type FileSourceDeps = {
  resolveLogicalPath?: (baris: BarisFileUnggah) => Promise<string | null>
  root?: () => string
  stat?: (physicalPath: string) => Promise<{ isFile(): boolean; size: number }>
  createReadStream?: (physicalPath: string) => NodeJS.ReadableStream
}

async function resolveLogicalPathDefault(baris: BarisFileUnggah): Promise<string | null> {
  if (baris.sumber === 'DOKUMEN') {
    if (!baris.dokumenId || baris.lampiranIndex === null) return null
    const { resolveDocumentLampiranLogicalPathForExport } = await import('#/lib/storage/document-file-access')
    const result = await resolveDocumentLampiranLogicalPathForExport({
      documentId: baris.dokumenId,
      lampiranIndex: baris.lampiranIndex,
    })
    return result.ok ? result.logicalPath : null
  }

  if (!baris.manualArsipId || !baris.attachmentId) return null
  const [{ db }, { manualArsip, manualArsipAttachment }, { manualArsipEffectiveStatusArsip }, { and, eq }] = await Promise.all([
    import('#/db/client'),
    import('#/db/schema/arsip'),
    import('#/lib/archive/manual-arsip-effective-status'),
    import('drizzle-orm'),
  ])
  const [row] = await db
    .select({ logicalPath: manualArsipAttachment.logicalPath, statusArsip: manualArsipEffectiveStatusArsip })
    .from(manualArsipAttachment)
    .innerJoin(manualArsip, eq(manualArsip.id, manualArsipAttachment.manualArsipId))
    .where(and(
      eq(manualArsipAttachment.id, baris.attachmentId),
      eq(manualArsipAttachment.manualArsipId, baris.manualArsipId),
    ))
    .limit(1)
  if (!row || row.statusArsip === ARCHIVE_STATUS.DIMUSNAHKAN) return null
  return row.logicalPath
}

export async function bukaFileUntukUnggah(baris: BarisFileUnggah, deps: FileSourceDeps = {}): Promise<FileUntukUnggah> {
  const logicalPath = await (deps.resolveLogicalPath ?? resolveLogicalPathDefault)(baris)
  if (!logicalPath) return { ok: false }

  let physicalPath: string
  try {
    physicalPath = resolvePhysicalStoragePath((deps.root ?? getLocalStorageRoot)(), logicalPath)
  } catch {
    return { ok: false }
  }

  try {
    const info = await (deps.stat ?? stat)(physicalPath)
    if (!info.isFile() || info.size > DRIVE_MAX_FILE_BYTES) return { ok: false }
    const open = deps.createReadStream ?? ((target: string) => createReadStream(target))
    return { ok: true, size: info.size, buka: () => open(physicalPath) }
  } catch {
    return { ok: false }
  }
}
