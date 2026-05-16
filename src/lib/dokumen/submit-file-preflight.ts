// Server-only module. Do not import from client components.
// Isolated helper foundation only: do not wire submit routes or filesystem movers here.
import type {
  SubmitMovePlan,
  SubmitMovePlanAttachment,
  SubmitMovePlanEntry,
  SubmitMovePlanIssueCode,
  SubmitMovePlanPathClassification,
} from '#/lib/storage/submit-move-plan'

export type SubmitFilePreflightIssueCode =
  | SubmitMovePlanIssueCode
  | 'existence-check-failed'
  | 'existence-checker-missing'
  | 'move-plan-blocking-issue'
  | 'source-missing'
  | 'target-already-exists'
  | 'unsafe-logical-path'

export type SubmitFilePreflightClientCategory =
  | 'validation'
  | 'local-storage-missing'
  | 'local-storage-conflict'
  | 'preflight-unavailable'

export type SubmitFilePreflightIssue = {
  code: SubmitFilePreflightIssueCode
  message: string
  index: number
  clientCategory: SubmitFilePreflightClientCategory
  sourceLogicalPath: string | null
  targetLogicalPath: string | null
  sourceClassification: SubmitMovePlanPathClassification
  movePlanIssueCode?: SubmitMovePlanIssueCode
  checkKind?: 'source' | 'target'
}

export type SubmitFilePreflightOperation = {
  index: number
  action: 'move-required' | 'no-move-required'
  sourceLogicalPath: string
  targetLogicalPath: string
  sourceClassification: SubmitMovePlanPathClassification
}

export type SubmitFilePreflightExistenceChecker = {
  /**
   * Receives a logical storage path only. Implementations must not return or
   * expose physical filesystem paths, storage roots, file contents, or tokens.
   */
  checkSourceExists?(logicalPath: string): Promise<boolean> | boolean
  /**
   * Receives a logical storage path only. Return true when the target can be
   * created without overwrite. Return false when it already exists or is not
   * available.
   */
  checkTargetAvailable?(logicalPath: string): Promise<boolean> | boolean
}

export type SubmitFilePreflightInput<
  TAttachment extends SubmitMovePlanAttachment = SubmitMovePlanAttachment,
> = {
  actorUserId: string
  movePlan: SubmitMovePlan<TAttachment>
  existenceChecker?: SubmitFilePreflightExistenceChecker
}

export type SubmitFilePreflightResult =
  | {
    ok: true
    operations: SubmitFilePreflightOperation[]
    issues: []
    plannedAttachments: SubmitMovePlanAttachment[]
    checks: {
      sourceExistence: 'checked' | 'not-checked'
      targetAvailability: 'checked' | 'not-checked'
    }
  }
  | {
    ok: false
    operations: SubmitFilePreflightOperation[]
    issues: SubmitFilePreflightIssue[]
    plannedAttachments: SubmitMovePlanAttachment[]
    checks: {
      sourceExistence: 'checked' | 'not-checked'
      targetAvailability: 'checked' | 'not-checked'
    }
  }

export const SUBMIT_FILE_PREFLIGHT_CLIENT_CATEGORIES: Record<
  SubmitFilePreflightIssueCode,
  SubmitFilePreflightClientCategory
> = {
  'existence-check-failed': 'preflight-unavailable',
  'existence-checker-missing': 'preflight-unavailable',
  'invalid-document-id': 'validation',
  'invalid-owner-id': 'validation',
  'invalid-source-extension': 'validation',
  'invalid-source-path': 'validation',
  'invalid-target-path': 'validation',
  'invalid-target-uuid': 'validation',
  'missing-url': 'validation',
  'move-plan-blocking-issue': 'validation',
  'owner-mismatch': 'validation',
  'source-missing': 'local-storage-missing',
  'target-already-exists': 'local-storage-conflict',
  'unsafe-logical-path': 'validation',
  'unsupported-source-path': 'validation',
}

export async function preflightSubmitFiles<
  TAttachment extends SubmitMovePlanAttachment = SubmitMovePlanAttachment,
>({
  actorUserId,
  movePlan,
  existenceChecker,
}: SubmitFilePreflightInput<TAttachment>): Promise<SubmitFilePreflightResult> {
  const operations = buildSafeOperations(movePlan.entries)
  const plannedAttachments = [...movePlan.plannedAttachments]
  const planIssues = collectMovePlanIssues(actorUserId, movePlan)

  if (planIssues.length > 0) {
    return {
      ok: false,
      operations,
      issues: planIssues,
      plannedAttachments,
      checks: {
        sourceExistence: 'not-checked',
        targetAvailability: 'not-checked',
      },
    }
  }

  const { issues, checks } = await runInjectedExistenceChecks(operations, existenceChecker)

  if (issues.length > 0) {
    return {
      ok: false,
      operations,
      issues,
      plannedAttachments,
      checks,
    }
  }

  return {
    ok: true,
    operations,
    issues: [],
    plannedAttachments,
    checks,
  }
}

function buildSafeOperations<TAttachment extends SubmitMovePlanAttachment>(
  entries: SubmitMovePlanEntry<TAttachment>[],
): SubmitFilePreflightOperation[] {
  return entries.flatMap(entry => {
    if (
      (entry.action === 'planned-move' || entry.action === 'unchanged')
      && entry.sourceLogicalPath !== null
      && entry.targetLogicalPath !== null
    ) {
      return [{
        index: entry.index,
        action: entry.action === 'planned-move' ? 'move-required' : 'no-move-required',
        sourceLogicalPath: entry.sourceLogicalPath,
        targetLogicalPath: entry.targetLogicalPath,
        sourceClassification: entry.sourceClassification,
      }]
    }

    return []
  })
}

