// Server-only module. Do not import from client components.
// Submit-specific boundary model only: no route wiring, no live service calls,
// no file movement, and no database execution.
import type { SubmitMovePlan, SubmitMovePlanAttachment } from '#/lib/storage/submit-move-plan'
import type { SubmitFilePreflightResult } from './submit-file-preflight'
import {
  classifySubmitDbFileOutcome,
  type SubmitDbFileCompensationResult,
  type SubmitDbFileMoveResult,
  type SubmitDbFilePolicyDecision,
  type SubmitDbFileTransactionResult,
} from './submit-db-file-compensation'

export type SubmitRuntimeOrchestratorStage =
  | 'parse-and-validate'
  | 'auth-and-role'
  | 'master-and-permission'
  | 'move-plan'
  | 'preflight'
  | 'db-transaction'
  | 'file-movement'
  | 'compensation-policy'
  | 'success'
  | 'blocked'

export type SubmitRuntimeOrchestratorStageStatus =
  | 'completed'
  | 'ready'
  | 'pending'
  | 'blocked'
  | 'not-required'

export type SubmitRuntimeOrchestratorOutcomeCategory =
  | 'blocked-before-auth'
  | 'blocked-before-db'
  | 'blocked-before-files'
  | 'ready-for-db'
  | 'ready-for-files'
  | 'compensation-required'
  | 'safe-success'
  | 'unsafe-to-return-success'
  | 'blocked-by-missing-dependency'

export type SubmitRuntimeOrchestratorIssueCode =
  | 'payload-validation-failed'
  | 'payload-validation-missing'
  | 'actor-missing'
  | 'actor-admin-only'
  | 'actor-not-submit-compatible'
  | 'master-or-permission-failed'
  | 'master-or-permission-missing'
  | 'move-plan-missing'
  | 'move-plan-blocking-issue'
  | 'preflight-missing'
  | 'preflight-failed'
  | 'write-transaction-missing'
  | 'db-transaction-failed'
  | 'file-mover-missing'
  | 'file-movement-not-started'
  | 'file-movement-failed'
  | 'compensation-policy-missing'

export type SubmitRuntimeDependencyName =
  | 'payload-validation'
  | 'actor-resolution'
  | 'master-and-permission'
  | 'move-plan-builder'
  | 'preflight'
  | 'write-transaction'
  | 'file-movement'
  | 'compensation-policy'

export type SubmitRuntimeDependencyState =
  | 'provided'
  | 'missing'
  | 'not-required'

export type SubmitRuntimeOrchestratorDependencies = Partial<
  Record<SubmitRuntimeDependencyName, SubmitRuntimeDependencyState>
>

export type SubmitRuntimeActorBoundary =
  | {
    ok: true
    userId: string
    submitCompatible: true
    adminOnly?: false
  }
  | {
    ok: false
    userId?: string
    submitCompatible?: false
    adminOnly?: boolean
    reason?: 'unauthenticated' | 'admin-only' | 'not-submit-compatible'
  }

export type SubmitRuntimePayloadBoundary =
  | {
    ok: true
  }
  | {
    ok: false
  }

export type SubmitRuntimeMasterBoundary =
  | {
    ok: true
  }
  | {
    ok: false
  }

export type SubmitRuntimeFileMovementResult =
  | 'not-required'
  | SubmitDbFileMoveResult

export type SubmitRuntimeOrchestratorInput<
  TAttachment extends SubmitMovePlanAttachment = SubmitMovePlanAttachment,
> = {
  payload: SubmitRuntimePayloadBoundary | null
  actor: SubmitRuntimeActorBoundary | null
  masterAndPermission?: SubmitRuntimeMasterBoundary | null
  dependencies?: SubmitRuntimeOrchestratorDependencies
  movePlan?: SubmitMovePlan<TAttachment> | null
  preflight?: SubmitFilePreflightResult | null
  dbTransaction?: SubmitDbFileTransactionResult
  fileMovement?: SubmitRuntimeFileMovementResult
  compensation?: SubmitDbFileCompensationResult
}

