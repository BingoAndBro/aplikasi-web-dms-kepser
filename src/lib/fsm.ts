// src/lib/fsm.ts
// Single source of truth for document status transitions.
// Invariant #8: all document status transitions must go through this file.

import type {
  FSMAction,
  StatusDokumen,
  TransitionResult,
} from './types/fsm'
import type { RoleName } from './types/auth'
import {
  CURRENT_STEPS,
  DOC_STATUS,
  FSM_ACTIONS,
  REVISION_TARGETS,
} from './constants/document-status'
import { ROLES } from './constants/roles'

const TRANSITIONS: Record<string, Omit<TransitionResult, 'success' | 'error'>> = {
  [`${DOC_STATUS.DRAFT}:${FSM_ACTIONS.SUBMIT}`]: {
    newStatus: DOC_STATUS.IN_PPK_VALIDATION,
    newCurrentStep: CURRENT_STEPS.PPK,
    newRevisionTarget: null,
    stepUrutan: 1,
  },
  [`${DOC_STATUS.IN_PPK_VALIDATION}:${FSM_ACTIONS.APPROVE}`]: {
    newStatus: DOC_STATUS.IN_BENDAHARA_APPROVAL,
    newCurrentStep: CURRENT_STEPS.BENDAHARA,
    newRevisionTarget: null,
    stepUrutan: 2,
  },
  [`${DOC_STATUS.IN_PPK_VALIDATION}:${FSM_ACTIONS.REJECT}`]: {
    newStatus: DOC_STATUS.NEED_REVISION,
    newCurrentStep: CURRENT_STEPS.PPK,
    newRevisionTarget: REVISION_TARGETS.USER,
    stepUrutan: 1,
  },
  [`${DOC_STATUS.IN_BENDAHARA_APPROVAL}:${FSM_ACTIONS.APPROVE}`]: {
    newStatus: DOC_STATUS.COMPLETED,
    newCurrentStep: null,
    newRevisionTarget: null,
    stepUrutan: 2,
  },
  [`${DOC_STATUS.IN_BENDAHARA_APPROVAL}:${FSM_ACTIONS.REJECT}`]: {
    newStatus: DOC_STATUS.NEED_REVISION,
    newCurrentStep: CURRENT_STEPS.BENDAHARA,
    newRevisionTarget: REVISION_TARGETS.PPK,
    stepUrutan: 1,
  },
  [`${DOC_STATUS.NEED_REVISION}:${FSM_ACTIONS.RESUBMIT}`]: {
    newStatus: DOC_STATUS.IN_PPK_VALIDATION,
    newCurrentStep: CURRENT_STEPS.PPK,
    newRevisionTarget: null,
    stepUrutan: 1,
  },
  [`${DOC_STATUS.NEED_REVISION}:${FSM_ACTIONS.RESUBMIT_PPK}`]: {
    newStatus: DOC_STATUS.IN_BENDAHARA_APPROVAL,
    newCurrentStep: CURRENT_STEPS.BENDAHARA,
    newRevisionTarget: null,
    stepUrutan: 2,
  },
  [`${DOC_STATUS.NEED_REVISION}:${FSM_ACTIONS.KEMBALIKAN}`]: {
    newStatus: DOC_STATUS.NEED_REVISION,
    newCurrentStep: CURRENT_STEPS.PPK,
    newRevisionTarget: REVISION_TARGETS.USER,
    stepUrutan: 1,
  },
  [`${DOC_STATUS.COMPLETED}:${FSM_ACTIONS.ARCHIVE}`]: {
    newStatus: DOC_STATUS.ARCHIVED,
    newCurrentStep: null,
    newRevisionTarget: null,
    stepUrutan: null,
  },
  [`${DOC_STATUS.COMPLETED}:${FSM_ACTIONS.SKIP}`]: {
    newStatus: DOC_STATUS.COMPLETED,
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
  const actorValid = isActorValidForAction(currentStatus, action, actorRole)
  if (!actorValid) {
    return makeError(
      currentStatus,
      `Actor '${actorRole}' tidak bisa melakukan aksi '${action}' pada status '${currentStatus}'`,
    )
  }

  if (action === FSM_ACTIONS.REJECT) {
    if (!revisionTarget || (revisionTarget !== REVISION_TARGETS.USER && revisionTarget !== REVISION_TARGETS.PPK)) {
      return makeError(
        currentStatus,
        "REJECT requires revisionTarget: 'USER' or 'PPK'",
      )
    }
  }

  if (action === FSM_ACTIONS.RESUBMIT && revisionTarget !== REVISION_TARGETS.USER) {
    return makeError(
      currentStatus,
      "RESUBMIT only valid when revisionTarget is 'USER'",
    )
  }
  if (action === FSM_ACTIONS.RESUBMIT_PPK && revisionTarget !== REVISION_TARGETS.PPK) {
    return makeError(
      currentStatus,
      "RESUBMIT_PPK only valid when revisionTarget is 'PPK'",
    )
  }

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
    case FSM_ACTIONS.SUBMIT:
      return role === ROLES.PEGAWAI
    case FSM_ACTIONS.APPROVE:
      return (
        (status === DOC_STATUS.IN_PPK_VALIDATION && role === ROLES.PPK) ||
        (status === DOC_STATUS.IN_BENDAHARA_APPROVAL && role === ROLES.BENDAHARA)
      )
    case FSM_ACTIONS.REJECT:
      return (
        (status === DOC_STATUS.IN_PPK_VALIDATION && role === ROLES.PPK) ||
        (status === DOC_STATUS.IN_BENDAHARA_APPROVAL && role === ROLES.BENDAHARA)
      )
    case FSM_ACTIONS.RESUBMIT:
      return role === ROLES.PEGAWAI
    case FSM_ACTIONS.RESUBMIT_PPK:
      return role === ROLES.PPK
    case FSM_ACTIONS.KEMBALIKAN:
      return role === ROLES.PPK && status === DOC_STATUS.NEED_REVISION
    case FSM_ACTIONS.ARCHIVE:
    case FSM_ACTIONS.SKIP:
      return role === ROLES.ARSIPARIS
    default:
      return false
  }
}

