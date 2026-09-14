import { Badge } from "#/components/ui/badge"
import { toneClasses, type Tone } from "#/lib/tone"
import { cn } from "#/lib/utils"

export type DocumentStatus =
  | "DRAFT"
  | "IN_PPK_VALIDATION"
  | "IN_PPSPM_APPROVAL"
  | "NEED_REVISION"
  | "COMPLETED"
  | "TERSIMPAN"

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

/** @deprecated use `Tone` from #/lib/tone — kept as an alias so existing imports still resolve */
export type StatusBadgeTone = Tone

export type StatusConfig = {
  label: string
  tone: Tone
}

export const DOCUMENT_STATUS_BADGE_CONFIG = {
  DRAFT: { label: "Draft", tone: "neutral" },
  IN_PPK_VALIDATION: { label: "Menunggu PPK", tone: "info" },
  IN_PPSPM_APPROVAL: { label: "Menunggu PPSPM", tone: "brand" },
  NEED_REVISION: { label: "Perlu Revisi", tone: "warning" },
  COMPLETED: { label: "Selesai", tone: "success" },
  TERSIMPAN: { label: "Tersimpan", tone: "success" },
} as const satisfies Record<DocumentStatus, StatusConfig>

export const FOLDER_STATUS_BADGE_CONFIG = {
  OPEN: { label: "Berkas Terbuka", tone: "info" },
  CLOSED: { label: "Berkas Ditutup", tone: "neutral" },
} as const satisfies Record<FolderStatus, StatusConfig>

export const ARCHIVE_STATUS_BADGE_CONFIG = {
  AKTIF: { label: "Tersimpan", tone: "success" },
  USUL_MUSNAH: { label: "Usul Pembersihan", tone: "brand" },
  DIMUSNAHKAN: { label: "File Dibersihkan", tone: "danger" },
} as const satisfies Record<ArchiveLifecycleStatus, StatusConfig>

export const SOURCE_TYPE_BADGE_CONFIG = {
  WORKFLOW: { label: "Persetujuan", tone: "info" },
  MANUAL: { label: "Manual", tone: "brand" },
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
      className={cn(toneClasses(config.tone, 'badge'), className)}
      title={label}
    >
      {label}
    </Badge>
  )
}
