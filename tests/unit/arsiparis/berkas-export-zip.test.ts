import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BerkasArsipDetailDto, BerkasArsipDetailItemDto, BerkasArsipDetailResult } from '#/lib/archive/berkas-arsip-read-model'
import type { BerkasArsipItemAttachmentsResult } from '#/lib/archive/berkas-arsip-file-access'
import { DocumentZipTooManyEntriesError, type DocumentZipEntry } from '#/lib/export/document-zip'
import {
  buildBerkasExportZipUrl,
  canExportBerkasZip,
  exportBerkasZipDisabledReason,
} from '#/routes/kasubag/berkas/$id'

const BERKAS_ID = '55555555-5555-4555-8555-555555555555'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  getBerkasArsipDetail: vi.fn(),
  resolveBerkasArsipItemAttachments: vi.fn(),
  streamDocumentZip: vi.fn(),
  dbInsert: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/lib/archive/berkas-arsip-read-model', () => ({
  getBerkasArsipDetail: mocks.getBerkasArsipDetail,
}))

vi.mock('#/lib/archive/berkas-arsip-file-access', () => ({
  resolveBerkasArsipItemAttachments: mocks.resolveBerkasArsipItemAttachments,
}))

vi.mock('#/lib/export/document-zip', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/lib/export/document-zip')>()

  return {
    ...actual,
    streamDocumentZip: mocks.streamDocumentZip,
  }
})

vi.mock('#/db/client', () => ({
  db: { insert: mocks.dbInsert },
}))

import { Route as ExportZipRoute } from '#/routes/api/kasubag/berkas/$id/export-zip'

type RouteGetHandler = (args: {
  request: Request
  params: Record<string, string>
}) => Promise<Response>

