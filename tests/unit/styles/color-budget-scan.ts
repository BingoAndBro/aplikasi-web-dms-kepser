import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx'])
const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g
const ORANGE_CLASS_RE = /\borange-\d{2,3}\b/g

export interface ColorBudgetEntry {
  hex: number
  orange: number
}

export type ColorBudget = Record<string, ColorBudgetEntry>

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectFiles(full, out)
    } else if (SCAN_EXTENSIONS.has(extname(entry.name))) {
      out.push(full)
    }
  }
  return out
}

/**
 * Counts raw hardcoded hex colors and `orange-*` Tailwind palette classes
 * per file under `rootDir`. Scope matches the Tema Global consolidation plan
 * (docs/planning/tema-global/rencana.md) — this is a budget for the brand
 * color specifically, not a general hardcoded-color linter.
 */
export function scanColorBudget(rootDir = 'src'): ColorBudget {
  const budget: ColorBudget = {}
  for (const file of collectFiles(rootDir)) {
    const content = readFileSync(file, 'utf8')
    const hex = content.match(HEX_COLOR_RE)?.length ?? 0
    const orange = content.match(ORANGE_CLASS_RE)?.length ?? 0
    if (hex > 0 || orange > 0) {
      const key = relative('.', file).split('\\').join('/')
      budget[key] = { hex, orange }
    }
  }
  return budget
}
