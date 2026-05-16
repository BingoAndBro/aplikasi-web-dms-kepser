// Server-only module. Do not import from client components.

export type SubmitDbFileExecutionStage =
  | 'preflight'
  | 'db-transaction'
  | 'file-movement'
  | 'compensation'
  | 'completed'

export type SubmitDbFilePolicyEventType =
  | 'preflight-failed'
  | 'db-transaction-failed'
  | 'db-transaction-succeeded'
  | 'file-move-failed'
  | 'file-move-succeeded'
  | 'compensation-required'
  | 'compensation-completed'
  | 'compensation-failed'

export type SubmitDbFilePolicyCategory =
  | 'abort-before-db'
  | 'abort-before-files'
  | 'proceed-to-files'
  | 'require-compensation'
  | 'safe-success'
  | 'unsafe-to-return-success'

export type SubmitDbFilePolicyGuardState =
  | 'allowed'
  | 'blocked'
  | 'already-failed'
  | 'already-succeeded'
  | 'partial-failure'

export type SubmitDbFilePreflightResult = 'failed' | 'succeeded'
export type SubmitDbFileTransactionResult = 'not-started' | 'failed' | 'succeeded'
export type SubmitDbFileMoveResult =
  | 'not-started'
  | 'failed'
  | 'partially-failed'
  | 'succeeded'
export type SubmitDbFileCompensationResult =
  | 'not-required'
  | 'required'
  | 'completed'
  | 'failed'

export type SubmitDbFilePolicyInput = {
  preflight: SubmitDbFilePreflightResult
  dbTransaction: SubmitDbFileTransactionResult
  fileMovement: SubmitDbFileMoveResult
  compensation?: SubmitDbFileCompensationResult
}

export type SubmitDbFilePolicyDecision = {
  stage: SubmitDbFileExecutionStage
  primaryCategory: SubmitDbFilePolicyCategory
  categories: readonly SubmitDbFilePolicyCategory[]
  events: readonly SubmitDbFilePolicyEventType[]
  guards: {
    dbWrite: SubmitDbFilePolicyGuardState
    fileMove: SubmitDbFilePolicyGuardState
    routeSuccess: 'allowed' | 'blocked'
  }
  requiresCompensation: boolean
  compensation: SubmitDbFileCompensationResult
  recommendedAction:
    | 'stop-before-db-and-files'
    | 'stop-before-files'
    | 'run-db-transaction-before-files'
    | 'run-file-movement-before-success'
    | 'return-success'
    | 'classify-controlled-failure-and-recover'
    | 'remain-unsafe-after-compensation-failure'
  routePlanningOnly: true
  runtimeCompensationImplemented: false
  auditLogPolicy: 'append-only-do-not-mutate'
  fileReferencePolicy: 'logical-decision-only'
}

export const SUBMIT_DB_FILE_COMPENSATION_POLICY = Object.freeze({
  scope: 'submit-route-decision-model',
  defaultSubmitPlanningTarget: 'temp-id',
  ordering: [
    'request-auth-master-role-checks',
    'build-submit-move-plan',
    'submit-file-preflight',
    'db-transaction',
    'file-movement',
    'classify-controlled-failure',
  ],
  invariants: [
    'preflight-failure-stops-db',
    'preflight-failure-stops-files',
    'db-failure-stops-files',
    'post-db-file-failure-is-not-success',
    'partial-file-failure-requires-compensation-classification',
    'audit-log-is-append-only',
    'no-external-storage-fallback',
    'logical-decision-output-only',
  ],
  routeWired: false,
  routeDiskPreflightWired: false,
  filesystemMovementImplemented: false,
  databaseWritesImplemented: false,
  runtimeCompensationImplemented: false,
} as const)

export function decideSubmitDbFilePolicy(
  input: SubmitDbFilePolicyInput,
): SubmitDbFilePolicyDecision {
  return classifySubmitDbFileOutcome(input)
}

