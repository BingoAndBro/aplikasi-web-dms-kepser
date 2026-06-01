import { Badge } from "#/components/ui/badge"
import { type RoleName } from "#/lib/constants/roles"
import { cn } from "#/lib/utils"

export const ROLE_BADGE_LABELS = {
  PEGAWAI: "Pegawai",
  PPK: "PPK",
  BENDAHARA: "PPSPM",
  KEPALA_SUB_BAGIAN_UMUM: "Kepala Sub Bagian Umum",
  PENANGGUNG_JAWAB_KINERJA: "Penanggung Jawab Kinerja",
  ADMIN: "Admin Sistem",
} as const satisfies Record<RoleName, string>

type RoleBadgeTone =
  | "neutral"
  | "blue"
  | "orange"
  | "green"
  | "amber"
  | "slate"

const roleToneByName: Record<RoleName, RoleBadgeTone> = {
  PEGAWAI: "green",
  PPK: "blue",
  BENDAHARA: "orange",
  KEPALA_SUB_BAGIAN_UMUM: "amber",
  PENANGGUNG_JAWAB_KINERJA: "slate",
  ADMIN: "neutral",
}

const roleToneClassName: Record<RoleBadgeTone, string> = {
  neutral:
    "border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-50",
  blue: "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-50",
  orange:
    "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-50",
  green:
    "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50",
  amber:
    "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50",
  slate:
    "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-50",
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
  const tone = knownRole ? roleToneByName[knownRole] : "neutral"

  return (
    <Badge
      variant="outline"
      className={cn(roleToneClassName[tone], className)}
      title={label}
    >
      {label}
    </Badge>
  )
}
