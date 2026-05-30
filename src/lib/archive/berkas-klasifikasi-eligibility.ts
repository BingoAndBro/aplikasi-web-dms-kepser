import { BERKAS_STATUS, type BerkasArchiveStatus, type BerkasStatus } from '#/lib/constants/archive-status'

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

const CLOSED_UNAVAILABLE_REASON = 'Berkas untuk jenis pembayaran ini sudah ditutup'
const ANOMALY_UNAVAILABLE_REASON = 'Data berkas untuk jenis pembayaran ini perlu ditinjau'

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
