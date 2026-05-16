import { describe, expect, it, vi } from 'vitest'

import {
  preflightSubmitFiles,
  type SubmitFilePreflightExistenceChecker,
} from '#/lib/dokumen/submit-file-preflight'
import {
  buildSubmitMovePlan,
  type SubmitMovePlanAttachment,
} from '#/lib/storage/submit-move-plan'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_OWNER_ID = '99999999-9999-4999-8999-999999999999'
const DOKUMEN_ID = '22222222-2222-4222-8222-222222222222'
const FIRST_TARGET_UUID = '33333333-3333-4333-8333-333333333333'
const SECOND_TARGET_UUID = '44444444-4444-4444-8444-444444444444'
const KELENGKAPAN_ID = '55555555-5555-4555-8555-555555555555'
const TIMESTAMP = 1778064971564
const UPLOAD_PENDING_PATH = `${OWNER_ID}/${KELENGKAPAN_ID}_${TIMESTAMP}_Daftar_Absensi.pdf`
const DASH_PENDING_PATH = `${OWNER_ID}/${TIMESTAMP}-abc123xyz-Daftar_Absensi.pdf`
const FORMAL_PATH = `${OWNER_ID}/${DOKUMEN_ID}/${FIRST_TARGET_UUID}.pdf`

describe('submit file preflight helper foundation', () => {
  it('returns ok for planned pending moves with existing sources and available targets', async () => {
    const plan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [
        attachment({ url: UPLOAD_PENDING_PATH }),
        attachment({ url: DASH_PENDING_PATH }),
      ],
      targetUuidFactory: createUuidFactory(FIRST_TARGET_UUID, SECOND_TARGET_UUID),
    })
    const checker = createChecker({
      sources: [UPLOAD_PENDING_PATH, DASH_PENDING_PATH],
      availableTargets: [
        `${OWNER_ID}/temp-id/${FIRST_TARGET_UUID}.pdf`,
        `${OWNER_ID}/temp-id/${SECOND_TARGET_UUID}.pdf`,
      ],
    })

    const result = await preflightSubmitFiles({
      actorUserId: OWNER_ID,
      movePlan: plan,
      existenceChecker: checker,
    })

    expect(result.ok).toBe(true)
    expect(result.operations).toEqual([
      {
        index: 0,
        action: 'move-required',
        sourceLogicalPath: UPLOAD_PENDING_PATH,
        targetLogicalPath: `${OWNER_ID}/temp-id/${FIRST_TARGET_UUID}.pdf`,
        sourceClassification: 'pending-upload-api',
      },
      {
        index: 1,
        action: 'move-required',
        sourceLogicalPath: DASH_PENDING_PATH,
        targetLogicalPath: `${OWNER_ID}/temp-id/${SECOND_TARGET_UUID}.pdf`,
        sourceClassification: 'pending-dash',
      },
    ])
    expect(result.plannedAttachments.map(lampiran => lampiran.url)).toEqual([
      `${OWNER_ID}/temp-id/${FIRST_TARGET_UUID}.pdf`,
      `${OWNER_ID}/temp-id/${SECOND_TARGET_UUID}.pdf`,
    ])
    expect(result.checks).toEqual({
      sourceExistence: 'checked',
      targetAvailability: 'checked',
    })
    expect(checker.checkSourceExists).toHaveBeenCalledWith(UPLOAD_PENDING_PATH)
    expect(checker.checkTargetAvailable).toHaveBeenCalledWith(`${OWNER_ID}/temp-id/${FIRST_TARGET_UUID}.pdf`)
    expectNoSensitiveExposure(result)
  })

  it('returns source-missing before any move when a planned source is unavailable', async () => {
    const plan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [attachment({ url: UPLOAD_PENDING_PATH })],
      targetUuidFactory: createUuidFactory(FIRST_TARGET_UUID),
    })
    const checker = createChecker({
      sources: [],
      availableTargets: [`${OWNER_ID}/temp-id/${FIRST_TARGET_UUID}.pdf`],
    })

    const result = await preflightSubmitFiles({
      actorUserId: OWNER_ID,
      movePlan: plan,
      existenceChecker: checker,
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'source-missing',
        clientCategory: 'local-storage-missing',
        index: 0,
        sourceLogicalPath: UPLOAD_PENDING_PATH,
        targetLogicalPath: `${OWNER_ID}/temp-id/${FIRST_TARGET_UUID}.pdf`,
        checkKind: 'source',
      }),
    ])
    expect(checker.checkTargetAvailable).not.toHaveBeenCalled()
    expectNoSensitiveExposure(result)
  })

  it('returns target-already-exists when a planned target is unavailable', async () => {
    const plan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [attachment({ url: UPLOAD_PENDING_PATH })],
      targetUuidFactory: createUuidFactory(FIRST_TARGET_UUID),
    })
    const checker = createChecker({
      sources: [UPLOAD_PENDING_PATH],
      availableTargets: [],
    })

    const result = await preflightSubmitFiles({
      actorUserId: OWNER_ID,
      movePlan: plan,
      existenceChecker: checker,
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'target-already-exists',
        clientCategory: 'local-storage-conflict',
        index: 0,
        sourceLogicalPath: UPLOAD_PENDING_PATH,
        targetLogicalPath: `${OWNER_ID}/temp-id/${FIRST_TARGET_UUID}.pdf`,
        checkKind: 'target',
      }),
    ])
    expectNoSensitiveExposure(result)
  })

  it('preserves move-plan blocking issues and skips injected checks', async () => {
    const plan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [attachment({ url: '' })],
      targetUuidFactory: createUuidFactory(FIRST_TARGET_UUID),
    })
    const checker = createChecker({
      sources: [UPLOAD_PENDING_PATH],
      availableTargets: [`${OWNER_ID}/temp-id/${FIRST_TARGET_UUID}.pdf`],
    })

    const result = await preflightSubmitFiles({
      actorUserId: OWNER_ID,
      movePlan: plan,
      existenceChecker: checker,
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'move-plan-blocking-issue',
        movePlanIssueCode: 'missing-url',
        clientCategory: 'validation',
        index: 0,
      }),
    ])
    expect(checker.checkSourceExists).not.toHaveBeenCalled()
    expect(checker.checkTargetAvailable).not.toHaveBeenCalled()
  })

  it('fails preflight for owner mismatch and unsafe logical path issues from the move plan', async () => {
    const plan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [
        attachment({ url: `${OTHER_OWNER_ID}/${KELENGKAPAN_ID}_${TIMESTAMP}_report.pdf` }),
        attachment({ url: `${OWNER_ID}/../report.pdf` }),
      ],
      targetUuidFactory: createUuidFactory(FIRST_TARGET_UUID),
    })

    const result = await preflightSubmitFiles({
      actorUserId: OWNER_ID,
      movePlan: plan,
      existenceChecker: createChecker({ sources: [], availableTargets: [] }),
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'owner-mismatch',
        movePlanIssueCode: 'owner-mismatch',
        sourceLogicalPath: `${OTHER_OWNER_ID}/${KELENGKAPAN_ID}_${TIMESTAMP}_report.pdf`,
      }),
      expect.objectContaining({
        code: 'unsafe-logical-path',
        movePlanIssueCode: 'invalid-source-path',
        sourceLogicalPath: `${OWNER_ID}/../report.pdf`,
      }),
    ])
    expectNoSensitiveExposure(result)
  })

  it('keeps already formal attachments safe without an existence checker', async () => {
    const formalAttachment = attachment({
      url: FORMAL_PATH,
      nama: 'Sudah Formal',
    })
    const plan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [formalAttachment],
      targetUuidFactory: createUuidFactory(SECOND_TARGET_UUID),
    })

    const result = await preflightSubmitFiles({
      actorUserId: OWNER_ID,
      movePlan: plan,
    })

    expect(result.ok).toBe(true)
    expect(result.operations).toEqual([
      {
        index: 0,
        action: 'no-move-required',
        sourceLogicalPath: FORMAL_PATH,
        targetLogicalPath: FORMAL_PATH,
        sourceClassification: 'formal',
      },
    ])
    expect(result.plannedAttachments).toEqual([formalAttachment])
    expect(result.checks).toEqual({
      sourceExistence: 'not-checked',
      targetAvailability: 'not-checked',
    })
  })

  it('converts checker failures to safe existence-check-failed issues', async () => {
    const plan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [attachment({ url: UPLOAD_PENDING_PATH })],
      targetUuidFactory: createUuidFactory(FIRST_TARGET_UUID),
    })
    const checker: SubmitFilePreflightExistenceChecker = {
      checkSourceExists: vi.fn(() => {
        throw new Error(`boom at C:\\private\\storage\\${UPLOAD_PENDING_PATH}\nstack with secret-token-value`)
      }),
      checkTargetAvailable: vi.fn(() => true),
    }

    const result = await preflightSubmitFiles({
      actorUserId: OWNER_ID,
      movePlan: plan,
      existenceChecker: checker,
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'existence-check-failed',
        clientCategory: 'preflight-unavailable',
        message: 'Submit file source existence could not be checked safely.',
        checkKind: 'source',
      }),
    ])
    expect(checker.checkTargetAvailable).not.toHaveBeenCalled()
    expectNoSensitiveExposure(result)
  })

  it('does not mutate the move plan or attachments', async () => {
    const sourceAttachment = attachment({ url: UPLOAD_PENDING_PATH })
    const plan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [sourceAttachment],
      targetUuidFactory: createUuidFactory(FIRST_TARGET_UUID),
    })
    const before = JSON.stringify(plan)

    await preflightSubmitFiles({
      actorUserId: OWNER_ID,
      movePlan: plan,
      existenceChecker: createChecker({
        sources: [UPLOAD_PENDING_PATH],
        availableTargets: [`${OWNER_ID}/temp-id/${FIRST_TARGET_UUID}.pdf`],
      }),
    })

    expect(JSON.stringify(plan)).toBe(before)
    expect(sourceAttachment.url).toBe(UPLOAD_PENDING_PATH)
  })

  it('fails closed for move-required operations when no existence checker is injected', async () => {
    const plan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [attachment({ url: UPLOAD_PENDING_PATH })],
      targetUuidFactory: createUuidFactory(FIRST_TARGET_UUID),
    })

    const result = await preflightSubmitFiles({
      actorUserId: OWNER_ID,
      movePlan: plan,
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'existence-checker-missing',
        clientCategory: 'preflight-unavailable',
        index: 0,
        sourceLogicalPath: UPLOAD_PENDING_PATH,
        targetLogicalPath: `${OWNER_ID}/temp-id/${FIRST_TARGET_UUID}.pdf`,
        checkKind: 'source',
      }),
      expect.objectContaining({
        code: 'existence-checker-missing',
        clientCategory: 'preflight-unavailable',
        index: 0,
        sourceLogicalPath: UPLOAD_PENDING_PATH,
        targetLogicalPath: `${OWNER_ID}/temp-id/${FIRST_TARGET_UUID}.pdf`,
        checkKind: 'target',
      }),
    ])
    expect(result.checks).toEqual({
      sourceExistence: 'not-checked',
      targetAvailability: 'not-checked',
    })
    expectNoSensitiveExposure(result)
    expect(String(preflightSubmitFiles)).not.toContain(['create', 'Client'].join(''))
    expect(String(preflightSubmitFiles)).not.toContain(['storage', 'from'].join('.'))
    expect(String(preflightSubmitFiles)).not.toContain('node:' + 'fs')
    expect(String(preflightSubmitFiles)).not.toContain(['route', 'Tree'].join(''))
    expect(String(preflightSubmitFiles)).not.toContain(['process', 'env'].join('.'))
  })

  it('fails closed when only the source checker is injected', async () => {
    const plan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [attachment({ url: UPLOAD_PENDING_PATH })],
      targetUuidFactory: createUuidFactory(FIRST_TARGET_UUID),
    })
    const checker: SubmitFilePreflightExistenceChecker = {
      checkSourceExists: vi.fn(() => true),
    }

    const result = await preflightSubmitFiles({
      actorUserId: OWNER_ID,
      movePlan: plan,
      existenceChecker: checker,
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'existence-checker-missing',
        checkKind: 'target',
        sourceLogicalPath: UPLOAD_PENDING_PATH,
        targetLogicalPath: `${OWNER_ID}/temp-id/${FIRST_TARGET_UUID}.pdf`,
      }),
    ])
    expect(checker.checkSourceExists).not.toHaveBeenCalled()
    expectNoSensitiveExposure(result)
  })

  it('fails closed when only the target checker is injected', async () => {
    const plan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [attachment({ url: UPLOAD_PENDING_PATH })],
      targetUuidFactory: createUuidFactory(FIRST_TARGET_UUID),
    })
    const checker: SubmitFilePreflightExistenceChecker = {
      checkTargetAvailable: vi.fn(() => true),
    }

    const result = await preflightSubmitFiles({
      actorUserId: OWNER_ID,
      movePlan: plan,
      existenceChecker: checker,
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'existence-checker-missing',
        checkKind: 'source',
        sourceLogicalPath: UPLOAD_PENDING_PATH,
        targetLogicalPath: `${OWNER_ID}/temp-id/${FIRST_TARGET_UUID}.pdf`,
      }),
    ])
    expect(checker.checkTargetAvailable).not.toHaveBeenCalled()
    expectNoSensitiveExposure(result)
  })
})

