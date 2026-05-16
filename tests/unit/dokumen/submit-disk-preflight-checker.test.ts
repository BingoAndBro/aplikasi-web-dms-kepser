import { describe, expect, it, vi } from 'vitest'

import {
  checkSubmitSourceExists,
  checkSubmitTargetAvailable,
  createSubmitDiskPreflightChecker,
  inspectSubmitSource,
  inspectSubmitTarget,
  type SubmitDiskPreflightReadOnlyFs,
} from '#/lib/dokumen/submit-disk-preflight-checker'
import { preflightSubmitFiles } from '#/lib/dokumen/submit-file-preflight'
import {
  buildSubmitMovePlan,
  type SubmitMovePlanAttachment,
} from '#/lib/storage/submit-move-plan'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const KELENGKAPAN_ID = '22222222-2222-4222-8222-222222222222'
const TARGET_UUID = '33333333-3333-4333-8333-333333333333'
const TIMESTAMP = 1778064971564
const PENDING_PATH = `${OWNER_ID}/${KELENGKAPAN_ID}_${TIMESTAMP}_laporan.pdf`
const TARGET_PATH = `${OWNER_ID}/temp-id/${TARGET_UUID}.pdf`
const FORMAL_PATH = `${OWNER_ID}/temp-id/44444444-4444-4444-8444-444444444444.pdf`
const TEST_ROOT = '.tmp/submit-disk-preflight-root'