export type SubmitRuntimeOrchestratorIssue = {
  code: SubmitRuntimeOrchestratorIssueCode
  stage: SubmitRuntimeOrchestratorStage
  blocksDb: boolean
  blocksFiles: boolean
  blocksRouteSuccess: true
  dependency?: SubmitRuntimeDependencyName
  sourceIssueCodes?: string[]
}

export type SubmitRuntimeOrchestrationPlanItem = {
  stage: SubmitRuntimeOrchestratorStage
  status: SubmitRuntimeOrchestratorStageStatus
  dependency?: SubmitRuntimeDependencyName
}

export type SubmitRuntimeOrchestrationPlan = {
  stages: SubmitRuntimeOrchestrationPlanItem[]
  moveRequired: boolean
  defaultSubmitPlanningTarget: 'temp-id'
  routeWired: false
  liveCallsExecuted: false
  fileMovementExecuted: false
}

export type SubmitRuntimeOrchestratorOutcome = {
  stage: SubmitRuntimeOrchestratorStage
  primaryCategory: SubmitRuntimeOrchestratorOutcomeCategory
  categories: readonly SubmitRuntimeOrchestratorOutcomeCategory[]
  issues: readonly SubmitRuntimeOrchestratorIssue[]
  plan: SubmitRuntimeOrchestrationPlan
  guards: {
    canStartDb: boolean
    canStartFiles: boolean
    canReturnRouteSuccess: boolean
  }
  moveRequired: boolean
  dbFilePolicy: SubmitDbFilePolicyDecision | null
  routeBoundaryOnly: true
  noExternalStorageFallback: true
  runtimeDbWritesExecuted: false
  runtimeFileMovementExecuted: false
}

export type SubmitRuntimeReadinessResult =
  | {
    ok: true
    issues: []
    moveRequired: boolean
  }
  | {
    ok: false
    issues: SubmitRuntimeOrchestratorIssue[]
    moveRequired: boolean
  }

const STAGE_ORDER: Array<{
  stage: SubmitRuntimeOrchestratorStage
  dependency?: SubmitRuntimeDependencyName
}> = [
  { stage: 'parse-and-validate', dependency: 'payload-validation' },
  { stage: 'auth-and-role', dependency: 'actor-resolution' },
  { stage: 'master-and-permission', dependency: 'master-and-permission' },
  { stage: 'move-plan', dependency: 'move-plan-builder' },
  { stage: 'preflight', dependency: 'preflight' },
  { stage: 'db-transaction', dependency: 'write-transaction' },
  { stage: 'file-movement', dependency: 'file-movement' },
  { stage: 'compensation-policy', dependency: 'compensation-policy' },
  { stage: 'success' },
]

export function createSubmitRuntimeOrchestrationPlan(
  input: SubmitRuntimeOrchestratorInput,
): SubmitRuntimeOrchestrationPlan {
  const outcome = classifySubmitRuntimeOrchestrationOutcome(input, {
    skipPlanCreation: true,
  })

  return {
    stages: STAGE_ORDER.map(({ stage, dependency }) => ({
      stage,
      dependency,
      status: getStageStatus(stage, dependency, outcome),
    })),
    moveRequired: outcome.moveRequired,
    defaultSubmitPlanningTarget: 'temp-id',
    routeWired: false,
    liveCallsExecuted: false,
    fileMovementExecuted: false,
  }
}

export function validateSubmitRuntimeOrchestrationReadiness(
  input: SubmitRuntimeOrchestratorInput,
): SubmitRuntimeReadinessResult {
  const outcome = classifySubmitRuntimeOrchestrationOutcome(input)
  const blockingIssues = outcome.issues.filter(issue => (
    issue.blocksDb || issue.blocksFiles || issue.blocksRouteSuccess
  ))

  if (blockingIssues.length > 0) {
    return {
      ok: false,
      issues: blockingIssues,
      moveRequired: outcome.moveRequired,
    }
  }

  return {
    ok: true,
    issues: [],
    moveRequired: outcome.moveRequired,
  }
}

