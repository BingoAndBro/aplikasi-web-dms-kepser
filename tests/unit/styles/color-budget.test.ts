import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { type ColorBudget, scanColorBudget } from './color-budget-scan'

describe('color budget guardrail (Fase 0 — Tema Global consolidation)', () => {
  it('does not let hardcoded hex colors or orange-* classes grow in any src/ file', () => {
    const baseline: ColorBudget = JSON.parse(readFileSync('tests/unit/styles/color-budget.baseline.json', 'utf8'))
    const current = scanColorBudget()

    const regressions: string[] = []
    for (const [file, counts] of Object.entries(current)) {
      const base = baseline[file] ?? { hex: 0, orange: 0 }
      if (counts.hex > base.hex) {
        regressions.push(`${file}: hex ${base.hex} -> ${counts.hex} (+${counts.hex - base.hex})`)
      }
      if (counts.orange > base.orange) {
        regressions.push(`${file}: orange-* ${base.orange} -> ${counts.orange} (+${counts.orange - base.orange})`)
      }
    }

    expect(
      regressions,
      regressions.length > 0
        ? `Hardcoded-color budget regressed in ${regressions.length} file(s). New code should use the theme tokens from src/styles.css instead of raw hex / orange-* classes:\n${regressions.join('\n')}`
        : undefined
    ).toEqual([])
  })

  it('baseline only ever shrinks — this test breaks the moment someone reduces a count without regenerating the file', () => {
    const baseline: ColorBudget = JSON.parse(readFileSync('tests/unit/styles/color-budget.baseline.json', 'utf8'))
    const current = scanColorBudget()

    const stale: string[] = []
    for (const [file, base] of Object.entries(baseline)) {
      const counts = current[file]
      if (!counts && (base.hex > 0 || base.orange > 0)) {
        stale.push(`${file}: file removed/emptied but baseline still expects hex=${base.hex} orange=${base.orange}`)
        continue
      }
      if (counts && (counts.hex < base.hex || counts.orange < base.orange)) {
        stale.push(`${file}: baseline hex=${base.hex}/orange=${base.orange} but current is hex=${counts.hex}/orange=${counts.orange} — regenerate the baseline`)
      }
    }

    expect(
      stale,
      stale.length > 0
        ? `Baseline is stale — run: pnpm tsx tests/unit/styles/generate-baseline.ts\n${stale.join('\n')}`
        : undefined
    ).toEqual([])
  })
})