describe('submit disk preflight checker foundation', () => {
  it('source exists returns true through an injected read-only adapter', async () => {
    const fs = createReadOnlyFs({
      files: [PENDING_PATH],
    })

    await expect(checkSubmitSourceExists(PENDING_PATH, { root: TEST_ROOT, fs })).resolves.toBe(true)
    expect(fs.stat).toHaveBeenCalledOnce()
    expectNoSensitivePublicExposure(await inspectSubmitSource(PENDING_PATH, { root: TEST_ROOT, fs }))
  })

  it('source missing returns false', async () => {
    const fs = createReadOnlyFs({
      files: [],
    })

    await expect(checkSubmitSourceExists(PENDING_PATH, { root: TEST_ROOT, fs })).resolves.toBe(false)
    await expect(inspectSubmitSource(PENDING_PATH, { root: TEST_ROOT, fs })).resolves.toEqual({
      code: 'missing',
      exists: false,
    })
  })

  it('target available returns true when the target does not exist', async () => {
    const fs = createReadOnlyFs({
      files: [],
    })

    await expect(checkSubmitTargetAvailable(TARGET_PATH, { root: TEST_ROOT, fs })).resolves.toBe(true)
    await expect(inspectSubmitTarget(TARGET_PATH, { root: TEST_ROOT, fs })).resolves.toEqual({
      code: 'target-available',
      available: true,
    })
  })

  it('target already exists returns false', async () => {
    const fs = createReadOnlyFs({
      files: [TARGET_PATH],
    })

    await expect(checkSubmitTargetAvailable(TARGET_PATH, { root: TEST_ROOT, fs })).resolves.toBe(false)
    await expect(inspectSubmitTarget(TARGET_PATH, { root: TEST_ROOT, fs })).resolves.toEqual({
      code: 'target-already-exists',
      available: false,
    })
  })

  it('unsafe logical paths return false without adapter calls or physical path exposure', async () => {
    const fs = createReadOnlyFs({
      files: [PENDING_PATH],
    })

    await expect(checkSubmitSourceExists(`${OWNER_ID}/../laporan.pdf`, { root: TEST_ROOT, fs }))
      .resolves.toBe(false)
    await expect(checkSubmitTargetAvailable('C:\\private\\target.pdf', { root: TEST_ROOT, fs }))
      .resolves.toBe(false)

    expect(fs.stat).not.toHaveBeenCalled()
    expectNoSensitivePublicExposure(await inspectSubmitSource(`${OWNER_ID}/../laporan.pdf`, { root: TEST_ROOT, fs }))
    expectNoSensitivePublicExposure(await inspectSubmitTarget('C:\\private\\target.pdf', { root: TEST_ROOT, fs }))
  })

  it('checker failures return false and safe code-only diagnostic results', async () => {
    const fs: SubmitDiskPreflightReadOnlyFs = {
      stat: vi.fn(() => {
        throw Object.assign(new Error('adapter failed at C:\\private\\root with secret-token-value'), {
          code: 'EACCES',
        })
      }),
    }

    await expect(checkSubmitSourceExists(PENDING_PATH, { root: TEST_ROOT, fs })).resolves.toBe(false)
    await expect(checkSubmitTargetAvailable(TARGET_PATH, { root: TEST_ROOT, fs })).resolves.toBe(false)
    await expect(inspectSubmitSource(PENDING_PATH, { root: TEST_ROOT, fs })).resolves.toEqual({
      code: 'check-failed',
      exists: false,
    })
    await expect(inspectSubmitTarget(TARGET_PATH, { root: TEST_ROOT, fs })).resolves.toEqual({
      code: 'check-failed',
      available: false,
    })
  })

  it('public checker methods accept logical paths only', async () => {
    const fs = createReadOnlyFs({
      files: [PENDING_PATH],
    })
    const checker = createSubmitDiskPreflightChecker({ root: TEST_ROOT, fs })

    expect(checker.checkSourceExists.length).toBe(1)
    expect(checker.checkTargetAvailable.length).toBe(1)
    await expect(checker.checkSourceExists(PENDING_PATH)).resolves.toBe(true)
    await expect(checker.checkTargetAvailable(TARGET_PATH)).resolves.toBe(true)
  })

  it('public results do not expose roots, physical paths, tokens, links, or file content', async () => {
    const fs = createReadOnlyFs({
      files: [PENDING_PATH],
    })
    const checker = createSubmitDiskPreflightChecker({ root: TEST_ROOT, fs })

    const publicResults = {
      sourceBoolean: await checker.checkSourceExists(PENDING_PATH),
      targetBoolean: await checker.checkTargetAvailable(TARGET_PATH),
      sourceDiagnostic: await inspectSubmitSource(PENDING_PATH, { root: TEST_ROOT, fs }),
      targetDiagnostic: await inspectSubmitTarget(TARGET_PATH, { root: TEST_ROOT, fs }),
    }

    expectNoSensitivePublicExposure(publicResults)
  })

  it('can be injected into submit file preflight for an ok move-required plan', async () => {
    const plan = buildPlan()
    const checker = createSubmitDiskPreflightChecker({
      root: TEST_ROOT,
      fs: createReadOnlyFs({
        files: [PENDING_PATH],
      }),
    })

    const result = await preflightSubmitFiles({
      actorUserId: OWNER_ID,
      movePlan: plan,
      existenceChecker: checker,
    })

    expect(result.ok).toBe(true)
    expect(result.operations).toEqual([
      expect.objectContaining({
        action: 'move-required',
        sourceLogicalPath: PENDING_PATH,
        targetLogicalPath: TARGET_PATH,
      }),
    ])
    expectNoSensitivePublicExposure(result)
  })

  it('causes submit file preflight to fail closed when the source is missing', async () => {
    const result = await preflightSubmitFiles({
      actorUserId: OWNER_ID,
      movePlan: buildPlan(),
      existenceChecker: createSubmitDiskPreflightChecker({
        root: TEST_ROOT,
        fs: createReadOnlyFs({
          files: [],
        }),
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'source-missing',
        sourceLogicalPath: PENDING_PATH,
        targetLogicalPath: TARGET_PATH,
      }),
    ])
  })

  it('causes submit file preflight to fail closed when the target already exists', async () => {
    const result = await preflightSubmitFiles({
      actorUserId: OWNER_ID,
      movePlan: buildPlan(),
      existenceChecker: createSubmitDiskPreflightChecker({
        root: TEST_ROOT,
        fs: createReadOnlyFs({
          files: [PENDING_PATH, TARGET_PATH],
        }),
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'target-already-exists',
        sourceLogicalPath: PENDING_PATH,
        targetLogicalPath: TARGET_PATH,
      }),
    ])
  })

  it('does not provide mutation operations to the read-only adapter', async () => {
    const fs = createReadOnlyFs({
      files: [PENDING_PATH],
    })
    const checker = createSubmitDiskPreflightChecker({ root: TEST_ROOT, fs })

    await checker.checkSourceExists(PENDING_PATH)
    await checker.checkTargetAvailable(TARGET_PATH)

    expect(Object.keys(fs)).toEqual(['stat'])
  })

  it('implementation strings avoid route, external storage, data-client, UI, and direct env markers', () => {
    const implementation = [
      String(createSubmitDiskPreflightChecker),
      String(checkSubmitSourceExists),
      String(checkSubmitTargetAvailable),
      String(inspectSubmitSource),
      String(inspectSubmitTarget),
    ].join('\n')

    for (const fragment of [
      ['supa', 'base'].join(''),
      ['create', 'Client'].join(''),
      ['storage', 'from'].join('.'),
      ['write', 'File'].join(''),
      ['re', 'name'].join(''),
      ['un', 'link'].join(''),
      ['mk', 'dir'].join(''),
      ['rm', '('].join(''),
      ['rm', 'dir'].join(''),
      ['create', 'Write', 'Stream'].join(''),
      ['create', 'Read', 'Stream'].join(''),
      ['process', 'env'].join('.'),
      ['DATA', 'BASE', '_URL'].join(''),
      ['route', 'Tree'].join(''),
      ['src', '/', 'routes'].join(''),
      ['components', '/'].join(''),
      ['db', '.'].join(''),
      ['driz', 'zle'].join(''),
    ]) {
      expect(implementation).not.toContain(fragment)
    }
  })
})