export function classifySubmitRuntimeOrchestrationOutcome(
  input: SubmitRuntimeOrchestratorInput,
  options: { skipPlanCreation?: boolean } = {},
): SubmitRuntimeOrchestratorOutcome {
  const moveRequired = hasMoveRequired(input.movePlan)
  const issue = getFirstBlockingIssue(input, moveRequired)

  if (issue) {
    return createOutcome({
      input,
      stage: issue.stage,
      primaryCategory: issue.code === 'actor-missing'
        ? 'blocked-before-auth'
        : issue.dependency
          ? 'blocked-by-missing-dependency'
          : 'blocked-before-db',
      categories: createBlockedCategories(issue),
      issues: [issue],
      moveRequired,
      guards: {
        canStartDb: false,
        canStartFiles: false,
        canReturnRouteSuccess: false,
      },
      dbFilePolicy: null,
      skipPlanCreation: options.skipPlanCreation,
    })
  }

  const dbTransaction = input.dbTransaction ?? 'not-started'

  if (dbTransaction === 'not-started') {
    return createOutcome({
      input,
      stage: 'db-transaction',
      primaryCategory: 'ready-for-db',
      categories: ['ready-for-db', 'blocked-before-files'],
      issues: [],
      moveRequired,
      guards: {
        canStartDb: true,
        canStartFiles: false,
        canReturnRouteSuccess: false,
      },
      dbFilePolicy: classifySubmitDbFileOutcome({
        preflight: 'succeeded',
        dbTransaction: 'not-started',
        fileMovement: 'not-started',
      }),
      skipPlanCreation: options.skipPlanCreation,
    })
  }

  if (dbTransaction === 'failed') {
    const failedIssue = createIssue({
      code: 'db-transaction-failed',
      stage: 'db-transaction',
      blocksDb: false,
      blocksFiles: true,
    })

    return createOutcome({
      input,
      stage: 'db-transaction',
      primaryCategory: 'blocked-before-files',
      categories: ['blocked-before-files'],
      issues: [failedIssue],
      moveRequired,
      guards: {
        canStartDb: false,
        canStartFiles: false,
        canReturnRouteSuccess: false,
      },
      dbFilePolicy: classifySubmitDbFileOutcome({
        preflight: 'succeeded',
        dbTransaction: 'failed',
        fileMovement: 'not-started',
      }),
      skipPlanCreation: options.skipPlanCreation,
    })
  }

  if (!moveRequired) {
    return createOutcome({
      input,
      stage: 'success',
      primaryCategory: 'safe-success',
      categories: ['safe-success'],
      issues: [],
      moveRequired,
      guards: {
        canStartDb: false,
        canStartFiles: false,
        canReturnRouteSuccess: true,
      },
      dbFilePolicy: null,
      skipPlanCreation: options.skipPlanCreation,
    })
  }

  if (dependencyState(input, 'file-movement') !== 'provided') {
    const missingMoverIssue = createIssue({
      code: 'file-mover-missing',
      stage: 'file-movement',
      blocksDb: false,
      blocksFiles: true,
      dependency: 'file-movement',
    })

    return createOutcome({
      input,
      stage: 'file-movement',
      primaryCategory: 'blocked-by-missing-dependency',
      categories: ['blocked-by-missing-dependency', 'blocked-before-files'],
      issues: [missingMoverIssue],
      moveRequired,
      guards: {
        canStartDb: false,
        canStartFiles: false,
        canReturnRouteSuccess: false,
      },
      dbFilePolicy: classifySubmitDbFileOutcome({
        preflight: 'succeeded',
        dbTransaction: 'succeeded',
        fileMovement: 'not-started',
      }),
      skipPlanCreation: options.skipPlanCreation,
    })
  }

  const fileMovement = input.fileMovement ?? 'not-started'
  if (fileMovement === 'not-required') {
    return createOutcome({
      input,
      stage: 'file-movement',
      primaryCategory: 'unsafe-to-return-success',
      categories: ['unsafe-to-return-success'],
      issues: [createIssue({
        code: 'file-movement-not-started',
        stage: 'file-movement',
        blocksDb: false,
        blocksFiles: false,
      })],
      moveRequired,
      guards: {
        canStartDb: false,
        canStartFiles: true,
        canReturnRouteSuccess: false,
      },
      dbFilePolicy: classifySubmitDbFileOutcome({
        preflight: 'succeeded',
        dbTransaction: 'succeeded',
        fileMovement: 'not-started',
      }),
      skipPlanCreation: options.skipPlanCreation,
    })
  }

  if (fileMovement === 'not-started') {
    return createOutcome({
      input,
      stage: 'file-movement',
      primaryCategory: 'ready-for-files',
      categories: ['ready-for-files'],
      issues: [createIssue({
        code: 'file-movement-not-started',
        stage: 'file-movement',
        blocksDb: false,
        blocksFiles: false,
      })],
      moveRequired,
      guards: {
        canStartDb: false,
        canStartFiles: true,
        canReturnRouteSuccess: false,
      },
      dbFilePolicy: classifySubmitDbFileOutcome({
        preflight: 'succeeded',
        dbTransaction: 'succeeded',
        fileMovement: 'not-started',
      }),
      skipPlanCreation: options.skipPlanCreation,
    })
  }

  if (fileMovement === 'succeeded') {
    return createOutcome({
      input,
      stage: 'success',
      primaryCategory: 'safe-success',
      categories: ['safe-success'],
      issues: [],
      moveRequired,
      guards: {
        canStartDb: false,
        canStartFiles: false,
        canReturnRouteSuccess: true,
      },
      dbFilePolicy: classifySubmitDbFileOutcome({
        preflight: 'succeeded',
        dbTransaction: 'succeeded',
        fileMovement: 'succeeded',
      }),
      skipPlanCreation: options.skipPlanCreation,
    })
  }

  const compensationMissing = dependencyState(input, 'compensation-policy') !== 'provided'
  const policyFileMovement = fileMovement === 'partially-failed'
    ? 'partially-failed'
    : 'failed'
  const dbFilePolicy = classifySubmitDbFileOutcome({
    preflight: 'succeeded',
    dbTransaction: 'succeeded',
    fileMovement: policyFileMovement,
    compensation: input.compensation,
  })

  return createOutcome({
    input,
    stage: compensationMissing ? 'compensation-policy' : 'file-movement',
    primaryCategory: compensationMissing
      ? 'blocked-by-missing-dependency'
      : 'compensation-required',
    categories: compensationMissing
      ? ['blocked-by-missing-dependency', 'compensation-required', 'unsafe-to-return-success']
      : ['compensation-required', 'unsafe-to-return-success'],
    issues: [
      createIssue({
        code: 'file-movement-failed',
        stage: 'file-movement',
        blocksDb: false,
        blocksFiles: false,
      }),
      ...(compensationMissing
        ? [createIssue({
          code: 'compensation-policy-missing',
          stage: 'compensation-policy',
          blocksDb: false,
          blocksFiles: false,
          dependency: 'compensation-policy',
        })]
        : []),
    ],
    moveRequired,
    guards: {
      canStartDb: false,
      canStartFiles: false,
      canReturnRouteSuccess: false,
    },
    dbFilePolicy,
    skipPlanCreation: options.skipPlanCreation,
  })
}

