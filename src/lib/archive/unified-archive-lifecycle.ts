import {
  ARCHIVE_SOURCE_TYPE_VALUES,
  ARCHIVE_STATUS_VALUES,
  type ArchiveSourceType,
  type StatusArsip,
} from '#/lib/constants/archive-status'

export const UNIFIED_ARCHIVE_LIFECYCLE_ACTION_VALUES = [
  'mark_inactive',
  'propose_destruction',
  'approve_destruction',
  'cancel_proposal',
] as const

export type UnifiedArchiveLifecycleAction =
  typeof UNIFIED_ARCHIVE_LIFECYCLE_ACTION_VALUES[number]

export type UnifiedArchiveLifecycleRejectReason =
  | 'ARCHIVE_NOT_FOUND'
  | 'SOURCE_NOT_SUPPORTED'
  | 'INVALID_ACTION'
  | 'INVALID_CURRENT_STATUS'
  | 'TRANSITION_NOT_ALLOWED'
  | 'TERMINAL_STATUS'
  | 'MANUAL_SOURCE_MISSING'
  | 'MANUAL_STATUS_DRIFT'
  | 'AUDIT_POLICY_UNRESOLVED'
  | 'DESTRUCTION_REQUIRES_EXTRA_CONFIRMATION'

export type UnifiedArchiveLifecycleAuditIntent = {
  action: UnifiedArchiveLifecycleAction
  fromStatus: StatusArsip
  toStatus: StatusArsip
  sourceType: ArchiveSourceType
  requiresReason: boolean
  requiresExplicitConfirmation: boolean
  auditStorage: 'FUTURE_ROUTE_DECISION_REQUIRED'
}

export type UnifiedArchiveLifecycleCanonicalUpdatePlan = {
  target: 'arsip.arsip'
  set: {
    statusArsip: StatusArsip
  }
  precondition: {
    statusArsip: StatusArsip
  }
}

export type UnifiedArchiveLifecycleSourceSyncUpdatePlan =
  | {
    target: 'none'
    reason: 'WORKFLOW_CANONICAL_STATUS_ONLY'
  }
  | {
    target: 'arsip.manual_arsip'
    set: {
      statusArsip: StatusArsip
    }
    precondition: {
      statusArsip: StatusArsip
      matchesCanonicalStatus: true
    }
  }

export type UnifiedArchiveLifecycleTransactionPlan = {
  description: string
  steps: string[]
}

export type UnifiedArchiveLifecycleAllowedPlan = {
  status: 'allowed'
  action: UnifiedArchiveLifecycleAction
  fromStatus: StatusArsip
  toStatus: StatusArsip
  sourceType: ArchiveSourceType
  canonicalUpdate: UnifiedArchiveLifecycleCanonicalUpdatePlan
  sourceSyncUpdate: UnifiedArchiveLifecycleSourceSyncUpdatePlan
  auditIntent: UnifiedArchiveLifecycleAuditIntent
  fileDeletion: false
  transactionPlan: UnifiedArchiveLifecycleTransactionPlan
}

export type UnifiedArchiveLifecycleRejectedPlan = {
  status: 'rejected'
  reason: UnifiedArchiveLifecycleRejectReason
  message: string
}

export type UnifiedArchiveLifecyclePlan =
  | UnifiedArchiveLifecycleAllowedPlan
  | UnifiedArchiveLifecycleRejectedPlan

export type PlanUnifiedArchiveLifecycleTransitionInput = {
  action: unknown
  currentStatus: unknown
  sourceType: unknown
  manualSourceStatus?: unknown
}

const ALLOWED_TRANSITIONS: Record<
  UnifiedArchiveLifecycleAction,
  Partial<Record<StatusArsip, StatusArsip>>
> = {
  mark_inactive: {
    AKTIF: 'INAKTIF',
  },
  propose_destruction: {
    INAKTIF: 'USUL_MUSNAH',
  },
  approve_destruction: {
    USUL_MUSNAH: 'DIMUSNAHKAN',
  },
  cancel_proposal: {
    USUL_MUSNAH: 'INAKTIF',
  },
}

const SAFE_REJECT_MESSAGES: Record<UnifiedArchiveLifecycleRejectReason, string> = {
  ARCHIVE_NOT_FOUND: 'Arsip tidak ditemukan.',
  SOURCE_NOT_SUPPORTED: 'Sumber arsip tidak didukung untuk perubahan lifecycle terpadu.',
  INVALID_ACTION: 'Aksi lifecycle arsip tidak valid.',
  INVALID_CURRENT_STATUS: 'Status arsip saat ini tidak valid.',
  TRANSITION_NOT_ALLOWED: 'Perubahan status arsip tidak diizinkan.',
  TERMINAL_STATUS: 'Arsip yang sudah dimusnahkan tidak dapat diubah statusnya.',
  MANUAL_SOURCE_MISSING: 'Sumber Arsip Manual terkait tidak ditemukan.',
  MANUAL_STATUS_DRIFT: 'Status Arsip Manual tidak selaras dengan status arsip canonical.',
  AUDIT_POLICY_UNRESOLVED: 'Kebijakan audit lifecycle arsip belum diputuskan.',
  DESTRUCTION_REQUIRES_EXTRA_CONFIRMATION: 'Pemusnahan arsip membutuhkan konfirmasi tambahan.',
}