function attachment(overrides: Partial<SubmitMovePlanAttachment>): SubmitMovePlanAttachment {
  return {
    kelengkapan_id: KELENGKAPAN_ID,
    nama: 'Lampiran',
    url: UPLOAD_PENDING_PATH,
    uploaded_at: new Date(TIMESTAMP).toISOString(),
    ...overrides,
  }
}

function createUuidFactory(...uuids: string[]): () => string {
  let index = 0

  return () => uuids[index++] ?? uuids[uuids.length - 1] ?? FIRST_TARGET_UUID
}

function createChecker({
  sources,
  availableTargets,
}: {
  sources: string[]
  availableTargets: string[]
}): Required<SubmitFilePreflightExistenceChecker> {
  const sourceSet = new Set(sources)
  const targetSet = new Set(availableTargets)

  return {
    checkSourceExists: vi.fn((logicalPath: string) => sourceSet.has(logicalPath)),
    checkTargetAvailable: vi.fn((logicalPath: string) => targetSet.has(logicalPath)),
  }
}

function expectNoSensitiveExposure(value: unknown): void {
  const serialized = JSON.stringify(value)
  const sensitiveFragments = [
    'C:\\private',
    '/storage/',
    ['DATABASE', '_URL'].join(''),
    ['DMS', '_LOCAL', '_STORAGE', '_ROOT'].join(''),
    'secret-token-value',
    ['signed', 'Url'].join(''),
    'uploaded file content',
  ]

  for (const fragment of sensitiveFragments) {
    expect(serialized).not.toContain(fragment)
  }
}
