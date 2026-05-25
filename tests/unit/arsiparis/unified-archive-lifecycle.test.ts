import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  planUnifiedArchiveLifecycleTransition,
  type UnifiedArchiveLifecycleAction,
  type UnifiedArchiveLifecyclePlan,
} from '#/lib/archive/unified-archive-lifecycle'
import type { ArchiveSourceType, StatusArsip } from '#/lib/constants/archive-status'

describe('unified archive lifecycle planner', () => {
  it('allows WORKFLOW AKTIF -> INAKTIF via mark_inactive', () => {
    const plan = workflowPlan('mark_inactive', 'AKTIF')

    expectAllowed(plan, {
      action: 'mark_inactive',
      fromStatus: 'AKTIF',
      toStatus: 'INAKTIF',
      sourceType: 'WORKFLOW',
    })
    if (plan.status !== 'allowed') throw new Error('expected allowed')
    expect(plan.sourceSyncUpdate).toEqual({
      target: 'none',
      reason: 'WORKFLOW_CANONICAL_STATUS_ONLY',
    })
    expect(plan.transactionPlan.steps).toContain('Do not update workflow document business metadata.')
  })

  it('allows WORKFLOW INAKTIF -> USUL_MUSNAH via propose_destruction', () => {
    const plan = workflowPlan('propose_destruction', 'INAKTIF')

    expectAllowed(plan, {
      action: 'propose_destruction',
      fromStatus: 'INAKTIF',
      toStatus: 'USUL_MUSNAH',
      sourceType: 'WORKFLOW',
    })
    if (plan.status !== 'allowed') throw new Error('expected allowed')
    expect(plan.auditIntent.requiresReason).toBe(true)
    expect(plan.transactionPlan.steps).toContain('Apply the future approved proposal bridge policy without deleting files.')
  })

  it('allows WORKFLOW USUL_MUSNAH -> DIMUSNAHKAN with extra confirmation audit intent', () => {
    const plan = workflowPlan('approve_destruction', 'USUL_MUSNAH')

    expectAllowed(plan, {
      action: 'approve_destruction',
      fromStatus: 'USUL_MUSNAH',
      toStatus: 'DIMUSNAHKAN',
      sourceType: 'WORKFLOW',
    })
    if (plan.status !== 'allowed') throw new Error('expected allowed')
    expect(plan.auditIntent).toMatchObject({
      requiresReason: true,
      requiresExplicitConfirmation: true,
      auditStorage: 'FUTURE_ROUTE_DECISION_REQUIRED',
    })
    expect(plan.fileDeletion).toBe(false)
    expect(plan.transactionPlan.steps).toContain('Block future file access by status; do not delete physical files.')
  })

  it('allows WORKFLOW USUL_MUSNAH -> INAKTIF cancellation without restoring to AKTIF', () => {
    const plan = workflowPlan('cancel_proposal', 'USUL_MUSNAH')

    expectAllowed(plan, {
      action: 'cancel_proposal',
      fromStatus: 'USUL_MUSNAH',
      toStatus: 'INAKTIF',
      sourceType: 'WORKFLOW',
    })
    if (plan.status !== 'allowed') throw new Error('expected allowed')
    expect(plan.toStatus).not.toBe('AKTIF')
    expect(plan.transactionPlan.steps).toContain(
      'Record cancellation semantics as USUL_MUSNAH to INAKTIF, not restoration to AKTIF.',
    )
  })

  it('rejects WORKFLOW transitions from DIMUSNAHKAN as terminal', () => {
    const plan = workflowPlan('mark_inactive', 'DIMUSNAHKAN')

    expectRejected(plan, 'TERMINAL_STATUS', 'Arsip yang sudah dimusnahkan tidak dapat diubah statusnya.')
  })

  it('rejects WORKFLOW AKTIF -> USUL_MUSNAH direct transition', () => {
    const plan = workflowPlan('propose_destruction', 'AKTIF')

    expectRejected(plan, 'TRANSITION_NOT_ALLOWED', 'Perubahan status arsip tidak diizinkan.')
  })

  it('rejects WORKFLOW INAKTIF -> DIMUSNAHKAN direct transition', () => {
    const plan = workflowPlan('approve_destruction', 'INAKTIF')

    expectRejected(plan, 'TRANSITION_NOT_ALLOWED', 'Perubahan status arsip tidak diizinkan.')
  })

  it('allows MANUAL matching source/canonical AKTIF -> INAKTIF and includes source sync', () => {
    const plan = manualPlan('mark_inactive', 'AKTIF', 'AKTIF')

    expectAllowed(plan, {
      action: 'mark_inactive',
      fromStatus: 'AKTIF',
      toStatus: 'INAKTIF',
      sourceType: 'MANUAL',
    })
    expectManualSync(plan, 'AKTIF', 'INAKTIF')
  })

  it('allows MANUAL matching source/canonical INAKTIF -> USUL_MUSNAH and includes source sync', () => {
    const plan = manualPlan('propose_destruction', 'INAKTIF', 'INAKTIF')

    expectAllowed(plan, {
      action: 'propose_destruction',
      fromStatus: 'INAKTIF',
      toStatus: 'USUL_MUSNAH',
      sourceType: 'MANUAL',
    })
    expectManualSync(plan, 'INAKTIF', 'USUL_MUSNAH')
  })

  it('allows MANUAL matching source/canonical USUL_MUSNAH -> DIMUSNAHKAN and includes source sync', () => {
    const plan = manualPlan('approve_destruction', 'USUL_MUSNAH', 'USUL_MUSNAH')

    expectAllowed(plan, {
      action: 'approve_destruction',
      fromStatus: 'USUL_MUSNAH',
      toStatus: 'DIMUSNAHKAN',
      sourceType: 'MANUAL',
    })
    expectManualSync(plan, 'USUL_MUSNAH', 'DIMUSNAHKAN')
    if (plan.status !== 'allowed') throw new Error('expected allowed')
    expect(plan.fileDeletion).toBe(false)
  })

  it('rejects MANUAL when linked source status is missing', () => {
    const plan = manualPlan('mark_inactive', 'AKTIF', undefined)

    expectRejected(plan, 'MANUAL_SOURCE_MISSING', 'Sumber Arsip Manual terkait tidak ditemukan.')
  })

  it('rejects MANUAL source/canonical status drift', () => {
    const plan = manualPlan('mark_inactive', 'AKTIF', 'INAKTIF')

    expectRejected(
      plan,
      'MANUAL_STATUS_DRIFT',
      'Status Arsip Manual tidak selaras dengan status arsip canonical.',
    )
  })

  it('rejects unknown action, status, and source type with controlled reasons', () => {
    expectRejected(
      planUnifiedArchiveLifecycleTransition({
        action: 'restore_active',
        currentStatus: 'INAKTIF',
        sourceType: 'WORKFLOW',
      }),
      'INVALID_ACTION',
      'Aksi lifecycle arsip tidak valid.',
    )
    expectRejected(
      planUnifiedArchiveLifecycleTransition({
        action: 'mark_inactive',
        currentStatus: 'VERIFIKASI_PENYUSUTAN',
        sourceType: 'WORKFLOW',
      }),
      'INVALID_CURRENT_STATUS',
      'Status arsip saat ini tidak valid.',
    )
    expectRejected(
      planUnifiedArchiveLifecycleTransition({
        action: 'mark_inactive',
        currentStatus: 'AKTIF',
        sourceType: 'LEGACY',
      }),
      'SOURCE_NOT_SUPPORTED',
      'Sumber arsip tidak didukung untuk perubahan lifecycle terpadu.',
    )
  })

  it('treats missing canonical status as archive not found', () => {
    const plan = planUnifiedArchiveLifecycleTransition({
      action: 'mark_inactive',
      currentStatus: null,
      sourceType: 'WORKFLOW',
    })

    expectRejected(plan, 'ARCHIVE_NOT_FOUND', 'Arsip tidak ditemukan.')
  })

  it('every allowed transition has fileDeletion false', () => {
    const allowedPlans = [
      workflowPlan('mark_inactive', 'AKTIF'),
      workflowPlan('propose_destruction', 'INAKTIF'),
      workflowPlan('approve_destruction', 'USUL_MUSNAH'),
      workflowPlan('cancel_proposal', 'USUL_MUSNAH'),
      manualPlan('mark_inactive', 'AKTIF', 'AKTIF'),
      manualPlan('propose_destruction', 'INAKTIF', 'INAKTIF'),
      manualPlan('approve_destruction', 'USUL_MUSNAH', 'USUL_MUSNAH'),
      manualPlan('cancel_proposal', 'USUL_MUSNAH', 'USUL_MUSNAH'),
    ]

    for (const plan of allowedPlans) {
      expect(plan.status).toBe('allowed')
      if (plan.status !== 'allowed') throw new Error(`expected allowed: ${JSON.stringify(plan)}`)
      expect(plan.fileDeletion).toBe(false)
    }
  })

  it('planner output does not include paths, storage roots, tokens, SQL, env, secrets, or raw rows', () => {
    const outputs = [
      workflowPlan('approve_destruction', 'USUL_MUSNAH'),
      manualPlan('mark_inactive', 'AKTIF', 'AKTIF'),
      manualPlan('mark_inactive', 'AKTIF', 'INAKTIF'),
      planUnifiedArchiveLifecycleTransition({
        action: 'restore_active',
        currentStatus: 'INAKTIF',
        sourceType: 'WORKFLOW',
      }),
    ]

    for (const output of outputs) {
      expectNoSensitiveOutput(output)
    }
  })

  it('helper source stays pure and does not import DB, route, session, request, or response utilities', () => {
    const source = readFileSync('src/lib/archive/unified-archive-lifecycle.ts', 'utf8')

    expect(source).not.toContain('#/db/')
    expect(source).not.toContain('#/routes')
    expect(source).not.toContain('local-server-auth')
    expect(source).not.toContain('auth-state')
    expect(source).not.toContain('same-origin')
    expect(source).not.toContain('Request')
    expect(source).not.toContain('Response')
    expect(source).not.toContain('transaction(')
    expect(source).not.toContain('insert(')
    expect(source).not.toContain('update(')
    expect(source).not.toContain('delete(')
  })
})

