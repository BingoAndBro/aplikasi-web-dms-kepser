import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  classifyLocalPendingMovePath,
  generateLocalFormalTargetLogicalPath,
  LocalPendingMoveError,
  localPendingMoveFsForTest,
  moveLocalPendingFileToFormal,
  validateLocalMoveOwnerSegment,
  validateLocalPendingMoveSource,
} from '#/lib/storage/local-pending-move'

const TEST_ROOT = path.resolve('.tmp', 'local-pending-move-root')
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_OWNER_ID = '99999999-9999-4999-8999-999999999999'
const DOKUMEN_ID = '22222222-2222-4222-8222-222222222222'
const TARGET_UUID = '33333333-3333-4333-8333-333333333333'
const TIMESTAMP = 1778064971564
const UPLOAD_PENDING_PATH = `${OWNER_ID}/44444444-4444-4444-8444-444444444444_${TIMESTAMP}_Daftar_Absensi.pdf`
const DASH_PENDING_PATH = `${OWNER_ID}/${TIMESTAMP}-abc123xyz-Daftar_Absensi.pdf`
const FORMAL_PATH = `${OWNER_ID}/${DOKUMEN_ID}/${TARGET_UUID}.pdf`
const ORIGINAL_LINK = localPendingMoveFsForTest.link
const ORIGINAL_COPY_FILE = localPendingMoveFsForTest.copyFile

