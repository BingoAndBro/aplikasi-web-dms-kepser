// Server-only module. Do not import from client components.
// Safety net for pending uploads that the browser-side cleanup could not remove
// (browser crash, lost connection, tab killed mid-upload). A pending file only
// lives while its form is open: the form is not persisted (no drafts), so a
// file older than PENDING_UPLOAD_MAX_AGE_MINUTES belongs to an abandoned form.
import {
  analyzeLocalStorageReferences,
  DEFAULT_PENDING_CLEANUP_MIN_AGE_MINUTES,
  deleteLocalOrphanCandidates,
  getEligiblePendingCleanupPaths,
  type StorageDocumentMetadataRow,
  type StorageManualAttachmentMetadataRow,
} from '#/lib/storage/local-storage-diagnostics'

/**
 * Maximum age of a pending upload: 24 hours. A normal login session lasts 8
 * hours, so this covers a full working day plus a tab left open overnight, and
 * matches the admin cleanup default (DEFAULT_PENDING_CLEANUP_MIN_AGE_MINUTES).
 * A form submitted after this gets the "unggah ulang" preflight message.
 */
export const PENDING_UPLOAD_MAX_AGE_MINUTES = DEFAULT_PENDING_CLEANUP_MIN_AGE_MINUTES

/** At most one automatic sweep per server process per hour. */
export const PENDING_UPLOAD_SWEEP_INTERVAL_MS = 60 * 60 * 1000

export type StorageReferenceMetadata = {
  documents: StorageDocumentMetadataRow[]
  manualAttachments: StorageManualAttachmentMetadataRow[]
}

export type PendingUploadSweepResult = {
  deletedCount: number
  missingCount: number
  failedCount: number
  /** Pending files younger than the max age that were kept. */
  keptRecentCount: number
}

/**
 * Deletes pending uploads older than `maxAgeMinutes`. Paths referenced by any
 * dokumen lampiran or manual attachment are never deleted, even when their
 * name looks like a pending upload (legacy data).
 */
export async function sweepStalePendingUploads({
  maxAgeMinutes = PENDING_UPLOAD_MAX_AGE_MINUTES,
  loadReferences = loadStorageReferenceMetadata,
}: {
  maxAgeMinutes?: number
  loadReferences?: () => Promise<StorageReferenceMetadata>
} = {}): Promise<PendingUploadSweepResult> {
  const analysis = await analyzeLocalStorageReferences(await loadReferences())
  const stalePaths = getEligiblePendingCleanupPaths(analysis.pending_path_details, maxAgeMinutes)
  const result = await deleteLocalOrphanCandidates(stalePaths, {
    allowedClassifications: ['pending-dash', 'pending-upload-api'],
  })

  return {
    deletedCount: result.deletedCount,
    missingCount: result.missingCount,
    failedCount: result.failedCount,
    keptRecentCount: analysis.pending_path_details.length - stalePaths.length,
  }
}

let lastSweepStartedAt: number | null = null
let sweepInFlight: Promise<void> | null = null

/**
 * Fire-and-forget sweep, throttled per process. Called from the upload route:
 * pending files are only created by uploads, so sweeping there keeps the area
 * bounded without a separate scheduler. Never throws.
 */
export function maybeSweepStalePendingUploads({
  now = Date.now(),
  sweep = () => sweepStalePendingUploads(),
}: {
  now?: number
  sweep?: () => Promise<PendingUploadSweepResult>
} = {}): Promise<void> | null {
  if (sweepInFlight) return null
  if (lastSweepStartedAt !== null && now - lastSweepStartedAt < PENDING_UPLOAD_SWEEP_INTERVAL_MS) return null

  lastSweepStartedAt = now
  sweepInFlight = sweep()
    .then((result) => {
      if (result.failedCount > 0) {
        console.error('[pending-upload-sweeper] Some stale pending uploads could not be deleted', {
          failedCount: result.failedCount,
        })
      }
    })
    .catch(() => {
      console.error('[pending-upload-sweeper] Sweep failed')
    })
    .finally(() => {
      sweepInFlight = null
    })

  return sweepInFlight
}

export function resetPendingUploadSweepThrottleForTest(): void {
  lastSweepStartedAt = null
  sweepInFlight = null
}

export async function loadStorageReferenceMetadata(): Promise<StorageReferenceMetadata> {
  const { db } = await import('#/db/client')
  const { dokumenTransaksi } = await import('#/db/schema/dokumen')
  const { manualArsipAttachment } = await import('#/db/schema/arsip')

  const [documents, manualAttachments] = await Promise.all([
    db
      .select({ id: dokumenTransaksi.id, lampiranUrls: dokumenTransaksi.lampiranUrls })
      .from(dokumenTransaksi),
    db
      .select({ id: manualArsipAttachment.id, logicalPath: manualArsipAttachment.logicalPath })
      .from(manualArsipAttachment),
  ])

  return { documents, manualAttachments }
}
