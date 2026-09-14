/**
 * Shared color/tone classes for the table + filter + search shells (Tema
 * Global Fase 3 — docs/planning/tema-global, plan Fase 3). Five near-duplicate
 * implementations (AdminPagePrimitives, ArchivePagePrimitives,
 * PpkPpspmPagePrimitives, KinerjaPagePrimitives, PegawaiPagePrimitives) each
 * hardcoded their own mix of arbitrary hex and Tailwind palette classes for
 * the same visual language — some strings were byte-identical, some drifted
 * (different ring width/opacity, different "info" shade, etc).
 *
 * Scope: color/tone only. Layout (height, padding, border-radius, font
 * weight, responsive breakpoint) intentionally stays local to each file —
 * those are legitimate per-area differences, not theme debt, and touching
 * them isn't needed to fix the "campur aduk" (mixed hex+palette) complaint
 * this fase targets. Every string here is static (never interpolated) for
 * the same reason as src/lib/tone.ts: Tailwind's scanner needs literal text.
 */

export const DATA_SEARCH_INPUT_TONE_CLASS =
  'border-brand-border bg-surface text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-brand-border-strong focus:ring-2 focus:ring-brand-ring'

export const DATA_SEARCH_ICON_TONE_CLASS = 'text-brand-icon/70'

export const DATA_TABLE_SHELL_TONE_CLASS =
  'border-border-default bg-surface shadow-[0_3px_14px_var(--shadow-card)]'

export const DATA_TABLE_HEADER_ROW_TONE_CLASS = 'border-border-default bg-sunken hover:bg-sunken'

export const DATA_TABLE_BODY_ROW_TONE_CLASS =
  'border-border-default bg-surface transition-colors hover:bg-brand-surface/70'

export const DATA_FILTER_SELECT_TRIGGER_TONE_CLASS =
  'border-border-default bg-surface text-zinc-950 hover:border-brand-border hover:bg-brand-surface focus-visible:border-brand-border-strong focus-visible:ring-brand-ring'

export const DATA_FILTER_SELECT_TRIGGER_DISABLED_TONE_CLASS = 'cursor-not-allowed border-border-default text-text-disabled'

export const DATA_FILTER_SELECT_MENU_TONE_CLASS = 'border-brand-border bg-surface'

export const DATA_FILTER_SELECT_OPTION_TONE_CLASS = 'text-zinc-950 hover:bg-brand-surface'

export const DATA_FILTER_SELECT_OPTION_SELECTED_TONE_CLASS = 'bg-brand-surface text-brand-text'
