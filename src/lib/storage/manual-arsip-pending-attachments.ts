// Server-only module. Do not import from client components.
// Manual archive attachments follow the same pending pattern as the Pegawai
// flow: files are uploaded to the pending area first (POST /api/upload) and only
// moved to `manual-arsip/<owner>/<id>/<uuid>.<ext>` inside the create
// transaction. This module checks the pending files before that transaction.
import { open, stat } from 'node:fs/promises'

import {
  LocalPendingMoveError,
  moveLocalPendingFileToLogicalPath,
  validateLocalPendingMoveSource,
} from '#/lib/storage/local-pending-move'
import {
  getLocalStorageRoot,
  getPendingUploadOriginalFilename,
  resolvePhysicalStoragePath,
} from '#/lib/storage/local-storage-paths'
import {
  rollbackLocalAttachmentMovements,
  type LocalAttachmentMovedFile,
} from '#/lib/storage/local-attachment-replacement'
import {
  DOCUMENT_UPLOAD_EXTENSIONS_BY_MIME_TYPE,
  DOCUMENT_UPLOAD_MAX_BYTES,
  matchesDocumentUploadSignature,
  type DocumentUploadAllowedMimeType,
} from '#/lib/upload/document-upload-policy'

export type ManualArsipPendingAttachmentInput = {
  url: string
  judul_lampiran: string
}

export type PreparedManualArsipPendingAttachment = {
  sourceLogicalPath: string
  judulLampiran: string
  originalFilename: string
  contentType: DocumentUploadAllowedMimeType
  sizeBytes: number
}

export class ManualArsipPendingAttachmentError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ManualArsipPendingAttachmentError'
  }
}

const SIGNATURE_BYTES = 8

const MIME_TYPE_BY_EXTENSION = new Map<string, DocumentUploadAllowedMimeType>(
  Object.entries(DOCUMENT_UPLOAD_EXTENSIONS_BY_MIME_TYPE).flatMap(([mimeType, extensions]) =>
    extensions.map(extension => [extension, mimeType as DocumentUploadAllowedMimeType] as const)),
)

/**
 * Validates every pending attachment before the create transaction starts.
 * Throws ManualArsipPendingAttachmentError (Indonesian, names the lampiran)
 * so the KSBU knows which file to upload again.
 */
export async function prepareManualArsipPendingAttachments({
  ownerUserId,
  attachments,
  root,
}: {
  ownerUserId: string
  attachments: readonly ManualArsipPendingAttachmentInput[]
  root?: string
}): Promise<PreparedManualArsipPendingAttachment[]> {
  const storageRoot = root ?? getLocalStorageRoot()
  const prepared: PreparedManualArsipPendingAttachment[] = []

  for (const attachment of attachments) {
    const label = `"${attachment.judul_lampiran}"`
    let sourceLogicalPath: string
    let extension: string

    try {
      const source = validateLocalPendingMoveSource({ sourceLogicalPath: attachment.url, ownerUserId })
      if (source.classification === 'formal') throw new Error('not-pending')
      sourceLogicalPath = source.logicalPath
      extension = source.extension
    } catch {
      throw invalidAttachment(label)
    }

    const contentType = MIME_TYPE_BY_EXTENSION.get(extension)
    const originalFilename = getPendingUploadOriginalFilename(sourceLogicalPath)
    if (!contentType || !originalFilename) throw invalidAttachment(label)

    const physicalPath = resolvePhysicalStoragePath(storageRoot, sourceLogicalPath)
    const sizeBytes = await readFileSize(physicalPath)
    if (sizeBytes === null) {
      throw new ManualArsipPendingAttachmentError(
        `Lampiran ${label} tidak ditemukan di penyimpanan sementara (kemungkinan sudah terhapus atau kedaluwarsa). `
          + 'Hapus lampiran tersebut, unggah ulang filenya, lalu simpan kembali.',
        400,
      )
    }

    if (sizeBytes === 0 || sizeBytes > DOCUMENT_UPLOAD_MAX_BYTES) {
      throw new ManualArsipPendingAttachmentError(
        `Ukuran lampiran ${label} tidak valid. Maksimal 5 MB per file; unggah ulang file yang sesuai.`,
        400,
      )
    }

    if (!matchesDocumentUploadSignature(await readFileHead(physicalPath), contentType)) {
      throw invalidAttachment(label)
    }

    prepared.push({
      sourceLogicalPath,
      judulLampiran: attachment.judul_lampiran,
      originalFilename,
      contentType,
      sizeBytes,
    })
  }

  return prepared
}

/**
 * Moves the prepared pending files to their final paths. Runs inside the create
 * transaction; on the first failure the files already moved go back to pending
 * and the error aborts the transaction. `moved` is shared with the caller so a
 * failed commit can also put the files back.
 */
export async function moveManualArsipPendingAttachments({
  ownerUserId,
  moves,
  moved,
}: {
  ownerUserId: string
  moves: ReadonlyArray<{ sourceLogicalPath: string; targetLogicalPath: string }>
  moved: LocalAttachmentMovedFile[]
}): Promise<void> {
  for (const [index, move] of moves.entries()) {
    try {
      await moveLocalPendingFileToLogicalPath({
        sourceLogicalPath: move.sourceLogicalPath,
        ownerUserId,
        targetLogicalPath: move.targetLogicalPath,
      })
      moved.push({ index, sourceLogicalPath: move.sourceLogicalPath, targetLogicalPath: move.targetLogicalPath })
    } catch (error) {
      const rollback = await rollbackLocalAttachmentMovements([...moved])
      if (rollback.ok) moved.length = 0
      else console.error('[manual-arsip] Pending attachment rollback failed after move failure')

      throw new ManualArsipPendingAttachmentError(
        error instanceof LocalPendingMoveError && error.code === 'missing-source'
          ? 'Salah satu lampiran tidak ditemukan di penyimpanan sementara. Unggah ulang lampiran lalu simpan kembali.'
          : 'Gagal menyimpan dokumen manual, silakan coba lagi.',
        error instanceof LocalPendingMoveError && error.code === 'missing-source' ? 400 : 500,
      )
    }
  }
}

function invalidAttachment(label: string): ManualArsipPendingAttachmentError {
  return new ManualArsipPendingAttachmentError(
    `Lampiran ${label} tidak valid atau bukan milik akun Anda. Hapus lampiran tersebut, unggah ulang filenya, lalu simpan kembali.`,
    400,
  )
}

async function readFileSize(physicalPath: string): Promise<number | null> {
  try {
    const stats = await stat(physicalPath)
    return stats.isFile() ? stats.size : null
  } catch {
    return null
  }
}

async function readFileHead(physicalPath: string): Promise<Uint8Array> {
  const handle = await open(physicalPath, 'r')
  try {
    const buffer = new Uint8Array(SIGNATURE_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, SIGNATURE_BYTES, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}
