import { mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  analyzeLocalStorageReferences,
  deleteLocalOrphanCandidates,
  getEligiblePendingCleanupPaths,
} from '#/lib/storage/local-storage-diagnostics'
import type { StorageArchiveMetadataRow, StorageDocumentMetadataRow } from '#/lib/storage/local-storage-diagnostics'

const TEST_ROOT = path.resolve('.tmp', 'local-storage-diagnostics-root')
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const DOKUMEN_ID = '22222222-2222-4222-8222-222222222222'
const ARCHIVE_DOKUMEN_ID = '33333333-3333-4333-8333-333333333333'
const DOC_REF_PATH = `${OWNER_ID}/${DOKUMEN_ID}/44444444-4444-4444-8444-444444444444.pdf`
const ARCHIVE_REF_PATH = `${OWNER_ID}/${ARCHIVE_DOKUMEN_ID}/55555555-5555-4555-8555-555555555555.pdf`
const ORPHAN_PATH = `${OWNER_ID}/${DOKUMEN_ID}/66666666-6666-4666-8666-666666666666.pdf`
const MISSING_REF_PATH = `${OWNER_ID}/${DOKUMEN_ID}/77777777-7777-4777-8777-777777777777.pdf`
const OLD_PENDING_PATH = `${OWNER_ID}/88888888-8888-4888-8888-888888888888_1778064971564_Bukti.pdf`
const RECENT_PENDING_PATH = `${OWNER_ID}/1778064971564-AbCd1234-Bukti.pdf`
const NOW = new Date('2026-05-20T00:00:00.000Z')