function getFirstBlockingIssue(
  input: SubmitRuntimeOrchestratorInput,
  moveRequired: boolean,
): SubmitRuntimeOrchestratorIssue | null {
  if (!input.payload) {
    return createIssue({
      code: 'payload-validation-missing',
      stage: 'parse-and-validate',
      blocksDb: true,
      blocksFiles: true,
      dependency: 'payload-validation',
    })
  }

  if (!input.payload.ok) {
    return createIssue({
      code: 'payload-validation-failed',
      stage: 'parse-and-validate',
      blocksDb: true,
      blocksFiles: true,
    })
  }

  if (!input.actor || (!input.actor.ok && input.actor.reason === 'unauthenticated')) {
    return createIssue({
      code: 'actor-missing',
      stage: 'auth-and-role',
      blocksDb: true,
      blocksFiles: true,
      dependency: input.actor ? undefined : 'actor-resolution',
    })
  }

  if (!input.actor.ok && (input.actor.adminOnly || input.actor.reason === 'admin-only')) {
    return createIssue({
      code: 'actor-admin-only',
      stage: 'auth-and-role',
      blocksDb: true,
      blocksFiles: true,
    })
  }

  if (!input.actor.ok || input.actor.submitCompatible !== true) {
    return createIssue({
      code: 'actor-not-submit-compatible',
      stage: 'auth-and-role',
      blocksDb: true,
      blocksFiles: true,
    })
  }

  if (!input.masterAndPermission) {
    return createIssue({
      code: 'master-or-permission-missing',
      stage: 'master-and-permission',
      blocksDb: true,
      blocksFiles: true,
      dependency: 'master-and-permission',
    })
  }

  if (!input.masterAndPermission.ok) {
    return createIssue({
      code: 'master-or-permission-failed',
      stage: 'master-and-permission',
      blocksDb: true,
      blocksFiles: true,
    })
  }

  if (!input.movePlan) {
    return createIssue({
      code: 'move-plan-missing',
      stage: 'move-plan',
      blocksDb: true,
      blocksFiles: true,
      dependency: 'move-plan-builder',
    })
  }

  if (input.movePlan.hasBlockingIssues) {
    return createIssue({
      code: 'move-plan-blocking-issue',
      stage: 'move-plan',
      blocksDb: true,
      blocksFiles: true,
      sourceIssueCodes: input.movePlan.issues.map(issue => issue.code),
    })
  }

  if (moveRequired && !input.preflight) {
    return createIssue({
      code: 'preflight-missing',
      stage: 'preflight',
      blocksDb: true,
      blocksFiles: true,
      dependency: 'preflight',
    })
  }

  if (input.preflight && !input.preflight.ok) {
    return createIssue({
      code: 'preflight-failed',
      stage: 'preflight',
      blocksDb: true,
      blocksFiles: true,
      sourceIssueCodes: input.preflight.issues.map(issue => issue.code),
    })
  }

  if (dependencyState(input, 'write-transaction') !== 'provided') {
    return createIssue({
      code: 'write-transaction-missing',
      stage: 'db-transaction',
      blocksDb: true,
      blocksFiles: true,
      dependency: 'write-transaction',
    })
  }

  return null
}