describe('local pending-to-formal move helper foundation', () => {
  beforeEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  afterEach(async () => {
    localPendingMoveFsForTest.link = ORIGINAL_LINK
    localPendingMoveFsForTest.copyFile = ORIGINAL_COPY_FILE
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  it('classifies supported pending/formal paths and safe unsupported paths', () => {
    expect(classifyLocalPendingMovePath(UPLOAD_PENDING_PATH)).toBe('pending-upload-api')
    expect(classifyLocalPendingMovePath(DASH_PENDING_PATH)).toBe('pending-dash')
    expect(classifyLocalPendingMovePath(FORMAL_PATH)).toBe('formal')
    expect(classifyLocalPendingMovePath(`${OWNER_ID}/notes/readme.txt`)).toBe('unsupported')
  })

  it('validates source logical path and owner segment', () => {
    expect(validateLocalPendingMoveSource({
      sourceLogicalPath: UPLOAD_PENDING_PATH,
      ownerUserId: OWNER_ID,
    })).toEqual({
      logicalPath: UPLOAD_PENDING_PATH,
      ownerId: OWNER_ID,
      classification: 'pending-upload-api',
      extension: 'pdf',
    })

    expect(validateLocalMoveOwnerSegment(OWNER_ID)).toBe(OWNER_ID)
    expect(() => validateLocalMoveOwnerSegment('owner/../other')).toThrowError(
      new LocalPendingMoveError('Local move path segment is not safe.', 'invalid-owner-id'),
    )
  })

  it('rejects unsafe, unsupported, and owner-mismatched source paths', () => {
    expect(() => validateLocalPendingMoveSource({
      sourceLogicalPath: `${OWNER_ID}/../report.pdf`,
      ownerUserId: OWNER_ID,
    })).toThrowError(new LocalPendingMoveError(
      'Local move source path is not safe.',
      'invalid-source-path',
    ))

    expect(() => validateLocalPendingMoveSource({
      sourceLogicalPath: `${OWNER_ID}/notes/readme.txt`,
      ownerUserId: OWNER_ID,
    })).toThrowError(new LocalPendingMoveError(
      'Local move source path is not supported.',
      'unsupported-source-path',
    ))

    expect(() => validateLocalPendingMoveSource({
      sourceLogicalPath: UPLOAD_PENDING_PATH,
      ownerUserId: OTHER_OWNER_ID,
    })).toThrowError(new LocalPendingMoveError(
      'Local move source owner does not match.',
      'owner-mismatch',
    ))
  })

  it('generates compatible formal target logical paths without physical path data', () => {
    const targetPath = generateLocalFormalTargetLogicalPath({
      sourceLogicalPath: UPLOAD_PENDING_PATH,
      ownerUserId: OWNER_ID,
      dokumenId: DOKUMEN_ID,
      targetUuid: TARGET_UUID,
    })

    expect(targetPath).toBe(FORMAL_PATH)
    expect(path.isAbsolute(targetPath)).toBe(false)
    expectNoPhysicalPathExposure(targetPath)
  })

  it('preserves temp-id compatibility for combined submit planning', () => {
    expect(generateLocalFormalTargetLogicalPath({
      sourceLogicalPath: DASH_PENDING_PATH,
      ownerUserId: OWNER_ID,
      dokumenId: 'temp-id',
      targetUuid: TARGET_UUID,
    })).toBe(`${OWNER_ID}/temp-id/${TARGET_UUID}.pdf`)
  })

  it('leaves already formal paths unchanged without touching the filesystem', async () => {
    const result = await moveLocalPendingFileToFormal({
      root: TEST_ROOT,
      sourceLogicalPath: FORMAL_PATH,
      ownerUserId: OWNER_ID,
      dokumenId: DOKUMEN_ID,
      targetUuid: '44444444-4444-4444-8444-444444444444',
    })

    expect(result).toEqual({
      action: 'unchanged',
      sourceLogicalPath: FORMAL_PATH,
      targetLogicalPath: FORMAL_PATH,
      sourceClassification: 'formal',
    })
    expectNoPhysicalPathExposure(result)
  })

  it('moves an upload API pending file to a formal path with no-overwrite semantics', async () => {
    await writeLogicalFile(UPLOAD_PENDING_PATH, 'local upload content')

    const result = await moveLocalPendingFileToFormal({
      root: TEST_ROOT,
      sourceLogicalPath: UPLOAD_PENDING_PATH,
      ownerUserId: OWNER_ID,
      dokumenId: DOKUMEN_ID,
      targetUuid: TARGET_UUID,
    })

    expect(result).toEqual({
      action: 'moved',
      sourceLogicalPath: UPLOAD_PENDING_PATH,
      targetLogicalPath: FORMAL_PATH,
      sourceClassification: 'pending-upload-api',
    })
    expectNoPhysicalPathExposure(result)
    await expect(stat(physicalPathFor(UPLOAD_PENDING_PATH))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(physicalPathFor(FORMAL_PATH), 'utf8')).toBe('local upload content')
  })

  it('moves a dash pending file to a formal path', async () => {
    const dashTarget = `${OWNER_ID}/${DOKUMEN_ID}/${TARGET_UUID}.pdf`
    await writeLogicalFile(DASH_PENDING_PATH, 'dash pending content')

    const result = await moveLocalPendingFileToFormal({
      root: TEST_ROOT,
      sourceLogicalPath: DASH_PENDING_PATH,
      ownerUserId: OWNER_ID,
      dokumenId: DOKUMEN_ID,
      targetUuid: TARGET_UUID,
    })

    expect(result.targetLogicalPath).toBe(dashTarget)
    expect(result.sourceClassification).toBe('pending-dash')
    expect(await readFile(physicalPathFor(dashTarget), 'utf8')).toBe('dash pending content')
  })

  it('rejects missing local source without attempting any Supabase fallback', async () => {
    const error = await captureError(() => moveLocalPendingFileToFormal({
      root: TEST_ROOT,
      sourceLogicalPath: UPLOAD_PENDING_PATH,
      ownerUserId: OWNER_ID,
      dokumenId: DOKUMEN_ID,
      targetUuid: TARGET_UUID,
    }))

    expect(error).toMatchObject({
      code: 'missing-source',
    })
    expectNoPhysicalPathExposure(error)
  })

  it('rejects existing targets and preserves source content', async () => {
    await writeLogicalFile(UPLOAD_PENDING_PATH, 'source content')
    await writeLogicalFile(FORMAL_PATH, 'existing target')

    const error = await captureError(() => moveLocalPendingFileToFormal({
      root: TEST_ROOT,
      sourceLogicalPath: UPLOAD_PENDING_PATH,
      ownerUserId: OWNER_ID,
      dokumenId: DOKUMEN_ID,
      targetUuid: TARGET_UUID,
    }))

    expect(error).toMatchObject({
      code: 'target-exists',
    })
    expectNoPhysicalPathExposure(error)
    expect(await readFile(physicalPathFor(UPLOAD_PENDING_PATH), 'utf8')).toBe('source content')
    expect(await readFile(physicalPathFor(FORMAL_PATH), 'utf8')).toBe('existing target')
  })

  it('does not delete a target that appears when link fails with EEXIST', async () => {
    await writeLogicalFile(UPLOAD_PENDING_PATH, 'source content')

    localPendingMoveFsForTest.link = async (_source, target) => {
      await writeFile(String(target), 'raced target')
      throw nodeError('EEXIST')
    }

    const error = await captureError(() => moveLocalPendingFileToFormal({
      root: TEST_ROOT,
      sourceLogicalPath: UPLOAD_PENDING_PATH,
      ownerUserId: OWNER_ID,
      dokumenId: DOKUMEN_ID,
      targetUuid: TARGET_UUID,
    }))

    expect(error).toMatchObject({
      code: 'target-exists',
    })
    expectNoPhysicalPathExposure(error)
    expect(await readFile(physicalPathFor(UPLOAD_PENDING_PATH), 'utf8')).toBe('source content')
    expect(await readFile(physicalPathFor(FORMAL_PATH), 'utf8')).toBe('raced target')
  })

  it('does not delete a target that appears when copy fallback fails with EEXIST', async () => {
    await writeLogicalFile(UPLOAD_PENDING_PATH, 'source content')

    localPendingMoveFsForTest.link = async () => {
      throw nodeError('EXDEV')
    }
    localPendingMoveFsForTest.copyFile = async (_source, target) => {
      await writeFile(String(target), 'copy raced target')
      throw nodeError('EEXIST')
    }

    const error = await captureError(() => moveLocalPendingFileToFormal({
      root: TEST_ROOT,
      sourceLogicalPath: UPLOAD_PENDING_PATH,
      ownerUserId: OWNER_ID,
      dokumenId: DOKUMEN_ID,
      targetUuid: TARGET_UUID,
    }))

    expect(error).toMatchObject({
      code: 'target-exists',
    })
    expectNoPhysicalPathExposure(error)
    expect(await readFile(physicalPathFor(UPLOAD_PENDING_PATH), 'utf8')).toBe('source content')
    expect(await readFile(physicalPathFor(FORMAL_PATH), 'utf8')).toBe('copy raced target')
  })

  it('keeps helper errors and results free of physical path and storage root details', async () => {
    const invalidUuidError = await captureError(() => Promise.resolve(
      generateLocalFormalTargetLogicalPath({
        sourceLogicalPath: UPLOAD_PENDING_PATH,
        ownerUserId: OWNER_ID,
        dokumenId: DOKUMEN_ID,
        targetUuid: 'not-a-uuid',
      }),
    ))

    expect(invalidUuidError).toMatchObject({ code: 'invalid-target-uuid' })
    expectNoPhysicalPathExposure(invalidUuidError)
  })
})

async function writeLogicalFile(logicalPath: string, content: string): Promise<void> {
  const physicalPath = physicalPathFor(logicalPath)

  await mkdir(path.dirname(physicalPath), { recursive: true })
  await writeFile(physicalPath, content)
}

function physicalPathFor(logicalPath: string): string {
  return path.join(TEST_ROOT, ...logicalPath.split('/'))
}

async function captureError(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation()
  } catch (error) {
    return error
  }

  throw new Error('Expected operation to throw.')
}

function expectNoPhysicalPathExposure(value: unknown): void {
  const serialized = stringifyForAssertion(value)

  expect(serialized).not.toContain(TEST_ROOT)
  expect(serialized).not.toContain(TEST_ROOT.replace(/\\/g, '/'))
}

function stringifyForAssertion(value: unknown): string {
  if (value instanceof Error) {
    return JSON.stringify({
      name: value.name,
      message: value.message,
      code: 'code' in value ? value.code : undefined,
    })
  }

  return JSON.stringify(value)
}

function nodeError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code })
}
