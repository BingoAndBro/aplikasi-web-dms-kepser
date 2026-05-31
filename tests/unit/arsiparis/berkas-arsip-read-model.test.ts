import { describe, expect, it } from 'vitest'

import {
  getBerkasArsipDetail,
  listBerkasArsipFolders,
  type ActorDisplayReadRow,
  type BerkasArsipReadModelRepository,
  type BerkasFolderReadRow,
  type BerkasItemSourceReadRow,
  type ManualAttachmentNameReadRow,
} from '#/lib/archive/berkas-arsip-read-model'

const BERKAS_OPEN_ID = 'berkas-open'
const BERKAS_CLOSED_ID = 'berkas-closed'
const KLASIFIKASI_ID = 'klasifikasi-belanja-barang'
const ACTOR_ID = 'actor-kasubag'
const WORKFLOW_CREATOR_ID = 'workflow-creator'
const MANUAL_CREATOR_ID = 'manual-creator'

describe('berkas arsip read model', () => {
  it('lists folder-first DTO rows rather than individual archive rows', async () => {
    const repository = createFakeRepository()

    const result = await listBerkasArsipFolders({}, { repository })

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({
      berkas_id: BERKAS_OPEN_ID,
      status_berkas: 'OPEN',
      status_arsip: null,
      item_count: 1,
      workflow_item_count: 1,
      manual_item_count: 0,
    })
    expect(result.rows[1]).toMatchObject({
      berkas_id: BERKAS_CLOSED_ID,
      status_berkas: 'CLOSED',
      status_arsip: 'AKTIF',
      item_count: 2,
      workflow_item_count: 1,
      manual_item_count: 1,
      total_nominal_realisasi: 1250000,
    })
    expect(result.summary).toMatchObject({
      total_rows_returned: 2,
      item_count_total: 3,
      workflow_item_count_total: 2,
      manual_item_count_total: 1,
      total_nominal_realisasi: 3250000,
    })
  })

  it('handles OPEN folders with null status_arsip as transitional folder state', async () => {
    const repository = createFakeRepository()

    const result = await listBerkasArsipFolders({
      status_berkas: 'OPEN',
      status_arsip: null,
    }, { repository })

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      berkas_id: BERKAS_OPEN_ID,
      status_berkas: 'OPEN',
      status_arsip: null,
    })
    expect(result.summary.status_arsip_counts.UNKNOWN).toBe(1)
  })

  it('handles CLOSED AKTIF folders with final metadata', async () => {
    const repository = createFakeRepository()

    const result = await listBerkasArsipFolders({
      status_berkas: 'CLOSED',
      status_arsip: 'AKTIF',
    }, { repository })

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      berkas_id: BERKAS_CLOSED_ID,
      nomor_spm: 'SPM-001/2026',
      retensi_aktif: '1 Tahun',
      retensi_inaktif: '3 Tahun',
      masa_aktif_berakhir: '2027-05-29',
      masa_inaktif_berakhir: '2030-05-29',
      closed_by: ACTOR_ID,
    })
  })

  it('combines WORKFLOW and MANUAL source items in folder detail', async () => {
    const repository = createFakeRepository()

    const result = await getBerkasArsipDetail(BERKAS_CLOSED_ID, { repository })

    expect(result.status).toBe('found')
    if (result.status !== 'found') return

    expect(result.detail.items).toHaveLength(2)
    expect(result.detail.items.map((item) => item.source_type)).toEqual(['WORKFLOW', 'MANUAL'])
    expect(result.detail.items[0]).toMatchObject({
      item_id: 'item-workflow-closed',
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
        {
          label: 'Dokumen Pendukung',
          previewTitle: 'Dokumen Pendukung_Detail Pembayaran_Kegiatan Pembayaran_2026-05-20.pdf',
          downloadFilename: 'Dokumen Pendukung_Detail Pembayaran_Kegiatan Pembayaran_2026-05-20.pdf',
        },
      ],
      has_attachments: true,
      workflow: {
        status: 'ARCHIVED',
        current_step: null,
        fungsi_nama: 'Fungsi Keuangan',
        kegiatan_nama: 'Kegiatan Pembayaran',
      },
      manual: null,
    })
    expect(result.detail.items[1]).toMatchObject({
      item_id: 'item-manual-closed',
      source_title: 'Dokumen Manual',
      source_nominal_realisasi: 250000,
      source_created_by_display_name: 'Pegawai Manual',
      attachment_count: 1,
      attachments: [
        {
          label: 'Bukti Manual',
          previewTitle: 'Bukti Manual',
          downloadFilename: 'Bukti Manual',
        },
      ],
      has_attachments: true,
      workflow: null,
      manual: {
        category_name: 'Pengadaan',
        keterangan: 'Keterangan aman',
      },
    })
  })

  it('does not expose paths, tokens, raw SQL, raw rows, or bridge ids in detail DTOs', async () => {
    const repository = createFakeRepository()

    const result = await getBerkasArsipDetail(BERKAS_CLOSED_ID, { repository })

    expect(result.status).toBe('found')
    if (result.status !== 'found') return

    const serialized = JSON.stringify(result.detail)
    expect(serialized).not.toContain('C:\\storage')
    expect(serialized).not.toContain('token-value')
    expect(serialized).not.toContain('select *')
    expect(serialized).not.toContain('workflow_lampiran_urls')
    expect(serialized).not.toContain('secret-token.pdf')
  })

  it('falls back to generic attachment names for unsafe workflow metadata without leaking paths or tokens', async () => {
    const repository = createFakeRepository({
      folderRows: [closedBerkas()],
      itemRows: [closedWorkflowItem({
        workflow_lampiran_urls: [
          {
            nama: 'https://files.example.test/signed?token=secret',
            fileName: '../secret.pdf',
            original_filename: 'C:\\storage\\secret-token.pdf',
            url: 'owner-user/workflow/report.pdf',
          },
        ],
      })],
    })

    const result = await getBerkasArsipDetail(BERKAS_CLOSED_ID, { repository })

    expect(result.status).toBe('found')
    if (result.status !== 'found') return

    expect(result.detail.items[0].attachments).toEqual([
      {
        label: 'Lampiran 1',
        previewTitle: 'Lampiran 1.pdf',
        downloadFilename: 'Lampiran 1.pdf',
      },
    ])
    expectNoSensitiveOutput(result.detail)
  })

  it('does not throw and falls back to source labels when workflow master metadata is missing', async () => {
    const repository = createFakeRepository({
      folderRows: [closedBerkas()],
      itemRows: [closedWorkflowItem({
        workflow_date: null,
        kegiatan_nama: null,
        jenis_dokumen_nama: null,
        jenis_permintaan_nama: null,
        kategori_permintaan_nama: null,
        detail_permintaan_nama: null,
        workflow_lampiran_urls: [
          {
            nama: 'Bukti Aman',
            url: 'owner-user/workflow/bukti-aman.pdf',
          },
        ],
      })],
    })

    const result = await getBerkasArsipDetail(BERKAS_CLOSED_ID, { repository })

    expect(result.status).toBe('found')
    if (result.status !== 'found') return

    expect(result.detail.items[0].attachments).toEqual([
      {
        label: 'Bukti Aman',
        previewTitle: 'Bukti Aman.pdf',
        downloadFilename: 'Bukti Aman.pdf',
      },
    ])
    expectNoSensitiveOutput(result.detail)
  })

  it('handles a missing source safely with a placeholder and warning', async () => {
    const repository = createFakeRepository({
      folderRows: [closedBerkas()],
      itemRows: [missingWorkflowItem()],
    })

    const result = await getBerkasArsipDetail(BERKAS_CLOSED_ID, { repository })

    expect(result.status).toBe('found')
    if (result.status !== 'found') return

    expect(result.detail.items[0]).toMatchObject({
      source_title: 'Sumber tidak ditemukan',
      source_nominal_realisasi: null,
      attachment_count: null,
      has_attachments: false,
      warnings: ['SOURCE_NOT_FOUND'],
    })
  })

  it('keeps total counts correct when sources are mixed and one source is missing', async () => {
    const repository = createFakeRepository({
      folderRows: [closedBerkas()],
      itemRows: [closedWorkflowItem(), closedManualItem(), missingWorkflowItem()],
    })

    const result = await listBerkasArsipFolders({
      status_berkas: 'CLOSED',
      status_arsip: 'AKTIF',
    }, { repository })

    expect(result.rows[0]).toMatchObject({
      item_count: 3,
      workflow_item_count: 2,
      manual_item_count: 1,
      total_nominal_realisasi: 1250000,
    })
    expect(result.summary).toMatchObject({
      item_count_total: 3,
      workflow_item_count_total: 2,
      manual_item_count_total: 1,
      total_nominal_realisasi: 1250000,
    })
  })

})