function buildPlan() {
  return buildSubmitMovePlan({
    ownerUserId: OWNER_ID,
    attachments: [attachment({ url: PENDING_PATH })],
    targetUuidFactory: createUuidFactory(TARGET_UUID),
  })
}

function attachment(overrides: Partial<SubmitMovePlanAttachment>): SubmitMovePlanAttachment {
  return {
    kelengkapan_id: KELENGKAPAN_ID,
    nama: 'Lampiran',
    url: PENDING_PATH,
    uploaded_at: new Date(TIMESTAMP).toISOString(),
    ...overrides,
  }
}

function createUuidFactory(...uuids: string[]): () => string {
  let index = 0

  return () => uuids[index++] ?? uuids[uuids.length - 1] ?? TARGET_UUID
}

function createReadOnlyFs({
  files,
}: {
  files: string[]
}): SubmitDiskPreflightReadOnlyFs & { stat: ReturnType<typeof vi.fn> } {
  const fileSet = new Set(files)

  return {
    stat: vi.fn((physicalPath: string) => {
      const normalizedPhysicalPath = physicalPath.replace(/\\/g, '/')
      const matchingLogicalPath = [...fileSet].find(logicalPath => (
        normalizedPhysicalPath.endsWith(logicalPath)
      ))

      if (!matchingLogicalPath) {
        throw Object.assign(new Error('not found'), { code: 'ENOENT' })
      }

      return {
        isFile: () => matchingLogicalPath !== FORMAL_PATH,
      }
    }),
  }
}

function expectNoSensitivePublicExposure(value: unknown): void {
  const serialized = JSON.stringify(value)
  const sensitiveFragments = [
    'D:\\',
    'C:\\private',
    '/storage/',
    TEST_ROOT,
    ['DATA', 'BASE', '_URL'].join(''),
    ['DMS', '_LOCAL', '_STORAGE', '_ROOT'].join(''),
    'secret-token-value',
    ['signed', 'Url'].join(''),
    'uploaded file content',
  ]

  for (const fragment of sensitiveFragments) {
    expect(serialized).not.toContain(fragment)
  }
}