describe('local storage diagnostics', () => {
  const previousStorageRoot = process.env.DMS_LOCAL_STORAGE_ROOT

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    process.env.DMS_LOCAL_STORAGE_ROOT = TEST_ROOT
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  afterEach(async () => {
    vi.useRealTimers()

    if (previousStorageRoot === undefined) {
      delete process.env.DMS_LOCAL_STORAGE_ROOT
    } else {
      process.env.DMS_LOCAL_STORAGE_ROOT = previousStorageRoot
    }

    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  it('protects document and archive references while reporting orphan, pending, and missing paths', async () => {
    await writeLogicalFile(DOC_REF_PATH, 'doc referenced')
    await writeLogicalFile(ARCHIVE_REF_PATH, 'archive referenced')
    await writeLogicalFile(ORPHAN_PATH, 'orphan formal')
    await writeLogicalFile(OLD_PENDING_PATH, 'old pending')
    await writeLogicalFile(RECENT_PENDING_PATH, 'recent pending')
    await setLogicalFileAgeMinutes(OLD_PENDING_PATH, 1500)
    await setLogicalFileAgeMinutes(RECENT_PENDING_PATH, 5)

    const analysis = await analyzeLocalStorageReferences({
      documents: [documentRow([
        lampiran(DOC_REF_PATH),
        lampiran(MISSING_REF_PATH),
        lampiran('https://example.test/legacy.pdf'),
        lampiran('../unsafe.pdf'),
      ])],
      archives: [archiveRow([lampiran(ARCHIVE_REF_PATH)])],
    })

    expect(analysis.referenced_paths).toEqual([ARCHIVE_REF_PATH, DOC_REF_PATH].sort())
    expect(analysis.orphan_paths).toEqual([ORPHAN_PATH])
    expect(analysis.pending_paths).toEqual([OLD_PENDING_PATH, RECENT_PENDING_PATH].sort())
    expect(analysis.eligible_pending_paths).toEqual([OLD_PENDING_PATH])
    expect(analysis.recent_pending_paths).toEqual([RECENT_PENDING_PATH])
    expect(analysis.missing_referenced_paths).toEqual([MISSING_REF_PATH])
    expect(analysis.metadata_issues.map(issue => issue.code).sort()).toEqual([
      'invalid-local-path',
      'legacy-or-url-reference',
    ])
    expect(analysis.summary).toMatchObject({
      total_orphan_files: 1,
      total_referenced_files: 2,
      total_pending_files: 2,
      total_missing_referenced_files: 1,
      total_eligible_pending_files_for_default_cleanup: 1,
      total_recent_pending_files_for_default_cleanup: 1,
    })
    expectNoPhysicalPathExposure(analysis)
  })

  it('deletes non-pending orphan candidates and treats missing candidates as no-op', async () => {
    await writeLogicalFile(ORPHAN_PATH, 'orphan formal')

    const result = await deleteLocalOrphanCandidates([ORPHAN_PATH, MISSING_REF_PATH])

    expect(result).toMatchObject({
      deletedCount: 1,
      missingCount: 1,
      failedCount: 0,
    })
    await expect(stat(physicalPathFor(ORPHAN_PATH))).rejects.toMatchObject({ code: 'ENOENT' })
    expectNoPhysicalPathExposure(result)
  })

  it('does not delete pending candidates unless the caller explicitly allows pending classifications', async () => {
    await writeLogicalFile(OLD_PENDING_PATH, 'old pending')

    const skipped = await deleteLocalOrphanCandidates([OLD_PENDING_PATH])
    expect(skipped).toMatchObject({
      deletedCount: 0,
      failedCount: 1,
    })
    expect(skipped.failures[0]).toEqual({ path: OLD_PENDING_PATH, code: 'unsupported-path' })
    expect(await readFile(physicalPathFor(OLD_PENDING_PATH), 'utf8')).toBe('old pending')

    const deleted = await deleteLocalOrphanCandidates([OLD_PENDING_PATH], {
      allowedClassifications: ['pending-upload-api'],
    })

    expect(deleted).toMatchObject({
      deletedCount: 1,
      failedCount: 0,
    })
    await expect(stat(physicalPathFor(OLD_PENDING_PATH))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('selects pending cleanup candidates by age threshold', async () => {
    await writeLogicalFile(OLD_PENDING_PATH, 'old pending')
    await writeLogicalFile(RECENT_PENDING_PATH, 'recent pending')
    await setLogicalFileAgeMinutes(OLD_PENDING_PATH, 1500)
    await setLogicalFileAgeMinutes(RECENT_PENDING_PATH, 5)

    const analysis = await analyzeLocalStorageReferences({
      documents: [],
      archives: [],
    })

    expect(getEligiblePendingCleanupPaths(analysis.pending_path_details, 1440)).toEqual([OLD_PENDING_PATH])
    expect(getEligiblePendingCleanupPaths(analysis.pending_path_details, 0)).toEqual(
      [OLD_PENDING_PATH, RECENT_PENDING_PATH].sort(),
    )
  })
})

function documentRow(lampiranUrls: Array<{ url: string }>): StorageDocumentMetadataRow {
  return {
    id: DOKUMEN_ID,
    lampiranUrls,
  }
}

function archiveRow(lampiranSnapshot: Array<{ url: string }>): StorageArchiveMetadataRow {
  return {
    id: ARCHIVE_DOKUMEN_ID,
    statusArsip: 'DIMUSNAHKAN',
    lampiranSnapshot,
  }
}

function lampiran(url: string): { url: string } {
  return { url }
}

async function writeLogicalFile(logicalPath: string, content: string): Promise<void> {
  const physicalPath = physicalPathFor(logicalPath)
  await mkdir(path.dirname(physicalPath), { recursive: true })
  await writeFile(physicalPath, content)
}

async function setLogicalFileAgeMinutes(logicalPath: string, ageMinutes: number): Promise<void> {
  const mtime = new Date(NOW.getTime() - ageMinutes * 60 * 1000)
  await utimes(physicalPathFor(logicalPath), mtime, mtime)
}

function physicalPathFor(logicalPath: string): string {
  return path.join(TEST_ROOT, ...logicalPath.split('/'))
}

function expectNoPhysicalPathExposure(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain(TEST_ROOT)
  expect(serialized).not.toContain(TEST_ROOT.replace(/\\/g, '/'))
}