const getHandler = (ExportZipRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

describe('GET /api/kasubag/berkas/$id/export-zip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    mocks.getLocalServerSession.mockResolvedValue(session())
    mocks.dbInsert.mockImplementation(() => {
      throw new Error('export-zip must not write to the database')
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a ZIP Response for a CLOSED non-DIMUSNAHKAN berkas, folder structure "<nomor spm> - <klasifikasi>/<folder dokumen>/<file>"', async () => {
    mocks.getBerkasArsipDetail.mockResolvedValue(detailResult({
      nomor_spm: 'SPM-001',
      klasifikasi_nama_snapshot: 'Keuangan',
      items: [
        workflowItem({ item_id: 'aaaaaaaa-1111-2222-3333-444444444444', source_title: 'Dokumen Satu', source_date: '2026-05-29' }),
        manualItem({ item_id: 'bbbbbbbb-1111-2222-3333-444444444444', source_title: 'Dokumen Dua' }),
      ],
    }))
    mocks.resolveBerkasArsipItemAttachments.mockResolvedValue({
      ok: true,
      attachments: [{ logicalPath: 'owner/doc/1.pdf', namaAman: 'file.pdf' }],
    } satisfies BerkasArsipItemAttachmentsResult)
    mocks.streamDocumentZip.mockImplementation(async () => new Response('zip-bytes', {
      status: 200,
      headers: { 'Content-Type': 'application/zip' },
    }))

    const response = await getHandler({ request: new Request('http://localhost/api/kasubag/berkas/x/export-zip'), params: { id: BERKAS_ID } })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/zip')
    expect(mocks.streamDocumentZip).toHaveBeenCalledTimes(1)
    const [entries] = mocks.streamDocumentZip.mock.calls[0] as [DocumentZipEntry[], unknown]
    expect(entries).toHaveLength(2)
    expect(entries[0].folderPath).toBe('SPM-001 - Keuangan/2026-05-29_Dokumen_Satu_aaaaaaaa')
    expect(entries[1].folderPath).toBe('SPM-001 - Keuangan/[Manual] Dokumen_Dua_bbbbbbbb')
  })

  it('falls back to "[Tanpa Nomor SPM]" in the parent folder when nomor_spm is null', async () => {
    mocks.getBerkasArsipDetail.mockResolvedValue(detailResult({
      nomor_spm: null,
      klasifikasi_nama_snapshot: 'Keuangan',
      items: [workflowItem({ item_id: 'aaaaaaaa-1111-2222-3333-444444444444' })],
    }))
    mocks.resolveBerkasArsipItemAttachments.mockResolvedValue({ ok: true, attachments: [] })
    mocks.streamDocumentZip.mockImplementation(async () => new Response(null, { status: 200 }))

    await getHandler({ request: new Request('http://localhost/api/kasubag/berkas/x/export-zip'), params: { id: BERKAS_ID } })

    const [entries] = mocks.streamDocumentZip.mock.calls[0] as [DocumentZipEntry[], unknown]
    expect(entries[0].folderPath).toContain('[Tanpa Nomor SPM] - Keuangan/')
  })

  it('produces only a DAFTAR_ISI.txt manifest (via document-zip.ts) for a berkas with 0 items', async () => {
    mocks.getBerkasArsipDetail.mockResolvedValue(detailResult({ items: [] }))
    mocks.streamDocumentZip.mockImplementation(async () => new Response(null, { status: 200 }))

    const response = await getHandler({ request: new Request('http://localhost/api/kasubag/berkas/x/export-zip'), params: { id: BERKAS_ID } })

    expect(response.status).toBe(200)
    const [entries] = mocks.streamDocumentZip.mock.calls[0] as [DocumentZipEntry[], unknown]
    expect(entries).toEqual([])
  })

  it('passes an empty files[] (skipped, no crash) for an item whose attachments fail to resolve', async () => {
    mocks.getBerkasArsipDetail.mockResolvedValue(detailResult({
      items: [workflowItem({ item_id: 'aaaaaaaa-1111-2222-3333-444444444444' })],
    }))
    mocks.resolveBerkasArsipItemAttachments.mockResolvedValue({ ok: false, status: 404, message: 'Lampiran berkas tidak ditemukan' })
    mocks.streamDocumentZip.mockImplementation(async () => new Response(null, { status: 200 }))

    const response = await getHandler({ request: new Request('http://localhost/api/kasubag/berkas/x/export-zip'), params: { id: BERKAS_ID } })

    expect(response.status).toBe(200)
    const [entries] = mocks.streamDocumentZip.mock.calls[0] as [DocumentZipEntry[], unknown]
    expect(entries[0].files).toEqual([])
  })

  it('returns 401 without a session', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await getHandler({ request: new Request('http://localhost/api/kasubag/berkas/x/export-zip'), params: { id: BERKAS_ID } })

    expect(response.status).toBe(401)
    expect(mocks.getBerkasArsipDetail).not.toHaveBeenCalled()
  })

  it('returns 403 for a non-KEPALA_SUB_BAGIAN_UMUM role, including ADMIN', async () => {
    mocks.getLocalServerSession.mockResolvedValue(session(['ADMIN']))

    const response = await getHandler({ request: new Request('http://localhost/api/kasubag/berkas/x/export-zip'), params: { id: BERKAS_ID } })

    expect(response.status).toBe(403)
    expect(mocks.getBerkasArsipDetail).not.toHaveBeenCalled()
  })

  it('returns 404 for a non-UUID berkas id, without querying the detail read-model', async () => {
    const response = await getHandler({ request: new Request('http://localhost/api/kasubag/berkas/x/export-zip'), params: { id: 'not-a-uuid' } })

    expect(response.status).toBe(404)
    expect(mocks.getBerkasArsipDetail).not.toHaveBeenCalled()
  })

  it('returns 404 when the berkas does not exist', async () => {
    mocks.getBerkasArsipDetail.mockResolvedValue({ status: 'not_found' } satisfies BerkasArsipDetailResult)

    const response = await getHandler({ request: new Request('http://localhost/api/kasubag/berkas/x/export-zip'), params: { id: BERKAS_ID } })

    expect(response.status).toBe(404)
  })

  it('returns 409 for a berkas that is still OPEN', async () => {
    mocks.getBerkasArsipDetail.mockResolvedValue(detailResult({ status_berkas: 'OPEN' }))

    const response = await getHandler({ request: new Request('http://localhost/api/kasubag/berkas/x/export-zip'), params: { id: BERKAS_ID } })

    expect(response.status).toBe(409)
    expect(mocks.streamDocumentZip).not.toHaveBeenCalled()
  })

  it('returns 410 "Data file sudah dimusnahkan" for a DIMUSNAHKAN berkas', async () => {
    mocks.getBerkasArsipDetail.mockResolvedValue(detailResult({ status_arsip: 'DIMUSNAHKAN' }))

    const response = await getHandler({ request: new Request('http://localhost/api/kasubag/berkas/x/export-zip'), params: { id: BERKAS_ID } })

    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({ error: 'Data file sudah dimusnahkan' })
    expect(mocks.streamDocumentZip).not.toHaveBeenCalled()
  })

  it('returns 413 with a specific count message for a berkas with > 500 items, before calling the attachment resolver', async () => {
    mocks.getBerkasArsipDetail.mockResolvedValue(detailResult({
      items: Array.from({ length: 501 }, (_, i) => workflowItem({ item_id: `item-${i}` })),
    }))

    const response = await getHandler({ request: new Request('http://localhost/api/kasubag/berkas/x/export-zip'), params: { id: BERKAS_ID } })

    expect(response.status).toBe(413)
    const body = await response.json()
    expect(body.error).toContain('501')
    expect(mocks.resolveBerkasArsipItemAttachments).not.toHaveBeenCalled()
    expect(mocks.streamDocumentZip).not.toHaveBeenCalled()
  })

  it('maps a DocumentZipTooManyEntriesError from streamDocumentZip to 413', async () => {
    mocks.getBerkasArsipDetail.mockResolvedValue(detailResult({
      items: [workflowItem({ item_id: 'aaaaaaaa-1111-2222-3333-444444444444' })],
    }))
    mocks.resolveBerkasArsipItemAttachments.mockResolvedValue({ ok: true, attachments: [] })
    mocks.streamDocumentZip.mockRejectedValue(new DocumentZipTooManyEntriesError(600, 500))

    const response = await getHandler({ request: new Request('http://localhost/api/kasubag/berkas/x/export-zip'), params: { id: BERKAS_ID } })

    expect(response.status).toBe(413)
  })

  it('never writes to the database (no berkas_arsip_activity row) on a successful export', async () => {
    mocks.getBerkasArsipDetail.mockResolvedValue(detailResult({
      items: [workflowItem({ item_id: 'aaaaaaaa-1111-2222-3333-444444444444' })],
    }))
    mocks.resolveBerkasArsipItemAttachments.mockResolvedValue({ ok: true, attachments: [] })
    mocks.streamDocumentZip.mockImplementation(async () => new Response(null, { status: 200 }))

    const response = await getHandler({ request: new Request('http://localhost/api/kasubag/berkas/x/export-zip'), params: { id: BERKAS_ID } })

    expect(response.status).toBe(200)
    expect(mocks.dbInsert).not.toHaveBeenCalled()
  })
})

