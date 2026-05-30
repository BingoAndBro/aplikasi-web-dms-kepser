import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const BERKAS_ID = '22222222-2222-4222-8222-222222222222'
const KLASIFIKASI_ID = '33333333-3333-4333-8333-333333333333'

const authMocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
}))

const readModelMocks = vi.hoisted(() => ({
  listBerkasArsipFolders: vi.fn(),
  getBerkasArsipDetail: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: authMocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/lib/archive/berkas-arsip-read-model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/lib/archive/berkas-arsip-read-model')>()

  return {
    ...actual,
    listBerkasArsipFolders: readModelMocks.listBerkasArsipFolders,
    getBerkasArsipDetail: readModelMocks.getBerkasArsipDetail,
  }
})

import {
  buildBerkasItemAttachmentFileUrl,
} from '#/routes/arsiparis/berkas/$id'
import {
  formatBerkasArchiveStatusLabel,
  formatBerkasStatusLabel,
  formatItemWarningLabel,
  formatSourceTypeLabel,
} from '#/lib/archive/berkas-arsip-page-format'
import { Route as BerkasListRoute } from '#/routes/api/arsiparis/berkas/index'
import { Route as BerkasDetailRoute } from '#/routes/api/arsiparis/berkas/$id'

type RouteGetHandler = (args: {
  request: Request
  params?: Record<string, string>
}) => Promise<Response>

const listGetHandler = (BerkasListRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

const detailGetHandler = (BerkasDetailRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

describe('folder-first berkas archive read API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    authMocks.getLocalServerSession.mockResolvedValue(createSession(['KEPALA_SUB_BAGIAN_UMUM']))
    readModelMocks.listBerkasArsipFolders.mockResolvedValue(listResult())
    readModelMocks.getBerkasArsipDetail.mockResolvedValue({
      status: 'found',
      detail: detailResult(),
    })
  })

  it('requires local dms_session and assigned KEPALA_SUB_BAGIAN_UMUM for list reads', async () => {
    authMocks.getLocalServerSession.mockResolvedValueOnce(null)

    const unauthenticated = await listGetHandler({
      request: new Request('http://localhost/api/arsiparis/berkas'),
    })

    expect(unauthenticated.status).toBe(401)
    expect(await unauthenticated.json()).toEqual({ error: 'Unauthorized' })
    expect(readModelMocks.listBerkasArsipFolders).not.toHaveBeenCalled()

    authMocks.getLocalServerSession.mockResolvedValueOnce(createSession(['ADMIN']))

    const adminOnly = await listGetHandler({
      request: new Request('http://localhost/api/arsiparis/berkas'),
    })

    expect(adminOnly.status).toBe(403)
    expect(await adminOnly.json()).toEqual({ error: 'Akses ditolak' })
    expect(readModelMocks.listBerkasArsipFolders).not.toHaveBeenCalled()
  })

  it('passes validated active-folder filters to the Phase 13N read model', async () => {
    const response = await listGetHandler({
      request: new Request('http://localhost/api/arsiparis/berkas?status_berkas=CLOSED&status_arsip=AKTIF'),
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(readModelMocks.listBerkasArsipFolders).toHaveBeenCalledWith({
      status_berkas: 'CLOSED',
      status_arsip: 'AKTIF',
    })
    expect(body.berkas[0]).toMatchObject({
      berkas_id: BERKAS_ID,
      status_berkas: 'CLOSED',
      status_arsip: 'AKTIF',
      item_count: 2,
    })
    expectNoSensitiveOutput(body)
    expect(JSON.stringify(body)).not.toContain('closed_by')
  })

  it('passes OPEN berkas filters with null archive status to the Phase 13N read model', async () => {
    readModelMocks.listBerkasArsipFolders.mockResolvedValueOnce(listResult({
      row: openFolderRow(),
      summary: {
        total_rows_returned: 1,
        status_berkas_counts: { OPEN: 1 },
        status_arsip_counts: { UNKNOWN: 1 },
        item_count_total: 1,
        workflow_item_count_total: 1,
        manual_item_count_total: 0,
        total_nominal_realisasi: 1000000,
        applied_limit: 100,
        applied_offset: 0,
      },
    }))

    const response = await listGetHandler({
      request: new Request('http://localhost/api/arsiparis/berkas?status_berkas=OPEN&status_arsip=null'),
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(readModelMocks.listBerkasArsipFolders).toHaveBeenCalledWith({
      status_berkas: 'OPEN',
      status_arsip: null,
    })
    expect(body.berkas[0]).toMatchObject({
      status_berkas: 'OPEN',
      status_arsip: null,
      nomor_spm: null,
    })
    expectNoSensitiveOutput(body)
  })

  it('returns OPEN folder detail DTOs without requiring final metadata', async () => {
    readModelMocks.getBerkasArsipDetail.mockResolvedValueOnce({
      status: 'found',
      detail: {
        ...openFolderRow(),
        items: [],
        warnings: ['OPEN_STATUS_ARSIP_NULL'],
      },
    })

    const response = await detailGetHandler({
      request: new Request(`http://localhost/api/arsiparis/berkas/${BERKAS_ID}`),
      params: { id: BERKAS_ID },
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.berkas).toMatchObject({
      status_berkas: 'OPEN',
      status_arsip: null,
      nomor_spm: null,
      retensi_aktif: null,
      retensi_inaktif: null,
      warnings: ['OPEN_STATUS_ARSIP_NULL'],
    })
    expectNoSensitiveOutput(body)
  })

  it('rejects invalid list filters before read model work', async () => {
    const response = await listGetHandler({
      request: new Request('http://localhost/api/arsiparis/berkas?status_arsip=TERHAPUS'),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Filter daftar berkas tidak valid' })
    expect(readModelMocks.listBerkasArsipFolders).not.toHaveBeenCalled()
  })

  it('returns safe detail DTOs from getBerkasArsipDetail with internal file keys but no bridge ids', async () => {
    const response = await detailGetHandler({
      request: new Request(`http://localhost/api/arsiparis/berkas/${BERKAS_ID}`),
      params: { id: BERKAS_ID },
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(readModelMocks.getBerkasArsipDetail).toHaveBeenCalledWith(BERKAS_ID)
    expect(body.berkas.items[0]).toMatchObject({
      item_key: 'item-1',
      item_file_key: '44444444-4444-4444-8444-444444444444',
      source_type: 'WORKFLOW',
      source_title: 'Laporan Pembayaran',
    })
    expectNoSensitiveOutput(body)
    expect(JSON.stringify(body)).not.toContain('item_id')
    expect(JSON.stringify(body)).not.toContain('canonical_arsip_id')
    expect(JSON.stringify(body)).not.toContain('closed_by')
  })

  it('returns 404 for missing folder detail', async () => {
    readModelMocks.getBerkasArsipDetail.mockResolvedValueOnce({ status: 'not_found' })

    const response = await detailGetHandler({
      request: new Request(`http://localhost/api/arsiparis/berkas/${BERKAS_ID}`),
      params: { id: BERKAS_ID },
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Berkas tidak ditemukan' })
  })
})

describe('folder-first berkas archive page formatting', () => {
  it('uses friendly labels for folder and item display states', () => {
    expect(formatBerkasStatusLabel('OPEN')).toBe('Berkas terbuka')
    expect(formatBerkasStatusLabel('CLOSED')).toBe('Berkas ditutup')
    expect(formatBerkasArchiveStatusLabel(null, 'OPEN')).toBe('Belum final')
    expect(formatBerkasArchiveStatusLabel(null, 'CLOSED')).toBe('Status arsip belum tersedia')
    expect(formatBerkasArchiveStatusLabel('AKTIF', 'CLOSED')).toBe('Aktif')
    expect(formatSourceTypeLabel('WORKFLOW')).toBe('Workflow')
    expect(formatSourceTypeLabel('MANUAL')).toBe('Manual')
    expect(formatItemWarningLabel('SOURCE_NOT_FOUND')).toBe('Data sumber tidak ditemukan')
  })

  it('builds folder item file-action URLs without raw logical paths', () => {
    const href = buildBerkasItemAttachmentFileUrl(
      BERKAS_ID,
      '44444444-4444-4444-8444-444444444444',
      0,
      'preview',
    )

    expect(href).toBe(
      `/api/arsiparis/berkas/${BERKAS_ID}/items/44444444-4444-4444-8444-444444444444/preview/0`,
    )
    expect(href).not.toContain('logical_path')
    expect(href).not.toContain('storage')
    expect(href).not.toContain('token')
  })
})

function createSession(roles: string[]) {
  return {
    user: {
      id: USER_ID,
      email: 'user@example.test',
    },
    userId: USER_ID,
    email: 'user@example.test',
    roles,
    activeRole: roles[0],
    sessionId: 'test-session-id',
  }
}

function listResult(options: {
  row?: ReturnType<typeof folderRow> | ReturnType<typeof openFolderRow>
  summary?: Record<string, unknown>
} = {}) {
  return {
    rows: [options.row ?? folderRow()],
    summary: options.summary ?? listSummary(),
  }
}

function listSummary() {
  return {
    total_rows_returned: 1,
    status_berkas_counts: { CLOSED: 1 },
    status_arsip_counts: { AKTIF: 1 },
    item_count_total: 2,
    workflow_item_count_total: 1,
    manual_item_count_total: 1,
    total_nominal_realisasi: 1250000,
    applied_limit: 100,
    applied_offset: 0,
  }
}

function detailResult() {
  return {
    ...folderRow(),
    items: [
      {
        item_id: '44444444-4444-4444-8444-444444444444',
        source_type: 'WORKFLOW',
        source_title: 'Laporan Pembayaran',
        source_date: '2026-05-20',
        source_nominal_realisasi: 1000000,
        source_created_by_display_name: 'Pegawai Workflow',
        attachment_count: 2,
        has_attachments: true,
        workflow: {
          title: 'Laporan Pembayaran',
          status: 'ARCHIVED',
          current_step: null,
          fungsi_nama: 'Fungsi Keuangan',
          kegiatan_nama: 'Kegiatan Pembayaran',
        },
        manual: null,
        warnings: [],
      },
    ],
    warnings: [],
  }
}

function folderRow() {
  return {
    berkas_id: BERKAS_ID,
    klasifikasi_id: KLASIFIKASI_ID,
    klasifikasi_kode_snapshot: 'BB',
    klasifikasi_nama_snapshot: 'Belanja Barang',
    status_berkas: 'CLOSED',
    status_arsip: 'AKTIF',
    nomor_spm: 'SPM-001/2026',
    retensi_aktif: '1 Tahun',
    retensi_inaktif: '3 Tahun',
    masa_aktif_berakhir: '2027-05-29',
    masa_inaktif_berakhir: '2030-05-29',
    closed_at: '2026-05-29T00:00:00.000Z',
    closed_by: USER_ID,
    item_count: 2,
    workflow_item_count: 1,
    manual_item_count: 1,
    total_nominal_realisasi: 1250000,
    created_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:00:00.000Z',
  }
}

function openFolderRow() {
  return {
    ...folderRow(),
    status_berkas: 'OPEN',
    status_arsip: null,
    nomor_spm: null,
    retensi_aktif: null,
    retensi_inaktif: null,
    masa_aktif_berakhir: null,
    masa_inaktif_berakhir: null,
    closed_at: null,
    closed_by: null,
    item_count: 1,
    workflow_item_count: 1,
    manual_item_count: 0,
    total_nominal_realisasi: 1000000,
  }
}

function expectNoSensitiveOutput(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain(USER_ID)
  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('logicalPath')
  expect(serialized).not.toContain('physical_path')
  expect(serialized).not.toContain('original_filename')
  expect(serialized).not.toContain('signedUrl')
  expect(serialized).not.toContain('signed_url')
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('secret')
  expect(serialized).not.toContain('D:\\')
  expect(serialized).not.toContain('/storage/')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('session')
  expect(serialized).not.toContain('cookie')
  expect(serialized).not.toContain('raw')
  expect(serialized).not.toContain('SQL')
}
