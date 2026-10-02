import { describe, it, expect } from 'vitest'
import { transition } from '../src/lib/fsm'
import type { FSMAction } from '../src/lib/types/fsm'

// Pesan galat yang diharapkan, satu per cabang galat di transition().
// Pesan dicocokkan persis supaya terbukti cabang mana yang ditempuh.
const actorError = (role: string, action: string, status: string) =>
  `Actor '${role}' tidak bisa melakukan aksi '${action}' pada status '${status}'`
const REJECT_TARGET_ERROR = "REJECT requires revisionTarget: 'USER' or 'PPK'"
const RESUBMIT_TARGET_ERROR = "RESUBMIT only valid when revisionTarget is 'USER'"
const RESUBMIT_PPK_TARGET_ERROR = "RESUBMIT_PPK only valid when revisionTarget is 'PPK'"
const tableError = (action: string, status: string) =>
  `Transisi '${action}' dari '${status}' tidak valid`

// Helper untuk error shape consistency
function assertError(result: ReturnType<typeof transition>, expectedError: string) {
  expect(result.success).toBe(false)
  expect(result.error).toBe(expectedError)
}

function assertSuccess(result: ReturnType<typeof transition>, msg?: string) {
  expect(result.success, msg ?? result.error).toBe(true)
  expect(result.error, msg).toBeUndefined()
}

