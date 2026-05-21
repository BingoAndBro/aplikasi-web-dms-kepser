import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import {
  analyzeLocalStorageReferences,
  DEFAULT_PENDING_CLEANUP_MIN_AGE_MINUTES,
  deleteLocalOrphanCandidates,
  getEligiblePendingCleanupPaths,
} from '#/lib/storage/local-storage-diagnostics'

// ---------------------------------------------------------------------------
// GET /api/admin/cleanup-orphan-files
//   - non-destructive analysis/dry-run only; destructive cleanup requires POST
//
// POST /api/admin/cleanup-orphan-files
// JSON body:
//   - dry_run=false : required for destructive cleanup
//   - confirm=true : required for destructive cleanup
//   - pending_only=true : report/clean only eligible pending files
//   - include_pending=true : include eligible pending files in cleanup candidates
//   - min_age_minutes=1440 : minimum pending age before cleanup eligibility
//
// GET query params support the same reporting controls, but dry_run=false is
// ignored on GET because destructive cleanup requires POST body intent.
// ---------------------------------------------------------------------------

const cleanupBodySchema = z.object({
  dry_run: z.boolean().optional().default(true),
  confirm: z.boolean().optional().default(false),
  include_pending: z.boolean().optional().default(false),
  pending_only: z.boolean().optional().default(false),
  min_age_minutes: z.number().finite().min(0).optional()
    .transform(value => value === undefined
      ? DEFAULT_PENDING_CLEANUP_MIN_AGE_MINUTES
      : Math.floor(value)),
}).strict()

type CleanupOptions = {
  dryRun: boolean
  pendingOnly: boolean
  includePending: boolean
  confirm: boolean
  minAgeMinutes: number
  destructiveRequiresPostMessage: boolean
}
type CleanupSession = NonNullable<Awaited<ReturnType<typeof getLocalServerSession>>>

export const Route = createFileRoute('/api/admin/cleanup-orphan-files')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await authorizeCleanupRequest(request)
        if (session instanceof Response) return session

        const url = new URL(request.url)
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
        const destructiveRequiresPostMessage = url.searchParams.get('dry_run') === 'false'

        return handleCleanupRequest(session, {
          dryRun: true,
          pendingOnly,
          includePending,
          confirm,
          minAgeMinutes,
          destructiveRequiresPostMessage,
        })
      },
      POST: async ({ request }: { request: Request }) => {
        const session = await authorizeCleanupRequest(request)
        if (session instanceof Response) return session

        const parsedBody = await parseCleanupBody(request)
        if (parsedBody instanceof Response) return parsedBody

        return handleCleanupRequest(session, {
          dryRun: parsedBody.dry_run,
          pendingOnly: parsedBody.pending_only,
          includePending: parsedBody.include_pending,
          confirm: parsedBody.confirm,
          minAgeMinutes: parsedBody.min_age_minutes,
          destructiveRequiresPostMessage: false,
        })
      },
    },
  },
})

async function authorizeCleanupRequest(
  request: Request,
): Promise<CleanupSession | Response> {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: 'Akses ditolak - hanya admin' }, { status: 403 })
  }

  return session
}

async function handleCleanupRequest(
  _session: CleanupSession,
  options: CleanupOptions,
): Promise<Response> {
  const {
    dryRun,
    pendingOnly,
    includePending,
    confirm,
    minAgeMinutes,
    destructiveRequiresPostMessage,
  } = options

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
    const destructiveConfirmed = !dryRun && confirm
    const pendingDeletionArmed = includePending && destructiveConfirmed
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
    const cleanupCandidatePaths = destructiveConfirmed
      ? [...orphanPaths, ...pendingCleanupPaths].sort()
      : []
    const dryRunCandidatePaths = [
      ...orphanPaths,
      ...(includePending || pendingOnly ? thresholdEligiblePendingPaths : []),
    ].sort()
    const skippedPendingCount = pendingPaths.length - pendingCleanupPaths.length
    const skippedRecentPendingCount = recentPendingPaths.length

    if (dryRun && dryRunCandidatePaths.length > 0) {
      return Response.json({
        message: destructiveRequiresPostMessage
          ? 'Destructive cleanup requires POST.'
          : pendingOnly ? 'Cleanup pending dry-run' : 'Cleanup dry-run',
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

    if (!dryRun && !confirm) {
      return Response.json({
        message: 'Cleanup dry-run; destructive cleanup requires confirm=true.',
        deleted_count: 0,
        orphan_paths: orphanPaths,
        dry_run: true,
        pending_only: pendingOnly,
        include_pending: includePending,
        min_age_minutes: minAgeMinutes,
        pending_cleanup_confirmed: false,
        skipped_pending_count: pendingPaths.length,
        skipped_recent_pending_count: skippedRecentPendingCount,
        pending_paths: pendingPaths,
        eligible_pending_paths: eligiblePendingPaths,
        analysis_summary: analysis.summary,
      })
    }

    if (cleanupCandidatePaths.length === 0) {
      return Response.json({
        message: destructiveRequiresPostMessage
          ? 'Destructive cleanup requires POST.'
          : pendingOnly
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
}

async function parseCleanupBody(request: Request): Promise<z.infer<typeof cleanupBodySchema> | Response> {
  let body: unknown = {}

  try {
    const rawBody = await request.text()
    body = rawBody.trim() === '' ? {} : JSON.parse(rawBody)
  } catch {
    return Response.json({ error: 'Body JSON tidak valid' }, { status: 400 })
  }

  const parsed = cleanupBodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({
      error: 'Body cleanup tidak valid',
      issues: parsed.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    }, { status: 400 })
  }

  return parsed.data
}

function parseMinAgeMinutes(value: string | null): number | null {
  if (value === null || value.trim() === '') {
    return DEFAULT_PENDING_CLEANUP_MIN_AGE_MINUTES
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null

  return Math.floor(parsed)
}
