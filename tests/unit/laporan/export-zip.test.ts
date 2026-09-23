import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DocumentZipTooManyEntriesError, type DocumentZipEntry } from '#/lib/export/document-zip'
import { extractContentDispositionFilename } from '#/lib/file-helpers'
import { EXPORT_ZIP_MAX_DOCUMENTS } from '#/components/laporan/ExportZipDialog'
import { buildLaporanExportZipFilename, resolveKegiatanFilenamePart } from '#/lib/export/laporan-zip-entries'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'
const DOC_A = '33333333-3333-4333-8333-333333333333'
const DOC_B = '44444444-4444-4444-8444-444444444444'
const KEGIATAN_ID = '55555555-5555-4555-8555-555555555555'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
  buildLaporanZipEntries: vi.fn(),
  streamDocumentZip: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
}))

vi.mock('#/db/client', () => ({
  db: { select: mocks.dbSelect },
}))

vi.mock('#/lib/export/laporan-zip-entries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/lib/export/laporan-zip-entries')>()

  return {
    ...actual,
    buildLaporanZipEntries: mocks.buildLaporanZipEntries,
  }
})

vi.mock('#/lib/export/document-zip', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/lib/export/document-zip')>()

  return {
    ...actual,
    streamDocumentZip: mocks.streamDocumentZip,
  }
})

import { Route as SayaExportZipRoute } from '#/routes/api/laporan/saya.export-zip'
import { Route as KegiatanExportZipRoute } from '#/routes/api/laporan/kegiatan.export-zip'

type RoutePostHandler = (args: { request: Request }) => Promise<Response>

const sayaHandler = (SayaExportZipRoute as unknown as {
  options: { server: { handlers: { POST: RoutePostHandler } } }
}).options.server.handlers.POST

const kegiatanHandler = (KegiatanExportZipRoute as unknown as {
  options: { server: { handlers: { POST: RoutePostHandler } } }
}).options.server.handlers.POST

function postRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
    body: JSON.stringify(body),
  })
}

function chainable(rows: unknown[]) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  builder.from = self
  builder.leftJoin = self
  builder.innerJoin = self
  builder.where = self
  builder.orderBy = self
  builder.then = (resolve: (value: unknown[]) => void) => resolve(rows)
  return builder
}

function documentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_A,
    judul: 'Dokumen Satu',
    fungsi_id: 'fungsi-id',
    kegiatan_jenis_id: KEGIATAN_ID,
    is_ketua_tim: false,
    status: 'COMPLETED',
    current_step: null,
    revision_target: null,
    revision_notes: null,
    lampiran_urls: [{ kelengkapan_id: 'k1', nama: 'Lampiran Satu', url: `${USER_ID}/${DOC_A}/1.pdf`, uploaded_at: '2026-05-29T00:00:00.000Z' }],
    tahun: 2026,
    tanggal: '2026-05-29',
    created_by: USER_ID,
    nominal_realisasi: '1000000.00',
    is_non_material: false,
    jenis_dokumen_id: null,
    keterangan_detail: null,
    created_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:00:00.000Z',
    jenis_permintaan_id: null,
    kategori_permintaan_id: null,
    detail_permintaan_id: null,
    kegiatan_nama: 'Kegiatan Pembayaran',
    jenis_permintaan_nama: null,
    kategori_permintaan_nama: null,
    detail_permintaan_nama: null,
    jenis_dokumen_nama: null,
    ...overrides,
  }
}

