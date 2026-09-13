import { describe, it, expect } from 'vitest'
import { transition } from '../src/lib/fsm'

// Helper untuk error shape consistency
function assertError(result: ReturnType<typeof transition>, msg?: string) {
  expect(result.success, msg).toBe(false)
  expect(result.error, msg).toBeDefined()
  expect(typeof result.error).toBe('string')
}

function assertSuccess(result: ReturnType<typeof transition>, msg?: string) {
  expect(result.success, msg ?? result.error).toBe(true)
  expect(result.error, msg).toBeUndefined()
}

describe('FSM transition()', () => {

  // ═══════════════════════════════════════════════════════
  // HAPPY PATH — All 9 Valid Transitions
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
      assertError(transition('DRAFT', 'SUBMIT', 'PPK'))
    })
    it('SUBMIT by PPSPM → error', () => {
      assertError(transition('DRAFT', 'SUBMIT', 'PPSPM'))
    })
    it('SUBMIT by KEPALA_SUB_BAGIAN_UMUM → error', () => {
      assertError(transition('DRAFT', 'SUBMIT', 'KEPALA_SUB_BAGIAN_UMUM'))
    })
    it('SUBMIT by ADMIN → error', () => {
      assertError(transition('DRAFT', 'SUBMIT', 'ADMIN'))
    })

    // APPROVE
    it('APPROVE by PPK on IN_PPK_VALIDATION → success', () => {
      const result = transition('IN_PPK_VALIDATION', 'APPROVE', 'PPK')
      assertSuccess(result)
    })
    it('APPROVE by PPSPM on IN_PPK_VALIDATION → error', () => {
      assertError(transition('IN_PPK_VALIDATION', 'APPROVE', 'PPSPM'))
    })
    it('APPROVE by PPK on IN_PPSPM_APPROVAL → error', () => {
      assertError(transition('IN_PPSPM_APPROVAL', 'APPROVE', 'PPK'))
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
      assertError(transition('IN_PPK_VALIDATION', 'REJECT', 'PPSPM', 'USER'))
    })

    // RESUBMIT
    it('RESUBMIT by PEGAWAI → success', () => {
      const result = transition('NEED_REVISION', 'RESUBMIT', 'PEGAWAI', 'USER')
      assertSuccess(result)
    })
    it('RESUBMIT by PPK → error', () => {
      assertError(transition('NEED_REVISION', 'RESUBMIT', 'PPK', 'USER'))
    })

    // RESUBMIT_PPK
    it('RESUBMIT_PPK by PPK → success', () => {
      const result = transition('NEED_REVISION', 'RESUBMIT_PPK', 'PPK', 'PPK')
      assertSuccess(result)
    })
    it('RESUBMIT_PPK by PEGAWAI → error', () => {
      assertError(transition('NEED_REVISION', 'RESUBMIT_PPK', 'PEGAWAI', 'PPK'))
    })

  })

  // ═══════════════════════════════════════════════════════
  // REJECT RevisionTarget Validation
  // ═══════════════════════════════════════════════════════

  describe('REJECT RevisionTarget Validation', () => {
    it('REJECT without revisionTarget → error', () => {
      assertError(transition('IN_PPK_VALIDATION', 'REJECT', 'PPK'))
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
      assertError(transition('NEED_REVISION', 'RESUBMIT', 'PEGAWAI', 'PPK'))
    })
    it('RESUBMIT_PPK with PPK target → success', () => {
      const result = transition('NEED_REVISION', 'RESUBMIT_PPK', 'PPK', 'PPK')
      assertSuccess(result)
    })
    it('RESUBMIT_PPK with USER target → error', () => {
      assertError(transition('NEED_REVISION', 'RESUBMIT_PPK', 'PPK', 'USER'))
    })
  })

  // ═══════════════════════════════════════════════════════
  // Invalid Status + Action Combinations
  // ═══════════════════════════════════════════════════════

  describe('Invalid Status + Action Combinations', () => {
    it('DRAFT + APPROVE → error', () => {
      assertError(transition('DRAFT', 'APPROVE', 'PPK'))
    })
    it('DRAFT + REJECT → error', () => {
      assertError(transition('DRAFT', 'REJECT', 'PPK', 'USER'))
    })
    it('COMPLETED + SUBMIT → error', () => {
      assertError(transition('COMPLETED', 'SUBMIT', 'PEGAWAI'))
    })
    it('NEED_REVISION + APPROVE → error', () => {
      assertError(transition('NEED_REVISION', 'APPROVE', 'PPK'))
    })
    it('NEED_REVISION + REJECT → error (use RESUBMIT)', () => {
      assertError(transition('NEED_REVISION', 'REJECT', 'PPK', 'USER'))
    })
    it('IN_PPK_VALIDATION + RESUBMIT → error', () => {
      assertError(transition('IN_PPK_VALIDATION', 'RESUBMIT', 'PEGAWAI', 'USER'))
    })
    it('IN_PPSPM_APPROVAL + SUBMIT → error', () => {
      assertError(transition('IN_PPSPM_APPROVAL', 'SUBMIT', 'PEGAWAI'))
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
    })

    it('Error message is descriptive', () => {
      const result = transition('DRAFT', 'APPROVE', 'PPK')
      expect(result.error).toContain('tidak bisa')
    })
  })

})
