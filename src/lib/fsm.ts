// src/lib/fsm.ts
// Single source of truth for document status transitions
// Invariant #8: Semua transisi status HARUS lewat fungsi ini
// Jangan pernah update status dokumen langsung di luar file ini

import type {
  StatusDokumen,
  FSMAction,
  TransitionResult,
} from './types/fsm'
import type { RoleName } from './types/auth'

// Lookup table — valid transitions
const TRANSITIONS: Record<string, Omit<TransitionResult, 'success' | 'error'>> = {
  // Material documents
  'DRAFT:SUBMIT': {
    newStatus: 'IN_PPK_VALIDATION',
    newCurrentStep: 'PPK',
    newRevisionTarget: null,
    stepUrutan: 1,
  },
  'IN_PPK_VALIDATION:APPROVE': {
    newStatus: 'IN_BENDAHARA_APPROVAL',
    newCurrentStep: 'BENDAHARA',
    newRevisionTarget: null,
    stepUrutan: 2,
  },
  'IN_PPK_VALIDATION:REJECT': {
    newStatus: 'NEED_REVISION',
    newCurrentStep: 'PPK',
    newRevisionTarget: 'USER',
    stepUrutan: 1,
  },
  'IN_BENDAHARA_APPROVAL:APPROVE': {
    newStatus: 'COMPLETED',
    newCurrentStep: null,
    newRevisionTarget: null,
    stepUrutan: 2,
  },
  'IN_BENDAHARA_APPROVAL:REJECT': {
    newStatus: 'NEED_REVISION',
    newCurrentStep: 'BENDAHARA',
    newRevisionTarget: 'PPK',
    stepUrutan: 1,
  },
  'NEED_REVISION:RESUBMIT': {
    newStatus: 'IN_PPK_VALIDATION',
    newCurrentStep: 'PPK',
    newRevisionTarget: null,
    stepUrutan: 1,
  },
  'NEED_REVISION:RESUBMIT_PPK': {
    newStatus: 'IN_BENDAHARA_APPROVAL',
    newCurrentStep: 'BENDAHARA',
    newRevisionTarget: null,
    stepUrutan: 2,
  },
  // PPK returns document to USER from revision page (NEED_REVISION, target=PPK -> USER)
  'NEED_REVISION:KEMBALIKAN': {
    newStatus: 'NEED_REVISION',
    newCurrentStep: 'PPK',
    newRevisionTarget: 'USER',
    stepUrutan: 1,
  },
  'COMPLETED:ARCHIVE': {
    newStatus: 'ARCHIVED',
    newCurrentStep: null,
    newRevisionTarget: null,
    stepUrutan: null,
  },
  'COMPLETED:SKIP': {
    newStatus: 'COMPLETED',
    newCurrentStep: null,
    newRevisionTarget: null,
    stepUrutan: null,
  },
}

function makeError(currentStatus: StatusDokumen, error: string): TransitionResult {
  return {
    success: false,
    newStatus: currentStatus,
    newCurrentStep: null,
    newRevisionTarget: null,
    stepUrutan: null,
    error,
  }
}

export function transition(
  currentStatus: StatusDokumen,
  action: FSMAction,
  actorRole: RoleName,
  revisionTarget?: string | null,
): TransitionResult {
  // 1. Validate actor
  const actorValid = isActorValidForAction(currentStatus, action, actorRole)
  if (!actorValid) {
    return makeError(
      currentStatus,
      `Actor '${actorRole}' tidak bisa melakukan aksi '${action}' pada status '${currentStatus}'`,
    )
  }

  // 2. REJECT requires revisionTarget
  if (action === 'REJECT') {
    if (!revisionTarget || (revisionTarget !== 'USER' && revisionTarget !== 'PPK')) {
      return makeError(
        currentStatus,
        "REJECT requires revisionTarget: 'USER' or 'PPK'",
      )
    }
  }

  // 3. RESUBMIT requires correct target
  if (action === 'RESUBMIT' && revisionTarget !== 'USER') {
    return makeError(
      currentStatus,
      "RESUBMIT only valid when revisionTarget is 'USER'",
    )
  }
  if (action === 'RESUBMIT_PPK' && revisionTarget !== 'PPK') {
    return makeError(
      currentStatus,
      "RESUBMIT_PPK only valid when revisionTarget is 'PPK'",
    )
  }

  // 4. Lookup transition
  const key = `${currentStatus}:${action}`
  const result = TRANSITIONS[key]
  if (!result) {
    return makeError(
      currentStatus,
      `Transisi '${action}' dari '${currentStatus}' tidak valid`,
    )
  }

  return { success: true, ...result }
}

function isActorValidForAction(
  status: StatusDokumen,
  action: FSMAction,
  role: RoleName,
): boolean {
  switch (action) {
    case 'SUBMIT':
      return role === 'PEGAWAI'
    case 'APPROVE':
      return (
        (status === 'IN_PPK_VALIDATION' && role === 'PPK') ||
        (status === 'IN_BENDAHARA_APPROVAL' && role === 'BENDAHARA')
      )
    case 'REJECT':
      return (
        (status === 'IN_PPK_VALIDATION' && role === 'PPK') ||
        (status === 'IN_BENDAHARA_APPROVAL' && role === 'BENDAHARA')
      )
    case 'RESUBMIT':
      return role === 'PEGAWAI'
    case 'RESUBMIT_PPK':
      return role === 'PPK'
    case 'KEMBALIKAN':
      return role === 'PPK' && status === 'NEED_REVISION'
    case 'ARCHIVE':
    case 'SKIP':
      return role === 'ARSIPARIS'
    default:
      return false
  }
}
