import path from 'node:path'
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { deleteLogicalFilesSafely } from '#/lib/storage/logical-file-deletion'

const TEST_ROOT = path.resolve('.tmp', 'logical-file-deletion')

describe('deleteLogicalFilesSafely', () => {
  beforeEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  it('deletes a plain file and reports it as deleted', async () => {
    await writeLogicalFile('owner/doc-1/file.pdf', 'content')

    const report = await deleteLogicalFilesSafely(['owner/doc-1/file.pdf'], { root: TEST_ROOT })

    expect(report).toMatchObject({
      status: 'completed',
      total_candidates: 1,
      deleted_count: 1,
      failed_count: 0,
      items: [{ index: 0, outcome: 'deleted' }],
    })
  })

  it('reports missing files as already_missing, not failed', async () => {
    const report = await deleteLogicalFilesSafely(['owner/doc-1/missing.pdf'], { root: TEST_ROOT })

    expect(report).toMatchObject({
      status: 'completed',
      already_missing_count: 1,
      failed_count: 0,
      items: [{ index: 0, outcome: 'already_missing' }],
    })
  })

  it('skips paths outside the storage root as unsafe, without throwing', async () => {
    const report = await deleteLogicalFilesSafely(['../outside.pdf'], { root: TEST_ROOT })

    expect(report).toMatchObject({
      status: 'partial',
      skipped_unsafe_count: 1,
      items: [{ index: 0, outcome: 'unsafe_skipped' }],
    })
  })

  it('rejects symlinks even when they resolve inside the root', async () => {
    const canMakeSymlink = await tryCreateSymlink('owner/doc-1/link.pdf', 'owner/doc-1/real.pdf')
    if (!canMakeSymlink) return // symlink privilege unavailable in this environment (e.g. Windows CI)

    const report = await deleteLogicalFilesSafely(['owner/doc-1/link.pdf'], { root: TEST_ROOT })

    expect(report.items[0]).toEqual({ index: 0, outcome: 'unsafe_skipped' })
  })

  it('honors protectedLogicalPaths and never touches the file on disk', async () => {
    await writeLogicalFile('owner/doc-1/shared.pdf', 'shared')

    const report = await deleteLogicalFilesSafely(['owner/doc-1/shared.pdf'], {
      root: TEST_ROOT,
      protectedLogicalPaths: new Set(['owner/doc-1/shared.pdf']),
    })

    expect(report).toMatchObject({
      protected_count: 1,
      deleted_count: 0,
      items: [{ index: 0, outcome: 'protected' }],
    })
    await expect(readLogicalFileExists('owner/doc-1/shared.pdf')).resolves.toBe(true)
  })

  it('dedupes candidates that resolve to the same physical path', async () => {
    await writeLogicalFile('owner/doc-1/dup.pdf', 'dup')

    const report = await deleteLogicalFilesSafely(
      ['owner/doc-1/dup.pdf', 'owner/doc-1/dup.pdf'],
      { root: TEST_ROOT },
    )

    expect(report.deleted_count).toBe(1)
    expect(report.skipped_duplicate_count).toBe(1)
    expect(report.items).toEqual([
      { index: 0, outcome: 'deleted' },
      { index: 1, outcome: 'duplicate_skipped' },
    ])
  })

  it('does not delete anything in dry-run mode', async () => {
    await writeLogicalFile('owner/doc-1/dry.pdf', 'dry')

    const report = await deleteLogicalFilesSafely(['owner/doc-1/dry.pdf'], {
      root: TEST_ROOT,
      dryRun: true,
    })

    expect(report.items[0].outcome).toBe('skipped')
    await expect(readLogicalFileExists('owner/doc-1/dry.pdf')).resolves.toBe(true)
  })

  it('never leaks physical or logical paths in the report', async () => {
    await writeLogicalFile('owner-secret/doc-1/secret-name.pdf', 'x')

    const report = await deleteLogicalFilesSafely(['owner-secret/doc-1/secret-name.pdf'], {
      root: TEST_ROOT,
    })

    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain('owner-secret')
    expect(serialized).not.toContain('secret-name')
    expect(serialized).not.toContain(TEST_ROOT)
  })
})

async function writeLogicalFile(logicalPath: string, content: string): Promise<void> {
  const targetPath = pathForLogicalPath(logicalPath)
  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, content)
}

async function readLogicalFileExists(logicalPath: string): Promise<boolean> {
  try {
    await import('node:fs/promises').then((fs) => fs.access(pathForLogicalPath(logicalPath)))
    return true
  } catch {
    return false
  }
}

function pathForLogicalPath(logicalPath: string): string {
  return path.join(TEST_ROOT, ...logicalPath.split('/'))
}

async function tryCreateSymlink(
  logicalPath: string,
  targetLogicalPath: string,
): Promise<boolean> {
  try {
    await writeLogicalFile(targetLogicalPath, 'target')
    const linkPath = pathForLogicalPath(logicalPath)
    await mkdir(path.dirname(linkPath), { recursive: true })
    await symlink(pathForLogicalPath(targetLogicalPath), linkPath)
    return true
  } catch {
    return false
  }
}
