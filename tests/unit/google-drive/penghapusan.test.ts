// Hook pemicu penghapusan Drive (section 09) dengan transaksi palsu yang
// mencatat urutan operasi. Isi SQL-nya (filter tautan DRIVE belum dicabut,
// update bersyarat status lama) dibuktikan di tests/integration/google-drive-penghapusan.test.ts.
import { getTableName, type Table } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import {
  tandaiFileBerkasDimusnahkan,
  tandaiFileDihapusUntukSumber,
  tandaiTautanDicabut,
  type PenghapusanExecutor,
} from '#/lib/google-drive/penghapusan'

const NOW = new Date('2026-10-22T03:00:00.000Z')
const TAUTAN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TAUTAN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AKUN = '22222222-2222-4222-8222-222222222222'
const DOK = '33333333-3333-4333-8333-333333333333'

type Op = { op: 'select' | 'update' | 'insert'; table: string; values?: unknown }

/** Transaksi palsu: setiap rantai builder dicatat; hasilnya diambil berurutan dari `results`. */
function recordingTx(results: unknown[][]) {
  const ops: Op[] = []
  const queue = [...results]

  function chain(entry: Op): unknown {
    const proxy: unknown = new Proxy(() => undefined, {
      get(_target, prop) {
        if (prop === 'then') {
          const result = queue.shift() ?? []
          return (resolve: (value: unknown) => void) => resolve(result)
        }
        return (...args: unknown[]) => {
          if (prop === 'from' && entry.op === 'select') entry.table = getTableName(args[0] as Table)
          if ((prop === 'values' || prop === 'set') && entry.values === undefined) entry.values = args[0]
          return proxy
        }
      },
    })
    return proxy
  }

  const tx = {
    select: () => {
      const entry: Op = { op: 'select', table: '?' }
      ops.push(entry)
      return chain(entry)
    },
    update: (table: Table) => {
      const entry: Op = { op: 'update', table: getTableName(table) }
      ops.push(entry)
      return chain(entry)
    },
    insert: (table: Table) => {
      const entry: Op = { op: 'insert', table: getTableName(table) }
      ops.push(entry)
      return chain(entry)
    },
  }
  return { tx: tx as unknown as PenghapusanExecutor, ops }
}

describe('tandaiTautanDicabut', () => {
  it('urutan dalam transaksi pemicu: MENGHAPUS -> batalkan job MENUNGGU -> enqueue HAPUS_TAUTAN', async () => {
    const { tx, ops } = recordingTx([[], [], [{ id: 'job-baru' }]])

    await tandaiTautanDicabut(tx, { tautanId: TAUTAN_A, akunId: AKUN, now: NOW })

    expect(ops.map((o) => `${o.op}:${o.table}`)).toEqual([
      'update:laporan_tautan',
      'update:drive_job',
      'insert:drive_job',
    ])
    expect(ops[0].values).toEqual({ driveStatus: 'MENGHAPUS' })
    expect(ops[1].values).toMatchObject({ status: 'DIBATALKAN', selesaiPada: NOW })
    expect(ops[2].values).toMatchObject({ jenis: 'HAPUS_TAUTAN', akunId: AKUN, tautanId: TAUTAN_A, status: 'MENUNGGU' })
  })
})

