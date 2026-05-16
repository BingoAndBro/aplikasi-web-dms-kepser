import { describe, expect, it, vi } from 'vitest'

import {
  classifySubmitRuntimeOrchestrationOutcome,
  createSubmitRuntimeOrchestrationPlan,
  validateSubmitRuntimeOrchestrationReadiness,
  type SubmitRuntimeOrchestratorInput,
} from '#/lib/dokumen/submit-runtime-orchestrator'
import { preflightSubmitFiles } from '#/lib/dokumen/submit-file-preflight'
import { buildSubmitMovePlan } from '#/lib/storage/submit-move-plan'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_OWNER_ID = '99999999-9999-4999-8999-999999999999'
const KELENGKAPAN_ID = '22222222-2222-4222-8222-222222222222'
const DOKUMEN_ID = '33333333-3333-4333-8333-333333333333'
const TARGET_UUID = '44444444-4444-4444-8444-444444444444'
const TIMESTAMP = 1778064971564
const PENDING_PATH = `${OWNER_ID}/${KELENGKAPAN_ID}_${TIMESTAMP}_laporan.pdf`
const FORMAL_PATH = `${OWNER_ID}/${DOKUMEN_ID}/${TARGET_UUID}.pdf`
const TARGET_PATH = `${OWNER_ID}/temp-id/${TARGET_UUID}.pdf`