function workflowPlan(
  action: UnifiedArchiveLifecycleAction,
  currentStatus: StatusArsip,
): UnifiedArchiveLifecyclePlan {
  return planUnifiedArchiveLifecycleTransition({
    action,
    currentStatus,
    sourceType: 'WORKFLOW',
  })
}

function manualPlan(
  action: UnifiedArchiveLifecycleAction,
  currentStatus: StatusArsip,
  manualSourceStatus: StatusArsip | undefined,
): UnifiedArchiveLifecyclePlan {
  return planUnifiedArchiveLifecycleTransition({
    action,
    currentStatus,
    sourceType: 'MANUAL',
    manualSourceStatus,
  })
}

function expectAllowed(
  plan: UnifiedArchiveLifecyclePlan,
  expected: {
    action: UnifiedArchiveLifecycleAction
    fromStatus: StatusArsip
    toStatus: StatusArsip
    sourceType: ArchiveSourceType
  },
): void {
  expect(plan.status).toBe('allowed')
  if (plan.status !== 'allowed') throw new Error(`expected allowed: ${JSON.stringify(plan)}`)
  expect(plan).toMatchObject(expected)
  expect(plan.canonicalUpdate).toEqual({
    target: 'arsip.arsip',
    set: { statusArsip: expected.toStatus },
    precondition: { statusArsip: expected.fromStatus },
  })
  expect(plan.fileDeletion).toBe(false)
  expect(plan.transactionPlan.description).toBe(
    'Planning contract only; this helper performs no database, route, auth, file, or audit writes.',
  )
  expectNoSensitiveOutput(plan)
}

