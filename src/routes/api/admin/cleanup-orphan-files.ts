import { createFileRoute } from '@tanstack/react-router'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import {
  analyzeLocalStorageReferences,
  DEFAULT_PENDING_CLEANUP_MIN_AGE_MINUTES,
  deleteLocalOrphanCandidates,
  getEligiblePendingCleanupPaths,
} from '#/lib/storage/local-storage-diagnostics'

// ---------------------------------------------------------------------------
// GET /api/admin/cleanup-orphan-files
// Query params:
//   - dry_run=true|false : defaults to true; destructive cleanup requires dry_run=false
//   - pending_only=true : report/clean only eligible pending files
//   - include_pending=true : include eligible pending files in cleanup candidates
//   - min_age_minutes=1440 : minimum pending age before cleanup eligibility
//   - confirm=true : required together with dry_run=false before deleting pending files
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/admin/cleanup-orphan-files')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        if (!hasLocalRole(session, 'ADMIN')) {
          return Response.json({ error: 'Akses ditolak - hanya admin' }, { status: 403 })
        }

        const url = new URL(request.url)
        const dryRun = url.searchParams.get('dry_run') !== 'false'
        const pendingOnly = url.searchParams.get('pending_only') === 'true'
        const includePending = url.searchParams.get('include_pending') === 'true'
        const confirm = url.searchParams.get('confirm') === 'true'
        const parsedMinAgeMinutes = parseMinAgeMinutes(url.searchParams.get('min_age_minutes'))

        if (parsedMinAgeMinutes === null) {
          return Response.json({
            error: 'min_age_minutes harus berupa angka >= 0',
          }, { status: 400 })
        }

        const minAgeMinutes = parsedMinAgeMinutes

        try {
          const { db } = await import('#/db/client')
          const { dokumenTransaksi } = await import('#/db/schema/dokumen')
          const { arsip } = await import('#/db/schema/arsip')

          const [documents, archives] = await Promise.all([
            db
              .select({
                id: dokumenTransaksi.id,
                lampiranUrls: dokumenTransaksi.lampiranUrls,
              })
              .from(dokumenTransaksi),
            db
              .select({
                id: arsip.id,
                statusArsip: arsip.statusArsip,
                lampiranSnapshot: arsip.lampiranSnapshot,
              })
              .from(arsip),
          ])

          const analysis = await analyzeLocalStorageReferences({
            documents,
            archives,
          })
          const orphanPaths = pendingOnly ? [] : analysis.orphan_paths
          const pendingPaths = analysis.pending_paths
          const pendingDeletionArmed = includePending && !dryRun && confirm
          const thresholdEligiblePendingPaths = getEligiblePendingCleanupPaths(
            analysis.pending_path_details,
            minAgeMinutes,
          )
          const eligiblePendingPaths = includePending || pendingOnly
            ? thresholdEligiblePendingPaths
            : []
          const recentPendingPaths = analysis.pending_path_details
            .filter(detail => !thresholdEligiblePendingPaths.includes(detail.path))
            .map(detail => detail.path)
            .sort()
          const pendingCleanupPaths = pendingDeletionArmed ? thresholdEligiblePendingPaths : []
          const cleanupCandidatePaths = [...orphanPaths, ...pendingCleanupPaths].sort()
          const dryRunCandidatePaths = [
            ...orphanPaths,
            ...(includePending || pendingOnly ? thresholdEligiblePendingPaths : []),
          ].sort()
          const skippedPendingCount = pendingPaths.length - pendingCleanupPaths.length
          const skippedRecentPendingCount = recentPendingPaths.length

          if (dryRun && dryRunCandidatePaths.length > 0) {
            return Response.json({
              message: pendingOnly ? 'Cleanup pending dry-run' : 'Cleanup dry-run',
              deleted_count: 0,
              orphan_paths: orphanPaths,
              dry_run: true,
              pending_only: pendingOnly,
              include_pending: includePending,
              min_age_minutes: minAgeMinutes,
              pending_cleanup_confirmed: confirm,
              skipped_pending_count: pendingPaths.length,
              skipped_recent_pending_count: skippedRecentPendingCount,
              pending_paths: pendingPaths,
              eligible_pending_paths: eligiblePendingPaths,
              analysis_summary: analysis.summary,
            })
          }

          if (cleanupCandidatePaths.length === 0) {
            return Response.json({
              message: pendingOnly
                ? 'Tidak ada file pending yang memenuhi syarat cleanup; file pending hanya dilaporkan'
                : 'Tidak ada file orphan',
              deleted_count: 0,
              orphan_paths: orphanPaths,
              dry_run: dryRun,
              pending_only: pendingOnly,
              include_pending: includePending,
              min_age_minutes: minAgeMinutes,
              pending_cleanup_confirmed: confirm,
              skipped_pending_count: skippedPendingCount,
              skipped_recent_pending_count: skippedRecentPendingCount,
              pending_paths: pendingPaths,
              eligible_pending_paths: eligiblePendingPaths,
              analysis_summary: analysis.summary,
            })
          }

          if (dryRun) {
            return Response.json({
              message: 'Cleanup dry-run',
              deleted_count: 0,
              orphan_paths: orphanPaths,
              dry_run: true,
              pending_only: pendingOnly,
              include_pending: includePending,
              min_age_minutes: minAgeMinutes,
              pending_cleanup_confirmed: confirm,
              skipped_pending_count: pendingPaths.length,
              skipped_recent_pending_count: skippedRecentPendingCount,
              pending_paths: pendingPaths,
              eligible_pending_paths: eligiblePendingPaths,
              analysis_summary: analysis.summary,
            })
          }

          const cleanup = await deleteLocalOrphanCandidates(cleanupCandidatePaths, {
            allowedClassifications: pendingDeletionArmed
              ? ['formal', 'pending-dash', 'pending-upload-api']
              : ['formal'],
          })

          if (cleanup.failedCount > 0) {
            return Response.json({
              error: 'Cleanup sebagian gagal',
              deleted_count: cleanup.deletedCount,
              orphan_paths: orphanPaths,
              missing_count: cleanup.missingCount,
              failed_count: cleanup.failedCount,
              failures: cleanup.failures,
              compensationRequired: true,
              dry_run: false,
              pending_only: pendingOnly,
              include_pending: includePending,
              min_age_minutes: minAgeMinutes,
              pending_cleanup_confirmed: confirm,
              skipped_pending_count: skippedPendingCount,
              skipped_recent_pending_count: skippedRecentPendingCount,
              pending_paths: pendingPaths,
              eligible_pending_paths: eligiblePendingPaths,
              analysis_summary: analysis.summary,
            }, { status: 500 })
          }

          return Response.json({
            message: 'Cleanup berhasil',
            deleted_count: cleanup.deletedCount,
            orphan_paths: orphanPaths,
            missing_count: cleanup.missingCount,
            dry_run: false,
            pending_only: pendingOnly,
            include_pending: includePending,
            min_age_minutes: minAgeMinutes,
            pending_cleanup_confirmed: confirm,
            skipped_pending_count: skippedPendingCount,
            skipped_recent_pending_count: skippedRecentPendingCount,
            pending_paths: pendingPaths,
            eligible_pending_paths: eligiblePendingPaths,
            analysis_summary: analysis.summary,
          })
        } catch {
          console.error('[admin/cleanup-orphan-files] local cleanup failed')
          return Response.json({ error: 'Gagal cleanup file orphan lokal' }, { status: 500 })
        }
      },
    },
  },
})

function parseMinAgeMinutes(value: string | null): number | null {
  if (value === null || value.trim() === '') {
    return DEFAULT_PENDING_CLEANUP_MIN_AGE_MINUTES
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null

  return Math.floor(parsed)
}
