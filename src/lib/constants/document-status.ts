export const DOC_STATUS_VALUES = [
  'DRAFT',
  'IN_PPK_VALIDATION',
  'IN_PPSPM_APPROVAL',
  'NEED_REVISION',
  'COMPLETED',
  'TERSIMPAN',
] as const

export type StatusDokumen = typeof DOC_STATUS_VALUES[number]

export const DOC_STATUS: { [K in StatusDokumen]: K } = {
  DRAFT: 'DRAFT',
  IN_PPK_VALIDATION: 'IN_PPK_VALIDATION',
  IN_PPSPM_APPROVAL: 'IN_PPSPM_APPROVAL',
  NEED_REVISION: 'NEED_REVISION',
  COMPLETED: 'COMPLETED',
  TERSIMPAN: 'TERSIMPAN',
}

export const CURRENT_STEPS = {
  PPK: 'PPK',
  PPSPM: 'PPSPM',
} as const

export type CurrentStep = typeof CURRENT_STEPS[keyof typeof CURRENT_STEPS] | null

export const REVISION_TARGETS = {
  USER: 'USER',
  PPK: 'PPK',
} as const

export type RevisionTarget = typeof REVISION_TARGETS[keyof typeof REVISION_TARGETS] | null

export const FSM_ACTIONS = {
  SUBMIT: 'SUBMIT',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  RESUBMIT: 'RESUBMIT',
  RESUBMIT_PPK: 'RESUBMIT_PPK',
  KEMBALIKAN: 'KEMBALIKAN',
} as const

export type FSMAction = typeof FSM_ACTIONS[keyof typeof FSM_ACTIONS]