describe('FSM transition()', () => {

  // ═══════════════════════════════════════════════════════
  // HAPPY PATH — All 8 Valid Transitions
  // ═══════════════════════════════════════════════════════

  describe('Valid Transitions', () => {
    it('DRAFT + SUBMIT → IN_PPK_VALIDATION, step=1', () => {
      const result = transition('DRAFT', 'SUBMIT', 'PEGAWAI')
      assertSuccess(result)
      expect(result.newStatus).toBe('IN_PPK_VALIDATION')
      expect(result.newCurrentStep).toBe('PPK')
      expect(result.newRevisionTarget).toBeNull()
      expect(result.stepUrutan).toBe(1)
    })

    it('IN_PPK_VALIDATION + APPROVE → IN_PPSPM_APPROVAL, step=2', () => {
      const result = transition('IN_PPK_VALIDATION', 'APPROVE', 'PPK')
      assertSuccess(result)
      expect(result.newStatus).toBe('IN_PPSPM_APPROVAL')
      expect(result.newCurrentStep).toBe('PPSPM')
      expect(result.newRevisionTarget).toBeNull()
      expect(result.stepUrutan).toBe(2)
    })

    it('IN_PPK_VALIDATION + REJECT → NEED_REVISION, target=USER, step=1', () => {
      const result = transition('IN_PPK_VALIDATION', 'REJECT', 'PPK', 'USER')
      assertSuccess(result)
      expect(result.newStatus).toBe('NEED_REVISION')
      expect(result.newCurrentStep).toBe('PPK')
      expect(result.newRevisionTarget).toBe('USER')
      expect(result.stepUrutan).toBe(1)
    })

    it('IN_PPSPM_APPROVAL + APPROVE → COMPLETED, step=2', () => {
      const result = transition('IN_PPSPM_APPROVAL', 'APPROVE', 'PPSPM')
      assertSuccess(result)
      expect(result.newStatus).toBe('COMPLETED')
      expect(result.newCurrentStep).toBeNull()
      expect(result.newRevisionTarget).toBeNull()
      expect(result.stepUrutan).toBe(2)
    })

    it('IN_PPSPM_APPROVAL + REJECT → NEED_REVISION, target=PPK, step=1', () => {
      const result = transition('IN_PPSPM_APPROVAL', 'REJECT', 'PPSPM', 'PPK')
      assertSuccess(result)
      expect(result.newStatus).toBe('NEED_REVISION')
      expect(result.newCurrentStep).toBe('PPSPM')
      expect(result.newRevisionTarget).toBe('PPK')
      expect(result.stepUrutan).toBe(1)
    })

    it('NEED_REVISION + RESUBMIT → IN_PPK_VALIDATION, step=1', () => {
      const result = transition('NEED_REVISION', 'RESUBMIT', 'PEGAWAI', 'USER')
      assertSuccess(result)
      expect(result.newStatus).toBe('IN_PPK_VALIDATION')
      expect(result.newCurrentStep).toBe('PPK')
      expect(result.newRevisionTarget).toBeNull()
      expect(result.stepUrutan).toBe(1)
    })

    it('NEED_REVISION + RESUBMIT_PPK → IN_PPSPM_APPROVAL, step=2', () => {
      const result = transition('NEED_REVISION', 'RESUBMIT_PPK', 'PPK', 'PPK')
      assertSuccess(result)
      expect(result.newStatus).toBe('IN_PPSPM_APPROVAL')
      expect(result.newCurrentStep).toBe('PPSPM')
      expect(result.newRevisionTarget).toBeNull()
      expect(result.stepUrutan).toBe(2)
    })

    it('NEED_REVISION + KEMBALIKAN → NEED_REVISION, target=USER, step=1', () => {
      const result = transition('NEED_REVISION', 'KEMBALIKAN', 'PPK', 'USER')
      assertSuccess(result)
      expect(result.newStatus).toBe('NEED_REVISION')
      expect(result.newCurrentStep).toBe('PPK')
      expect(result.newRevisionTarget).toBe('USER')
      expect(result.stepUrutan).toBe(1)
    })

  })

  // ═══════════════════════════════════════════════════════
  // ACTOR VALIDATION
  // ═══════════════════════════════════════════════════════

  describe('Actor Validation', () => {
    // SUBMIT
    it('SUBMIT by PEGAWAI → success', () => {
      const result = transition('DRAFT', 'SUBMIT', 'PEGAWAI')
      assertSuccess(result)
    })
    it('SUBMIT by PPK → error', () => {
      assertError(transition('DRAFT', 'SUBMIT', 'PPK'), actorError('PPK', 'SUBMIT', 'DRAFT'))
    })
    it('SUBMIT by PPSPM → error', () => {
      assertError(transition('DRAFT', 'SUBMIT', 'PPSPM'), actorError('PPSPM', 'SUBMIT', 'DRAFT'))
    })
    it('SUBMIT by KEPALA_SUB_BAGIAN_UMUM → error', () => {
      assertError(
        transition('DRAFT', 'SUBMIT', 'KEPALA_SUB_BAGIAN_UMUM'),
        actorError('KEPALA_SUB_BAGIAN_UMUM', 'SUBMIT', 'DRAFT'),
      )
    })
    it('SUBMIT by ADMIN → error', () => {
      assertError(transition('DRAFT', 'SUBMIT', 'ADMIN'), actorError('ADMIN', 'SUBMIT', 'DRAFT'))
    })

    // APPROVE
    it('APPROVE by PPK on IN_PPK_VALIDATION → success', () => {
      const result = transition('IN_PPK_VALIDATION', 'APPROVE', 'PPK')
      assertSuccess(result)
    })
    it('APPROVE by PPSPM on IN_PPK_VALIDATION → error', () => {
      assertError(
        transition('IN_PPK_VALIDATION', 'APPROVE', 'PPSPM'),
        actorError('PPSPM', 'APPROVE', 'IN_PPK_VALIDATION'),
      )
    })
    it('APPROVE by PPK on IN_PPSPM_APPROVAL → error', () => {
      assertError(
        transition('IN_PPSPM_APPROVAL', 'APPROVE', 'PPK'),
        actorError('PPK', 'APPROVE', 'IN_PPSPM_APPROVAL'),
      )
    })
    it('APPROVE by PPSPM on IN_PPSPM_APPROVAL → success', () => {
      const result = transition('IN_PPSPM_APPROVAL', 'APPROVE', 'PPSPM')
      assertSuccess(result)
    })

    // REJECT
    it('REJECT by PPK on IN_PPK_VALIDATION → success', () => {
      const result = transition('IN_PPK_VALIDATION', 'REJECT', 'PPK', 'USER')
      assertSuccess(result)
    })
    it('REJECT by PPSPM on IN_PPSPM_APPROVAL → success', () => {
      const result = transition('IN_PPSPM_APPROVAL', 'REJECT', 'PPSPM', 'PPK')
      assertSuccess(result)
    })
    it('REJECT by PPSPM on IN_PPK_VALIDATION → error', () => {
      assertError(
        transition('IN_PPK_VALIDATION', 'REJECT', 'PPSPM', 'USER'),
        actorError('PPSPM', 'REJECT', 'IN_PPK_VALIDATION'),
      )
    })

    // RESUBMIT
    it('RESUBMIT by PEGAWAI → success', () => {
      const result = transition('NEED_REVISION', 'RESUBMIT', 'PEGAWAI', 'USER')
      assertSuccess(result)
    })
    it('RESUBMIT by PPK → error', () => {
      assertError(
        transition('NEED_REVISION', 'RESUBMIT', 'PPK', 'USER'),
        actorError('PPK', 'RESUBMIT', 'NEED_REVISION'),
      )
    })

    // RESUBMIT_PPK
    it('RESUBMIT_PPK by PPK → success', () => {
      const result = transition('NEED_REVISION', 'RESUBMIT_PPK', 'PPK', 'PPK')
      assertSuccess(result)
    })
    it('RESUBMIT_PPK by PEGAWAI → error', () => {
      assertError(
        transition('NEED_REVISION', 'RESUBMIT_PPK', 'PEGAWAI', 'PPK'),
        actorError('PEGAWAI', 'RESUBMIT_PPK', 'NEED_REVISION'),
      )
    })

    // KEMBALIKAN
    it('KEMBALIKAN by PPK → success', () => {
      assertSuccess(transition('NEED_REVISION', 'KEMBALIKAN', 'PPK', 'USER'))
    })
    it.each(['PEGAWAI', 'PPSPM', 'KEPALA_SUB_BAGIAN_UMUM', 'ADMIN'] as const)(
      'KEMBALIKAN by %s → error',
      (role) => {
        assertError(
          transition('NEED_REVISION', 'KEMBALIKAN', role, 'USER'),
          actorError(role, 'KEMBALIKAN', 'NEED_REVISION'),
        )
      },
    )

  })

  // ═══════════════════════════════════════════════════════
  // KEMBALIKAN (transisi #8: PPK mengembalikan ke Pegawai)
  // ═══════════════════════════════════════════════════════

  describe('KEMBALIKAN Validation', () => {
    it('KEMBALIKAN from IN_PPK_VALIDATION → error', () => {
      assertError(
        transition('IN_PPK_VALIDATION', 'KEMBALIKAN', 'PPK', 'USER'),
        actorError('PPK', 'KEMBALIKAN', 'IN_PPK_VALIDATION'),
      )
    })
    it('KEMBALIKAN from IN_PPSPM_APPROVAL → error', () => {
      assertError(
        transition('IN_PPSPM_APPROVAL', 'KEMBALIKAN', 'PPK', 'USER'),
        actorError('PPK', 'KEMBALIKAN', 'IN_PPSPM_APPROVAL'),
      )
    })
    it('KEMBALIKAN from COMPLETED → error', () => {
      assertError(
        transition('COMPLETED', 'KEMBALIKAN', 'PPK', 'USER'),
        actorError('PPK', 'KEMBALIKAN', 'COMPLETED'),
      )
    })
    it('KEMBALIKAN result always targets USER', () => {
      // The route reads revision_target=PPK from the row; the FSM result must flip it to USER.
      expect(transition('NEED_REVISION', 'KEMBALIKAN', 'PPK', 'PPK').newRevisionTarget).toBe('USER')
      expect(transition('NEED_REVISION', 'KEMBALIKAN', 'PPK').newRevisionTarget).toBe('USER')
    })
  })

  // ═══════════════════════════════════════════════════════
  // REJECT RevisionTarget Validation
  // ═══════════════════════════════════════════════════════

  describe('REJECT RevisionTarget Validation', () => {
    it('REJECT without revisionTarget → error', () => {
      assertError(transition('IN_PPK_VALIDATION', 'REJECT', 'PPK'), REJECT_TARGET_ERROR)
    })
    it('REJECT with USER target from PPK step → success', () => {
      const result = transition('IN_PPK_VALIDATION', 'REJECT', 'PPK', 'USER')
      assertSuccess(result)
    })
    it('REJECT with PPK target from Ppspm step → success', () => {
      const result = transition('IN_PPSPM_APPROVAL', 'REJECT', 'PPSPM', 'PPK')
      assertSuccess(result)
    })
  })

  // ═══════════════════════════════════════════════════════
  // RESUBMIT Validation
  // ═══════════════════════════════════════════════════════

  describe('RESUBMIT Validation', () => {
    it('RESUBMIT with USER target → success', () => {
      const result = transition('NEED_REVISION', 'RESUBMIT', 'PEGAWAI', 'USER')
      assertSuccess(result)
    })
    it('RESUBMIT with PPK target → error', () => {
      assertError(transition('NEED_REVISION', 'RESUBMIT', 'PEGAWAI', 'PPK'), RESUBMIT_TARGET_ERROR)
    })
    it('RESUBMIT_PPK with PPK target → success', () => {
      const result = transition('NEED_REVISION', 'RESUBMIT_PPK', 'PPK', 'PPK')
      assertSuccess(result)
    })
    it('RESUBMIT_PPK with USER target → error', () => {
      assertError(
        transition('NEED_REVISION', 'RESUBMIT_PPK', 'PPK', 'USER'),
        RESUBMIT_PPK_TARGET_ERROR,
      )
    })
  })

  // ═══════════════════════════════════════════════════════
  // Invalid Status + Action Combinations
  // ═══════════════════════════════════════════════════════

  describe('Invalid Status + Action Combinations', () => {
    it('DRAFT + APPROVE → error', () => {
      assertError(transition('DRAFT', 'APPROVE', 'PPK'), actorError('PPK', 'APPROVE', 'DRAFT'))
    })
    it('DRAFT + REJECT → error', () => {
      assertError(
        transition('DRAFT', 'REJECT', 'PPK', 'USER'),
        actorError('PPK', 'REJECT', 'DRAFT'),
      )
    })
    it('COMPLETED + SUBMIT → error', () => {
      assertError(transition('COMPLETED', 'SUBMIT', 'PEGAWAI'), tableError('SUBMIT', 'COMPLETED'))
    })
    it('NEED_REVISION + APPROVE → error', () => {
      assertError(
        transition('NEED_REVISION', 'APPROVE', 'PPK'),
        actorError('PPK', 'APPROVE', 'NEED_REVISION'),
      )
    })
    it('NEED_REVISION + REJECT → error (use RESUBMIT)', () => {
      assertError(
        transition('NEED_REVISION', 'REJECT', 'PPK', 'USER'),
        actorError('PPK', 'REJECT', 'NEED_REVISION'),
      )
    })
    it('IN_PPK_VALIDATION + RESUBMIT → error', () => {
      assertError(
        transition('IN_PPK_VALIDATION', 'RESUBMIT', 'PEGAWAI', 'USER'),
        tableError('RESUBMIT', 'IN_PPK_VALIDATION'),
      )
    })
    it('IN_PPSPM_APPROVAL + SUBMIT → error', () => {
      assertError(
        transition('IN_PPSPM_APPROVAL', 'SUBMIT', 'PEGAWAI'),
        tableError('SUBMIT', 'IN_PPSPM_APPROVAL'),
      )
    })
  })

  // ═══════════════════════════════════════════════════════
  // Error Return Shape
  // ═══════════════════════════════════════════════════════

  describe('Error Return Shape', () => {
    it('All failures preserve original status', () => {
      const result = transition('DRAFT', 'APPROVE', 'PPK')
      expect(result.success).toBe(false)
      expect(result.newStatus).toBe('DRAFT')
      expect(result.newCurrentStep).toBeNull()
      expect(result.newRevisionTarget).toBeNull()
      expect(result.stepUrutan).toBeNull()
      expect(result.error).toBe(actorError('PPK', 'APPROVE', 'DRAFT'))
    })

    it('Error message is descriptive', () => {
      const result = transition('DRAFT', 'APPROVE', 'PPK')
      expect(result.error).toContain('tidak bisa')
      expect(result.error).toBe(actorError('PPK', 'APPROVE', 'DRAFT'))
    })
  })

  // ═══════════════════════════════════════════════════════
  // Additional Decision Outcomes (white-box, decision coverage)
  // ═══════════════════════════════════════════════════════

  describe('Additional Decision Outcomes', () => {
    it('IN_PPK_VALIDATION + REJECT (target X) → error', () => {
      // fsm.ts L96: revisionTarget terisi tetapi bukan USER/PPK.
      assertError(transition('IN_PPK_VALIDATION', 'REJECT', 'PPK', 'X'), REJECT_TARGET_ERROR)
    })
    it('IN_PPSPM_APPROVAL + REJECT by PPK → error', () => {
      // fsm.ts L145: status IN_PPSPM_APPROVAL, tetapi peran bukan PPSPM.
      assertError(
        transition('IN_PPSPM_APPROVAL', 'REJECT', 'PPK', 'PPK'),
        actorError('PPK', 'REJECT', 'IN_PPSPM_APPROVAL'),
      )
    })
    it('DRAFT + X (unknown action) → error', () => {
      // fsm.ts L153: cabang default pada isActorValidForAction.
      assertError(
        transition('DRAFT', 'X' as FSMAction, 'PEGAWAI'),
        actorError('PEGAWAI', 'X', 'DRAFT'),
      )
    })
  })

})
