import { Badge } from "#/components/ui/badge"
import { cn } from "#/lib/utils"

export type DocumentStatus =
  | "DRAFT"
  | "IN_PPK_VALIDATION"
  | "IN_BENDAHARA_APPROVAL"
  | "NEED_REVISION"
  | "COMPLETED"
  | "TERSIMPAN"
  | "ARCHIVED"

export type FolderStatus = "OPEN" | "CLOSED"

// RP-01 de-arsip: `INAKTIF` dibuang dari alur lifecycle berkas. Nilai enum masih
// ada di DB CHECK (`ARCHIVE_STATUS_VALUES`), tapi tak lagi punya badge — baris
// lama otomatis jatuh ke fallback "Status tidak dikenal".
export type ArchiveLifecycleStatus =
  | "AKTIF"
  | "USUL_MUSNAH"
  | "DIMUSNAHKAN"

export type SourceType = "WORKFLOW" | "MANUAL"

export type StatusBadgeKind = "document" | "folder" | "archive" | "source"

export type StatusBadgeTone =
  | "neutral"
  | "info"
  | "warning"
  | "success"
  | "destructive"
  | "orange"

export type StatusConfig = {
  label: string
  tone: StatusBadgeTone
}

const toneClassName: Record<StatusBadgeTone, string> = {
  neutral:
    "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50",
  info: "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-50",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50",
  destructive:
    "border-red-200 bg-red-50 text-red-800 hover:bg-red-50",
  orange:
    "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-50",
}

export const DOCUMENT_STATUS_BADGE_CONFIG = {
  DRAFT: { label: "Draft", tone: "neutral" },
  IN_PPK_VALIDATION: { label: "Menunggu PPK", tone: "info" },
  IN_BENDAHARA_APPROVAL: { label: "Menunggu PPSPM", tone: "orange" },
  NEED_REVISION: { label: "Perlu Revisi", tone: "warning" },
  COMPLETED: { label: "Selesai", tone: "success" },
  TERSIMPAN: { label: "Tersimpan", tone: "success" },
  ARCHIVED: { label: "Diarsipkan", tone: "neutral" },
} as const satisfies Record<DocumentStatus, StatusConfig>

export const FOLDER_STATUS_BADGE_CONFIG = {
  OPEN: { label: "Berkas Terbuka", tone: "info" },
  CLOSED: { label: "Berkas Ditutup", tone: "neutral" },
} as const satisfies Record<FolderStatus, StatusConfig>

export const ARCHIVE_STATUS_BADGE_CONFIG = {
  AKTIF: { label: "Tersimpan", tone: "success" },
  USUL_MUSNAH: { label: "Usul Pembersihan", tone: "orange" },
  DIMUSNAHKAN: { label: "File Dibersihkan", tone: "destructive" },
} as const satisfies Record<ArchiveLifecycleStatus, StatusConfig>

export const SOURCE_TYPE_BADGE_CONFIG = {
  WORKFLOW: { label: "Persetujuan", tone: "info" },
  MANUAL: { label: "Manual", tone: "orange" },
} as const satisfies Record<SourceType, StatusConfig>

const statusConfigByKind = {
  document: DOCUMENT_STATUS_BADGE_CONFIG,
  folder: FOLDER_STATUS_BADGE_CONFIG,
  archive: ARCHIVE_STATUS_BADGE_CONFIG,
  source: SOURCE_TYPE_BADGE_CONFIG,
} as const

export function getStatusBadgeConfig(
  status: string | null | undefined,
  kind: StatusBadgeKind = "document",
): StatusConfig {
  const config = status
    ? (statusConfigByKind[kind] as Record<string, StatusConfig>)[status]
    : undefined

  return config ?? { label: "Status tidak dikenal", tone: "neutral" }
}

export type StatusBadgeProps = {
  status: string | null | undefined
  kind?: StatusBadgeKind
  className?: string
  fallbackLabel?: string
}

export function StatusBadge({
  status,
  kind = "document",
  className,
  fallbackLabel,
}: StatusBadgeProps) {
  const config = getStatusBadgeConfig(status, kind)
  const label =
    config.label === "Status tidak dikenal" && fallbackLabel
      ? fallbackLabel
      : config.label

  return (
    <Badge
      variant="outline"
      className={cn(toneClassName[config.tone], className)}
      title={label}
    >
      {label}
    </Badge>
  )
}
