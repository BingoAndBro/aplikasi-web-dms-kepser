import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

import { DRIVE_MAX_FILE_BYTES } from '#/lib/google-drive/config'
import { bukaFileUntukUnggah, type FileSourceDeps } from '#/lib/google-drive/file-source'
import type { BarisFileUnggah } from '#/lib/google-drive/tautan-drive-repository'

const baris: BarisFileUnggah = {
  id: 'f1', tautanId: 't1', sumber: 'DOKUMEN', dokumenId: '33333333-3333-4333-8333-333333333333', lampiranIndex: 0,
  manualArsipId: null, attachmentId: null, kunciLampiran: 'DOKUMEN:33333333-3333-4333-8333-333333333333:0',
  namaFile: 'a.pdf', contentType: 'application/pdf', dicobaPada: null,
}

function deps(overrides: Partial<FileSourceDeps> = {}): FileSourceDeps {
  return {
    resolveLogicalPath: async () => 'dokumen/u1/a.pdf',
    root: () => '/srv/dms-storage',
    stat: async () => ({ isFile: () => true, size: 1024 }),
    createReadStream: vi.fn(() => Readable.from(['isi'])),
    ...overrides,
  }
}

describe('bukaFileUntukUnggah', () => {
  it('file tersedia -> ok dengan ukuran; stream baru dibuka saat buka() dipanggil', async () => {
    const d = deps()
    const result = await bukaFileUntukUnggah(baris, d)
    expect(result).toMatchObject({ ok: true, size: 1024 })
    expect(d.createReadStream).not.toHaveBeenCalled()
    if (result.ok) result.buka()
    expect(d.createReadStream).toHaveBeenCalledWith(expect.stringMatching(/dms-storage[\\/]dokumen[\\/]u1[\\/]a\.pdf$/))
  })

  it('tidak tersedia: lampiran ditolak resolver (dibersihkan/dimusnahkan), path tidak aman, stat gagal, bukan file, > 5 MB', async () => {
    const cases: Array<Partial<FileSourceDeps>> = [
      { resolveLogicalPath: async () => null },
      { resolveLogicalPath: async () => '../../etc/passwd' },
      { stat: async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) } },
      { stat: async () => ({ isFile: () => false, size: 1 }) },
      { stat: async () => ({ isFile: () => true, size: DRIVE_MAX_FILE_BYTES + 1 }) },
    ]
    for (const override of cases) {
      expect(await bukaFileUntukUnggah(baris, deps(override))).toEqual({ ok: false })
    }
    expect(await bukaFileUntukUnggah(baris, deps({ stat: async () => ({ isFile: () => true, size: DRIVE_MAX_FILE_BYTES }) })))
      .toMatchObject({ ok: true })
  })

  it('baris tanpa kolom sumber yang lengkap -> tidak tersedia tanpa menyentuh DB', async () => {
    expect(await bukaFileUntukUnggah({ ...baris, dokumenId: null }, { ...deps(), resolveLogicalPath: undefined })).toEqual({ ok: false })
    expect(await bukaFileUntukUnggah(
      { ...baris, sumber: 'MANUAL_ARSIP', dokumenId: null, lampiranIndex: null, manualArsipId: null, attachmentId: null },
      { ...deps(), resolveLogicalPath: undefined },
    )).toEqual({ ok: false })
  })
})
