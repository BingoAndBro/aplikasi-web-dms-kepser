export function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return isoString
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

export function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return isoString
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return isoString
  }
}

type AgeSortable = {
  created_at?: string | null
  tanggal?: string | null
}

function ageTimestamp(item: AgeSortable): number {
  const raw = item.created_at ?? item.tanggal
  if (!raw) return 0
  const time = new Date(raw).getTime()
  return Number.isNaN(time) ? 0 : time
}

/** Sort comparator: oldest `created_at` (fallback `tanggal`) first. Missing dates sort as oldest. */
export function byOldest(a: AgeSortable, b: AgeSortable): number {
  return ageTimestamp(a) - ageTimestamp(b)
}

/** e.g. "Menunggu 12 hari" — how long ago `isoString` was, for prioritizing "Perlu Tindakan" rows. */
export function formatRelativeAge(isoString: string): string | undefined {
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return undefined
  const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'Menunggu hari ini'
  if (diffDays === 1) return 'Menunggu 1 hari'
  return `Menunggu ${diffDays} hari`
}
