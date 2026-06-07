import { describe, expect, it, vi } from 'vitest'

import {
  PHASE15_BERKAS_ACTIVITY_DEV_RESET_CONFIRMATION,
  analyzePhase15BerkasActivityDevReset,
  resetPhase15BerkasActivityDevData,
  type Phase15BerkasActivityDevResetRepository,
  type Phase15BerkasActivityDevResetTableCounts,
} from '#/lib/archive/phase15-berkas-activity-dev-reset-analysis'

const DELETE_COUNTS: Phase15BerkasActivityDevResetTableCounts = {
  berkas_arsip_activity: 8,
  berkas_arsip_item: 5,
  berkas_arsip: 3,
  manual_arsip_attachment: 4,
  manual_arsip: 2,
  archive_lifecycle_or_proposal: 0,
}

describe('Phase 15 berkas activity dev archive reset helper', () => {
  it('dry-runs aggregate archive reset scope without deleting anything', async () => {
    const repository = createRepository()

    const report = await analyzePhase15BerkasActivityDevReset({ repository })

    expect(report).toMatchObject({
      mode: 'dry_run',
      status: 'dry_run',
      would_delete_rows_by_table: DELETE_COUNTS,
      deleted_rows_by_table: emptyCounts(),
      preserved_counts: {
        workflow_source_documents_referenced_by_berkas_items: 2,
        workflow_source_documents_deleted: 0,
        workflow_approval_history_deleted: 0,
        auth_user_session_rows_deleted: 0,
        master_data_rows_deleted: 0,
        fungsi_kegiatan_rows_deleted: 0,
        kelengkapan_configuration_rows_deleted: 0,
      },
      physicalFileDeletionPerformed: false,
    })
    expect(repository.countResetScope).toHaveBeenCalledTimes(1)
    expect(repository.executeReset).not.toHaveBeenCalled()
    expectNoLeak(report)
  })

  it('rejects destructive mode without the exact confirmation phrase before repository access', async () => {
    const repository = createRepository()

    const report = await resetPhase15BerkasActivityDevData({
      dryRun: false,
      confirmation: 'RESET ARCHIVE DATA',
      repository,
    })

    expect(report).toMatchObject({
      mode: 'execute',
      status: 'confirmation_required',
      would_delete_rows_by_table: emptyCounts(),
      deleted_rows_by_table: emptyCounts(),
      physicalFileDeletionPerformed: false,
      warnings: ['INVALID_CONFIRMATION'],
    })
    expect(repository.countResetScope).not.toHaveBeenCalled()
    expect(repository.executeReset).not.toHaveBeenCalled()
    expectNoLeak(report)
  })

  it('keeps execution DB-only and aggregate-only when exact confirmation is supplied', async () => {
    const repository = createRepository()

    const report = await resetPhase15BerkasActivityDevData({
      dryRun: false,
      confirmation: PHASE15_BERKAS_ACTIVITY_DEV_RESET_CONFIRMATION,
      repository,
    })

    expect(report).toMatchObject({
      mode: 'execute',
      status: 'completed',
      would_delete_rows_by_table: DELETE_COUNTS,
      deleted_rows_by_table: DELETE_COUNTS,
      preserved_counts: {
        workflow_source_documents_referenced_by_berkas_items: 2,
        workflow_source_documents_deleted: 0,
        workflow_approval_history_deleted: 0,
        auth_user_session_rows_deleted: 0,
        master_data_rows_deleted: 0,
        fungsi_kegiatan_rows_deleted: 0,
        kelengkapan_configuration_rows_deleted: 0,
      },
      physicalFileDeletionPerformed: false,
    })
    expect(repository.countResetScope).toHaveBeenCalledTimes(1)
    expect(repository.executeReset).toHaveBeenCalledTimes(1)
    expectNoLeak(report)
  })
})

function createRepository(): Phase15BerkasActivityDevResetRepository & {
  countResetScope: ReturnType<typeof vi.fn>
  executeReset: ReturnType<typeof vi.fn>
} {
  return {
    countResetScope: vi.fn(async () => ({
      deleteCounts: DELETE_COUNTS,
      preservedCounts: {
        workflow_source_documents_referenced_by_berkas_items: 2,
        workflow_source_documents_deleted: 0,
        workflow_approval_history_deleted: 0,
        auth_user_session_rows_deleted: 0,
        master_data_rows_deleted: 0,
        fungsi_kegiatan_rows_deleted: 0,
        kelengkapan_configuration_rows_deleted: 0,
      },
    })),
    executeReset: vi.fn(async () => DELETE_COUNTS),
  }
}

function emptyCounts(): Phase15BerkasActivityDevResetTableCounts {
  return {
    berkas_arsip_activity: 0,
    berkas_arsip_item: 0,
    berkas_arsip: 0,
    manual_arsip_attachment: 0,
    manual_arsip: 0,
    archive_lifecycle_or_proposal: 0,
  }
}

function expectNoLeak(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('logicalPath')
  expect(serialized).not.toContain('physical_path')
  expect(serialized).not.toContain('physicalPath')
  expect(serialized).not.toContain('storage root')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('cookie')
  expect(serialized).not.toContain('session value')
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('SQL')
}