export function classifySubmitDbFileOutcome(
  input: SubmitDbFilePolicyInput,
): SubmitDbFilePolicyDecision {
  const compensation = input.compensation ?? 'not-required'

  if (input.preflight === 'failed') {
    return createDecision({
      stage: 'preflight',
      primaryCategory: 'abort-before-db',
      categories: ['abort-before-db', 'abort-before-files'],
      events: ['preflight-failed'],
      dbWrite: 'blocked',
      fileMove: 'blocked',
      compensation,
      recommendedAction: 'stop-before-db-and-files',
    })
  }

  if (input.dbTransaction === 'not-started') {
    return createDecision({
      stage: 'db-transaction',
      primaryCategory: 'abort-before-files',
      categories: ['abort-before-files'],
      events: [],
      dbWrite: 'allowed',
      fileMove: 'blocked',
      compensation,
      recommendedAction: 'run-db-transaction-before-files',
    })
  }

  if (input.dbTransaction === 'failed') {
    return createDecision({
      stage: 'db-transaction',
      primaryCategory: 'abort-before-files',
      categories: ['abort-before-files'],
      events: ['db-transaction-failed'],
      dbWrite: 'already-failed',
      fileMove: 'blocked',
      compensation,
      recommendedAction: 'stop-before-files',
    })
  }

  if (input.fileMovement === 'not-started') {
    return createDecision({
      stage: 'file-movement',
      primaryCategory: 'proceed-to-files',
      categories: ['proceed-to-files'],
      events: ['db-transaction-succeeded'],
      dbWrite: 'already-succeeded',
      fileMove: 'allowed',
      compensation,
      recommendedAction: 'run-file-movement-before-success',
    })
  }

  if (input.fileMovement === 'succeeded') {
    return createDecision({
      stage: 'completed',
      primaryCategory: 'safe-success',
      categories: ['safe-success'],
      events: ['db-transaction-succeeded', 'file-move-succeeded'],
      dbWrite: 'already-succeeded',
      fileMove: 'already-succeeded',
      routeSuccess: 'allowed',
      compensation: 'not-required',
      recommendedAction: 'return-success',
    })
  }

  const failureEvents: SubmitDbFilePolicyEventType[] = [
    'db-transaction-succeeded',
    'file-move-failed',
    'compensation-required',
  ]

  if (compensation === 'completed') {
    failureEvents.push('compensation-completed')
  } else if (compensation === 'failed') {
    failureEvents.push('compensation-failed')
  }

  return createDecision({
    stage: compensation === 'failed' || compensation === 'completed' ? 'compensation' : 'file-movement',
    primaryCategory: 'require-compensation',
    categories: ['require-compensation', 'unsafe-to-return-success'],
    events: failureEvents,
    dbWrite: 'already-succeeded',
    fileMove: input.fileMovement === 'partially-failed' ? 'partial-failure' : 'already-failed',
    compensation: compensation === 'not-required' ? 'required' : compensation,
    recommendedAction: compensation === 'failed'
      ? 'remain-unsafe-after-compensation-failure'
      : 'classify-controlled-failure-and-recover',
  })
}

export function createSubmitDbFileFailurePlan(
  input: SubmitDbFilePolicyInput,
): SubmitDbFilePolicyDecision {
  return classifySubmitDbFileOutcome(input)
}

function createDecision(input: {
  stage: SubmitDbFileExecutionStage
  primaryCategory: SubmitDbFilePolicyCategory
  categories: readonly SubmitDbFilePolicyCategory[]
  events: readonly SubmitDbFilePolicyEventType[]
  dbWrite: SubmitDbFilePolicyGuardState
  fileMove: SubmitDbFilePolicyGuardState
  routeSuccess?: 'allowed' | 'blocked'
  compensation: SubmitDbFileCompensationResult
  recommendedAction: SubmitDbFilePolicyDecision['recommendedAction']
}): SubmitDbFilePolicyDecision {
  const routeSuccess = input.routeSuccess ?? 'blocked'

  return {
    stage: input.stage,
    primaryCategory: input.primaryCategory,
    categories: [...input.categories],
    events: [...input.events],
    guards: {
      dbWrite: input.dbWrite,
      fileMove: input.fileMove,
      routeSuccess,
    },
    requiresCompensation: input.categories.includes('require-compensation'),
    compensation: input.compensation,
    recommendedAction: input.recommendedAction,
    routePlanningOnly: true,
    runtimeCompensationImplemented: false,
    auditLogPolicy: 'append-only-do-not-mutate',
    fileReferencePolicy: 'logical-decision-only',
  }
}
