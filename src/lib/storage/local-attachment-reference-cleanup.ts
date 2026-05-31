// Server-only module. Do not import from client components.
import { db } from '#/db/client'
import { manualArsipAttachment } from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { parseLampiranUrls } from '#/lib/dokumen'
import type { LampiranUrl } from '#/lib/dokumen/types'
import { assertSafeLogicalStoragePath } from '#/lib/storage/local-storage-paths'
import {
  cleanupReplacedLocalAttachments,
  type LocalReplacedAttachmentCleanupResult,
} from '#/lib/storage/local-attachment-replacement'

type CleanupContext = 'dokumen-update' | 'ppk-resubmit-save' | 'ppk-resubmit-submit'

export async function cleanupUnreferencedReplacedLocalAttachments({
  context,
  dokumenId,
  oldAttachments,
  newAttachments,
}: {
  context: CleanupContext
  dokumenId: string
  oldAttachments: LampiranUrl[]
  newAttachments: LampiranUrl[]
}): Promise<void> {
  let protectedLogicalPaths: Set<string>

  try {
    protectedLogicalPaths = await loadReferencedLocalAttachmentPaths()
  } catch {
    console.warn('[local-attachment-cleanup] Skipped replaced-file cleanup; reference guard failed:', {
      context,
      dokumenId,
    })
    return
  }

  let cleanup: LocalReplacedAttachmentCleanupResult
  try {
    cleanup = await cleanupReplacedLocalAttachments({
      oldAttachments,
      newAttachments,
      protectedLogicalPaths,
    })
  } catch {
    console.warn('[local-attachment-cleanup] Skipped replaced-file cleanup; cleanup failed:', {
      context,
      dokumenId,
    })
    return
  }

  if (cleanup.failedCount > 0) {
    console.warn('[local-attachment-cleanup] Replaced-file cleanup incomplete:', {
      context,
      dokumenId,
      ...safeCleanupSummary(cleanup),
    })
  }
}

async function loadReferencedLocalAttachmentPaths(): Promise<Set<string>> {
  const referencedPaths = new Set<string>()

  const [documentRows, manualAttachmentRows] = await Promise.all([
    db
      .select({
        id: dokumenTransaksi.id,
        lampiranUrls: dokumenTransaksi.lampiranUrls,
      })
      .from(dokumenTransaksi),
    db
      .select({
        id: manualArsipAttachment.id,
        logicalPath: manualArsipAttachment.logicalPath,
      })
      .from(manualArsipAttachment),
  ])

  for (const row of documentRows) {
    addReferencedAttachmentPaths(referencedPaths, parseLampiranUrls(row.lampiranUrls))
  }

  for (const row of manualAttachmentRows) {
    addReferencedLogicalPath(referencedPaths, row.logicalPath)
  }

  return referencedPaths
}

function addReferencedLogicalPath(
  referencedPaths: Set<string>,
  logicalPath: unknown,
): void {
  if (typeof logicalPath !== 'string') return

  try {
    referencedPaths.add(assertSafeLogicalStoragePath(logicalPath))
  } catch {
    // Unsafe or legacy metadata must not influence deletion.
  }
}

function addReferencedAttachmentPaths(
  referencedPaths: Set<string>,
  attachments: LampiranUrl[],
): void {
  for (const attachment of attachments) {
    try {
      referencedPaths.add(assertSafeLogicalStoragePath(attachment.url))
    } catch {
      // Unsafe or legacy metadata must not influence deletion.
    }
  }
}

function safeCleanupSummary(cleanup: LocalReplacedAttachmentCleanupResult) {
  return {
    deletedCount: cleanup.deletedCount,
    missingCount: cleanup.missingCount,
    skippedCount: cleanup.skippedCount,
    protectedCount: cleanup.protectedCount,
    failedCount: cleanup.failedCount,
    failureCodes: [...new Set(cleanup.failures.map(failure => failure.code))],
  }
}