function expectManualSync(
  plan: UnifiedArchiveLifecyclePlan,
  fromStatus: StatusArsip,
  toStatus: StatusArsip,
): void {
  if (plan.status !== 'allowed') throw new Error(`expected allowed: ${JSON.stringify(plan)}`)
  expect(plan.sourceSyncUpdate).toEqual({
    target: 'arsip.manual_arsip',
    set: { statusArsip: toStatus },
    precondition: {
      statusArsip: fromStatus,
      matchesCanonicalStatus: true,
    },
  })
}

function expectRejected(
  plan: UnifiedArchiveLifecyclePlan,
  reason: UnifiedArchiveLifecyclePlan extends infer T
    ? T extends { status: 'rejected'; reason: infer R }
      ? R
      : never
    : never,
  message: string,
): void {
  expect(plan).toEqual({
    status: 'rejected',
    reason,
    message,
  })
  expectNoSensitiveOutput(plan)
}

function expectNoSensitiveOutput(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('physical_path')
  expect(serialized).not.toContain('original_filename')
  expect(serialized).not.toContain('signedUrl')
  expect(serialized).not.toContain('signed_url')
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('secret')
  expect(serialized).not.toContain('D:\\')
  expect(serialized).not.toContain('/storage/')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('SQL')
  expect(serialized).not.toContain('session')
  expect(serialized).not.toContain('cookie')
  expect(serialized).not.toContain('raw')
}
