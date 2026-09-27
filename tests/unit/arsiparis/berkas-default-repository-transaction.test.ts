import { beforeEach, describe, expect, it, vi } from 'vitest'
import { berkasArsip, berkasArsipActivity } from '#/db/schema/arsip'

const BERKAS_ID = '55555555-5555-4555-8555-555555555555'
const KLASIFIKASI_ID = '44444444-4444-4444-8444-444444444444'
const ACTOR_ID = '11111111-1111-4111-8111-111111111111'

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  dbTransaction: vi.fn(),
  txSelect: vi.fn(),
  txInsert: vi.fn(),
  txInsertValues: vi.fn(),
  txUpdate: vi.fn(),
  onConflictDoNothing: vi.fn(),
}))

vi.mock('#/db/client', () => ({
  db: {
    select: mocks.dbSelect,
    insert: mocks.dbInsert,
    update: mocks.dbUpdate,
    transaction: mocks.dbTransaction,
  },
}))

import {
  closeBerkasArsip,
  getOrCreateOpenBerkasForKlasifikasi,
} from '#/lib/archive/berkas-arsip-service'

describe('default berkas repository — close transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes status CLOSED and BERKAS_DITUTUP through the same db.transaction', async () => {
    const tx = createCloseTransaction()
    mocks.dbTransaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => operation(tx))

    const closed = await closeBerkasArsip({
      berkasId: BERKAS_ID,
      actorUserId: ACTOR_ID,
      metadata: { nomor_spm: 'SPM-001/2026', retensi_aktif: '1 Tahun', closed_at: '2026-05-29' },
    })

    expect(closed.status_berkas).toBe('CLOSED')
    expect(mocks.dbTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.txUpdate).toHaveBeenCalledWith(berkasArsip)
    expect(mocks.txInsert).toHaveBeenCalledWith(berkasArsipActivity)
    expect(mocks.txInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      berkasId: BERKAS_ID,
      eventType: 'BERKAS_DITUTUP',
      actorUserId: ACTOR_ID,
    }))
    // Nothing is written outside the transaction.
    expect(mocks.dbUpdate).not.toHaveBeenCalled()
    expect(mocks.dbInsert).not.toHaveBeenCalled()
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('propagates an activity insert failure so the transaction rolls the CLOSED update back', async () => {
    const tx = createCloseTransaction({ activityError: new Error('activity insert failed') })
    mocks.dbTransaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => operation(tx))

    await expect(closeBerkasArsip({
      berkasId: BERKAS_ID,
      actorUserId: ACTOR_ID,
      metadata: { nomor_spm: 'SPM-001/2026', retensi_aktif: '1 Tahun', closed_at: '2026-05-29' },
    })).rejects.toThrow('activity insert failed')

    expect(mocks.txUpdate).toHaveBeenCalledWith(berkasArsip)
    expect(mocks.dbUpdate).not.toHaveBeenCalled()
  })
})

describe('default berkas repository — get-or-create race', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts with ON CONFLICT (klasifikasi_id, tahun_anggaran) DO NOTHING and reads back the race winner', async () => {
    const selectResults: unknown[][] = [
      [klasifikasiRow()],
      [],
      [],
      [openBerkasRow()],
    ]
    mocks.dbSelect.mockImplementation(() => createSelectBuilder(selectResults.shift() ?? []))
    mocks.dbInsert.mockImplementation(() => ({
      values: () => {
        const builder: Record<string, unknown> = {
          returning: vi.fn(async () => []),
        }
        builder.onConflictDoNothing = mocks.onConflictDoNothing.mockImplementation(() => builder)
        return builder
      },
    }))

    const berkas = await getOrCreateOpenBerkasForKlasifikasi({
      klasifikasiId: KLASIFIKASI_ID,
      tahunAnggaran: 2026,
      actorUserId: ACTOR_ID,
    })

    expect(berkas.id).toBe(BERKAS_ID)
    expect(mocks.onConflictDoNothing).toHaveBeenCalledWith({
      target: [berkasArsip.klasifikasiId, berkasArsip.tahunAnggaran],
    })
    // Only the berkas insert ran; no BERKAS_DIBUKA for the losing request.
    expect(mocks.dbInsert).toHaveBeenCalledTimes(1)
  })
})

function createCloseTransaction(options: { activityError?: Error } = {}) {
  const selectResults: unknown[][] = [
    [openBerkasRow()],
    [{ count: 2 }],
  ]

  return {
    select: mocks.txSelect.mockImplementation(() => createSelectBuilder(selectResults.shift() ?? [])),
    update: mocks.txUpdate.mockImplementation(() => ({
      set: () => ({
        where: () => ({
          returning: async () => [closedBerkasRow()],
        }),
      }),
    })),
    insert: mocks.txInsert.mockImplementation(() => ({
      values: async (values: Record<string, unknown>) => {
        mocks.txInsertValues(values)
        if (options.activityError) throw options.activityError
      },
    })),
  }
}

function createSelectBuilder(result: unknown[]): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  query.from = vi.fn(() => query)
  query.where = vi.fn(() => query)
  query.limit = vi.fn(async () => result)
  query.then = (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return query
}

function klasifikasiRow() {
  return { id: KLASIFIKASI_ID, kode: 'KA.01', nama: 'Keuangan', isActive: true }
}

function openBerkasRow() {
  return {
    id: BERKAS_ID,
    klasifikasiId: KLASIFIKASI_ID,
    tahunAnggaran: 2026,
    klasifikasiKodeSnapshot: 'KA.01',
    klasifikasiNamaSnapshot: 'Keuangan',
    statusBerkas: 'OPEN',
    statusArsip: null,
    nomorSpm: null,
    retensiAktif: null,
    retensiInaktif: null,
    masaAktifBerakhir: null,
    masaInaktifBerakhir: null,
    closedAt: null,
    closedBy: null,
    createdBy: ACTOR_ID,
  }
}

function closedBerkasRow() {
  return {
    ...openBerkasRow(),
    statusBerkas: 'CLOSED',
    statusArsip: 'AKTIF',
    nomorSpm: 'SPM-001/2026',
    retensiAktif: '1 Tahun',
    masaAktifBerakhir: '2027-05-29',
    closedAt: new Date('2026-05-29T00:00:00.000Z'),
    closedBy: ACTOR_ID,
  }
}
