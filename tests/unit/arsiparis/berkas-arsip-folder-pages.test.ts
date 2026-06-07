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

const serviceMocks = vi.hoisted(() => ({
  updateActiveBerkasMetadata: vi.fn(),
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

vi.mock('#/lib/archive/berkas-arsip-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/lib/archive/berkas-arsip-service')>()

  return {
    ...actual,
    updateActiveBerkasMetadata: serviceMocks.updateActiveBerkasMetadata,
  }
})

import {
  buildCloseBerkasRequestBody,
  buildBerkasItemAttachmentFileUrl,
  buildBerkasHistoryItems,
  canEditActiveMetadata,
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
  options: { server: { handlers: { GET: RouteGetHandler; PATCH: RouteGetHandler } } }
}).options.server.handlers.GET
const detailPatchHandler = (BerkasDetailRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler; PATCH: RouteGetHandler } } }
}).options.server.handlers.PATCH

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
    serviceMocks.updateActiveBerkasMetadata.mockResolvedValue({
      id: BERKAS_ID,
      klasifikasi_id: KLASIFIKASI_ID,
      klasifikasi_kode_snapshot: 'BB',
      klasifikasi_nama_snapshot: 'Belanja Barang',
      status_berkas: 'CLOSED',
      status_arsip: 'AKTIF',
      nomor_spm: 'SPM-EDIT-001',
      retensi_aktif: '3 Tahun',
      retensi_inaktif: '5 Tahun',
      masa_aktif_berakhir: '2029-05-29',
      masa_inaktif_berakhir: '2034-05-29',
      closed_at: '2026-05-29T00:00:00.000Z',
      closed_by: USER_ID,
      created_by: USER_ID,
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
    expect(JSON.stringify(body)).not.toContain(['canonical', 'arsip', 'id'].join('_'))
    expect(JSON.stringify(body)).not.toContain('closed_by')
  })

  it('updates active archive metadata through existing detail API PATCH guard', async () => {
    const response = await detailPatchHandler({
      request: new Request(`http://localhost/api/arsiparis/berkas/${BERKAS_ID}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
        },
        body: JSON.stringify({
          nomor_spm: 'SPM-EDIT-001',
          retensi_aktif: '3 Tahun',
          retensi_inaktif: '5 Tahun',
          closed_at: '2026-06-01',
        }),
      }),
      params: { id: BERKAS_ID },
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(serviceMocks.updateActiveBerkasMetadata).toHaveBeenCalledWith({
      berkasId: BERKAS_ID,
      metadata: {
        nomor_spm: 'SPM-EDIT-001',
        retensi_aktif: '3 Tahun',
        retensi_inaktif: '5 Tahun',
        closed_at: '2026-06-01',
      },
    })
    expect(body.berkas).toMatchObject({
      id: BERKAS_ID,
      status_berkas: 'CLOSED',
      status_arsip: 'AKTIF',
      nomor_spm: 'SPM-EDIT-001',
      closed_at: '2026-05-29T00:00:00.000Z',
    })
    expectNoSensitiveOutput(body)
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
    expect(formatSourceTypeLabel('WORKFLOW')).toBe('Persetujuan')
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
      .toContain('File fisik terkait berkas akan dihapus')
    expect(resolveBerkasLifecycleAction('CLOSED', 'USUL_MUSNAH')?.confirmation)
      .toContain('Preview dan download file tidak akan tersedia setelah pemusnahan')
    expect(resolveBerkasLifecycleAction('CLOSED', 'USUL_MUSNAH')?.confirmation)
      .toContain('Metadata berkas dan dokumen tetap tersimpan')
    expect(resolveBerkasLifecycleAction('CLOSED', 'USUL_MUSNAH')?.confirmation)
      .toContain('Aksi ini tidak mudah dibalik')
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

  it('shows edit metadata only for CLOSED AKTIF folder details', () => {
    expect(canEditActiveMetadata({ status_berkas: 'CLOSED', status_arsip: 'AKTIF' })).toBe(true)
    expect(canEditActiveMetadata({ status_berkas: 'OPEN', status_arsip: null })).toBe(false)
    expect(canEditActiveMetadata({ status_berkas: 'CLOSED', status_arsip: 'INAKTIF' })).toBe(false)
    expect(canEditActiveMetadata({ status_berkas: 'CLOSED', status_arsip: 'USUL_MUSNAH' })).toBe(false)
    expect(canEditActiveMetadata({ status_berkas: 'CLOSED', status_arsip: 'DIMUSNAHKAN' })).toBe(false)
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

  it('builds folder-first activity history from supported berkas timestamps', () => {
    const history = buildBerkasHistoryItems({
      ...detailResult(),
      status_arsip: 'DIMUSNAHKAN',
      created_at: '2026-05-22T07:00:00.000Z',
      closed_at: '2026-05-29T00:00:00.000Z',
      updated_at: '2026-05-30T10:45:00.000Z',
      items: [
        {
          ...detailResult().items[0],
          source_type: 'WORKFLOW',
          source_title: 'Dokumen Persetujuan A',
          source_date: '2026-05-20',
          item_added_at: '2026-05-22T08:30:00.000Z',
        },
        {
          ...detailResult().items[0],
          source_type: 'MANUAL',
          source_title: 'Dokumen Manual B',
          source_date: '2026-05-21',
          item_added_at: '2026-05-22T09:15:00.000Z',
          workflow: null,
          manual: {
            nama: 'Dokumen Manual B',
            category_name: 'Pengadaan',
            keterangan: 'Aman',
          },
        },
      ],
    } as any)

    expect(history.map((item) => item.label)).toEqual([
      'Berkas dibuka',
      'Dokumen Persetujuan diklasifikasikan',
      'Penambahan dokumen manual sukses',
      'Berkas ditutup',
      'Berkas dimusnahkan',
    ])
    expect(JSON.stringify(history)).not.toContain('Dokumen selesai persetujuan PPSPM')
    expect(JSON.stringify(history)).not.toContain('Workflow')
    expect(history.at(-1)?.label).toBe('Berkas dimusnahkan')
  })

  it('sorts berkas opened before manual insertion before close when close is date-only', () => {
    const history = buildBerkasHistoryItems({
      ...detailResult(),
      status_arsip: 'AKTIF',
      created_at: '2026-05-29T07:00:00.000Z',
      closed_at: '2026-05-29T00:00:00.000Z',
      updated_at: '2026-05-29T00:00:00.000Z',
      items: [
        {
          ...detailResult().items[0],
          source_type: 'MANUAL',
          source_title: 'Dokumen Manual A',
          item_added_at: '2026-05-29T08:15:00.000Z',
          workflow: null,
          manual: {
            nama: 'Dokumen Manual A',
            category_name: 'Pengadaan',
            keterangan: 'Aman',
          },
        },
      ],
    } as any)

    expect(history.map((item) => item.label)).toEqual([
      'Berkas dibuka',
      'Penambahan dokumen manual sukses',
      'Berkas ditutup',
    ])
    expect(history.find((item) => item.label === 'Berkas ditutup')?.timestampLabel)
      .not.toMatch(/\b00[:.][0]{2}\b/)
  })

  it('sorts classified Persetujuan documents after berkas opened and before close', () => {
    const history = buildBerkasHistoryItems({
      ...detailResult(),
      status_arsip: 'AKTIF',
      created_at: '2026-05-29T10:00:00.000Z',
      closed_at: '2026-05-29T00:00:00.000Z',
      updated_at: '2026-05-29T00:00:00.000Z',
      items: [
        {
          ...detailResult().items[0],
          source_type: 'WORKFLOW',
          source_title: 'Dokumen Persetujuan A',
          item_added_at: '2026-05-29T11:30:00.000Z',
        },
      ],
    } as any)

    expect(history.map((item) => item.label)).toEqual([
      'Berkas dibuka',
      'Dokumen Persetujuan diklasifikasikan',
      'Berkas ditutup',
    ])
    expect(formatSourceTypeLabel('WORKFLOW')).toBe('Persetujuan')
    expect(JSON.stringify(history)).not.toContain('Workflow')
  })

  it('keeps destroyed berkas terminal even when current-status timestamp is earlier than item timestamps', () => {
    const history = buildBerkasHistoryItems({
      ...detailResult(),
      status_arsip: 'DIMUSNAHKAN',
      created_at: '2026-05-29T07:00:00.000Z',
      closed_at: '2026-05-29T00:00:00.000Z',
      updated_at: '2026-05-29T00:00:00.000Z',
      items: [
        {
          ...detailResult().items[0],
          source_type: 'WORKFLOW',
          source_title: 'Dokumen Persetujuan A',
          item_added_at: '2026-05-29T08:00:00.000Z',
        },
        {
          ...detailResult().items[0],
          source_type: 'MANUAL',
          source_title: 'Dokumen Manual B',
          item_added_at: '2026-05-29T09:00:00.000Z',
          workflow: null,
          manual: {
            nama: 'Dokumen Manual B',
            category_name: 'Pengadaan',
            keterangan: 'Aman',
          },
        },
      ],
    } as any)

    expect(history.map((item) => item.label)).toEqual([
      'Berkas dibuka',
      'Dokumen Persetujuan diklasifikasikan',
      'Penambahan dokumen manual sukses',
      'Berkas ditutup',
      'Berkas dimusnahkan',
    ])
    expect(history.at(-1)?.label).toBe('Berkas dimusnahkan')
    expect(JSON.stringify(history.slice(history.findIndex((item) => item.label === 'Berkas dimusnahkan') + 1)))
      .toBe('[]')
  })

  it('keeps exact destroyed-file and destruction-confirmation phrases in folder detail surfaces', () => {
    const detailSource = readFileSync('src/routes/arsiparis/berkas/$id.tsx', 'utf8')
    const formatSource = readFileSync('src/lib/archive/berkas-arsip-page-format.ts', 'utf8')

    expect(detailSource).toContain('Data file sudah dimusnahkan')
    expect(formatSource).toContain("BERKAS_DESTRUCTION_CONFIRMATION_PHRASE = 'MUSNAHKAN DATA FILE'")
  })

  it('keeps the active folder page constrained to open and active sections', () => {
    const listSource = readFileSync('src/routes/arsiparis/berkas/index.tsx', 'utf8')
    const detailSource = readFileSync('src/routes/arsiparis/berkas/$id.tsx', 'utf8')
    const closeDialogSource = readFileSync('src/routes/arsiparis/berkas/-components/CloseBerkasDialog.tsx', 'utf8')
    const formatSource = readFileSync('src/lib/archive/berkas-arsip-page-format.ts', 'utf8')
    const dashboardSource = readFileSync('src/routes/arsiparis/index.tsx', 'utf8')
    const inactiveSource = readFileSync('src/routes/arsiparis/inaktif/index.tsx', 'utf8')
    const proposedSource = readFileSync('src/routes/arsiparis/usul-musnah/index.tsx', 'utf8')
    const headerSource = readFileSync('src/components/layout/AppHeader.tsx', 'utf8')
    const navigationSource = readFileSync('src/config/navigation.ts', 'utf8')
    const routesSource = readFileSync('src/lib/constants/routes.ts', 'utf8')
    const routeTreeSource = readFileSync('src/routeTree.gen.ts', 'utf8')

    expect(listSource).toContain("value: 'all', label: 'Semua'")
    expect(listSource).toContain("value: 'open', label: 'Terbuka'")
    expect(listSource).toContain("value: 'active', label: 'Arsip Aktif'")
    expect(listSource).toContain('Pemberkasan Arsip Aktif')
    expect(listSource).toContain('Cari Jenis Pembayaran...')
    expect(listSource).toContain('resultText={`Hasil: ${exportRowCount} berkas`}')
    expect(listSource).toContain('matchesStatusFilter(folder, statusFilter)')
    expect(listSource).toContain('<BerkasUnifiedSection')
    expect(listSource).toContain('Tidak ada data yang cocok dengan pencarian.')
    expect(listSource).toContain('filterBerkasFolders(visibleFolders, searchQuery)')
    expect(listSource).toContain('folders={filteredFolders}')
    expect(listSource).toContain('Ekspor CSV')
    expect(listSource).toContain('createBerkasFolderListCsv')
    expect(listSource).toContain('Tidak ada data untuk diekspor.')
    expect(listSource).not.toContain('CloseBerkasDialog')
    expect(listSource).not.toContain('CloseBerkasShortcutButton')
    expect(listSource).not.toContain('LifecycleActionButton')
    expect(listSource).toContain('isOpenFolder(folder)')
    expect(listSource).not.toContain('/close')
    expect(listSource).not.toContain('Berkas berhasil ditutup dan menjadi Arsip Aktif.')
    expect(listSource).not.toContain('Arsip Inaktif')
    expect(listSource).not.toContain('Usul Musnah')
    expect(listSource).not.toContain('Dimusnahkan')

    const listSearchSource = extractFunctionBlock(listSource, 'function buildBerkasFolderSearchText')
    expect(listSearchSource).toContain('klasifikasi_kode_snapshot')
    expect(listSearchSource).toContain('klasifikasi_nama_snapshot')
    expect(listSearchSource).toContain('nomor_spm')
    expect(listSearchSource).toContain('item_count')
    expectSafeSearchSource(listSearchSource)

    expect(formatSource).toContain('Jadikan Inaktif')
    expect(formatSource).toContain('Usulkan Musnah')
    expect(formatSource).toContain('Musnahkan Data')
    expect(formatSource).toContain('MUSNAHKAN DATA FILE')
    expect(detailSource).toContain('BERKAS_DESTRUCTION_CONFIRMATION_PHRASE')
    expect(detailSource).toContain('File fisik terkait berkas akan dihapus.')
    expect(detailSource).toContain('Preview dan download file tidak akan tersedia setelah pemusnahan.')
    expect(detailSource).toContain('Aksi ini tidak mudah dibalik.')
    expect(detailSource).toContain('Metadata berkas dan dokumen tetap tersimpan')
    expect(detailSource).toContain('disabled={!canSubmitDestruction}')
    expect(detailSource).toContain("from '#/components/ui/dialog'")
    expect(detailSource).toContain('<Dialog')
    expect(detailSource).toContain('<DialogContent')
    expect(detailSource).toContain('<DialogTitle>Musnahkan Data</DialogTitle>')
    expect(detailSource).toContain('destructionDialogOpen')
    expect(detailSource).toContain('setDestructionDialogOpen(true)')
    expect(detailSource).toContain('setDestructionDialogOpen(false)')
    expect(detailSource).toContain('berkas-detail-destruction-confirmation')
    expect(detailSource).not.toContain('destructionPanelOpen')
    expect(detailSource).not.toContain('setDestructionPanelOpen')
    expect(detailSource).not.toContain('mt-4 rounded-xl border border-error/30 bg-error/5 p-4')
    expect(detailSource).toContain('Ekspor CSV')
    expect(detailSource).toContain('createBerkasDetailItemsCsv')
    expect(detailSource).toContain('DocumentMetadataDialog')
    expect(detailSource).toContain('Detail Dokumen Berkas')
    expect(detailSource).toContain('DocumentItemTable')
    expect(detailSource).toContain('FolderActionPanel')
    expect(detailSource).toContain("label: 'Metadata Berkas'")
    expect(detailSource).toContain("label: 'Metadata Arsip'")
    expect(detailSource).toContain('WorkflowSearchPanel')
    expect(detailSource).toContain("value: 'WORKFLOW', label: 'Persetujuan'")
    expect(detailSource).toContain("value: 'MANUAL', label: 'Manual'")
    expect(detailSource).toContain('Judul Dokumen')
    expect(detailSource).toContain('Sumber')
    expect(detailSource).toContain('Tanggal Dokumen')
    expect(detailSource).toContain('Pengaju / Pembuat')
    expect(detailSource).toContain('Nominal Realisasi')
    expect(detailSource).toContain('canEditActiveMetadata')
    expect(detailSource).toContain('Edit Metadata Arsip Aktif')
    expect(detailSource).toContain("status_berkas === 'CLOSED' && detail.status_arsip === 'AKTIF'")
    expect(detailSource).toContain("method: 'PATCH'")
    expect(detailSource).toContain('Metadata arsip aktif berhasil diperbarui.')
    expect(detailSource).toContain('Edit metadata hanya berlaku untuk Arsip Aktif')
    expect(detailSource).toContain('Tanggal tutup adalah waktu finalisasi berkas dan tidak diubah dari edit metadata.')
    expect(detailSource).not.toContain('Metadata arsip aktif diperbarui')
    expect(detailSource).toContain('Berkas dibuka')
    expect(detailSource).toContain('Dokumen Persetujuan diklasifikasikan')
    expect(detailSource).toContain('Penambahan dokumen manual sukses')
    expect(detailSource).toContain('item_added_at')
    expect(detailSource).toContain('Berkas dipindahkan ke Inaktif')
    expect(detailSource).toContain('Berkas dipindahkan ke Usul Musnah')
    expect(detailSource).toContain('Berkas dimusnahkan')
    expect(detailSource).not.toContain('Dokumen selesai persetujuan PPSPM')
    expect(detailSource).not.toContain('Dokumen diklasifikasikan ke berkas')
    expect(detailSource).not.toContain('File dimusnahkan')
    expect(detailSource).toContain('Data file sudah dimusnahkan')
    expect(detailSource).toContain('formatHistoryDateLabel')
    expect(detailSource).toContain('compareBerkasHistoryItems')
    expect(detailSource).toContain("statusArsip === 'DIMUSNAHKAN'")
    expect(detailSource).toContain('const availableAttachments = item.attachments')
    expect(detailSource).toContain('attachment.label ||')
    expect(detailSource).toContain('attachment.previewTitle || title')
    expect(detailSource).toContain('Tutup Berkas')
    expect(detailSource).toContain('/close')
    expect(detailSource).toContain('buildCloseBerkasRequestBody(closeForm)')
    expect(detailSource).toContain('setActionSuccess')
    expect(detailSource).toContain('useNavigate')
    expect(detailSource).toContain("await navigate({ to: '/arsiparis/berkas' })")
    expect(detailSource).toContain("await navigate({ to: '/arsiparis/inaktif' })")
    expect(detailSource).toContain("await navigate({ to: '/arsiparis/usul-musnah' })")
    expect(detailSource).toContain('CloseBerkasDialog')
    expect(detailSource).toContain('setCloseDialogOpen(true)')
    expect(detailSource).toContain('setCloseDialogOpen(false)')
    expect(detailSource).toContain('EMPTY_BERKAS_CLOSE_MESSAGE')
    expect(detailSource).toContain('Cari dokumen dalam berkas...')
    expect(detailSource).not.toContain('Pencarian lokal dokumen')
    expect(detailSource).toContain('filterBerkasDetailItems(items, searchQuery, sourceFilter)')
    expect(detailSource).toContain('sourceFilter')
    expect(detailSource).toContain('sortOrder')
    expect(detailSource).toContain('createBerkasDetailItemsCsv(filteredItems)')
    expect(detailSource).not.toContain('bg-emerald-50/50 p-4')
    expect(detailSource).not.toContain('File fisik tidak dihapus pada fase ini')

    const detailSearchSource = extractFunctionBlock(detailSource, 'function buildBerkasDetailItemSearchText')
    expect(detailSearchSource).toContain('source_title')
    expect(detailSearchSource).toContain('source_type')
    expect(detailSearchSource).toContain('source_created_by_display_name')
    expect(detailSearchSource).toContain('workflow?.fungsi_nama')
    expect(detailSearchSource).toContain('manual?.category_name')
    expect(detailSearchSource).toContain('attachment.label')
    expect(detailSearchSource).toContain('attachment.previewTitle')
    expect(detailSearchSource).toContain('attachment.downloadFilename')
    expectSafeSearchSource(detailSearchSource)
    expect(detailSearchSource).not.toContain('item_file_key')

    expect(existsSync('src/routes/arsiparis/arsip/$id.tsx')).toBe(false)
    expect(existsSync('src/routes/arsiparis/aktif/index.tsx')).toBe(false)
    expect(existsSync('src/routes/arsiparis/search.tsx')).toBe(false)

    expect(dashboardSource).toContain("label: 'Pemberkasan Arsip Aktif'")
    expect(dashboardSource).toContain("apiFetch<BerkasStatsResponse>('/arsiparis/berkas'")
    expect(dashboardSource).toContain("status_berkas: 'CLOSED'")
    expect(dashboardSource).toContain("status_arsip: 'AKTIF'")
    expect(dashboardSource).toContain("status_arsip: 'INAKTIF'")
    expect(dashboardSource).toContain("status_arsip: 'USUL_MUSNAH'")
    expect(dashboardSource).toContain('inaktif: inaktifJson.summary?.total_rows_returned ?? 0')
    expect(dashboardSource).toContain('usulMusnah: musnahJson.summary?.total_rows_returned ?? 0')
    expect(dashboardSource).toContain("href: '/arsiparis/berkas'")
    expect(dashboardSource).not.toContain("window.location.href = '/arsiparis/aktif'")
    expect(dashboardSource).not.toContain("label: 'Pencarian'")
    expect(dashboardSource).not.toContain("window.location.href = '/arsiparis/search'")
    expect(dashboardSource).not.toContain("apiFetch<InaktifStatsResponse>('/arsiparis/inaktif')")
    expect(dashboardSource).not.toContain("apiFetch<UsulMusnahStatsResponse>('/arsiparis/usul-musnah')")

    expect(navigationSource).not.toContain('laporan_klasifikasi')
    expect(navigationSource).not.toContain('Laporan Klasifikasi Arsip')
    expect(navigationSource).not.toContain('LAPORAN_KLASIFIKASI')
    expect(routesSource).not.toContain('LAPORAN_KLASIFIKASI')
    expect(routesSource).not.toContain('/arsiparis/laporan-klasifikasi')
    expect(routesSource).not.toContain('AKTIF: \'/arsiparis/aktif\'')
    expect(routesSource).not.toContain('SEARCH: \'/arsiparis/search\'')
    expect(existsSync('src/routes/arsiparis/laporan-klasifikasi.tsx')).toBe(false)
    expect(existsSync('src/routes/arsiparis.laporan-klasifikasi_.detail.tsx')).toBe(false)
    expect(existsSync('src/routes/api/arsiparis/arsip/classification-report.ts')).toBe(false)
    expect(existsSync('src/routes/api/arsiparis/arsip/classification-report-detail.ts')).toBe(false)
    expect(existsSync('src/routes/api/arsiparis/aktif.ts')).toBe(false)
    expect(existsSync('src/routes/api/arsiparis/inaktif.ts')).toBe(false)
    expect(existsSync('src/routes/api/arsiparis/usul-musnah.ts')).toBe(false)
    expect(existsSync('src/routes/api/arsiparis/search.ts')).toBe(false)
    expect(existsSync('src/routes/api/arsiparis/arsip/$id.ts')).toBe(false)
    expect(existsSync('src/routes/api/arsiparis/arsip/$id/lifecycle.ts')).toBe(false)
    expect(existsSync('src/routes/api/arsiparis/arsip/aggregate.ts')).toBe(false)
    expect(existsSync('src/routes/api/arsiparis/arsip/export.ts')).toBe(false)
    expect(existsSync('src/lib/archive/berkas-arsip-report.ts')).toBe(false)
    expect(existsSync('src/lib/archive/unified-archive-query.ts')).toBe(false)
    expect(existsSync('src/lib/archive/unified-archive-detail.ts')).toBe(false)
    expect(existsSync('src/lib/archive/unified-archive-file-actions.ts')).toBe(false)
    expect(existsSync('src/lib/archive/unified-archive-lifecycle.ts')).toBe(false)
    expect(existsSync('src/lib/archive/unified-archive-aggregate-export.ts')).toBe(false)
    expect(existsSync('src/lib/archive/unified-archive-physical-destruction.ts')).toBe(false)
    expect(routeTreeSource).not.toContain('/arsiparis/laporan-klasifikasi')
    expect(routeTreeSource).not.toContain('/api/arsiparis/arsip/classification-report')
    expect(routeTreeSource).not.toContain('/arsiparis/arsip/$id')
    expect(routeTreeSource).not.toContain('/arsiparis/aktif')
    expect(routeTreeSource).not.toContain('/arsiparis/search')
    expect(routeTreeSource).not.toContain('/api/arsiparis/aktif')
    expect(routeTreeSource).not.toContain('/api/arsiparis/inaktif')
    expect(routeTreeSource).not.toContain('/api/arsiparis/usul-musnah')
    expect(routeTreeSource).not.toContain('/api/arsiparis/search')
    expect(routeTreeSource).not.toContain('/api/arsiparis/arsip/$id')
    expect(routeTreeSource).not.toContain('/api/arsiparis/arsip/aggregate')
    expect(routeTreeSource).not.toContain('/api/arsiparis/arsip/export')
    expect(routeTreeSource).not.toContain('berkas-arsip-report')

    expect(headerSource).toContain('DMS Workspace')
    expect(headerSource).toContain('Panel visual-only')
    expect(headerSource).not.toContain('Cari Arsip')

    expect(inactiveSource).toContain("createFileRoute('/arsiparis/inaktif/')")
    expect(inactiveSource).toContain("apiFetch<BerkasFolderListResponse>('/arsiparis/berkas'")
    expect(inactiveSource).toContain("status_berkas: 'CLOSED'")
    expect(inactiveSource).toContain("status_arsip: 'INAKTIF'")
    expect(inactiveSource).not.toContain("body: JSON.stringify({ action: 'propose_destruction' })")
    expect(inactiveSource).not.toContain("await navigate({ to: '/arsiparis/usul-musnah' })")
    expect(inactiveSource).not.toContain('Usulkan Musnah')
    expect(inactiveSource).toContain('Berkas yang sudah ditutup dan berada pada lifecycle arsip Inaktif.')
    expect(inactiveSource).toContain('Cari berkas inaktif di halaman ini...')
    expect(inactiveSource).toContain('filterBerkasFolders(folders, searchQuery)')
    expect(inactiveSource).toContain('Ekspor CSV')
    expect(inactiveSource).toContain('createBerkasFolderListCsv')
    expect(inactiveSource).toContain('BERKAS_INAKTIF_LIST_CSV_FILENAME')
    expect(inactiveSource).toContain('folders: filteredFolders')
    expect(inactiveSource).toContain('Tidak ada data untuk diekspor.')
    expect(inactiveSource).toContain('folders={filteredFolders}')
    expect(inactiveSource).toContain('to="/arsiparis/berkas/$id"')
    expect(inactiveSource).toContain('Klasifikasi Arsip')
    expect(inactiveSource).toContain('Nomor SPM')
    expect(inactiveSource).toContain('Jumlah Dokumen')
    expect(inactiveSource).toContain('Nominal Realisasi')
    expect(inactiveSource).toContain('Tanggal Ditutup')
    expect(inactiveSource).toContain('Masa Inaktif Berakhir')
    expect(inactiveSource).not.toContain("apiFetch<ArsipInaktifResponse>('/arsiparis/inaktif')")
    expect(inactiveSource).not.toContain('to="/arsiparis/arsip/$id"')

    const inactiveExportSource = extractFunctionBlock(inactiveSource, 'function exportCsv')
    expect(inactiveExportSource).toContain('folders: filteredFolders')
    expect(inactiveExportSource).not.toContain('item_file_key')
    expectSafeSearchSource(inactiveExportSource)

    const inactiveSearchSource = extractFunctionBlock(inactiveSource, 'function buildBerkasFolderSearchText')
    expect(inactiveSearchSource).toContain('klasifikasi_kode_snapshot')
    expect(inactiveSearchSource).toContain('klasifikasi_nama_snapshot')
    expect(inactiveSearchSource).toContain('nomor_spm')
    expect(inactiveSearchSource).toContain('closed_at')
    expect(inactiveSearchSource).toContain('item_count')
    expectSafeSearchSource(inactiveSearchSource)

    expect(proposedSource).toContain("createFileRoute('/arsiparis/usul-musnah/')")
    expect(proposedSource).toContain("apiFetch<BerkasFolderListResponse>('/arsiparis/berkas'")
    expect(proposedSource).toContain("status_berkas: 'CLOSED'")
    expect(proposedSource).toContain("status_arsip: 'USUL_MUSNAH'")
    expect(proposedSource).not.toContain("action: 'approve_destruction'")
    expect(proposedSource).not.toContain('BERKAS_DESTRUCTION_CONFIRMATION_PHRASE')
    expect(formatSource).toContain("BERKAS_DESTRUCTION_CONFIRMATION_PHRASE = 'MUSNAHKAN DATA FILE'")
    expect(proposedSource).not.toContain("from '#/components/ui/dialog'")
    expect(proposedSource).not.toContain('<Dialog')
    expect(proposedSource).not.toContain('<DialogContent')
    expect(proposedSource).not.toContain('<DialogTitle>Musnahkan Data</DialogTitle>')
    expect(proposedSource).not.toContain('openDestructionDialog')
    expect(proposedSource).not.toContain('closeDestructionDialog')
    expect(proposedSource).not.toContain('disabled={!canSubmitDestruction}')
    expect(proposedSource).not.toContain('Musnahkan Data')
    expect(proposedSource).not.toContain('Status berkas akan menjadi Dimusnahkan.')
    expect(proposedSource).not.toContain('File fisik terkait berkas akan dihapus.')
    expect(proposedSource).not.toContain('Preview dan download file tidak akan tersedia setelah pemusnahan.')
    expect(proposedSource).not.toContain('Metadata berkas dan dokumen tetap tersimpan.')
    expect(proposedSource).not.toContain('Aksi ini tidak mudah dibalik.')
    expect(proposedSource).not.toContain('File fisik tidak dihapus pada fase ini')
    expect(proposedSource).toContain('Cari berkas usul musnah di halaman ini...')
    expect(proposedSource).toContain('filterBerkasFolders(folders, searchQuery)')
    expect(proposedSource).toContain('Ekspor CSV')
    expect(proposedSource).toContain('createBerkasFolderListCsv')
    expect(proposedSource).toContain('BERKAS_USUL_MUSNAH_LIST_CSV_FILENAME')
    expect(proposedSource).toContain('folders: filteredFolders')
    expect(proposedSource).toContain('Tidak ada data untuk diekspor.')
    expect(proposedSource).toContain('folders={filteredFolders}')
    expect(proposedSource).toContain('to="/arsiparis/berkas/$id"')
    expect(proposedSource).toContain('Klasifikasi Arsip')
    expect(proposedSource).toContain('Nomor SPM')
    expect(proposedSource).toContain('Jumlah Dokumen')
    expect(proposedSource).toContain('Nominal Realisasi')
    expect(proposedSource).toContain('Tanggal Ditutup')
    expect(proposedSource).not.toContain('rounded-2xl border border-error/30 bg-error/5 p-4')
    expect(proposedSource).not.toContain('Dimusnahkan list')
    expect(proposedSource).not.toContain("apiFetch<UsulMusnahResponse>('/arsiparis/usul-musnah')")
    expect(proposedSource).not.toContain('to="/arsiparis/arsip/$id"')

    const proposedExportSource = extractFunctionBlock(proposedSource, 'function exportCsv')
    expect(proposedExportSource).toContain('folders: filteredFolders')
    expect(proposedExportSource).not.toContain('item_file_key')
    expectSafeSearchSource(proposedExportSource)

    const proposedSearchSource = extractFunctionBlock(proposedSource, 'function buildBerkasFolderSearchText')
    expect(proposedSearchSource).toContain('klasifikasi_kode_snapshot')
    expect(proposedSearchSource).toContain('klasifikasi_nama_snapshot')
    expect(proposedSearchSource).toContain('nomor_spm')
    expect(proposedSearchSource).toContain('closed_at')
    expect(proposedSearchSource).toContain('item_count')
    expectSafeSearchSource(proposedSearchSource)

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

  it('renders folder item file actions only from safe attachment DTOs', () => {
    const detailPageSource = readFileSync('src/routes/arsiparis/berkas/$id.tsx', 'utf8')

    expect(detailPageSource).toContain('const availableAttachments = item.attachments')
    expect(detailPageSource).toContain('availableAttachments.map((attachment, lampiranIndex)')
    expect(detailPageSource).not.toContain('Array.from({ length: attachmentCount }')
  })

  it('keeps archive classification inbox aligned to the compact workflow table columns', () => {
    const inboxSource = readFileSync('src/routes/arsiparis/inbox.tsx', 'utf8')
    const inboxApiSource = readFileSync('src/routes/api/arsiparis/inbox.ts', 'utf8')

    expect(inboxSource).toContain('Judul Dokumen')
    expect(inboxSource).toContain('Kegiatan')
    expect(inboxSource).toContain('Nominal Realisasi')
    expect(inboxSource).toContain('Tanggal Selesai')
    expect(inboxSource).toContain('WorkflowSearchPanel')
    expect(inboxSource).toContain('SOURCE_FILTER_OPTIONS')
    expect(inboxSource).toContain('SORT_OPTIONS')
    expect(inboxSource).not.toContain('Tanggal Approve')
    expect(inboxSource).not.toContain('Tahun</th>')
    expect(inboxApiSource).toContain('nominal_realisasi: dokumenTransaksi.nominalRealisasi')
    expect(inboxApiSource).toContain('source_type: ARCHIVE_SOURCE_TYPE.WORKFLOW')
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
        item_added_at: '2026-05-22T08:30:00.000Z',
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

function extractFunctionBlock(source: string, functionName: string): string {
  const start = source.indexOf(functionName)
  expect(start).toBeGreaterThanOrEqual(0)

  const nextFunction = source.indexOf('\nfunction ', start + functionName.length)
  return source.slice(start, nextFunction === -1 ? undefined : nextFunction)
}

function expectSafeSearchSource(source: string): void {
  expect(source).not.toContain('logical_path')
  expect(source).not.toContain('logicalPath')
  expect(source).not.toContain('physical_path')
  expect(source).not.toContain('storage')
  expect(source).not.toContain('token')
  expect(source).not.toContain('signed')
  expect(source).not.toContain('root')
}