describe('submit runtime orchestrator boundary helper foundation', () => {
  it('blocks missing actor/session before DB and files', async () => {
    const input = await createMoveRequiredInput({
      actor: null,
    })

    const outcome = classifySubmitRuntimeOrchestrationOutcome(input)

    expect(outcome.primaryCategory).toBe('blocked-before-auth')
    expect(outcome.categories).toEqual([
      'blocked-by-missing-dependency',
      'blocked-before-auth',
      'blocked-before-db',
      'blocked-before-files',
    ])
    expect(outcome.issues).toEqual([
      expect.objectContaining({
        code: 'actor-missing',
        stage: 'auth-and-role',
        blocksDb: true,
        blocksFiles: true,
        dependency: 'actor-resolution',
      }),
    ])
    expect(outcome.guards).toEqual({
      canStartDb: false,
      canStartFiles: false,
      canReturnRouteSuccess: false,
    })
    expectNoSensitiveExposure(outcome)
  })

  it('blocks ADMIN-only and non-submit-compatible actors before DB and files', async () => {
    const adminOnly = classifySubmitRuntimeOrchestrationOutcome(await createMoveRequiredInput({
      actor: {
        ok: false,
        userId: OWNER_ID,
        adminOnly: true,
        reason: 'admin-only',
      },
    }))
    const nonCompatible = classifySubmitRuntimeOrchestrationOutcome(await createMoveRequiredInput({
      actor: {
        ok: false,
        userId: OWNER_ID,
        submitCompatible: false,
        reason: 'not-submit-compatible',
      },
    }))

    expect(adminOnly.primaryCategory).toBe('blocked-before-db')
    expect(adminOnly.issues[0]).toMatchObject({
      code: 'actor-admin-only',
      stage: 'auth-and-role',
      blocksDb: true,
      blocksFiles: true,
    })
    expect(nonCompatible.issues[0]).toMatchObject({
      code: 'actor-not-submit-compatible',
      stage: 'auth-and-role',
      blocksDb: true,
      blocksFiles: true,
    })
    expect(adminOnly.guards.canStartDb).toBe(false)
    expect(nonCompatible.guards.canStartFiles).toBe(false)
  })

  it('blocks move plan issues before DB and files', async () => {
    const movePlan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [attachment({ url: `${OTHER_OWNER_ID}/${KELENGKAPAN_ID}_${TIMESTAMP}_laporan.pdf` })],
      targetUuidFactory: createUuidFactory(TARGET_UUID),
    })

    const outcome = classifySubmitRuntimeOrchestrationOutcome({
      ...baseInput(),
      movePlan,
      preflight: null,
    })

    expect(outcome.primaryCategory).toBe('blocked-before-db')
    expect(outcome.issues).toEqual([
      expect.objectContaining({
        code: 'move-plan-blocking-issue',
        sourceIssueCodes: ['owner-mismatch'],
        blocksDb: true,
        blocksFiles: true,
      }),
    ])
  })

  it('blocks preflight failure before DB and files', async () => {
    const input = await createMoveRequiredInput({
      preflightSourceExists: false,
    })

    const outcome = classifySubmitRuntimeOrchestrationOutcome(input)

    expect(outcome.primaryCategory).toBe('blocked-before-db')
    expect(outcome.issues).toEqual([
      expect.objectContaining({
        code: 'preflight-failed',
        stage: 'preflight',
        sourceIssueCodes: ['source-missing'],
        blocksDb: true,
        blocksFiles: true,
      }),
    ])
  })

  it('blocks missing preflight dependency for move-required plans before DB and files', () => {
    const movePlan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [attachment({ url: PENDING_PATH })],
      targetUuidFactory: createUuidFactory(TARGET_UUID),
    })

    const outcome = classifySubmitRuntimeOrchestrationOutcome({
      ...baseInput(),
      movePlan,
      preflight: null,
    })

    expect(outcome.primaryCategory).toBe('blocked-by-missing-dependency')
    expect(outcome.categories).toEqual([
      'blocked-by-missing-dependency',
      'blocked-before-db',
      'blocked-before-files',
    ])
    expect(outcome.issues[0]).toMatchObject({
      code: 'preflight-missing',
      dependency: 'preflight',
      blocksDb: true,
      blocksFiles: true,
    })
  })

  it('classifies DB transaction failure as blocking files', async () => {
    const input = await createMoveRequiredInput({
      dbTransaction: 'failed',
    })

    const outcome = classifySubmitRuntimeOrchestrationOutcome(input)

    expect(outcome.primaryCategory).toBe('blocked-before-files')
    expect(outcome.issues[0]).toMatchObject({
      code: 'db-transaction-failed',
      blocksFiles: true,
    })
    expect(outcome.dbFilePolicy?.primaryCategory).toBe('abort-before-files')
    expect(outcome.guards.canStartFiles).toBe(false)
  })

  it('classifies DB success with file movement not started as not route success', async () => {
    const input = await createMoveRequiredInput({
      dbTransaction: 'succeeded',
      fileMovement: 'not-started',
    })

    const outcome = classifySubmitRuntimeOrchestrationOutcome(input)

    expect(outcome.primaryCategory).toBe('ready-for-files')
    expect(outcome.guards).toEqual({
      canStartDb: false,
      canStartFiles: true,
      canReturnRouteSuccess: false,
    })
    expect(outcome.primaryCategory).not.toBe('safe-success')
  })

  it('classifies DB success plus file movement success as safe-success', async () => {
    const input = await createMoveRequiredInput({
      dbTransaction: 'succeeded',
      fileMovement: 'succeeded',
    })

    const outcome = classifySubmitRuntimeOrchestrationOutcome(input)

    expect(outcome.primaryCategory).toBe('safe-success')
    expect(outcome.categories).toEqual(['safe-success'])
    expect(outcome.guards.canReturnRouteSuccess).toBe(true)
    expect(outcome.dbFilePolicy?.primaryCategory).toBe('safe-success')
  })

  it('classifies DB success plus file movement failure as compensation-required or unsafe, not success', async () => {
    const failed = classifySubmitRuntimeOrchestrationOutcome(await createMoveRequiredInput({
      dbTransaction: 'succeeded',
      fileMovement: 'failed',
    }))
    const partial = classifySubmitRuntimeOrchestrationOutcome(await createMoveRequiredInput({
      dbTransaction: 'succeeded',
      fileMovement: 'partially-failed',
    }))

    expect(failed.categories).toContain('compensation-required')
    expect(failed.categories).toContain('unsafe-to-return-success')
    expect(failed.primaryCategory).not.toBe('safe-success')
    expect(partial.categories).toContain('compensation-required')
    expect(partial.guards.canReturnRouteSuccess).toBe(false)
  })

  it('blocks move-required success when file movement is out of scope or not injected', async () => {
    const input = await createMoveRequiredInput({
      dbTransaction: 'succeeded',
      dependencies: {
        ...readyDependencies(),
        'file-movement': 'missing',
      },
    })

    const outcome = classifySubmitRuntimeOrchestrationOutcome(input)

    expect(outcome.primaryCategory).toBe('blocked-by-missing-dependency')
    expect(outcome.categories).toContain('blocked-before-files')
    expect(outcome.issues[0]).toMatchObject({
      code: 'file-mover-missing',
      dependency: 'file-movement',
    })
    expect(outcome.guards.canReturnRouteSuccess).toBe(false)
  })

  it('allows formal/no-move-required-only plans to reach safe-success after DB success', () => {
    const movePlan = buildSubmitMovePlan({
      ownerUserId: OWNER_ID,
      attachments: [attachment({ url: FORMAL_PATH })],
      targetUuidFactory: createUuidFactory(TARGET_UUID),
    })

    const outcome = classifySubmitRuntimeOrchestrationOutcome({
      ...baseInput(),
      movePlan,
      preflight: null,
      dbTransaction: 'succeeded',
      fileMovement: 'not-required',
      dependencies: {
        ...readyDependencies(),
        preflight: 'not-required',
        'file-movement': 'not-required',
      },
    })

    expect(outcome.moveRequired).toBe(false)
    expect(outcome.primaryCategory).toBe('safe-success')
    expect(outcome.guards.canReturnRouteSuccess).toBe(true)
  })

  it('does not expose an external storage fallback outcome', async () => {
    const outcome = classifySubmitRuntimeOrchestrationOutcome(await createMoveRequiredInput({
      dbTransaction: 'succeeded',
      fileMovement: 'failed',
    }))
    const serialized = JSON.stringify(outcome).toLowerCase()

    expect(outcome.noExternalStorageFallback).toBe(true)
    expect(serialized).not.toContain(['supa', 'base'].join(''))
    expect(serialized).not.toContain(['storage', 'from'].join('.'))
    expect(serialized).not.toContain('fallback-to-external')
  })

  it('serialized outputs do not contain physical paths, roots, env names, tokens, links, or file contents', async () => {
    const outcome = classifySubmitRuntimeOrchestrationOutcome(await createMoveRequiredInput({
      dbTransaction: 'succeeded',
      fileMovement: 'failed',
      compensation: 'failed',
    }))
    const plan = createSubmitRuntimeOrchestrationPlan(await createMoveRequiredInput())
    const readiness = validateSubmitRuntimeOrchestrationReadiness(await createMoveRequiredInput())

    expectNoSensitiveExposure(outcome)
    expectNoSensitiveExposure(plan)
    expectNoSensitiveExposure(readiness)
  })

  it('does not mutate input', async () => {
    const input = await createMoveRequiredInput({
      dbTransaction: 'succeeded',
      fileMovement: 'failed',
    })
    const before = JSON.stringify(input)

    const first = classifySubmitRuntimeOrchestrationOutcome(input)
    const second = classifySubmitRuntimeOrchestrationOutcome(input)

    expect(JSON.stringify(input)).toBe(before)
    expect(second).toEqual(first)
  })

  it('helper implementation strings are free of route, service, query, and file operation markers', () => {
    const implementation = [
      String(classifySubmitRuntimeOrchestrationOutcome),
      String(createSubmitRuntimeOrchestrationPlan),
      String(validateSubmitRuntimeOrchestrationReadiness),
    ].join('\n')

    for (const fragment of [
      ['supa', 'base'].join(''),
      ['create', 'Client'].join(''),
      ['storage', 'from'].join('.'),
      'node:' + 'fs',
      ['fs', '.'].join(''),
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
      ['DMS', '_LOCAL', '_STORAGE', '_ROOT'].join(''),
      ['route', 'Tree'].join(''),
      ['src', '/', 'routes'].join(''),
      ['components', '/'].join(''),
      ['db', '.'].join(''),
      ['driz', 'zle'].join(''),
      ['get', 'Local', 'Storage', 'Root'].join(''),
      ['resolve', 'Physical', 'Storage', 'Path'].join(''),
    ]) {
      expect(implementation).not.toContain(fragment)
    }
  })

  it('creates an explicit stage plan without executing injected capabilities', async () => {
    const input = await createMoveRequiredInput({
      dbTransaction: 'succeeded',
      fileMovement: 'not-started',
    })

    const plan = createSubmitRuntimeOrchestrationPlan(input)

    expect(plan.defaultSubmitPlanningTarget).toBe('temp-id')
    expect(plan.routeWired).toBe(false)
    expect(plan.liveCallsExecuted).toBe(false)
    expect(plan.fileMovementExecuted).toBe(false)
    expect(plan.stages.map(stage => stage.stage)).toEqual([
      'parse-and-validate',
      'auth-and-role',
      'master-and-permission',
      'move-plan',
      'preflight',
      'db-transaction',
      'file-movement',
      'compensation-policy',
      'success',
    ])
    expect(plan.stages.find(stage => stage.stage === 'file-movement')?.status).toBe('ready')
  })
})

