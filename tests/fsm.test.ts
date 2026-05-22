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

    it('IN_PPK_VALIDATION + APPROVE → IN_BENDAHARA_APPROVAL, step=2', () => {
      const result = transition('IN_PPK_VALIDATION', 'APPROVE', 'PPK')
      assertSuccess(result)
      expect(result.newStatus).toBe('IN_BENDAHARA_APPROVAL')
      expect(result.newCurrentStep).toBe('BENDAHARA')
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

    it('IN_BENDAHARA_APPROVAL + APPROVE → COMPLETED, step=2', () => {
      const result = transition('IN_BENDAHARA_APPROVAL', 'APPROVE', 'BENDAHARA')
      assertSuccess(result)
      expect(result.newStatus).toBe('COMPLETED')
      expect(result.newCurrentStep).toBeNull()
      expect(result.newRevisionTarget).toBeNull()
      expect(result.stepUrutan).toBe(2)
    })

    it('IN_BENDAHARA_APPROVAL + REJECT → NEED_REVISION, target=PPK, step=1', () => {
      const result = transition('IN_BENDAHARA_APPROVAL', 'REJECT', 'BENDAHARA', 'PPK')
      assertSuccess(result)
      expect(result.newStatus).toBe('NEED_REVISION')
      expect(result.newCurrentStep).toBe('BENDAHARA')
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

    it('NEED_REVISION + RESUBMIT_PPK → IN_BENDAHARA_APPROVAL, step=2', () => {
      const result = transition('NEED_REVISION', 'RESUBMIT_PPK', 'PPK', 'PPK')
      assertSuccess(result)
      expect(result.newStatus).toBe('IN_BENDAHARA_APPROVAL')
      expect(result.newCurrentStep).toBe('BENDAHARA')
      expect(result.newRevisionTarget).toBeNull()
      expect(result.stepUrutan).toBe(2)
    })

    it('COMPLETED + ARCHIVE → ARCHIVED', () => {
      const result = transition('COMPLETED', 'ARCHIVE', 'KEPALA_SUB_BAGIAN_UMUM')
      assertSuccess(result)
      expect(result.newStatus).toBe('ARCHIVED')
      expect(result.newCurrentStep).toBeNull()
      expect(result.newRevisionTarget).toBeNull()
      expect(result.stepUrutan).toBeNull()
    })

    it('COMPLETED + SKIP → COMPLETED (stays), step=null', () => {
      const result = transition('COMPLETED', 'SKIP', 'KEPALA_SUB_BAGIAN_UMUM')
      assertSuccess(result)
      expect(result.newStatus).toBe('COMPLETED')
      expect(result.newCurrentStep).toBeNull()
      expect(result.newRevisionTarget).toBeNull()
      expect(result.stepUrutan).toBeNull()
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
    it('SUBMIT by BENDAHARA → error', () => {
      assertError(transition('DRAFT', 'SUBMIT', 'BENDAHARA'))
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
    it('APPROVE by BENDAHARA on IN_PPK_VALIDATION → error', () => {
      assertError(transition('IN_PPK_VALIDATION', 'APPROVE', 'BENDAHARA'))
    })
    it('APPROVE by PPK on IN_BENDAHARA_APPROVAL → error', () => {
      assertError(transition('IN_BENDAHARA_APPROVAL', 'APPROVE', 'PPK'))
    })
    it('APPROVE by BENDAHARA on IN_BENDAHARA_APPROVAL → success', () => {
      const result = transition('IN_BENDAHARA_APPROVAL', 'APPROVE', 'BENDAHARA')
      assertSuccess(result)
    })

    // REJECT
    it('REJECT by PPK on IN_PPK_VALIDATION → success', () => {
      const result = transition('IN_PPK_VALIDATION', 'REJECT', 'PPK', 'USER')
      assertSuccess(result)
    })
    it('REJECT by BENDAHARA on IN_BENDAHARA_APPROVAL → success', () => {
      const result = transition('IN_BENDAHARA_APPROVAL', 'REJECT', 'BENDAHARA', 'PPK')
      assertSuccess(result)
    })
    it('REJECT by BENDAHARA on IN_PPK_VALIDATION → error', () => {
      assertError(transition('IN_PPK_VALIDATION', 'REJECT', 'BENDAHARA', 'USER'))
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

    // ARCHIVE
    it('ARCHIVE by KEPALA_SUB_BAGIAN_UMUM → success', () => {
      const result = transition('COMPLETED', 'ARCHIVE', 'KEPALA_SUB_BAGIAN_UMUM')
      assertSuccess(result)
    })
    it('ARCHIVE by PPK → error', () => {
      assertError(transition('COMPLETED', 'ARCHIVE', 'PPK'))
    })

    // SKIP
    it('SKIP by KEPALA_SUB_BAGIAN_UMUM → success', () => {
      const result = transition('COMPLETED', 'SKIP', 'KEPALA_SUB_BAGIAN_UMUM')
      assertSuccess(result)
    })
    it('SKIP by PPK → error', () => {
      assertError(transition('COMPLETED', 'SKIP', 'PPK'))
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
    it('REJECT with PPK target from Bendahara step → success', () => {
      const result = transition('IN_BENDAHARA_APPROVAL', 'REJECT', 'BENDAHARA', 'PPK')
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
    it('ARCHIVED + any action → error', () => {
      assertError(transition('ARCHIVED', 'SUBMIT', 'PEGAWAI'))
      assertError(transition('ARCHIVED', 'APPROVE', 'PPK'))
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
    it('IN_BENDAHARA_APPROVAL + SUBMIT → error', () => {
      assertError(transition('IN_BENDAHARA_APPROVAL', 'SUBMIT', 'PEGAWAI'))
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
