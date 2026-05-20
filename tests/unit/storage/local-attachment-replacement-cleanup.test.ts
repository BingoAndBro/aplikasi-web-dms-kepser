import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cleanupReplacedLocalAttachments } from '#/lib/storage/local-attachment-replacement'
import type { LampiranUrl } from '#/lib/dokumen/types'

const TEST_ROOT = path.resolve('.tmp', 'local-attachment-replacement-cleanup-root')
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const DOKUMEN_ID = '22222222-2222-4222-8222-222222222222'
const OLD_UUID = '33333333-3333-4333-8333-333333333333'
const NEW_UUID = '44444444-4444-4444-8444-444444444444'
const OLD_PATH = `${OWNER_ID}/${DOKUMEN_ID}/${OLD_UUID}.pdf`
const NEW_PATH = `${OWNER_ID}/${DOKUMEN_ID}/${NEW_UUID}.pdf`
const PENDING_PATH = `${OWNER_ID}/55555555-5555-4555-8555-555555555555_1778064971564_Bukti.pdf`

describe('local replaced attachment cleanup', () => {
  beforeEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  it('deletes an old formal file only when it is no longer referenced', async () => {
    await writeLogicalFile(OLD_PATH, 'old content')
    await writeLogicalFile(NEW_PATH, 'new content')

    const result = await cleanupReplacedLocalAttachments({
      root: TEST_ROOT,
      oldAttachments: [lampiran(OLD_PATH)],
      newAttachments: [lampiran(NEW_PATH)],
      protectedLogicalPaths: new Set([NEW_PATH]),
    })

    expect(result).toMatchObject({
      deletedCount: 1,
      missingCount: 0,
      failedCount: 0,
    })
    await expect(stat(physicalPathFor(OLD_PATH))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(physicalPathFor(NEW_PATH), 'utf8')).toBe('new content')
    expectNoPhysicalPathExposure(result)
  })

  it('keeps an old formal file when the same path remains in new metadata', async () => {
    await writeLogicalFile(OLD_PATH, 'kept content')

    const result = await cleanupReplacedLocalAttachments({
      root: TEST_ROOT,
      oldAttachments: [lampiran(OLD_PATH)],
      newAttachments: [lampiran(OLD_PATH)],
    })

    expect(result).toMatchObject({
      deletedCount: 0,
      protectedCount: 1,
      failedCount: 0,
    })
    expect(await readFile(physicalPathFor(OLD_PATH), 'utf8')).toBe('kept content')
  })

  it('keeps an old formal file when another reference protects it', async () => {
    await writeLogicalFile(OLD_PATH, 'shared content')
    await writeLogicalFile(NEW_PATH, 'new content')

    const result = await cleanupReplacedLocalAttachments({
      root: TEST_ROOT,
      oldAttachments: [lampiran(OLD_PATH)],
      newAttachments: [lampiran(NEW_PATH)],
      protectedLogicalPaths: new Set([OLD_PATH, NEW_PATH]),
    })

    expect(result).toMatchObject({
      deletedCount: 0,
      protectedCount: 1,
      failedCount: 0,
    })
    expect(await readFile(physicalPathFor(OLD_PATH), 'utf8')).toBe('shared content')
  })

  it('treats a missing old formal file as a clean no-op', async () => {
    const result = await cleanupReplacedLocalAttachments({
      root: TEST_ROOT,
      oldAttachments: [lampiran(OLD_PATH)],
      newAttachments: [lampiran(NEW_PATH)],
    })

    expect(result).toMatchObject({
      deletedCount: 0,
      missingCount: 1,
      failedCount: 0,
    })
  })

  it('skips unsafe and pending old paths without deleting formal files', async () => {
    await writeLogicalFile(OLD_PATH, 'old content')
    await writeLogicalFile(PENDING_PATH, 'pending content')

    const result = await cleanupReplacedLocalAttachments({
      root: TEST_ROOT,
      oldAttachments: [
        lampiran('../outside.pdf'),
        lampiran(PENDING_PATH),
        lampiran(OLD_PATH),
      ],
      newAttachments: [lampiran(NEW_PATH)],
    })

    expect(result).toMatchObject({
      deletedCount: 1,
      skippedCount: 2,
      failedCount: 0,
    })
    expect(await readFile(physicalPathFor(PENDING_PATH), 'utf8')).toBe('pending content')
    await expect(stat(physicalPathFor(OLD_PATH))).rejects.toMatchObject({ code: 'ENOENT' })
    expectNoPhysicalPathExposure(result)
  })
})

function lampiran(url: string): LampiranUrl {
  return {
    kelengkapan_id: '66666666-6666-4666-8666-666666666666',
    nama: 'Bukti',
    url,
    uploaded_at: '2026-05-20T00:00:00.000Z',
  }
}

async function writeLogicalFile(logicalPath: string, content: string): Promise<void> {
  const physicalPath = physicalPathFor(logicalPath)

  await mkdir(path.dirname(physicalPath), { recursive: true })
  await writeFile(physicalPath, content)
}

function physicalPathFor(logicalPath: string): string {
  return path.join(TEST_ROOT, ...logicalPath.split('/'))
}

function expectNoPhysicalPathExposure(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain(TEST_ROOT)
  expect(serialized).not.toContain(TEST_ROOT.replace(/\\/g, '/'))
}
