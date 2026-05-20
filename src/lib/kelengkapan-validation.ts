import type { LampiranUrl } from './dokumen/types'

export const DUPLICATE_ADDITIONAL_KELENGKAPAN_ERROR =
  'Nama kelengkapan tambahan tidak boleh duplikat'

export function normalizeKelengkapanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function findDuplicateAdditionalKelengkapanName(
  lampiranUrls: Pick<LampiranUrl, 'kelengkapan_id' | 'nama'>[],
): string | null {
  const seen = new Set<string>()

  for (const lampiran of lampiranUrls) {
    if (!lampiran.kelengkapan_id.startsWith('user-custom-')) continue

    const normalizedName = normalizeKelengkapanName(lampiran.nama)
    if (!normalizedName) continue

    if (seen.has(normalizedName)) return lampiran.nama.trim()
    seen.add(normalizedName)
  }

  return null
}