function createFakeRepository(options: {
  folderRows?: BerkasFolderReadRow[]
  itemRows?: BerkasItemSourceReadRow[]
  actorRows?: ActorDisplayReadRow[]
  manualAttachments?: Map<string, ManualAttachmentNameReadRow[]>
} = {}): BerkasArsipReadModelRepository {
  const folderRows = options.folderRows ?? [openBerkas(), closedBerkas()]
  const itemRows = options.itemRows ?? [openWorkflowItem(), closedWorkflowItem(), closedManualItem()]
  const actorRows = options.actorRows ?? [
    actorRow(WORKFLOW_CREATOR_ID, 'Pegawai Workflow'),
    actorRow(MANUAL_CREATOR_ID, 'Pegawai Manual'),
  ]
  const manualAttachments = options.manualAttachments ?? new Map([
    ['manual-source-id', [{
      manual_arsip_id: 'manual-source-id',
      judul_lampiran: 'Bukti Manual',
      original_filename: 'bukti-manual.pdf',
    }]],
  ])

  return {
    async listFolders(query) {
      return folderRows.filter((row) => {
        if (query.status_berkas && row.status_berkas !== query.status_berkas) return false
        if (query.status_arsip !== undefined && row.status_arsip !== query.status_arsip) return false
        if (query.klasifikasi_id && row.klasifikasi_id !== query.klasifikasi_id) return false
        if (query.search && ![
          row.klasifikasi_kode_snapshot,
          row.klasifikasi_nama_snapshot,
          row.nomor_spm,
        ].some((value) => value?.toLowerCase().includes(query.search?.toLowerCase() ?? ''))) {
          return false
        }
        return true
      }).slice(query.offset, query.offset + query.limit)
    },
    async getFolderById(berkasId) {
      return folderRows.find((row) => row.berkas_id === berkasId) ?? null
    },
    async listItemsForBerkasIds(berkasIds) {
      return itemRows.filter((row) => berkasIds.includes(row.berkas_id))
    },
    async listManualAttachmentsByManualArsipIds(manualArsipIds) {
      return new Map(
        [...manualAttachments.entries()].filter(([manualArsipId]) => manualArsipIds.includes(manualArsipId)),
      )
    },
    async findActorDisplayNames(actorIds) {
      return new Map(
        actorRows
          .filter((row) => actorIds.includes(row.id))
          .map((row) => [row.id, row.display_name ?? row.nama_lengkap ?? row.email ?? '']),
      )
    },
  }
}

