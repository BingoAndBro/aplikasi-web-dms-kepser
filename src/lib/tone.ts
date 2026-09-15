/**
 * Shared semantic-tone class helper (Tema Global Fase 2 — consolidates ~9
 * duplicated tone systems: StatusBadge, RoleBadge, ConfirmDialog,
 * DashboardMetricCard, AppToast, ErrorState. AdminNotice/ArchiveNotice/
 * KinerjaNotice/KinerjaSummaryCard/AdminSummaryCard turned out to be dead
 * code — 0 real call sites — and were deleted outright instead of migrated).
 *
 * `neutral | info | success | warning | danger` mirror the theme-invariant
 * status tokens in src/styles.css (Group 3 — same across se/sp/st, D1/D2).
 * `brand` is the one tone that changes color per theme.
 *
 * Callers that need per-entity identity (RoleBadge's 6 roles, not a status)
 * keep their own `Record<Role, Tone>` assignment table and call toneClasses()
 * for the actual class strings — identity mapping and visual output are
 * deliberately kept separate (see plan Fase 2, "Sengaja tidak digeneralisasi").
 *
 * IMPORTANT: class strings below are written out in full, never built via
 * string interpolation — Tailwind's source scanner matches literal text, it
 * does not execute this file, so an interpolated `` `border-${t}-border` ``
 * would silently generate no CSS at all.
 */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand' | 'brand-fixed'

export type ToneSurface = 'badge' | 'notice' | 'solid' | 'icon'

/**
 * badge: pill-shaped status badge — border + soft bg + text (+hover, same bg)
 * notice: banner/callout — border + soft bg + text (no hover)
 * icon: icon chip — soft bg + text only, no border (e.g. ConfirmDialog's icon badge)
 * solid: filled button/step — solid bg + on-solid text (+hover)
 */
const TONE_CLASSES: Record<Tone, Record<ToneSurface, string>> = {
  neutral: {
    badge: 'border-neutral-status-border bg-neutral-status-surface text-neutral-status-text hover:bg-neutral-status-surface',
    notice: 'border-neutral-status-border bg-neutral-status-surface text-neutral-status-text',
    icon: 'bg-neutral-status-surface text-neutral-status-text',
    solid: 'bg-neutral-status-solid text-neutral-status-on-solid hover:bg-neutral-status-solid/90',
  },
  info: {
    badge: 'border-info-border bg-info-surface text-info-text hover:bg-info-surface',
    notice: 'border-info-border bg-info-surface text-info-text',
    icon: 'bg-info-surface text-info-text',
    solid: 'bg-info-solid text-info-on-solid hover:bg-info-solid/90',
  },
  success: {
    badge: 'border-success-border bg-success-surface text-success-text hover:bg-success-surface',
    notice: 'border-success-border bg-success-surface text-success-text',
    icon: 'bg-success-surface text-success-text',
    solid: 'bg-success-solid text-success-on-solid hover:bg-success-solid/90',
  },
  warning: {
    badge: 'border-warning-border bg-warning-surface text-warning-text hover:bg-warning-surface',
    notice: 'border-warning-border bg-warning-surface text-warning-text',
    icon: 'bg-warning-surface text-warning-text',
    solid: 'bg-warning-solid text-warning-on-solid hover:bg-warning-solid/90',
  },
  danger: {
    badge: 'border-danger-border bg-danger-surface text-danger-text hover:bg-danger-surface',
    notice: 'border-danger-border bg-danger-surface text-danger-text',
    icon: 'bg-danger-surface text-danger-text',
    solid: 'bg-danger-solid text-danger-on-solid hover:bg-danger-solid/90',
  },
  brand: {
    badge: 'border-brand-border bg-brand-surface text-brand-text hover:bg-brand-surface',
    notice: 'border-brand-border bg-brand-surface text-brand-text',
    icon: 'bg-brand-surface text-brand-text',
    solid: 'bg-brand-solid text-brand-on-solid hover:bg-brand-solid-hover',
  },
  // Fixed (theme-invariant) — see src/styles.css Group 7. A frozen snapshot
  // of SE's `brand` values, deliberately NOT theme-following. Used for
  // PPSPM's role-identity badge and the handful of statuses that need to
  // stay visually distinct across all 3 themes ("Menunggu PPSPM", "Usul
  // Pembersihan", "Manual") — Fase 8.
  'brand-fixed': {
    badge: 'border-brand-fixed-border bg-brand-fixed-surface text-brand-fixed-text hover:bg-brand-fixed-surface',
    notice: 'border-brand-fixed-border bg-brand-fixed-surface text-brand-fixed-text',
    icon: 'bg-brand-fixed-surface text-brand-fixed-text',
    solid: 'bg-brand-fixed-solid text-brand-fixed-on-solid hover:bg-brand-fixed-solid/90',
  },
}

export function toneClasses(tone: Tone, surface: ToneSurface): string {
  return TONE_CLASSES[tone][surface]
}