function hasMoveRequired(
  movePlan: SubmitMovePlan | null | undefined,
): boolean {
  return Boolean(movePlan?.moves.length)
}

function dependencyState(
  input: SubmitRuntimeOrchestratorInput,
  dependency: SubmitRuntimeDependencyName,
): SubmitRuntimeDependencyState {
  return input.dependencies?.[dependency] ?? 'missing'
}

function createBlockedCategories(
  issue: SubmitRuntimeOrchestratorIssue,
): SubmitRuntimeOrchestratorOutcomeCategory[] {
  const categories: SubmitRuntimeOrchestratorOutcomeCategory[] = []

  if (issue.code === 'actor-missing') {
    categories.push('blocked-before-auth')
  }

  if (issue.blocksDb) {
    categories.push('blocked-before-db')
  }

  if (issue.blocksFiles) {
    categories.push('blocked-before-files')
  }

  if (issue.dependency) {
    categories.unshift('blocked-by-missing-dependency')
  }

  return uniqueCategories(categories)
}

function createIssue(input: {
  code: SubmitRuntimeOrchestratorIssueCode
  stage: SubmitRuntimeOrchestratorStage
  blocksDb: boolean
  blocksFiles: boolean
  dependency?: SubmitRuntimeDependencyName
  sourceIssueCodes?: string[]
}): SubmitRuntimeOrchestratorIssue {
  return {
    code: input.code,
    stage: input.stage,
    blocksDb: input.blocksDb,
    blocksFiles: input.blocksFiles,
    blocksRouteSuccess: true,
    dependency: input.dependency,
    sourceIssueCodes: input.sourceIssueCodes ? [...input.sourceIssueCodes] : undefined,
  }
}