function baseInput(): SubmitRuntimeOrchestratorInput {
  return {
    payload: { ok: true },
    actor: {
      ok: true,
      userId: OWNER_ID,
      submitCompatible: true,
    },
    masterAndPermission: { ok: true },
    dependencies: readyDependencies(),
    dbTransaction: 'not-started',
    fileMovement: 'not-started',
  }
}

async function createMoveRequiredInput(
  overrides: Partial<SubmitRuntimeOrchestratorInput> & {
    preflightSourceExists?: boolean
  } = {},
): Promise<SubmitRuntimeOrchestratorInput> {
  const movePlan = buildSubmitMovePlan({
    ownerUserId: OWNER_ID,
    attachments: [attachment({ url: PENDING_PATH })],
    targetUuidFactory: createUuidFactory(TARGET_UUID),
  })
  const sourceExists = overrides.preflightSourceExists ?? true
  const preflight = await preflightSubmitFiles({
    actorUserId: OWNER_ID,
    movePlan,
    existenceChecker: {
      checkSourceExists: vi.fn(() => sourceExists),
      checkTargetAvailable: vi.fn(() => true),
    },
  })
  const { preflightSourceExists: _unused, ...plainOverrides } = overrides

  return {
    ...baseInput(),
    movePlan,
    preflight,
    ...plainOverrides,
    dependencies: {
      ...readyDependencies(),
      ...overrides.dependencies,
    },
  }
}