function collectMovePlanIssues<TAttachment extends SubmitMovePlanAttachment>(
  actorUserId: string,
  movePlan: SubmitMovePlan<TAttachment>,
): SubmitFilePreflightIssue[] {
  const issues: SubmitFilePreflightIssue[] = []

  if (actorUserId !== movePlan.ownerUserId) {
    issues.push(createIssue({
      code: 'owner-mismatch',
      message: 'Submit file preflight actor does not match the planned owner.',
      index: -1,
      sourceLogicalPath: null,
      targetLogicalPath: null,
      sourceClassification: 'invalid',
      movePlanIssueCode: 'owner-mismatch',
    }))
  }

  for (const entry of movePlan.entries) {
    if (!entry.issue) continue

    issues.push(createIssue({
      code: mapMovePlanIssueCode(entry.issue.code),
      message: entry.issue.message,
      index: entry.index,
      sourceLogicalPath: entry.sourceLogicalPath,
      targetLogicalPath: entry.targetLogicalPath,
      sourceClassification: entry.sourceClassification,
      movePlanIssueCode: entry.issue.code,
    }))
  }

  return issues
}

function mapMovePlanIssueCode(code: SubmitMovePlanIssueCode): SubmitFilePreflightIssueCode {
  if (code === 'owner-mismatch' || code === 'unsupported-source-path') {
    return code
  }

  if (code === 'invalid-source-path' || code === 'invalid-target-path') {
    return 'unsafe-logical-path'
  }

  return 'move-plan-blocking-issue'
}

async function runInjectedExistenceChecks(
  operations: SubmitFilePreflightOperation[],
  existenceChecker: SubmitFilePreflightExistenceChecker | undefined,
): Promise<{
  issues: SubmitFilePreflightIssue[]
  checks: SubmitFilePreflightResult['checks']
}> {
  const issues: SubmitFilePreflightIssue[] = []
  let sourceChecked = false
  let targetChecked = false

  for (const operation of operations) {
    if (operation.action !== 'move-required') continue

    if (!existenceChecker?.checkSourceExists) {
      issues.push(createIssue({
        code: 'existence-checker-missing',
        message: 'Submit file source existence checker is required for move-required operations.',
        operation,
        checkKind: 'source',
      }))
    }

    if (!existenceChecker?.checkTargetAvailable) {
      issues.push(createIssue({
        code: 'existence-checker-missing',
        message: 'Submit file target availability checker is required for move-required operations.',
        operation,
        checkKind: 'target',
      }))
    }

    if (!existenceChecker?.checkSourceExists || !existenceChecker.checkTargetAvailable) {
      continue
    }

    sourceChecked = true
    const sourceResult = await callBooleanChecker(
      () => existenceChecker.checkSourceExists?.(operation.sourceLogicalPath),
    )

    if (sourceResult === 'failed') {
      issues.push(createIssue({
        code: 'existence-check-failed',
        message: 'Submit file source existence could not be checked safely.',
        operation,
        checkKind: 'source',
      }))
      continue
    }

    if (!sourceResult) {
      issues.push(createIssue({
        code: 'source-missing',
        message: 'Submit file source is missing from local storage.',
        operation,
        checkKind: 'source',
      }))
      continue
    }

    targetChecked = true
    const targetResult = await callBooleanChecker(
      () => existenceChecker.checkTargetAvailable?.(operation.targetLogicalPath),
    )

    if (targetResult === 'failed') {
      issues.push(createIssue({
        code: 'existence-check-failed',
        message: 'Submit file target availability could not be checked safely.',
        operation,
        checkKind: 'target',
      }))
      continue
    }

    if (!targetResult) {
      issues.push(createIssue({
        code: 'target-already-exists',
        message: 'Submit file target already exists or is unavailable.',
        operation,
        checkKind: 'target',
      }))
    }
  }

  return {
    issues,
    checks: {
      sourceExistence: sourceChecked ? 'checked' : 'not-checked',
      targetAvailability: targetChecked ? 'checked' : 'not-checked',
    },
  }
}

async function callBooleanChecker(
  operation: () => Promise<boolean> | boolean | undefined,
): Promise<boolean | 'failed'> {
  try {
    return Boolean(await operation())
  } catch {
    return 'failed'
  }
}

function createIssue(input: {
  code: SubmitFilePreflightIssueCode
  message: string
  index?: number
  sourceLogicalPath?: string | null
  targetLogicalPath?: string | null
  sourceClassification?: SubmitMovePlanPathClassification
  movePlanIssueCode?: SubmitMovePlanIssueCode
  checkKind?: 'source' | 'target'
  operation?: SubmitFilePreflightOperation
}): SubmitFilePreflightIssue {
  const operation = input.operation
  const code = input.code

  return {
    code,
    message: input.message,
    index: input.index ?? operation?.index ?? -1,
    clientCategory: SUBMIT_FILE_PREFLIGHT_CLIENT_CATEGORIES[code],
    sourceLogicalPath: input.sourceLogicalPath ?? operation?.sourceLogicalPath ?? null,
    targetLogicalPath: input.targetLogicalPath ?? operation?.targetLogicalPath ?? null,
    sourceClassification: input.sourceClassification ?? operation?.sourceClassification ?? 'invalid',
    movePlanIssueCode: input.movePlanIssueCode,
    checkKind: input.checkKind,
  }
}
