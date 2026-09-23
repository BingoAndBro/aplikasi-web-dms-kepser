import { describe, expect, it } from 'vitest'

import {
  filterKlasifikasiTreeForBerkasSelection,
  getKlasifikasiBerkasEligibility,
  OperationalKlasifikasiSelectionError,
  validateOperationalKlasifikasiSelection,
} from '#/lib/archive/berkas-klasifikasi-eligibility'

describe('berkas klasifikasi eligibility helper', () => {
  it('accepts active leaf classification for operational selection', async () => {
    await expect(validateOperationalKlasifikasiSelection('active-leaf', {
      async findKlasifikasiForOperationalSelection(id) {
        return {
          id,
          kode: '001.01',
          nama: 'Leaf',
          isActive: true,
          hasChildren: false,
        }
      },
    })).resolves.toEqual({
      id: 'active-leaf',
      kode: '001.01',
      nama: 'Leaf',
    })
  })

  it('rejects parent classifications for operational selection', async () => {
    await expect(validateOperationalKlasifikasiSelection('active-parent', {
      async findKlasifikasiForOperationalSelection(id) {
        return {
          id,
          kode: '001',
          nama: 'Parent',
          isActive: true,
          hasChildren: true,
        }
      },
    })).rejects.toMatchObject({
      code: 'KLASIFIKASI_PARENT',
      message: 'Klasifikasi induk tidak dapat dipilih sebagai Cara Pembayaran. Pilih Pilihan Akhir.',
    })
  })

  it('rejects inactive leaf classifications for operational selection', async () => {
    await expect(validateOperationalKlasifikasiSelection('inactive-leaf', {
      async findKlasifikasiForOperationalSelection(id) {
        return {
          id,
          kode: '001.02',
          nama: 'Inactive Leaf',
          isActive: false,
          hasChildren: false,
        }
      },
    })).rejects.toMatchObject({
      code: 'KLASIFIKASI_INACTIVE',
      message: 'Klasifikasi tidak aktif.',
    })
  })

  it('treats a parent with inactive child rows as non-selectable', async () => {
    await expect(validateOperationalKlasifikasiSelection('parent-with-inactive-child', {
      async findKlasifikasiForOperationalSelection(id) {
        return {
          id,
          kode: '002',
          nama: 'Parent With Inactive Child',
          isActive: true,
          hasChildren: true,
        }
      },
    })).rejects.toBeInstanceOf(OperationalKlasifikasiSelectionError)
  })

  it('rejects missing classifications for operational selection', async () => {
    await expect(validateOperationalKlasifikasiSelection('missing', {
      async findKlasifikasiForOperationalSelection() {
        return null
      },
    })).rejects.toMatchObject({
      code: 'KLASIFIKASI_NOT_FOUND',
      message: 'Klasifikasi tidak ditemukan.',
    })
  })

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
      unavailable_reason: 'Berkas untuk cara pembayaran ini sudah ditutup',
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
          { id: 'open-leaf', nama: 'Open Leaf', children: [], has_open_berkas: true },
          { id: 'new-leaf', nama: 'New Leaf', children: [], has_open_berkas: false },
        ],
      },
    ])
  })

  it('drops a parent whose every child has a closed berkas, instead of showing it as a pickable leaf', () => {
    const filtered = filterKlasifikasiTreeForBerkasSelection([
      {
        id: 'root',
        nama: 'Root',
        children: [
          {
            id: 'up',
            nama: 'UP',
            children: [
              { id: 'up-1', nama: 'UP-1', children: [] },
            ],
          },
        ],
      },
    ], [
      eligibilityRow('up-1', 'CLOSED', 'AKTIF'),
    ])

    expect(filtered).toEqual([])
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
