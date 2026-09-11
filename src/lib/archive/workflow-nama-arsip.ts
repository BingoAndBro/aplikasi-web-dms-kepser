export type WorkflowNamaArsipSource = {
  judul?: string | null
  namaDokumen?: string | null
  kegiatanNama?: string | null
}

const FALLBACK_WORKFLOW_NAMA_ARSIP = 'Arsip Dokumen'
const MAX_WORKFLOW_NAMA_ARSIP_LENGTH = 255

export function deriveWorkflowNamaArsip(source: WorkflowNamaArsipSource): string {
  const judul = normalizeNamePart(source.judul)
  const namaDokumen = normalizeNamePart(source.namaDokumen)
  const kegiatanNama = normalizeNamePart(source.kegiatanNama)

  if (judul && namaDokumen) {
    return truncateWorkflowNamaArsip(`${namaDokumen} - ${judul}`)
  }

  if (judul) {
    return truncateWorkflowNamaArsip(judul)
  }

  if (kegiatanNama) {
    return truncateWorkflowNamaArsip(kegiatanNama)
  }

  return FALLBACK_WORKFLOW_NAMA_ARSIP
}

function normalizeNamePart(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null

  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > 0 ? normalized : null
}

function truncateWorkflowNamaArsip(value: string): string {
  if (value.length <= MAX_WORKFLOW_NAMA_ARSIP_LENGTH) return value

  return value.slice(0, MAX_WORKFLOW_NAMA_ARSIP_LENGTH).trimEnd()
}