function readyDependencies() {
  return {
    'payload-validation': 'provided',
    'actor-resolution': 'provided',
    'master-and-permission': 'provided',
    'move-plan-builder': 'provided',
    preflight: 'provided',
    'write-transaction': 'provided',
    'file-movement': 'provided',
    'compensation-policy': 'provided',
  } as const
}

function attachment(overrides: { url: string }) {
  return {
    kelengkapan_id: KELENGKAPAN_ID,
    nama: 'Lampiran',
    url: overrides.url,
    uploaded_at: new Date(TIMESTAMP).toISOString(),
  }
}

function createUuidFactory(...uuids: string[]): () => string {
  let index = 0

  return () => uuids[index++] ?? uuids[uuids.length - 1] ?? TARGET_UUID
}

function expectNoSensitiveExposure(value: unknown): void {
  const serialized = JSON.stringify(value)
  const sensitiveFragments = [
    'D:\\',
    'C:\\',
    '/storage/',
    ['DATA', 'BASE', '_URL'].join(''),
    ['DMS', '_LOCAL', '_STORAGE', '_ROOT'].join(''),
    'secret',
    ['tok', 'en'].join(''),
    ['signed', 'Url'].join(''),
    'uploaded file content',
  ]

  for (const fragment of sensitiveFragments) {
    expect(serialized).not.toContain(fragment)
  }
}