describe('Ekspor ZIP button + dialog (/kasubag/berkas/$id)', () => {
  it('canExportBerkasZip is true only for CLOSED non-DIMUSNAHKAN berkas', () => {
    expect(canExportBerkasZip({ status_berkas: 'CLOSED', status_arsip: 'AKTIF' })).toBe(true)
    expect(canExportBerkasZip({ status_berkas: 'CLOSED', status_arsip: 'USUL_MUSNAH' })).toBe(true)
    expect(canExportBerkasZip({ status_berkas: 'CLOSED', status_arsip: null })).toBe(true)
    expect(canExportBerkasZip({ status_berkas: 'OPEN', status_arsip: null })).toBe(false)
    expect(canExportBerkasZip({ status_berkas: 'CLOSED', status_arsip: 'DIMUSNAHKAN' })).toBe(false)
  })

  it('exportBerkasZipDisabledReason mirrors the server guard messages', () => {
    expect(exportBerkasZipDisabledReason({ status_berkas: 'OPEN', status_arsip: null }))
      .toBe('Berkas belum ditutup, tidak bisa diekspor')
    expect(exportBerkasZipDisabledReason({ status_berkas: 'CLOSED', status_arsip: 'DIMUSNAHKAN' }))
      .toBe('Data file sudah dimusnahkan')
    expect(exportBerkasZipDisabledReason({ status_berkas: 'CLOSED', status_arsip: 'AKTIF' })).toBeNull()
  })

  it('builds the export-zip URL without leaking any storage/path details', () => {
    const url = buildBerkasExportZipUrl(BERKAS_ID)

    expect(url).toBe(`/api/kasubag/berkas/${BERKAS_ID}/export-zip`)
    expect(url).not.toContain('logical')
    expect(url).not.toContain('storage')
  })

  it('renders the button disabled with a tooltip reason for OPEN/DIMUSNAHKAN, and wires the confirm dialog to a plain GET navigation (no fetch+blob needed)', () => {
    const source = readFileSync('src/routes/kasubag/berkas/$id.tsx', 'utf8')

    expect(source).toContain('Ekspor ZIP')
    expect(source).toContain('disabled={!canExportZip}')
    expect(source).toContain('title={exportZipDisabledReason ?? undefined}')
    expect(source).toContain('setExportZipDialogOpen(true)')
    expect(source).toContain('function ExportBerkasZipDialog')
    expect(source).toContain('Ekspor ZIP Berkas')
    expect(source).toContain('Ekspor Sekarang')
    expect(source).toContain('window.location.href = buildBerkasExportZipUrl(detail.berkas_id)')
    expect(source).toContain('Batal')
    expect(source).toContain('if (!preparing) onOpenChange(nextOpen)')
  })
})