function createOutcome(input: {
  input: SubmitRuntimeOrchestratorInput
  stage: SubmitRuntimeOrchestratorStage
  primaryCategory: SubmitRuntimeOrchestratorOutcomeCategory
  categories: readonly SubmitRuntimeOrchestratorOutcomeCategory[]
  issues: readonly SubmitRuntimeOrchestratorIssue[]
  moveRequired: boolean
  guards: SubmitRuntimeOrchestratorOutcome['guards']
  dbFilePolicy: SubmitDbFilePolicyDecision | null
  skipPlanCreation?: boolean
}): SubmitRuntimeOrchestratorOutcome {
  const partialOutcome = {
    stage: input.stage,
    primaryCategory: input.primaryCategory,
    categories: uniqueCategories(input.categories),
    issues: input.issues.map(issue => ({
      ...issue,
      sourceIssueCodes: issue.sourceIssueCodes ? [...issue.sourceIssueCodes] : undefined,
    })),
    guards: input.guards,
    moveRequired: input.moveRequired,
    dbFilePolicy: input.dbFilePolicy,
    routeBoundaryOnly: true,
    noExternalStorageFallback: true,
    runtimeDbWritesExecuted: false,
    runtimeFileMovementExecuted: false,
  } satisfies Omit<SubmitRuntimeOrchestratorOutcome, 'plan'>

  return {
    ...partialOutcome,
    plan: input.skipPlanCreation
      ? createEmptyPlan(input.moveRequired)
      : createSubmitRuntimeOrchestrationPlan(input.input),
  }
}

function createEmptyPlan(moveRequired: boolean): SubmitRuntimeOrchestrationPlan {
  return {
    stages: [],
    moveRequired,
    defaultSubmitPlanningTarget: 'temp-id',
    routeWired: false,
    liveCallsExecuted: false,
    fileMovementExecuted: false,
  }
}

function getStageStatus(
  stage: SubmitRuntimeOrchestratorStage,
  dependency: SubmitRuntimeDependencyName | undefined,
  outcome: SubmitRuntimeOrchestratorOutcome,
): SubmitRuntimeOrchestratorStageStatus {
  if (stage === 'success') {
    return outcome.primaryCategory === 'safe-success' ? 'completed' : 'pending'
  }

  if (stage === 'file-movement' && !outcome.moveRequired) {
    return 'not-required'
  }

  if (stage === 'compensation-policy' && !outcome.categories.includes('compensation-required')) {
    return 'not-required'
  }

  if (stage === outcome.stage && outcome.primaryCategory !== 'safe-success') {
    if (
      outcome.primaryCategory === 'ready-for-db'
      || outcome.primaryCategory === 'ready-for-files'
    ) {
      return 'ready'
    }

    if (outcome.issues.length > 0 || outcome.primaryCategory === 'blocked-by-missing-dependency') {
      return 'blocked'
    }

    return 'ready'
  }

  const outcomeIndex = STAGE_ORDER.findIndex(item => item.stage === outcome.stage)
  const stageIndex = STAGE_ORDER.findIndex(item => item.stage === stage)

  if (outcome.primaryCategory === 'safe-success' || stageIndex < outcomeIndex) {
    return 'completed'
  }

  if (dependency && outcome.issues.some(issue => issue.dependency === dependency)) {
    return 'blocked'
  }

  return 'pending'
}

function uniqueCategories(
  categories: readonly SubmitRuntimeOrchestratorOutcomeCategory[],
): SubmitRuntimeOrchestratorOutcomeCategory[] {
  return [...new Set(categories)]
}