export function planUnifiedArchiveLifecycleTransition(
  input: PlanUnifiedArchiveLifecycleTransitionInput,
): UnifiedArchiveLifecyclePlan {
  const action = normalizeLifecycleAction(input.action)
  if (!action) return reject('INVALID_ACTION')

  const sourceType = normalizeSourceType(input.sourceType)
  if (!sourceType) return reject('SOURCE_NOT_SUPPORTED')

  if (input.currentStatus === null || input.currentStatus === undefined || input.currentStatus === '') {
    return reject('ARCHIVE_NOT_FOUND')
  }

  const currentStatus = normalizeStatus(input.currentStatus)
  if (!currentStatus) return reject('INVALID_CURRENT_STATUS')

  if (currentStatus === 'DIMUSNAHKAN') return reject('TERMINAL_STATUS')

  if (sourceType === 'MANUAL') {
    const sourceValidation = validateManualSourceStatus(
      currentStatus,
      input.manualSourceStatus,
    )
    if (sourceValidation) return sourceValidation
  }

  const toStatus = ALLOWED_TRANSITIONS[action][currentStatus]
  if (!toStatus) return reject('TRANSITION_NOT_ALLOWED')

  return {
    status: 'allowed',
    action,
    fromStatus: currentStatus,
    toStatus,
    sourceType,
    canonicalUpdate: {
      target: 'arsip.arsip',
      set: { statusArsip: toStatus },
      precondition: { statusArsip: currentStatus },
    },
    sourceSyncUpdate: buildSourceSyncUpdate(sourceType, currentStatus, toStatus),
    auditIntent: buildAuditIntent(action, currentStatus, toStatus, sourceType),
    fileDeletion: false,
    transactionPlan: buildTransactionPlan(action, sourceType),
  }
}

function validateManualSourceStatus(
  currentStatus: StatusArsip,
  manualSourceStatus: unknown,
): UnifiedArchiveLifecycleRejectedPlan | null {
  if (manualSourceStatus === null || manualSourceStatus === undefined || manualSourceStatus === '') {
    return reject('MANUAL_SOURCE_MISSING')
  }

  const normalizedSourceStatus = normalizeStatus(manualSourceStatus)
  if (!normalizedSourceStatus || normalizedSourceStatus !== currentStatus) {
    return reject('MANUAL_STATUS_DRIFT')
  }

  return null
}

function buildSourceSyncUpdate(
  sourceType: ArchiveSourceType,
  fromStatus: StatusArsip,
  toStatus: StatusArsip,
): UnifiedArchiveLifecycleSourceSyncUpdatePlan {
  if (sourceType === 'WORKFLOW') {
    return {
      target: 'none',
      reason: 'WORKFLOW_CANONICAL_STATUS_ONLY',
    }
  }

  return {
    target: 'arsip.manual_arsip',
    set: { statusArsip: toStatus },
    precondition: {
      statusArsip: fromStatus,
      matchesCanonicalStatus: true,
    },
  }
}

function buildAuditIntent(
  action: UnifiedArchiveLifecycleAction,
  fromStatus: StatusArsip,
  toStatus: StatusArsip,
  sourceType: ArchiveSourceType,
): UnifiedArchiveLifecycleAuditIntent {
  return {
    action,
    fromStatus,
    toStatus,
    sourceType,
    requiresReason: action !== 'mark_inactive',
    requiresExplicitConfirmation: action === 'approve_destruction',
    auditStorage: 'FUTURE_ROUTE_DECISION_REQUIRED',
  }
}

function buildTransactionPlan(
  action: UnifiedArchiveLifecycleAction,
  sourceType: ArchiveSourceType,
): UnifiedArchiveLifecycleTransactionPlan {
  const steps = [
    'Reload canonical archive row inside the future route transaction.',
    'Verify source type and current canonical status still match this plan.',
  ]

  if (sourceType === 'MANUAL') {
    steps.push('Reload linked Manual Archive source row and verify status still matches canonical status.')
  } else {
    steps.push('Do not update workflow document business metadata.')
  }

  steps.push('Update canonical archive status to the planned target status.')

  if (sourceType === 'MANUAL') {
    steps.push('Sync linked Manual Archive source status to the same planned target status.')
  }

  if (action === 'propose_destruction') {
    steps.push('Apply the future approved proposal bridge policy without deleting files.')
  }

  if (action === 'approve_destruction') {
    steps.push('Require explicit confirmation before applying status change to DIMUSNAHKAN.')
    steps.push('Block future file access by status; do not delete physical files.')
  }

  if (action === 'cancel_proposal') {
    steps.push('Record cancellation semantics as USUL_MUSNAH to INAKTIF, not restoration to AKTIF.')
  }

  steps.push('Write the future approved audit record after audit storage policy is decided.')

  return {
    description: 'Planning contract only; this helper performs no database, route, auth, file, or audit writes.',
    steps,
  }
}

function normalizeLifecycleAction(value: unknown): UnifiedArchiveLifecycleAction | null {
  return UNIFIED_ARCHIVE_LIFECYCLE_ACTION_VALUES.includes(value as UnifiedArchiveLifecycleAction)
    ? value as UnifiedArchiveLifecycleAction
    : null
}

function normalizeStatus(value: unknown): StatusArsip | null {
  return ARCHIVE_STATUS_VALUES.includes(value as StatusArsip)
    ? value as StatusArsip
    : null
}

function normalizeSourceType(value: unknown): ArchiveSourceType | null {
  return ARCHIVE_SOURCE_TYPE_VALUES.includes(value as ArchiveSourceType)
    ? value as ArchiveSourceType
    : null
}

function reject(reason: UnifiedArchiveLifecycleRejectReason): UnifiedArchiveLifecycleRejectedPlan {
  return {
    status: 'rejected',
    reason,
    message: SAFE_REJECT_MESSAGES[reason],
  }
}