describe('POST /api/laporan/saya.export-zip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    mocks.getLocalServerSession.mockResolvedValue(session())
    mocks.buildLaporanZipEntries.mockResolvedValue([] as DocumentZipEntry[])
    mocks.streamDocumentZip.mockImplementation(async () => new Response('zip', {
      status: 200,
      headers: { 'Content-Type': 'application/zip' },
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a ZIP for dokumen_ids owned by the requester with COMPLETED/TERSIMPAN status', async () => {
    mocks.dbSelect.mockReturnValueOnce(chainable([documentRow()]))

    const response = await sayaHandler({
      request: postRequest('http://localhost/api/laporan/saya.export-zip', { dokumen_ids: [DOC_A] }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/zip')
    expect(mocks.buildLaporanZipEntries).toHaveBeenCalledTimes(1)
    const [[rows]] = mocks.buildLaporanZipEntries.mock.calls
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(DOC_A)
  })

  it('includes a sourceDescription indicating this is the Laporan Saya filter result', async () => {
    mocks.dbSelect.mockReturnValueOnce(chainable([documentRow()]))

    await sayaHandler({
      request: postRequest('http://localhost/api/laporan/saya.export-zip', { dokumen_ids: [DOC_A] }),
    })

    const [, options] = mocks.streamDocumentZip.mock.calls[0]
    expect(options.sourceDescription).toContain('Laporan Saya')
  })

  it('scopes the query to the requester (created_by) and the final statuses, silently excluding ids that resolve to nothing', async () => {
    // Simulate the query having filtered out an id belonging to another user —
    // only the caller's own document is returned by the (mocked) DB layer.
    mocks.dbSelect.mockReturnValueOnce(chainable([documentRow({ id: DOC_A })]))

    const response = await sayaHandler({
      request: postRequest('http://localhost/api/laporan/saya.export-zip', { dokumen_ids: [DOC_A, DOC_B] }),
    })

    expect(response.status).toBe(200)
    const [[rows]] = mocks.buildLaporanZipEntries.mock.calls
    expect(rows.map((r: { id: string }) => r.id)).toEqual([DOC_A])
    expect(JSON.stringify(rows)).not.toContain(OTHER_USER_ID)
  })

  it('does not duplicate a folder for a duplicate id in dokumen_ids (DB IN-clause collapses it to one row)', async () => {
    mocks.dbSelect.mockReturnValueOnce(chainable([documentRow()]))

    await sayaHandler({
      request: postRequest('http://localhost/api/laporan/saya.export-zip', { dokumen_ids: [DOC_A, DOC_A] }),
    })

    const [[rows]] = mocks.buildLaporanZipEntries.mock.calls
    expect(rows).toHaveLength(1)
  })

  it('returns 401 without a session, without querying the database', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await sayaHandler({
      request: postRequest('http://localhost/api/laporan/saya.export-zip', { dokumen_ids: [DOC_A] }),
    })

    expect(response.status).toBe(401)
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('rejects a request with a bad Origin before authorization/DB work', async () => {
    const response = await sayaHandler({
      request: postRequest('http://evil.test/api/laporan/saya.export-zip', { dokumen_ids: [DOC_A] }),
    })

    expect(response.status).toBe(403)
    expect(mocks.getLocalServerSession).not.toHaveBeenCalled()
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('returns 400 for an empty dokumen_ids array, before querying the database', async () => {
    const response = await sayaHandler({
      request: postRequest('http://localhost/api/laporan/saya.export-zip', { dokumen_ids: [] }),
    })

    expect(response.status).toBe(400)
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('returns 413 with a specific count message for 501 ids, before any DB query is run', async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`)

    const response = await sayaHandler({
      request: postRequest('http://localhost/api/laporan/saya.export-zip', { dokumen_ids: ids }),
    })

    expect(response.status).toBe(413)
    const body = await response.json()
    expect(body.error).toContain('501')
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('maps a DocumentZipTooManyEntriesError from streamDocumentZip to 413', async () => {
    mocks.dbSelect.mockReturnValueOnce(chainable([documentRow()]))
    mocks.streamDocumentZip.mockRejectedValue(new DocumentZipTooManyEntriesError(600, 500))

    const response = await sayaHandler({
      request: postRequest('http://localhost/api/laporan/saya.export-zip', { dokumen_ids: [DOC_A] }),
    })

    expect(response.status).toBe(413)
  })
})

describe('POST /api/laporan/kegiatan.export-zip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    mocks.getLocalServerSession.mockResolvedValue(session())
    mocks.buildLaporanZipEntries.mockResolvedValue([] as DocumentZipEntry[])
    mocks.streamDocumentZip.mockImplementation(async () => new Response('zip', {
      status: 200,
      headers: { 'Content-Type': 'application/zip' },
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('includes documents from other team members within a led kegiatan', async () => {
    mocks.dbSelect
      .mockReturnValueOnce(chainable([{ kegiatan_id: KEGIATAN_ID }]))
      .mockReturnValueOnce(chainable([documentRow({ id: DOC_A, created_by: OTHER_USER_ID })]))

    const response = await kegiatanHandler({
      request: postRequest('http://localhost/api/laporan/kegiatan.export-zip', { dokumen_ids: [DOC_A] }),
    })

    expect(response.status).toBe(200)
    const [[rows]] = mocks.buildLaporanZipEntries.mock.calls
    expect(rows).toHaveLength(1)
    expect(rows[0].created_by).toBe(OTHER_USER_ID)
  })

  it('silently excludes documents from a kegiatan the requester does not lead', async () => {
    mocks.dbSelect
      .mockReturnValueOnce(chainable([{ kegiatan_id: KEGIATAN_ID }]))
      // Simulate the DB filter having already excluded DOC_B (different kegiatan).
      .mockReturnValueOnce(chainable([documentRow({ id: DOC_A })]))

    const response = await kegiatanHandler({
      request: postRequest('http://localhost/api/laporan/kegiatan.export-zip', { dokumen_ids: [DOC_A, DOC_B] }),
    })

    expect(response.status).toBe(200)
    const [[rows]] = mocks.buildLaporanZipEntries.mock.calls
    expect(rows.map((r: { id: string }) => r.id)).toEqual([DOC_A])
  })

  it('returns an empty ZIP (not 403/404) when the requester is not a Ketua Tim for any kegiatan', async () => {
    mocks.dbSelect.mockReturnValueOnce(chainable([]))

    const response = await kegiatanHandler({
      request: postRequest('http://localhost/api/laporan/kegiatan.export-zip', { dokumen_ids: [DOC_A] }),
    })

    expect(response.status).toBe(200)
    expect(mocks.streamDocumentZip).toHaveBeenCalledWith([], expect.anything())
  })

  it('returns 413 for 501 ids before querying ketuaTimAssignments or documents', async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`)

    const response = await kegiatanHandler({
      request: postRequest('http://localhost/api/laporan/kegiatan.export-zip', { dokumen_ids: ids }),
    })

    expect(response.status).toBe(413)
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('returns 401 without a session', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await kegiatanHandler({
      request: postRequest('http://localhost/api/laporan/kegiatan.export-zip', { dokumen_ids: [DOC_A] }),
    })

    expect(response.status).toBe(401)
  })

  it('rejects a bad Origin before authorization', async () => {
    const response = await kegiatanHandler({
      request: postRequest('http://evil.test/api/laporan/kegiatan.export-zip', { dokumen_ids: [DOC_A] }),
    })

    expect(response.status).toBe(403)
    expect(mocks.getLocalServerSession).not.toHaveBeenCalled()
  })
})

describe('buildLaporanExportZipFilename / resolveKegiatanFilenamePart', () => {
  it('sanitizes the identity segment and appends today\'s date', () => {
    const filename = buildLaporanExportZipFilename('Laporan_Saya', 'budi santoso')

    expect(filename).toMatch(/^Laporan_Saya_budi_santoso_\d{4}-\d{2}-\d{2}\.zip$/)
  })

  it('falls back to a generic identity segment when sanitization would empty it', () => {
    const filename = buildLaporanExportZipFilename('Laporan_Saya', '😀😀😀')

    expect(filename).toMatch(/^Laporan_Saya_Ekspor_\d{4}-\d{2}-\d{2}\.zip$/)
  })

  it('resolves a single shared kegiatan_nama across rows', () => {
    expect(resolveKegiatanFilenamePart([
      { kegiatan_nama: 'Kegiatan A' },
      { kegiatan_nama: 'Kegiatan A' },
    ])).toBe('Kegiatan A')
  })

  it('falls back to a generic "Kegiatan" label when rows span multiple kegiatan names', () => {
    expect(resolveKegiatanFilenamePart([
      { kegiatan_nama: 'Kegiatan A' },
      { kegiatan_nama: 'Kegiatan B' },
    ])).toBe('Kegiatan')
    expect(resolveKegiatanFilenamePart([])).toBe('Kegiatan')
  })
})

describe('extractContentDispositionFilename', () => {
  it('extracts a quoted filename from a Content-Disposition header', () => {
    expect(extractContentDispositionFilename('attachment; filename="Laporan_Saya_budi_2026-05-29.zip"', 'fallback.zip'))
      .toBe('Laporan_Saya_budi_2026-05-29.zip')
  })

  it('falls back when the header is missing or unparseable', () => {
    expect(extractContentDispositionFilename(null, 'fallback.zip')).toBe('fallback.zip')
    expect(extractContentDispositionFilename('attachment', 'fallback.zip')).toBe('fallback.zip')
  })
})

describe('Ekspor Semua File (ZIP) buttons + dialog (/pegawai/laporan/saya, /pegawai/laporan/kegiatan)', () => {
  it('wires /pegawai/laporan/saya to fetch+blob against filtered, with a 500-document dialog cap', () => {
    const source = readFileSync('src/routes/pegawai/laporan/saya.tsx', 'utf8')

    expect(source).toContain('Ekspor Semua File (ZIP)')
    expect(source).toContain("fetch('/api/laporan/saya/export-zip'")
    expect(source).toContain('body: JSON.stringify({ dokumen_ids: filtered.map((dok) => dok.id) })')
    expect(source).toContain('downloadZipBlob(blob, filename)')
    expect(source).toContain('disabled={exportCount === 0}')
    expect(source).toContain('exportCount={filtered.length}')
    expect(EXPORT_ZIP_MAX_DOCUMENTS).toBe(500)
  })

  it('wires /pegawai/laporan/kegiatan to fetch+blob against selectedDocuments (the currently viewed kegiatan), not the full kegiatanRows list', () => {
    const source = readFileSync('src/routes/pegawai/laporan/kegiatan.tsx', 'utf8')

    expect(source).toContain('Ekspor Semua File (ZIP)')
    expect(source).toContain("fetch('/api/laporan/kegiatan/export-zip'")
    expect(source).toContain('body: JSON.stringify({ dokumen_ids: selectedDocuments.map((dok) => dok.id) })')
    expect(source).toContain('downloadZipBlob(blob, filename)')
    expect(source).toContain('exportCount={dokumen.length}')
    expect(source).not.toContain('dokumen_ids: kegiatanRows')
  })

  it('the shared ExportZipDialog shows a "persempit filter" message with no confirm button when documentCount exceeds the limit', () => {
    const source = readFileSync('src/components/laporan/ExportZipDialog.tsx', 'utf8')

    expect(source).toContain('Maksimal {EXPORT_ZIP_MAX_DOCUMENTS} per ekspor')
    expect(source).toContain('const overLimit = documentCount > EXPORT_ZIP_MAX_DOCUMENTS')
    expect(source).toContain('{!overLimit && (')
    expect(source).toContain('disabled={pending || documentCount === 0}')
  })
})

function session() {
  return {
    user: { id: USER_ID, username: 'pegawai.satu', displayName: 'Pegawai Satu' },
    userId: USER_ID,
    roles: ['PEGAWAI'],
    activeRole: 'PEGAWAI',
    sessionId: 'unit-test-session',
  }
}