describe('tandaiFileDihapusUntukSumber', () => {
  it('tanpa id sumber -> tidak menyentuh basis data', async () => {
    const { tx, ops } = recordingTx([])

    await expect(tandaiFileDihapusUntukSumber(tx, { dokumenIds: [], manualArsipIds: [], keterangan: 'DIBERSIHKAN', now: NOW }))
      .resolves.toEqual({ tautanTerdampak: 0 })
    await expect(tandaiFileDihapusUntukSumber(tx, { keterangan: 'DIBERSIHKAN', now: NOW }))
      .resolves.toEqual({ tautanTerdampak: 0 })
    expect(ops).toEqual([])
  })

  it('cari baris -> TERUNGGAH->MENGHAPUS -> MENUNGGU->DILEWATI -> satu HAPUS_FILE per tautan yang berubah', async () => {
    const { tx, ops } = recordingTx([
      // baris target (tautan DRIVE belum dicabut)
      [
        { id: 'f1', tautanId: TAUTAN_A, akunId: AKUN },
        { id: 'f2', tautanId: TAUTAN_A, akunId: AKUN },
        { id: 'f3', tautanId: TAUTAN_B, akunId: AKUN },
      ],
      // TERUNGGAH -> MENGHAPUS
      [{ tautanId: TAUTAN_A }, { tautanId: TAUTAN_A }],
      // MENUNGGU -> DILEWATI
      [{ tautanId: TAUTAN_B }],
      [{ id: 'job-a' }],
      [{ id: 'job-b' }],
    ])

    const hasil = await tandaiFileDihapusUntukSumber(tx, { dokumenIds: [DOK], keterangan: 'DIMUSNAHKAN', now: NOW })

    expect(hasil).toEqual({ tautanTerdampak: 2 })
    expect(ops.map((o) => `${o.op}:${o.table}`)).toEqual([
      'select:laporan_tautan_drive_file',
      'update:laporan_tautan_drive_file',
      'update:laporan_tautan_drive_file',
      'insert:drive_job',
      'insert:drive_job',
    ])
    expect(ops[1].values).toEqual({ status: 'MENGHAPUS', keteranganHapus: 'DIMUSNAHKAN' })
    expect(ops[2].values).toEqual({ status: 'DILEWATI', keteranganHapus: 'DIMUSNAHKAN' })
    expect(ops.slice(3).map((o) => o.values)).toEqual([
      expect.objectContaining({ jenis: 'HAPUS_FILE', tautanId: TAUTAN_A, akunId: AKUN }),
      expect.objectContaining({ jenis: 'HAPUS_FILE', tautanId: TAUTAN_B, akunId: AKUN }),
    ])
  })

  it('tidak ada baris tautan DRIVE aktif -> berhenti setelah pencarian', async () => {
    const { tx, ops } = recordingTx([[]])

    await expect(tandaiFileDihapusUntukSumber(tx, { manualArsipIds: [DOK], keterangan: 'DIMUSNAHKAN', now: NOW }))
      .resolves.toEqual({ tautanTerdampak: 0 })
    expect(ops.map((o) => o.op)).toEqual(['select'])
  })

  it('baris berubah status di antara pencarian dan update (balapan) -> tanpa job', async () => {
    const { tx, ops } = recordingTx([[{ id: 'f1', tautanId: TAUTAN_A, akunId: AKUN }], [], []])

    await expect(tandaiFileDihapusUntukSumber(tx, { dokumenIds: [DOK], keterangan: 'DIBERSIHKAN', now: NOW }))
      .resolves.toEqual({ tautanTerdampak: 0 })
    expect(ops.filter((o) => o.op === 'insert')).toEqual([])
  })
})

describe('tandaiFileBerkasDimusnahkan', () => {
  it('mengambil dokumen WORKFLOW + MANUAL dari isi berkas lalu menandai dengan DIMUSNAHKAN', async () => {
    const { tx, ops } = recordingTx([
      [{ dokumenId: DOK, manualArsipId: null }, { dokumenId: null, manualArsipId: 'm1' }],
      [],
    ])

    await expect(tandaiFileBerkasDimusnahkan(tx, { berkasId: 'berkas-1', now: NOW })).resolves.toEqual({ tautanTerdampak: 0 })
    expect(ops.map((o) => `${o.op}:${o.table}`)).toEqual(['select:berkas_arsip_item', 'select:laporan_tautan_drive_file'])
  })

  it('berkas kosong -> hanya membaca isi berkas', async () => {
    const { tx, ops } = recordingTx([[]])

    await tandaiFileBerkasDimusnahkan(tx, { berkasId: 'berkas-1', now: NOW })
    expect(ops.map((o) => o.op)).toEqual(['select'])
  })
})
