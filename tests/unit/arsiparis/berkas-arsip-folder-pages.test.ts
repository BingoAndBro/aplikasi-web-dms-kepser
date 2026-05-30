import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

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
  buildCloseBerkasRequestBody,
  buildBerkasItemAttachmentFileUrl,
  canShowCloseBerkasForm,
  isBerkasEmptyForClose,
} from '#/routes/arsiparis/berkas/$id'
import {
  formatBerkasArchiveStatusLabel,
  formatBerkasStatusLabel,
  formatItemWarningLabel,
  resolveBerkasLifecycleAction,
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

  it.each([
    ['INAKTIF', 'Arsip Inaktif'],
    ['USUL_MUSNAH', 'Usul Musnah'],
    ['DIMUSNAHKAN', 'Dimusnahkan'],
  ] as const)('passes CLOSED %s filters for folder-first visibility', async (statusArsip) => {
    readModelMocks.listBerkasArsipFolders.mockResolvedValueOnce(listResult({
      row: folderRow({ status_arsip: statusArsip }),
      summary: listSummary({ status_arsip_counts: { [statusArsip]: 1 } }),
    }))

    const response = await listGetHandler({
      request: new Request(`http://localhost/api/arsiparis/berkas?status_berkas=CLOSED&status_arsip=${statusArsip}`),
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(readModelMocks.listBerkasArsipFolders).toHaveBeenCalledWith({
      status_berkas: 'CLOSED',
      status_arsip: statusArsip,
    })
    expect(body.berkas[0]).toMatchObject({
      status_berkas: 'CLOSED',
      status_arsip: statusArsip,
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
      attachments: [
        {
          label: 'Bukti Pembayaran',
          previewTitle: 'Bukti Pembayaran_Detail Pembayaran_Kegiatan Pembayaran_2026-05-20.pdf',
          downloadFilename: 'Bukti Pembayaran_Detail Pembayaran_Kegiatan Pembayaran_2026-05-20.pdf',
        },
      ],
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

  it('resolves lifecycle buttons only for valid CLOSED folder statuses', () => {
    expect(resolveBerkasLifecycleAction('CLOSED', 'AKTIF')).toMatchObject({
      action: 'mark_inactive',
      label: 'Jadikan Inaktif',
    })
    expect(resolveBerkasLifecycleAction('CLOSED', 'INAKTIF')).toMatchObject({
      action: 'propose_destruction',
      label: 'Usulkan Musnah',
    })
    expect(resolveBerkasLifecycleAction('CLOSED', 'USUL_MUSNAH')).toMatchObject({
      action: 'approve_destruction',
      label: 'Musnahkan Data',
    })
    expect(resolveBerkasLifecycleAction('CLOSED', 'DIMUSNAHKAN')).toBeNull()
    expect(resolveBerkasLifecycleAction('OPEN', null)).toBeNull()
    expect(resolveBerkasLifecycleAction('CLOSED', null)).toBeNull()
    expect(resolveBerkasLifecycleAction('CLOSED', 'USUL_MUSNAH')?.confirmation)
      .toContain('File fisik tidak dihapus pada fase ini')
    expect(resolveBerkasLifecycleAction('CLOSED', 'USUL_MUSNAH')?.confirmationPhrase)
      .toBe('MUSNAHKAN DATA FILE')
  })

  it('shows close berkas form controls only for OPEN folder details', () => {
    expect(canShowCloseBerkasForm({ status_berkas: 'OPEN', status_arsip: null })).toBe(true)
    expect(canShowCloseBerkasForm({ status_berkas: 'CLOSED', status_arsip: 'AKTIF' })).toBe(false)
    expect(canShowCloseBerkasForm({ status_berkas: 'CLOSED', status_arsip: 'INAKTIF' })).toBe(false)
    expect(canShowCloseBerkasForm({ status_berkas: 'CLOSED', status_arsip: 'USUL_MUSNAH' })).toBe(false)
    expect(canShowCloseBerkasForm({ status_berkas: 'CLOSED', status_arsip: 'DIMUSNAHKAN' })).toBe(false)
    expect(canShowCloseBerkasForm({ status_berkas: 'CLOSED', status_arsip: null })).toBe(false)
  })

  it('blocks close submission for empty OPEN berkas details', () => {
    expect(isBerkasEmptyForClose({ item_count: 0, items: [] })).toBe(true)
    expect(isBerkasEmptyForClose({ item_count: 1, items: [] })).toBe(true)
    expect(isBerkasEmptyForClose({ item_count: 0, items: [{} as any] })).toBe(true)
    expect(isBerkasEmptyForClose({ item_count: 1, items: [{} as any] })).toBe(false)
  })

  it('builds close request bodies with existing close API field names', () => {
    expect(buildCloseBerkasRequestBody({
      nomor_spm: '  SPM-001/2026  ',
      retensi_aktif: '1 Tahun',
      retensi_inaktif: '3 Tahun',
      closed_at: '2026-05-30',
    })).toEqual({
      nomor_spm: 'SPM-001/2026',
      retensi_aktif: '1 Tahun',
      retensi_inaktif: '3 Tahun',
      closed_at: '2026-05-30',
    })

    expect(buildCloseBerkasRequestBody({
      nomor_spm: 'SPM-002/2026',
      retensi_aktif: '5 Tahun',
      retensi_inaktif: '10 Tahun',
      closed_at: '',
    })).toEqual({
      nomor_spm: 'SPM-002/2026',
      retensi_aktif: '5 Tahun',
      retensi_inaktif: '10 Tahun',
    })
  })

  it('keeps the active folder page constrained to open and active sections', () => {
    const listSource = readFileSync('src/routes/arsiparis/berkas/index.tsx', 'utf8')
    const detailSource = readFileSync('src/routes/arsiparis/berkas/$id.tsx', 'utf8')
    const legacyDetailSource = readFileSync('src/routes/arsiparis/arsip/$id.tsx', 'utf8')
    const closeDialogSource = readFileSync('src/routes/arsiparis/berkas/-components/CloseBerkasDialog.tsx', 'utf8')
    const formatSource = readFileSync('src/lib/archive/berkas-arsip-page-format.ts', 'utf8')
    const legacyActiveSource = readFileSync('src/routes/arsiparis/aktif/index.tsx', 'utf8')
    const dashboardSource = readFileSync('src/routes/arsiparis/index.tsx', 'utf8')
    const searchSource = readFileSync('src/routes/arsiparis/search.tsx', 'utf8')
    const inactiveSource = readFileSync('src/routes/arsiparis/inaktif/index.tsx', 'utf8')
    const proposedSource = readFileSync('src/routes/arsiparis/usul-musnah/index.tsx', 'utf8')

    expect(listSource).toContain('Berkas Terbuka')
    expect(listSource).toContain('Pemberkasan Arsip Aktif')
    expect(listSource).toContain('Export CSV')
    expect(listSource).toContain('createBerkasFolderListCsv')
    expect(listSource).toContain('Tidak ada data untuk diekspor.')
    expect(listSource).toContain('CloseBerkasDialog')
    expect(listSource).toContain('CloseBerkasShortcutButton')
    expect(listSource).toContain("mode === 'open'")
    expect(listSource).toContain('/close')
    expect(listSource).toContain('await fetchData()')
    expect(listSource).toContain('setCloseDialogFolder(null)')
    expect(listSource).toContain('Berkas berhasil ditutup dan menjadi Arsip Aktif.')
    expect(listSource).not.toContain('Arsip Inaktif')
    expect(listSource).not.toContain('Usul Musnah')
    expect(listSource).not.toContain('Dimusnahkan')

    expect(formatSource).toContain('Jadikan Inaktif')
    expect(formatSource).toContain('Usulkan Musnah')
    expect(formatSource).toContain('Musnahkan Data')
    expect(formatSource).toContain('MUSNAHKAN DATA FILE')
    expect(detailSource).toContain('BERKAS_DESTRUCTION_CONFIRMATION_PHRASE')
    expect(detailSource).toContain('File fisik tidak dihapus pada fase ini')
    expect(detailSource).toContain('Metadata berkas dan dokumen tetap tersimpan')
    expect(detailSource).toContain('disabled={!canSubmitDestruction}')
    expect(detailSource).toContain('Export Daftar Dokumen CSV')
    expect(detailSource).toContain('createBerkasDetailItemsCsv')
    expect(detailSource).toContain('Data file sudah dimusnahkan')
    expect(detailSource).toContain("statusArsip === 'DIMUSNAHKAN'")
    expect(detailSource).toContain('attachment?.label')
    expect(detailSource).toContain('attachment?.previewTitle')
    expect(detailSource).toContain('Tutup Berkas')
    expect(detailSource).toContain('/close')
    expect(detailSource).toContain('buildCloseBerkasRequestBody(closeForm)')
    expect(detailSource).toContain('setActionSuccess')
    expect(detailSource).toContain('await fetchData()')
    expect(detailSource).toContain('CloseBerkasDialog')
    expect(detailSource).toContain('setCloseDialogOpen(true)')
    expect(detailSource).toContain('setCloseDialogOpen(false)')
    expect(detailSource).toContain('EMPTY_BERKAS_CLOSE_MESSAGE')
    expect(detailSource).not.toContain('bg-emerald-50/50 p-4')
    expect(detailSource).not.toContain('File fisik dihapus')

    expect(legacyDetailSource).toContain('Kembali ke Pemberkasan Arsip Aktif')
    expect(legacyDetailSource).toContain('Detail kanonis read-only berdasarkan arsip.arsip.id.')

    expect(legacyActiveSource).toContain("createFileRoute('/arsiparis/aktif/')")
    expect(legacyActiveSource).toContain("redirect({ to: '/arsiparis/berkas', replace: true })")
    expect(legacyActiveSource).not.toContain("apiFetch<ArsipAktifResponse>('/arsiparis/aktif')")
    expect(legacyActiveSource).not.toContain('Daftar Arsip Aktif')
    expect(legacyActiveSource).not.toContain('/api/arsiparis/arsip/export?status=AKTIF')

    expect(dashboardSource).toContain("label: 'Pemberkasan Arsip Aktif'")
    expect(dashboardSource).toContain("apiFetch<BerkasStatsResponse>('/arsiparis/berkas'")
    expect(dashboardSource).toContain("status_berkas: 'CLOSED'")
    expect(dashboardSource).toContain("status_arsip: 'AKTIF'")
    expect(dashboardSource).toContain("window.location.href = '/arsiparis/berkas'")
    expect(dashboardSource).not.toContain("window.location.href = '/arsiparis/aktif'")

    expect(searchSource).toContain("if (a.status_arsip === 'AKTIF') return '/arsiparis/arsip/' + a.id")
    expect(searchSource).not.toContain("if (a.status_arsip === 'AKTIF') return '/arsiparis/aktif/' + a.id")

    expect(inactiveSource).toContain("createFileRoute('/arsiparis/inaktif/')")
    expect(inactiveSource).toContain("apiFetch<BerkasFolderListResponse>('/arsiparis/berkas'")
    expect(inactiveSource).toContain("status_berkas: 'CLOSED'")
    expect(inactiveSource).toContain("status_arsip: 'INAKTIF'")
    expect(inactiveSource).toContain("body: JSON.stringify({ action: 'propose_destruction' })")
    expect(inactiveSource).toContain('Usulkan Musnah')
    expect(inactiveSource).toContain('Folder-first untuk berkas yang sudah ditutup dan berstatus arsip Inaktif.')
    expect(inactiveSource).toContain('File fisik tidak dihapus.')
    expect(inactiveSource).toContain('to="/arsiparis/berkas/$id"')
    expect(inactiveSource).not.toContain("apiFetch<ArsipInaktifResponse>('/arsiparis/inaktif')")
    expect(inactiveSource).not.toContain('to="/arsiparis/arsip/$id"')

    expect(proposedSource).toContain("createFileRoute('/arsiparis/usul-musnah/')")
    expect(proposedSource).toContain("apiFetch<BerkasFolderListResponse>('/arsiparis/berkas'")
    expect(proposedSource).toContain("status_berkas: 'CLOSED'")
    expect(proposedSource).toContain("status_arsip: 'USUL_MUSNAH'")
    expect(proposedSource).toContain("action: 'approve_destruction'")
    expect(proposedSource).toContain('BERKAS_DESTRUCTION_CONFIRMATION_PHRASE')
    expect(formatSource).toContain("BERKAS_DESTRUCTION_CONFIRMATION_PHRASE = 'MUSNAHKAN DATA FILE'")
    expect(proposedSource).toContain('disabled={!canSubmitDestruction}')
    expect(proposedSource).toContain('Musnahkan Data')
    expect(proposedSource).toContain('Status berkas akan menjadi Dimusnahkan.')
    expect(proposedSource).toContain('Preview dan download file akan diblokir.')
    expect(proposedSource).toContain('File fisik tidak dihapus pada fase ini.')
    expect(proposedSource).toContain('Metadata berkas dan dokumen tetap tersimpan.')
    expect(proposedSource).toContain('to="/arsiparis/berkas/$id"')
    expect(proposedSource).not.toContain("apiFetch<UsulMusnahResponse>('/arsiparis/usul-musnah')")
    expect(proposedSource).not.toContain('to="/arsiparis/arsip/$id"')

    expect(existsSync('src/routes/arsiparis/dimusnahkan')).toBe(false)
    expect(existsSync('src/routes/arsiparis/dimusnahkan.tsx')).toBe(false)
    expect(existsSync('src/routes/api/arsiparis/dimusnahkan.ts')).toBe(false)

    expect(closeDialogSource).toContain('Dialog')
    expect(closeDialogSource).toContain('DialogContent')
    expect(closeDialogSource).toContain('Tutup Berkas')
    expect(closeDialogSource).toContain('Berkas belum memiliki dokumen. Tambahkan dokumen terlebih dahulu sebelum menutup berkas.')
    expect(closeDialogSource).toContain('Berkas akan difinalisasi menjadi Arsip Aktif.')
    expect(closeDialogSource).toContain('Setelah ditutup, Jenis Pembayaran ini tidak bisa menerima dokumen baru.')
    expect(closeDialogSource).toContain('Dokumen dan file fisik tidak dihapus.')
    expect(closeDialogSource).toContain('Status berkas menjadi Ditutup dan status arsip menjadi Aktif.')
    expect(closeDialogSource).toContain('Nomor SPM')
    expect(closeDialogSource).toContain('Retensi Aktif')
    expect(closeDialogSource).toContain('Retensi Inaktif')
    expect(closeDialogSource).toContain('Tanggal Tutup')
    expect(closeDialogSource).toContain('nomor_spm')
    expect(closeDialogSource).toContain('retensi_aktif')
    expect(closeDialogSource).toContain('retensi_inaktif')
    expect(closeDialogSource).toContain('closed_at')
    expect(closeDialogSource).toContain('Finalisasi Berkas')
    expect(closeDialogSource).not.toContain('File fisik dihapus')
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

function listSummary(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
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
        attachments: [
          {
            label: 'Bukti Pembayaran',
            previewTitle: 'Bukti Pembayaran_Detail Pembayaran_Kegiatan Pembayaran_2026-05-20.pdf',
            downloadFilename: 'Bukti Pembayaran_Detail Pembayaran_Kegiatan Pembayaran_2026-05-20.pdf',
          },
        ],
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

function folderRow(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
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
