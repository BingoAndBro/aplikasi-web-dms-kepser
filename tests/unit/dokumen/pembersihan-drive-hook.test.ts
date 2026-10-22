// Section 09 tautan Google Drive: Pembersihan Dokumen ikut menandai salinan
// lampiran di Drive (keterangan DIBERSIHKAN) di transaksi pembersihan yang sama.
import { getTableName, type Table } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  tandaiFileDihapusUntukSumber: vi.fn(),
  order: [] as string[],
}))

vi.mock('#/lib/google-drive/penghapusan', () => ({
  tandaiFileDihapusUntukSumber: async (...args: unknown[]) => {
    mocks.order.push('drive:tandaiFileDihapusUntukSumber')
    return mocks.tandaiFileDihapusUntukSumber(...args)
  },
}))

import { applyCleanupInTransaction } from '#/lib/dokumen/pembersihan-service'
import type { PenghapusanExecutor } from '#/lib/google-drive/penghapusan'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const DOK_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const DOK_2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const NOW = new Date('2026-10-22T03:00:00.000Z')

function recordingTx() {
  const builder = (label: string) => {
    const chain: Record<string, unknown> = {}
    for (const method of ['set', 'where', 'values']) chain[method] = () => chain
    chain.then = (resolve: (value: unknown) => void) => {
      mocks.order.push(label)
      resolve(undefined)
    }
    return chain
  }
  return {
    update: (table: Table) => builder(`update:${getTableName(table)}`),
    insert: (table: Table) => builder(`insert:${getTableName(table)}`),
    select: () => { throw new Error('tidak dipakai') },
  } as unknown as PenghapusanExecutor
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.order.length = 0
  mocks.tandaiFileDihapusUntukSumber.mockResolvedValue({ tautanTerdampak: 1 })
})

describe('applyCleanupInTransaction', () => {
  it('update + audit per dokumen, lalu salinan Drive ditandai DIBERSIHKAN dengan tx yang sama', async () => {
    const tx = recordingTx()

    await applyCleanupInTransaction(tx, {
      actorUserId: ACTOR,
      now: NOW,
      entries: [
        { dokumenId: DOK_1, metadataSnapshot: { judul: 'A' } },
        { dokumenId: DOK_2, metadataSnapshot: { judul: 'B' } },
      ],
    })

    expect(mocks.order).toEqual([
      'update:dokumen_transaksi',
      'insert:audit_log',
      'update:dokumen_transaksi',
      'insert:audit_log',
      'drive:tandaiFileDihapusUntukSumber',
    ])
    expect(mocks.tandaiFileDihapusUntukSumber).toHaveBeenCalledWith(tx, {
      dokumenIds: [DOK_1, DOK_2],
      keterangan: 'DIBERSIHKAN',
      now: NOW,
    })
  })

  it('tanpa entri -> tidak menyentuh basis data maupun Drive', async () => {
    await applyCleanupInTransaction(recordingTx(), { actorUserId: ACTOR, now: NOW, entries: [] })

    expect(mocks.order).toEqual([])
    expect(mocks.tandaiFileDihapusUntukSumber).not.toHaveBeenCalled()
  })

  it('galat hook Drive diteruskan (transaksi pembersihan pemanggil di-rollback)', async () => {
    mocks.tandaiFileDihapusUntukSumber.mockRejectedValue(new Error('drive_job insert failed'))

    await expect(applyCleanupInTransaction(recordingTx(), {
      actorUserId: ACTOR,
      now: NOW,
      entries: [{ dokumenId: DOK_1, metadataSnapshot: {} }],
    })).rejects.toThrow('drive_job insert failed')
  })
})
