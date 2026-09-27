// Deletes pending uploads older than 24 hours (see PENDING_UPLOAD_MAX_AGE_MINUTES).
// The server already runs this automatically after uploads (at most hourly);
// this script is for a scheduler (e.g. Windows Task Scheduler) or a manual run.
//
//   pnpm storage:sweep-pending
import {
  PENDING_UPLOAD_MAX_AGE_MINUTES,
  sweepStalePendingUploads,
} from '../lib/storage/pending-upload-sweeper'

async function main() {
  const result = await sweepStalePendingUploads()

  console.log(
    `File pending lebih dari ${PENDING_UPLOAD_MAX_AGE_MINUTES / 60} jam dihapus: ${result.deletedCount}. `
      + `Masih baru (dipertahankan): ${result.keptRecentCount}. Gagal dihapus: ${result.failedCount}.`,
  )

  if (result.failedCount > 0) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error('Pembersihan file pending gagal:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    // Close the pg pool so the process can exit (skipped if it never connected).
    try {
      const { pool } = await import('../db/client')
      await pool.end()
    } catch {
      // DATABASE_URL missing: the error above was already reported.
    }
  })