function openBerkas(): BerkasFolderReadRow {
  return {
    berkas_id: BERKAS_OPEN_ID,
    klasifikasi_id: KLASIFIKASI_ID,
    klasifikasi_kode_snapshot: 'BB',
    klasifikasi_nama_snapshot: 'Belanja Barang',
    status_berkas: 'OPEN',
    status_arsip: null,
    nomor_spm: null,
    retensi_aktif: null,
    retensi_inaktif: null,
    masa_aktif_berakhir: null,
    masa_inaktif_berakhir: null,
    closed_at: null,
    closed_by: null,
    created_at: '2026-05-29T00:00:00.000Z',
    updated_at: '2026-05-29T00:00:00.000Z',
  }
}

function closedBerkas(): BerkasFolderReadRow {
  return {
    ...openBerkas(),
    berkas_id: BERKAS_CLOSED_ID,
    status_berkas: 'CLOSED',
    status_arsip: 'AKTIF',
    nomor_spm: 'SPM-001/2026',
    retensi_aktif: '1 Tahun',
    retensi_inaktif: '3 Tahun',
    masa_aktif_berakhir: '2027-05-29',
    masa_inaktif_berakhir: '2030-05-29',
    closed_at: '2026-05-29T00:00:00.000Z',
    closed_by: ACTOR_ID,
  }
}

