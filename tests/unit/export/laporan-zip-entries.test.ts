import { describe, expect, it, vi } from 'vitest'

const DOC = '33333333-3333-4333-8333-333333333333'

const mocks = vi.hoisted(() => ({
  loadDocumentAccessContextForExport: vi.fn(),
  resolveDocumentLampiranReferenceFromContext: vi.fn(),
}))

vi.mock('#/db/client', () => ({ db: {} }))
vi.mock('#/lib/storage/document-file-access', () => ({
  loadDocumentAccessContextForExport: mocks.loadDocumentAccessContextForExport,
  resolveDocumentLampiranReferenceFromContext: mocks.resolveDocumentLampiranReferenceFromContext,
}))

import { buildLaporanZipEntries } from '#/lib/export/laporan-zip-entries'
import type { DokumenRow } from '#/lib/dokumen/types'

describe('buildLaporanZipEntries', () => {
  it('mengisi kunci DOKUMEN:<id>:<index> sesuai index lampiran asli (index yang tidak tersedia dilewati)', async () => {
    mocks.loadDocumentAccessContextForExport.mockResolvedValue({ id: DOC })
    mocks.resolveDocumentLampiranReferenceFromContext.mockImplementation((_ctx: unknown, index: number) => (
      index === 1 ? { ok: false, status: 404, message: 'x' } : { ok: true, logicalPath: `dokumen/${DOC}/f${index}.pdf` }
    ))
    const row = {
      id: DOC, judul: 'Rapat', tanggal: '2026-10-01', nama_dokumen: 'Undangan',
      lampiran_urls: [{ nama: 'A', url: 'a.pdf' }, { nama: 'B', url: 'b.pdf' }, { nama: 'C', url: 'c.pdf' }],
    } as unknown as DokumenRow

    const [entry] = await buildLaporanZipEntries([row])
    expect(entry.files.map((file) => [file.kunci, file.logicalPath])).toEqual([
      [`DOKUMEN:${DOC}:0`, `dokumen/${DOC}/f0.pdf`],
      [`DOKUMEN:${DOC}:2`, `dokumen/${DOC}/f2.pdf`],
    ])
  })
})
