import path from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildBerkasParentFolderName,
  buildManualDocumentFolderName,
  buildWorkflowDocumentFolderName,
  buildZipPlan,
  DocumentZipTooManyEntriesError,
  streamDocumentZip,
  type DocumentZipEntry,
} from '#/lib/export/document-zip'

const BASE_OPTIONS = {
  requesterLabel: 'Budi Santoso',
  requesterRole: 'PEGAWAI',
  sourceDescription: 'Laporan Saya (filter aktif klien)',
  generatedAt: new Date('2026-05-29T03:04:05.000Z'),
}

describe('buildZipPlan (pure, no filesystem)', () => {
  it('produces folder + final file names unchanged for entries without collisions', () => {
    const entries: DocumentZipEntry[] = [
      {
        folderPath: 'folder-a',
        files: [{ namaAman: 'File Satu.pdf', logicalPath: 'user/doc-a/1.pdf' }],
      },
      {
        folderPath: 'folder-b',
        files: [
          { namaAman: 'File Dua.pdf', logicalPath: 'user/doc-b/1.pdf' },
          { namaAman: 'File Tiga.pdf', logicalPath: 'user/doc-b/2.pdf' },
        ],
      },
    ]

    const plan = buildZipPlan(entries, BASE_OPTIONS)

    expect(plan.includedFolders).toEqual([
      { folderPath: 'folder-a', files: [{ finalName: 'File Satu.pdf', logicalPath: 'user/doc-a/1.pdf' }] },
      {
        folderPath: 'folder-b',
        files: [
          { finalName: 'File Dua.pdf', logicalPath: 'user/doc-b/1.pdf' },
          { finalName: 'File Tiga.pdf', logicalPath: 'user/doc-b/2.pdf' },
        ],
      },
    ])
    expect(plan.skipped).toEqual([])
  })

  it('renders DAFTAR_ISI.txt text with timestamp, requester, source, included docs, and empty skip section', () => {
    const entries: DocumentZipEntry[] = [
      { folderPath: 'folder-a', files: [{ namaAman: 'a.pdf', logicalPath: 'u/a.pdf' }] },
    ]

    const plan = buildZipPlan(entries, BASE_OPTIONS)

    expect(plan.daftarIsiText).toContain('2026-05-29T03:04:05.000Z')
    expect(plan.daftarIsiText).toContain('Budi Santoso')
    expect(plan.daftarIsiText).toContain('PEGAWAI')
    expect(plan.daftarIsiText).toContain('Laporan Saya (filter aktif klien)')
    expect(plan.daftarIsiText).toContain('folder-a (1 file)')
    expect(plan.daftarIsiText).toMatch(/Dokumen dilewati \(0\):\n\(tidak ada\)/)
  })

  it('builds RP-05 style flat folder structure and RP-02 style nested folder structure from the same contract', () => {
    const entries: DocumentZipEntry[] = [
      { folderPath: 'dokumen-folder', files: [{ namaAman: 'x.pdf', logicalPath: 'u/x.pdf' }] },
      { folderPath: 'berkas-folder/dokumen-folder-2', files: [{ namaAman: 'y.pdf', logicalPath: 'u/y.pdf' }] },
    ]

    const plan = buildZipPlan(entries, BASE_OPTIONS)

    expect(plan.includedFolders[0].folderPath).toBe('dokumen-folder')
    expect(plan.includedFolders[1].folderPath).toBe('berkas-folder/dokumen-folder-2')
  })

  it('builds WORKFLOW folder name with YYYY-MM-DD date prefix and 8-char id suffix', () => {
    const name = buildWorkflowDocumentFolderName({
      id: 'abcdefgh-1111-2222-3333-444444444444',
      judul: 'Judul Dokumen',
      tanggal: '2026-05-29T10:00:00.000Z',
    })

    expect(name).toBe('2026-05-29_Judul_Dokumen_abcdefgh')
  })

  it('builds MANUAL folder name with [Manual] prefix and 8-char id suffix', () => {
    const name = buildManualDocumentFolderName({
      id: 'zzzzzzzz-1111-2222-3333-444444444444',
      judul: 'Judul Manual',
    })

    expect(name).toBe('[Manual] Judul_Manual_zzzzzzzz')
  })

  it('builds the RP-02 parent folder name as "<nomor spm> - <klasifikasi>"', () => {
    const name = buildBerkasParentFolderName({ nomorSpm: 'SPM-001', klasifikasiNama: 'Klasifikasi A' })

    expect(name).toBe('SPM-001 - Klasifikasi_A')
  })

  it('falls back to "[Tanpa Nomor SPM]" when nomorSpm is null or empty', () => {
    expect(buildBerkasParentFolderName({ nomorSpm: null, klasifikasiNama: 'Klasifikasi A' }))
      .toBe('[Tanpa Nomor SPM] - Klasifikasi_A')
    expect(buildBerkasParentFolderName({ nomorSpm: '  ', klasifikasiNama: 'Klasifikasi A' }))
      .toBe('[Tanpa Nomor SPM] - Klasifikasi_A')
  })

  it('adds " (2)", " (3)" suffixes for duplicate namaAman within the same folder, in array order', () => {
    const entries: DocumentZipEntry[] = [
      {
        folderPath: 'folder-a',
        files: [
          { namaAman: 'sama.pdf', logicalPath: 'u/1.pdf' },
          { namaAman: 'sama.pdf', logicalPath: 'u/2.pdf' },
          { namaAman: 'sama.pdf', logicalPath: 'u/3.pdf' },
        ],
      },
    ]

    const plan = buildZipPlan(entries, BASE_OPTIONS)

    expect(plan.includedFolders[0].files.map(f => f.finalName)).toEqual([
      'sama.pdf',
      'sama (2).pdf',
      'sama (3).pdf',
    ])
  })

  it('skips entries with no files, recording them as "tanpa lampiran"', () => {
    const entries: DocumentZipEntry[] = [
      { folderPath: 'folder-kosong', files: [] },
      { folderPath: 'folder-isi', files: [{ namaAman: 'a.pdf', logicalPath: 'u/a.pdf' }] },
    ]

    const plan = buildZipPlan(entries, BASE_OPTIONS)

    expect(plan.includedFolders).toHaveLength(1)
    expect(plan.includedFolders[0].folderPath).toBe('folder-isi')
    expect(plan.skipped).toEqual([{ label: 'folder-kosong', reason: 'tanpa lampiran' }])
    expect(plan.daftarIsiText).toContain('folder-kosong - tanpa lampiran')
  })

  it('sanitizes unsafe judul characters and falls back to a generic name when sanitization empties the segment', () => {
    const name = buildWorkflowDocumentFolderName({
      id: 'aaaaaaaa-1111-2222-3333-444444444444',
      judul: '/\\😀',
      tanggal: '2026-01-01',
    })

    expect(name).toBe('2026-01-01_Dokumen_aaaaaaaa')
  })

  it('throws DocumentZipTooManyEntriesError before doing anything else when entries.length > 500', () => {
    const entries: DocumentZipEntry[] = Array.from({ length: 501 }, (_, i) => ({
      folderPath: `folder-${i}`,
      files: [{ namaAman: `f${i}.pdf`, logicalPath: `u/${i}.pdf` }],
    }))

    expect(() => buildZipPlan(entries, BASE_OPTIONS)).toThrow(DocumentZipTooManyEntriesError)
  })

  it('never includes logical path, physical path, storage root, or token substrings in DAFTAR_ISI.txt', () => {
    const entries: DocumentZipEntry[] = [
      { folderPath: 'folder-a', files: [{ namaAman: 'a.pdf', logicalPath: 'secret-owner-id/secret-doc/file.pdf' }] },
    ]

    const plan = buildZipPlan(entries, BASE_OPTIONS)

    expect(plan.daftarIsiText).not.toContain('secret-owner-id')
    expect(plan.daftarIsiText).not.toContain('secret-doc')
    expect(plan.daftarIsiText).not.toContain(path.resolve('storage'))
  })
})

