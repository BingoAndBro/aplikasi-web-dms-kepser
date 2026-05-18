import { createFileRoute } from '@tanstack/react-router'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import {
  analyzeLocalStorageReferences,
  deleteLocalOrphanCandidates,
} from '#/lib/storage/local-storage-diagnostics'

// ---------------------------------------------------------------------------
// GET /api/admin/cleanup-orphan-files
// Query params:
//   - pending_only=true : report pending files only; local pending files are not deleted in 9G
//   - dry_run=true|false : defaults to true; destructive cleanup requires dry_run=false
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
          const pendingPaths = pendingOnly ? analysis.pending_paths : []

          if (orphanPaths.length === 0) {
            return Response.json({
              message: pendingOnly
                ? 'Tidak ada file orphan yang memenuhi syarat cleanup; file pending hanya dilaporkan'
                : 'Tidak ada file orphan',
              deleted_count: 0,
              orphan_paths: orphanPaths,
              dry_run: dryRun,
              pending_only: pendingOnly,
              skipped_pending_count: pendingPaths.length,
              pending_paths: pendingPaths,
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
              skipped_pending_count: pendingPaths.length,
              pending_paths: pendingPaths,
              analysis_summary: analysis.summary,
            })
          }

          const cleanup = await deleteLocalOrphanCandidates(orphanPaths)

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
              skipped_pending_count: pendingPaths.length,
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
            skipped_pending_count: pendingPaths.length,
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
