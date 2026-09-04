import { BERKAS_STATUS, type BerkasArchiveStatus, type BerkasStatus } from '#/lib/constants/archive-status'

export type OperationalKlasifikasiSelection = {
  id: string
  kode: string | null
  nama: string
}

export type OperationalKlasifikasiSelectionCandidate = OperationalKlasifikasiSelection & {
  isActive: boolean
  hasChildren: boolean
}

export type OperationalKlasifikasiSelectionRepository = {
  findKlasifikasiForOperationalSelection(id: string): Promise<OperationalKlasifikasiSelectionCandidate | null>
}

export type KlasifikasiEligibilityNode = {
  id: string
  children?: KlasifikasiEligibilityNode[]
}

export type KlasifikasiBerkasEligibilityRow = {
  klasifikasi_id: string
  status_berkas: BerkasStatus | string
  status_arsip: BerkasArchiveStatus | string | null
}

export type KlasifikasiBerkasEligibility = {
  is_selectable: boolean
  has_open_berkas: boolean
  unavailable_reason: string | null
  anomaly: 'MULTIPLE_OPEN_BERKAS' | null
}

export type OperationalKlasifikasiSelectionErrorCode =
  | 'KLASIFIKASI_NOT_FOUND'
  | 'KLASIFIKASI_INACTIVE'
  | 'KLASIFIKASI_PARENT'

const CLOSED_UNAVAILABLE_REASON = 'Berkas untuk cara pembayaran ini sudah ditutup'
const ANOMALY_UNAVAILABLE_REASON = 'Data berkas untuk cara pembayaran ini perlu ditinjau'

export class OperationalKlasifikasiSelectionError extends Error {
  constructor(
    public readonly code: OperationalKlasifikasiSelectionErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'OperationalKlasifikasiSelectionError'
  }
}

export async function validateOperationalKlasifikasiSelection(
  id: string,
  repository: OperationalKlasifikasiSelectionRepository = defaultOperationalKlasifikasiSelectionRepository,
): Promise<OperationalKlasifikasiSelection> {
  const candidate = await repository.findKlasifikasiForOperationalSelection(id)

  if (!candidate) {
    throw new OperationalKlasifikasiSelectionError(
      'KLASIFIKASI_NOT_FOUND',
      'Klasifikasi tidak ditemukan.',
    )
  }

  if (!candidate.isActive) {
    throw new OperationalKlasifikasiSelectionError(
      'KLASIFIKASI_INACTIVE',
      'Klasifikasi tidak aktif.',
    )
  }

  if (candidate.hasChildren) {
    throw new OperationalKlasifikasiSelectionError(
      'KLASIFIKASI_PARENT',
      'Klasifikasi induk tidak dapat dipilih sebagai Cara Pembayaran. Pilih Pilihan Akhir.',
    )
  }

  return {
    id: candidate.id,
    kode: candidate.kode,
    nama: candidate.nama,
  }
}

export function getKlasifikasiBerkasEligibility(
  rows: readonly KlasifikasiBerkasEligibilityRow[],
): KlasifikasiBerkasEligibility {
  const openRows = rows.filter((row) => row.status_berkas === BERKAS_STATUS.OPEN)

  if (openRows.length === 1) {
    return {
      is_selectable: true,
      has_open_berkas: true,
      unavailable_reason: null,
      anomaly: null,
    }
  }

  if (openRows.length > 1) {
    return {
      is_selectable: false,
      has_open_berkas: true,
      unavailable_reason: ANOMALY_UNAVAILABLE_REASON,
      anomaly: 'MULTIPLE_OPEN_BERKAS',
    }
  }

  if (rows.length > 0) {
    return {
      is_selectable: false,
      has_open_berkas: false,
      unavailable_reason: CLOSED_UNAVAILABLE_REASON,
      anomaly: null,
    }
  }

  return {
    is_selectable: true,
    has_open_berkas: false,
    unavailable_reason: null,
    anomaly: null,
  }
}

export function filterKlasifikasiTreeForBerkasSelection<TNode extends KlasifikasiEligibilityNode>(
  nodes: readonly TNode[],
  berkasRows: readonly KlasifikasiBerkasEligibilityRow[],
): TNode[] {
  const rowsByKlasifikasi = groupBerkasRowsByKlasifikasiId(berkasRows)

  return filterNodes(nodes, rowsByKlasifikasi)
}

function filterNodes<TNode extends KlasifikasiEligibilityNode>(
  nodes: readonly TNode[],
  rowsByKlasifikasi: Map<string, KlasifikasiBerkasEligibilityRow[]>,
): TNode[] {
  const filtered: TNode[] = []

  for (const node of nodes) {
    const children = filterNodes(node.children as readonly TNode[] | undefined ?? [], rowsByKlasifikasi)
    const eligibility = getKlasifikasiBerkasEligibility(rowsByKlasifikasi.get(node.id) ?? [])

    if (eligibility.is_selectable || children.length > 0) {
      filtered.push({
        ...node,
        children,
      } as TNode)
    }
  }

  return filtered
}

function groupBerkasRowsByKlasifikasiId(
  rows: readonly KlasifikasiBerkasEligibilityRow[],
): Map<string, KlasifikasiBerkasEligibilityRow[]> {
  const grouped = new Map<string, KlasifikasiBerkasEligibilityRow[]>()

  for (const row of rows) {
    const current = grouped.get(row.klasifikasi_id) ?? []
    current.push(row)
    grouped.set(row.klasifikasi_id, current)
  }

  return grouped
}

const defaultOperationalKlasifikasiSelectionRepository: OperationalKlasifikasiSelectionRepository = {
  async findKlasifikasiForOperationalSelection(id) {
    const [{ db }, { masterKlasifikasiArsip }, { eq }] = await Promise.all([
      import('#/db/client'),
      import('#/db/schema/arsip'),
      import('drizzle-orm'),
    ])

    const [row] = await db
      .select({
        id: masterKlasifikasiArsip.id,
        kode: masterKlasifikasiArsip.kode,
        nama: masterKlasifikasiArsip.nama,
        isActive: masterKlasifikasiArsip.isActive,
      })
      .from(masterKlasifikasiArsip)
      .where(eq(masterKlasifikasiArsip.id, id))
      .limit(1)

    if (!row) return null

    const [child] = await db
      .select({ id: masterKlasifikasiArsip.id })
      .from(masterKlasifikasiArsip)
      .where(eq(masterKlasifikasiArsip.parentId, id))
      .limit(1)

    return {
      id: row.id,
      kode: row.kode,
      nama: row.nama,
      isActive: row.isActive,
      hasChildren: Boolean(child),
    }
  },
}
