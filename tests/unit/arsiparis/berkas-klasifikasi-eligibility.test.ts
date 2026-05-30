import { describe, expect, it } from 'vitest'

import {
  filterKlasifikasiTreeForBerkasSelection,
  getKlasifikasiBerkasEligibility,
} from '#/lib/archive/berkas-klasifikasi-eligibility'

describe('berkas klasifikasi eligibility helper', () => {
  it('includes classifications with no existing berkas', () => {
    expect(getKlasifikasiBerkasEligibility([])).toMatchObject({
      is_selectable: true,
      has_open_berkas: false,
      unavailable_reason: null,
    })
  })

  it('includes classifications with exactly one OPEN berkas for reuse', () => {
    expect(getKlasifikasiBerkasEligibility([
      eligibilityRow('klasifikasi-open', 'OPEN', null),
    ])).toMatchObject({
      is_selectable: true,
      has_open_berkas: true,
      unavailable_reason: null,
    })
  })

  it.each([
    ['AKTIF'],
    [null],
    ['INAKTIF'],
    ['USUL_MUSNAH'],
    ['DIMUSNAHKAN'],
  ] as const)('excludes CLOSED classifications with status_arsip %s', (statusArsip) => {
    expect(getKlasifikasiBerkasEligibility([
      eligibilityRow('klasifikasi-closed', 'CLOSED', statusArsip),
    ])).toMatchObject({
      is_selectable: false,
      has_open_berkas: false,
      unavailable_reason: 'Berkas untuk jenis pembayaran ini sudah ditutup',
    })
  })

  it('fails safe for anomalous multiple OPEN berkas rows', () => {
    expect(getKlasifikasiBerkasEligibility([
      eligibilityRow('klasifikasi-anomaly', 'OPEN', null),
      eligibilityRow('klasifikasi-anomaly', 'OPEN', null),
    ])).toMatchObject({
      is_selectable: false,
      has_open_berkas: true,
      anomaly: 'MULTIPLE_OPEN_BERKAS',
    })
  })

  it('filters unavailable leaves while retaining parents for eligible children', () => {
    const filtered = filterKlasifikasiTreeForBerkasSelection([
      {
        id: 'root',
        nama: 'Root',
        children: [
          { id: 'closed-leaf', nama: 'Closed Leaf', children: [] },
          { id: 'open-leaf', nama: 'Open Leaf', children: [] },
          { id: 'new-leaf', nama: 'New Leaf', children: [] },
        ],
      },
    ], [
      eligibilityRow('closed-leaf', 'CLOSED', 'AKTIF'),
      eligibilityRow('open-leaf', 'OPEN', null),
    ])

    expect(filtered).toEqual([
      {
        id: 'root',
        nama: 'Root',
        children: [
          { id: 'open-leaf', nama: 'Open Leaf', children: [] },
          { id: 'new-leaf', nama: 'New Leaf', children: [] },
        ],
      },
    ])
  })
})

function eligibilityRow(
  klasifikasiId: string,
  statusBerkas: 'OPEN' | 'CLOSED',
  statusArsip: 'AKTIF' | 'INAKTIF' | 'USUL_MUSNAH' | 'DIMUSNAHKAN' | null,
) {
  return {
    klasifikasi_id: klasifikasiId,
    status_berkas: statusBerkas,
    status_arsip: statusArsip,
  }
}
