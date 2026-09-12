import { Badge } from '#/components/ui/badge'
import { ARCHIVE_STATUS_BADGE_CONFIG } from '#/components/ui/StatusBadge'

const LABEL = ARCHIVE_STATUS_BADGE_CONFIG.DIMUSNAHKAN.label // "File Dibersihkan"

const ALASAN_MESSAGE: Record<string, string> = {
  BERKAS_DIMUSNAHKAN: 'File dibersihkan bersama pemusnahan berkas',
  PEMBERSIHAN_NON_MATERIAL: 'File dibersihkan oleh ketua tim',
}

/**
 * Badge menampilkan kondisi lampiran fisik -- TERPISAH dari status dokumen
 * (`StatusBadge`). Dipasang berdampingan, tidak menggantikan badge status.
 * Kolom sumbernya (`lampiran_dibersihkan_at`) hanya untuk tampilan; otoritas
 * pemblokiran akses tetap di guard baca (`document-file-access.ts`).
 */
export function LampiranDibersihkanBadge({
  lampiranDibersihkanAt,
  lampiranDibersihkanAlasan,
  className,
}: {
  lampiranDibersihkanAt?: string | Date | null
  lampiranDibersihkanAlasan?: string | null
  className?: string
}) {
  if (!lampiranDibersihkanAt) return null

  return (
    <Badge
      variant="destructive"
      className={className}
      title={lampiranDibersihkanAlasan ? ALASAN_MESSAGE[lampiranDibersihkanAlasan] ?? undefined : undefined}
    >
      {LABEL}
    </Badge>
  )
}