function session(roles: string[] = ['KEPALA_SUB_BAGIAN_UMUM']) {
  return {
    user: { id: 'actor-id', username: 'actor', displayName: 'Actor' },
    userId: 'actor-id',
    roles,
    activeRole: roles[0],
    sessionId: 'unit-test-session',
  }
}

function workflowItem(overrides: Partial<BerkasArsipDetailItemDto> = {}): BerkasArsipDetailItemDto {
  return {
    item_id: '11111111-1111-2222-3333-444444444444',
    item_added_at: '2026-05-29T00:00:00.000Z',
    source_type: 'WORKFLOW',
    source_title: 'Dokumen Workflow',
    source_date: '2026-05-29',
    source_nominal_realisasi: null,
    source_created_by_display_name: null,
    attachment_count: 1,
    attachments: [],
    has_attachments: true,
    workflow: { title: 'Dokumen Workflow', status: 'COMPLETED', current_step: null, fungsi_nama: null, kegiatan_nama: null },
    manual: null,
    warnings: [],
    ...overrides,
  }
}

function manualItem(overrides: Partial<BerkasArsipDetailItemDto> = {}): BerkasArsipDetailItemDto {
  return {
    item_id: '22222222-1111-2222-3333-444444444444',
    item_added_at: '2026-05-29T00:00:00.000Z',
    source_type: 'MANUAL',
    source_title: 'Dokumen Manual',
    source_date: null,
    source_nominal_realisasi: null,
    source_created_by_display_name: null,
    attachment_count: 1,
    attachments: [],
    has_attachments: true,
    workflow: null,
    manual: { nama: 'Dokumen Manual', komponen_name: null, keterangan: null },
    warnings: [],
    ...overrides,
  }
}

function detailResult(overrides: Partial<BerkasArsipDetailDto> = {}): BerkasArsipDetailResult {
  return {
    status: 'found',
    detail: {
      berkas_id: BERKAS_ID,
      klasifikasi_id: 'klasifikasi-id',
      klasifikasi_kode_snapshot: 'KA.01',
      klasifikasi_nama_snapshot: 'Keuangan',
      status_berkas: 'CLOSED',
      status_arsip: 'AKTIF',
      nomor_spm: 'SPM-001',
      retensi_aktif: null,
      retensi_inaktif: null,
      masa_aktif_berakhir: null,
      masa_inaktif_berakhir: null,
      closed_at: '2026-05-29T00:00:00.000Z',
      closed_by: 'closer-id',
      umur_berkas: null,
      jatuh_tempo: false,
      tanggal_jatuh_tempo: null,
      item_count: 0,
      workflow_item_count: 0,
      manual_item_count: 0,
      total_nominal_realisasi: null,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      items: [],
      activity_events: [],
      warnings: [],
      ...overrides,
    },
  }
}
