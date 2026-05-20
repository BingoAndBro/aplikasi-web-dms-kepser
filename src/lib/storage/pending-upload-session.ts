import type { LampiranUrl } from '#/lib/dokumen/types'

export function addPendingUploadUrl(
  currentUrls: ReadonlySet<string>,
  url: string | null | undefined,
): Set<string> {
  const nextUrls = new Set(currentUrls)
  const normalizedUrl = normalizePendingUrl(url)

  if (normalizedUrl) nextUrls.add(normalizedUrl)

  return nextUrls
}

export function removePendingUploadUrls(
  currentUrls: ReadonlySet<string>,
  urlsToRemove: Iterable<string>,
): Set<string> {
  const nextUrls = new Set(currentUrls)

  for (const url of urlsToRemove) {
    nextUrls.delete(url)
  }

  return nextUrls
}

export function collectReferencedPendingUploadUrls(
  sessionPendingUrls: ReadonlySet<string>,
  lampiranUrls: Pick<LampiranUrl, 'url'>[],
): Set<string> {
  const referencedUrls = new Set<string>()

  for (const lampiran of lampiranUrls) {
    if (sessionPendingUrls.has(lampiran.url)) {
      referencedUrls.add(lampiran.url)
    }
  }

  return referencedUrls
}

export function collectUnreferencedPendingUploadUrls(
  sessionPendingUrls: ReadonlySet<string>,
  lampiranUrls: Pick<LampiranUrl, 'url'>[],
): string[] {
  const referencedUrls = collectReferencedPendingUploadUrls(sessionPendingUrls, lampiranUrls)

  return [...sessionPendingUrls].filter(url => !referencedUrls.has(url))
}

export function replaceLampiranByKelengkapanId(
  lampiranUrls: LampiranUrl[],
  nextLampiran: LampiranUrl,
): LampiranUrl[] {
  const index = lampiranUrls.findIndex(lampiran => lampiran.kelengkapan_id === nextLampiran.kelengkapan_id)

  if (index < 0) return [...lampiranUrls, nextLampiran]

  const nextLampirans = [...lampiranUrls]
  nextLampirans[index] = nextLampiran
  return nextLampirans
}

export function resetLampiranByKelengkapanId({
  lampiranUrls,
  kelengkapanId,
  originalLampiran,
}: {
  lampiranUrls: LampiranUrl[]
  kelengkapanId: string
  originalLampiran: LampiranUrl | undefined
}): LampiranUrl[] {
  if (originalLampiran) {
    return replaceLampiranByKelengkapanId(lampiranUrls, originalLampiran)
  }

  return lampiranUrls.filter(lampiran => lampiran.kelengkapan_id !== kelengkapanId)
}

function normalizePendingUrl(url: string | null | undefined): string | null {
  const normalizedUrl = url?.trim()
  return normalizedUrl ? normalizedUrl : null
}
