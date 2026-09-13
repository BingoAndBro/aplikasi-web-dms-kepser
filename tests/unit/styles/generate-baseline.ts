import { writeFileSync } from 'node:fs'

import { scanColorBudget } from './color-budget-scan'

/**
 * Regenerates tests/unit/styles/color-budget.baseline.json.
 *
 * Run this ONLY when a change intentionally lowers a file's hardcoded-color
 * count (e.g. after a refactor phase lands) — never to silence a failing
 * color-budget.test.ts by re-baselining an increase. The guardrail is a
 * ratchet: counts may only go down.
 *
 *   pnpm tsx tests/unit/styles/generate-baseline.ts
 */
const budget = scanColorBudget()
const fileCount = Object.keys(budget).length
const totals = Object.values(budget).reduce(
  (acc, entry) => ({ hex: acc.hex + entry.hex, orange: acc.orange + entry.orange }),
  { hex: 0, orange: 0 }
)

writeFileSync('tests/unit/styles/color-budget.baseline.json', `${JSON.stringify(budget, null, 2)}\n`)

console.log(`Wrote baseline for ${fileCount} files (${totals.hex} hex, ${totals.orange} orange-* classes)`)