function openWorkflowItem(): BerkasItemSourceReadRow {
  return {
    ...closedWorkflowItem(),
    item_id: 'item-workflow-open',
    berkas_id: BERKAS_OPEN_ID,
    workflow_nominal_realisasi: '2000000',
  }
}

function closedWorkflowItem(overrides: Partial<BerkasItemSourceReadRow> = {}): BerkasItemSourceReadRow {
  return {
    item_id: 'item-workflow-closed',
    berkas_id: BERKAS_CLOSED_ID,
    source_type: 'WORKFLOW',
    dokumen_id: 'workflow-source-id',
    manual_arsip_id: null,
    workflow_title: 'Laporan Pembayaran',
    workflow_status: 'ARCHIVED',
    workflow_current_step: null,
    workflow_date: '2026-05-20',
    workflow_nominal_realisasi: '1000000',
    workflow_is_non_material: false,
    workflow_created_by: WORKFLOW_CREATOR_ID,
    workflow_lampiran_urls: [
      { nama: 'Bukti Pembayaran', url: 'owner-user/workflow/bukti-pembayaran.pdf' },
      { nama: 'Dokumen Pendukung', url: 'owner-user/workflow/dokumen-pendukung.pdf' },
    ],
    fungsi_nama: 'Fungsi Keuangan',
    kegiatan_nama: 'Kegiatan Pembayaran',
    jenis_dokumen_nama: null,
    jenis_permintaan_nama: 'Jenis Pembayaran',
    kategori_permintaan_nama: 'Kategori Pembayaran',
    detail_permintaan_nama: 'Detail Pembayaran',
    manual_nama: null,
    manual_date: null,
    manual_nominal_realisasi: null,
    manual_created_by: null,
    manual_category_name: null,
    manual_keterangan: null,
    ...overrides,
  }
}

function closedManualItem(): BerkasItemSourceReadRow {
  return {
    ...closedWorkflowItem(),
    item_id: 'item-manual-closed',
    source_type: 'MANUAL',
    dokumen_id: null,
    manual_arsip_id: 'manual-source-id',
    workflow_title: null,
    workflow_status: null,
    workflow_current_step: null,
    workflow_date: null,
    workflow_nominal_realisasi: null,
    workflow_is_non_material: null,
    workflow_created_by: null,
    workflow_lampiran_urls: null,
    fungsi_nama: null,
    kegiatan_nama: null,
    jenis_dokumen_nama: null,
    jenis_permintaan_nama: null,
    kategori_permintaan_nama: null,
    detail_permintaan_nama: null,
    manual_nama: 'Dokumen Manual',
    manual_date: '2026-05-21',
    manual_nominal_realisasi: '250000',
    manual_created_by: MANUAL_CREATOR_ID,
    manual_category_name: 'Pengadaan',
    manual_keterangan: 'Keterangan aman',
  }
}

function missingWorkflowItem(overrides: Partial<BerkasItemSourceReadRow> = {}): BerkasItemSourceReadRow {
  return {
    ...closedWorkflowItem(),
    item_id: 'item-missing-workflow',
    workflow_title: null,
    workflow_status: null,
    workflow_date: null,
    workflow_nominal_realisasi: null,
    workflow_is_non_material: null,
    workflow_created_by: null,
    workflow_lampiran_urls: null,
    fungsi_nama: null,
    kegiatan_nama: null,
    ...overrides,
  }
}

function actorRow(id: string, displayName: string): ActorDisplayReadRow {
  return {
    id,
    display_name: displayName,
    nama_lengkap: null,
    email: null,
  }
}

function expectNoSensitiveOutput(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain('C:\\storage')
  expect(serialized).not.toContain('secret-token')
  expect(serialized).not.toContain('token=secret')
  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('logicalPath')
  expect(serialized).not.toContain('physical_path')
  expect(serialized).not.toContain('physicalPath')
  expect(serialized).not.toContain('signedUrl')
  expect(serialized).not.toContain('signed_url')
  expect(serialized).not.toContain('storage root')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('SQL')
}