describe('streamDocumentZip (thin I/O layer, temp directory)', () => {
  const TEST_ROOT = path.resolve('.tmp', 'document-zip-test')

  beforeEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
    await mkdir(TEST_ROOT, { recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  it('returns a 200 application/zip Response with sanitized Content-Disposition and no-store cache control', async () => {
    await writeFileAt('owner/doc/file.pdf', 'small file content')

    const response = await streamDocumentZip(
      [{ folderPath: 'folder-a', files: [{ namaAman: 'file.pdf', logicalPath: 'owner/doc/file.pdf' }] }],
      { ...BASE_OPTIONS, filename: 'Laporan_Saya_budi_2026-05-29.zip' },
      { root: TEST_ROOT },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/zip')
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Laporan_Saya_budi_2026-05-29.zip"',
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')

    await response.arrayBuffer()
  })

  it('skips a missing file (ENOENT) without throwing, and the ZIP still completes', async () => {
    const response = await streamDocumentZip(
      [{ folderPath: 'folder-a', files: [{ namaAman: 'missing.pdf', logicalPath: 'owner/doc/missing.pdf' }] }],
      { ...BASE_OPTIONS, filename: 'export.zip' },
      { root: TEST_ROOT },
    )

    expect(response.status).toBe(200)
    await expect(response.arrayBuffer()).resolves.toBeDefined()
  })

  it('skips a file larger than 250 MB via injected stat, recorded with the oversize reason', async () => {
    await writeFileAt('owner/doc/big.pdf', 'tiny actual content')

    const statSpy = vi.fn(async () => ({ isFile: () => true, size: 251 * 1024 * 1024 }))
    const createReadStreamSpy = vi.fn()

    const response = await streamDocumentZip(
      [{ folderPath: 'folder-a', files: [{ namaAman: 'big.pdf', logicalPath: 'owner/doc/big.pdf' }] }],
      { ...BASE_OPTIONS, filename: 'export.zip' },
      { root: TEST_ROOT, stat: statSpy, createReadStream: createReadStreamSpy },
    )

    expect(response.status).toBe(200)
    expect(createReadStreamSpy).not.toHaveBeenCalled()
    await response.arrayBuffer()
  })

  it('writes DAFTAR_ISI.txt as the first archive.append call, before any file entries', async () => {
    await writeFileAt('owner/doc/a.pdf', 'content a')
    await writeFileAt('owner/doc/b.pdf', 'content b')

    const appendCalls: string[] = []
    const fakeArchive = {
      append: vi.fn((_source: unknown, data: { name: string }) => {
        appendCalls.push(data.name)
      }),
      finalize: vi.fn(() => Promise.resolve()),
      pipe: vi.fn(),
      on: vi.fn(),
    }

    await streamDocumentZip(
      [
        {
          folderPath: 'folder-a',
          files: [
            { namaAman: 'a.pdf', logicalPath: 'owner/doc/a.pdf' },
            { namaAman: 'b.pdf', logicalPath: 'owner/doc/b.pdf' },
          ],
        },
      ],
      { ...BASE_OPTIONS, filename: 'export.zip' },
      { root: TEST_ROOT, createArchive: () => fakeArchive },
    )

    expect(appendCalls[0]).toBe('DAFTAR_ISI.txt')
    expect(appendCalls.slice(1)).toEqual(['folder-a/a.pdf', 'folder-a/b.pdf'])
  })

  it('rejects entries.length > 500 before touching the filesystem at all', async () => {
    const statSpy = vi.fn()
    const createReadStreamSpy = vi.fn()
    const entries: DocumentZipEntry[] = Array.from({ length: 501 }, (_, i) => ({
      folderPath: `folder-${i}`,
      files: [{ namaAman: `f${i}.pdf`, logicalPath: `owner/${i}.pdf` }],
    }))

    await expect(streamDocumentZip(
      entries,
      { ...BASE_OPTIONS, filename: 'export.zip' },
      { root: TEST_ROOT, stat: statSpy, createReadStream: createReadStreamSpy },
    )).rejects.toThrow(DocumentZipTooManyEntriesError)

    expect(statSpy).not.toHaveBeenCalled()
    expect(createReadStreamSpy).not.toHaveBeenCalled()
  })

  it('rejects when the archive emits a fatal error before any bytes are produced, instead of silently returning an empty ZIP', async () => {
    const fakeArchive = {
      append: vi.fn(),
      finalize: vi.fn(function (this: { errorListener?: (err: Error) => void }) {
        this.errorListener?.(new Error('boom'))
      }),
      pipe: vi.fn(),
      on: vi.fn(function (this: { errorListener?: (err: Error) => void }, event: string, listener: (err: Error) => void) {
        if (event === 'error') this.errorListener = listener
      }),
    }

    await expect(streamDocumentZip(
      [{ folderPath: 'folder-a', files: [{ namaAman: 'a.pdf', logicalPath: 'owner/a.pdf' }] }],
      { ...BASE_OPTIONS, filename: 'export.zip' },
      { root: TEST_ROOT, createArchive: () => fakeArchive },
    )).rejects.toThrow('boom')
  })

  it('rejects a manipulated logicalPath (path traversal attempt) as a skip, not a thrown error or an out-of-root read', async () => {
    const createReadStreamSpy = vi.fn()

    const response = await streamDocumentZip(
      [{ folderPath: 'folder-a', files: [{ namaAman: 'evil.pdf', logicalPath: '../../etc/passwd' }] }],
      { ...BASE_OPTIONS, filename: 'export.zip' },
      { root: TEST_ROOT, createReadStream: createReadStreamSpy },
    )

    expect(response.status).toBe(200)
    expect(createReadStreamSpy).not.toHaveBeenCalled()
    await response.arrayBuffer()
  })

  async function writeFileAt(logicalPath: string, content: string): Promise<void> {
    const fullPath = path.join(TEST_ROOT, logicalPath)
    await mkdir(path.dirname(fullPath), { recursive: true })
    await writeFile(fullPath, content)
  }
})
