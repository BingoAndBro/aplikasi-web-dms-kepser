import { Badge } from "#/components/ui/badge"
import { type RoleName } from "#/lib/constants/roles"
import { toneClasses, type Tone } from "#/lib/tone"
import { cn } from "#/lib/utils"

export const ROLE_BADGE_LABELS = {
  PEGAWAI: "Pegawai",
  PPK: "PPK",
  PPSPM: "PPSPM",
  KEPALA_SUB_BAGIAN_UMUM: "Kepala Sub Bagian Umum",
  PENANGGUNG_JAWAB_KINERJA: "Penanggung Jawab Kinerja",
  ADMIN: "Admin Sistem",
} as const satisfies Record<RoleName, string>

// Organizational identity, not a status — deliberately kept as its own
// role -> tone assignment table rather than folded into semantic Tone
// (see plan Fase 2, "Sengaja tidak digeneralisasi"). PJ Kinerja and Admin
// share "neutral" — that's the plan's own taxonomy, not an accidental
// collision. PPSPM uses the fixed "brand-fixed" tone (Fase 8), not "brand" —
// role-identity colors are pinned so Pegawai/PPK/PPSPM read as
// green/blue/orange regardless of which theme (se/sp/st) is active.
export const ROLE_TONE: Record<RoleName, Tone> = {
  PEGAWAI: "success",
  PPK: "info",
  PPSPM: "brand-fixed",
  KEPALA_SUB_BAGIAN_UMUM: "warning",
  PENANGGUNG_JAWAB_KINERJA: "neutral",
  ADMIN: "neutral",
}

export function getRoleBadgeLabel(role: RoleName | string | null | undefined) {
  return role && role in ROLE_BADGE_LABELS
    ? ROLE_BADGE_LABELS[role as RoleName]
    : "Role tidak dikenal"
}

export type RoleBadgeProps = {
  role: RoleName | string | null | undefined
  className?: string
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  const knownRole = role && role in ROLE_BADGE_LABELS ? (role as RoleName) : null
  const label = getRoleBadgeLabel(role)
  const tone = knownRole ? ROLE_TONE[knownRole] : "neutral"

  return (
    <Badge
      variant="outline"
      className={cn(toneClasses(tone, 'badge'), className)}
      title={label}
    >
      {label}
    </Badge>
  )
}
