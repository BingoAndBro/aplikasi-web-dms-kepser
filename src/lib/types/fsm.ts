// src/lib/types/fsm.ts
// Finite State Machine types for document status transitions
// This file re-exports canonical FSM constants/types for compatibility.

import type {
  CurrentStep,
  FSMAction,
  RevisionTarget,
  StatusDokumen,
} from '../constants/document-status'

export {
  CURRENT_STEPS,
  DOC_STATUS,
  DOC_STATUS_VALUES,
  FSM_ACTIONS,
  REVISION_TARGETS,
} from '../constants/document-status'
export type {
  CurrentStep,
  FSMAction,
  RevisionTarget,
  StatusDokumen,
} from '../constants/document-status'

/** Return type dari transition() */
export interface TransitionResult {
  success: boolean
  newStatus: StatusDokumen
  newCurrentStep: CurrentStep
  newRevisionTarget: RevisionTarget
  /** Step ke berapa saat aksi dilakukan (untuk log_aktivitas) */
  stepUrutan: number | null
  error?: string
}

