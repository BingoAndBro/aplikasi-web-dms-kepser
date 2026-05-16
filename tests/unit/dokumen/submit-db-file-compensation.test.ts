import { describe, expect, it } from 'vitest'

import {
  classifySubmitDbFileOutcome,
  createSubmitDbFileFailurePlan,
  decideSubmitDbFilePolicy,
  SUBMIT_DB_FILE_COMPENSATION_POLICY,
  type SubmitDbFilePolicyInput,
} from '#/lib/dokumen/submit-db-file-compensation'

describe('submit DB/file compensation policy foundation', () => {
  it('classifies preflight failure as abort-before-db and abort-before-files', () => {
    const decision = decideSubmitDbFilePolicy({
      preflight: 'failed',
      dbTransaction: 'not-started',
      fileMovement: 'not-started',
    })

    expect(decision.primaryCategory).toBe('abort-before-db')
    expect(decision.categories).toEqual(['abort-before-db', 'abort-before-files'])
    expect(decision.events).toEqual(['preflight-failed'])
    expect(decision.guards).toEqual({
      dbWrite: 'blocked',
      fileMove: 'blocked',
      routeSuccess: 'blocked',
    })
    expect(decision.requiresCompensation).toBe(false)
    expect(decision.runtimeCompensationImplemented).toBe(false)
    expectNoSensitiveExposure(decision)
  })

  it('classifies DB transaction failure after preflight success as abort-before-files', () => {
    const decision = decideSubmitDbFilePolicy({
      preflight: 'succeeded',
      dbTransaction: 'failed',
      fileMovement: 'not-started',
    })

    expect(decision.primaryCategory).toBe('abort-before-files')
    expect(decision.categories).toEqual(['abort-before-files'])
    expect(decision.events).toEqual(['db-transaction-failed'])
    expect(decision.guards).toEqual({
      dbWrite: 'already-failed',
      fileMove: 'blocked',
      routeSuccess: 'blocked',
    })
    expect(decision.requiresCompensation).toBe(false)
    expectNoSensitiveExposure(decision)
  })

  it('classifies DB success before movement as proceed-to-files but not success', () => {
    const decision = classifySubmitDbFileOutcome({
      preflight: 'succeeded',
      dbTransaction: 'succeeded',
      fileMovement: 'not-started',
    })

    expect(decision.primaryCategory).toBe('proceed-to-files')
    expect(decision.guards.fileMove).toBe('allowed')
    expect(decision.guards.routeSuccess).toBe('blocked')
    expect(decision.requiresCompensation).toBe(false)
  })

  it('classifies DB success plus file move success as safe-success', () => {
    const decision = decideSubmitDbFilePolicy({
      preflight: 'succeeded',
      dbTransaction: 'succeeded',
      fileMovement: 'succeeded',
    })

    expect(decision.primaryCategory).toBe('safe-success')
    expect(decision.categories).toEqual(['safe-success'])
    expect(decision.events).toEqual(['db-transaction-succeeded', 'file-move-succeeded'])
    expect(decision.guards.routeSuccess).toBe('allowed')
    expect(decision.requiresCompensation).toBe(false)
    expect(decision.compensation).toBe('not-required')
    expectNoSensitiveExposure(decision)
  })

  it('classifies DB success plus file move failure as compensation-required, not success', () => {
    const decision = decideSubmitDbFilePolicy({
      preflight: 'succeeded',
      dbTransaction: 'succeeded',
      fileMovement: 'failed',
    })

    expect(decision.primaryCategory).toBe('require-compensation')
    expect(decision.categories).toEqual(['require-compensation', 'unsafe-to-return-success'])
    expect(decision.events).toEqual([
      'db-transaction-succeeded',
      'file-move-failed',
      'compensation-required',
    ])
    expect(decision.guards.routeSuccess).toBe('blocked')
    expect(decision.requiresCompensation).toBe(true)
    expect(decision.compensation).toBe('required')
    expect(decision.primaryCategory).not.toBe('safe-success')
  })

  it('classifies partial file movement failure as compensation-required and not success', () => {
    const decision = decideSubmitDbFilePolicy({
      preflight: 'succeeded',
      dbTransaction: 'succeeded',
      fileMovement: 'partially-failed',
    })

    expect(decision.categories).toContain('require-compensation')
    expect(decision.categories).toContain('unsafe-to-return-success')
    expect(decision.guards.fileMove).toBe('partial-failure')
    expect(decision.guards.routeSuccess).toBe('blocked')
    expect(decision.recommendedAction).toBe('classify-controlled-failure-and-recover')
  })

  it('keeps compensation failure unsafe and does not claim rollback success', () => {
    const decision = decideSubmitDbFilePolicy({
      preflight: 'succeeded',
      dbTransaction: 'succeeded',
      fileMovement: 'failed',
      compensation: 'failed',
    })

    expect(decision.stage).toBe('compensation')
    expect(decision.events).toContain('compensation-failed')
    expect(decision.categories).toContain('unsafe-to-return-success')
    expect(decision.guards.routeSuccess).toBe('blocked')
    expect(decision.recommendedAction).toBe('remain-unsafe-after-compensation-failure')
    expect(decision.primaryCategory).not.toBe('safe-success')
  })

  it('does not expose an option for external service fallback in policy output', () => {
    const decision = decideSubmitDbFilePolicy({
      preflight: 'succeeded',
      dbTransaction: 'succeeded',
      fileMovement: 'failed',
    })
    const serialized = JSON.stringify({
      policy: SUBMIT_DB_FILE_COMPENSATION_POLICY,
      decision,
    }).toLowerCase()

    expect(serialized).not.toContain(['supa', 'base'].join(''))
    expect(serialized).not.toContain(['storage', 'from'].join('.'))
    expect(serialized).toContain('no-external-storage-fallback')
  })

  it('does not include physical paths, roots, env names, tokens, link fields, or file contents in serialized outputs', () => {
    const decisions = [
      decideSubmitDbFilePolicy({
        preflight: 'failed',
        dbTransaction: 'not-started',
        fileMovement: 'not-started',
      }),
      decideSubmitDbFilePolicy({
        preflight: 'succeeded',
        dbTransaction: 'succeeded',
        fileMovement: 'failed',
        compensation: 'completed',
      }),
      createSubmitDbFileFailurePlan({
        preflight: 'succeeded',
        dbTransaction: 'succeeded',
        fileMovement: 'succeeded',
      }),
      SUBMIT_DB_FILE_COMPENSATION_POLICY,
    ]

    for (const value of decisions) {
      expectNoSensitiveExposure(value)
    }
  })

  it('is pure and does not mutate input', () => {
    const input: SubmitDbFilePolicyInput = {
      preflight: 'succeeded',
      dbTransaction: 'succeeded',
      fileMovement: 'failed',
      compensation: 'required',
    }
    const before = JSON.stringify(input)

    const first = decideSubmitDbFilePolicy(input)
    const second = decideSubmitDbFilePolicy(input)

    expect(JSON.stringify(input)).toBe(before)
    expect(second).toEqual(first)
  })

  it('keeps helper implementation free of route, service, database, query-builder, and filesystem integration strings', () => {
    const implementation = [
      String(decideSubmitDbFilePolicy),
      String(classifySubmitDbFileOutcome),
      String(createSubmitDbFileFailurePlan),
      JSON.stringify(SUBMIT_DB_FILE_COMPENSATION_POLICY),
    ].join('\n')

    for (const fragment of [
      ['supa', 'base'].join(''),
      ['create', 'Client'].join(''),
      ['storage', 'from'].join('.'),
      'node:' + 'fs',
      ['write', 'File'].join(''),
      ['re', 'name'].join(''),
      ['un', 'link'].join(''),
      ['mk', 'dir'].join(''),
      ['rm', 'dir'].join(''),
      ['process', 'env'].join('.'),
      ['DATA', 'BASE', '_URL'].join(''),
      ['DMS', '_LOCAL', '_STORAGE', '_ROOT'].join(''),
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
