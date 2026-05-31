import { describe, expect, it } from 'vitest'

import {
  BERKAS_INAKTIF_LIST_CSV_FILENAME,
  BERKAS_USUL_MUSNAH_LIST_CSV_FILENAME,
  buildSafeCsv,
  createBerkasDetailItemsCsv,
  createBerkasFolderListCsv,
} from '#/lib/archive/berkas-arsip-csv'

const BERKAS_ID = '22222222-2222-4222-8222-222222222222'
const ITEM_FILE_KEY = '44444444-4444-4444-8444-444444444444'
const DOKUMEN_ID = '55555555-5555-4555-8555-555555555555'
const MANUAL_ARSIP_ID = '66666666-6666-4666-8666-666666666666'

describe('folder-first berkas CSV helper', () => {
  it('escapes comma, quote, newline, and carriage-return cells', () => {
    const csv = buildSafeCsv([
      ['Nama', 'Catatan'],
      ['Laporan, "Kinerja"\nTahunan', 'Baris\rbaru'],
    ])

    expect(csv).toContain('"Laporan, ""Kinerja""\nTahunan"')
    expect(csv).toContain('"Baris\rbaru"')
  })

  it('neutralizes spreadsheet formula injection prefixes', () => {
    const csv = buildSafeCsv([
      ['A', 'B', 'C', 'D', 'E', 'F'],
      ['=1+1', '+kasubag', '-001', '@arsip', '\tSUM(A1:A2)', '\r=cmd'],
    ])

    expect(csv).toContain("'=1+1")
    expect(csv).toContain("'+kasubag")
    expect(csv).toContain("'-001")
    expect(csv).toContain("'@arsip")
    expect(csv).toContain("'\tSUM(A1:A2)")
    expect(csv).toContain("'\r=cmd")
  })

  it('exports folder list rows without raw ids, paths, tokens, or file content', () => {
    const csv = createBerkasFolderListCsv([
      {
        label: 'Berkas Terbuka',
        folders: [{
          berkas_id: BERKAS_ID,
          klasifikasi_id: DOKUMEN_ID,
          klasifikasi_kode_snapshot: 'BB',
          klasifikasi_nama_snapshot: 'Belanja Barang',
          status_berkas: 'OPEN',
          status_arsip: null,
          nomor_spm: null,
          closed_at: null,
          item_count: 1,
          workflow_item_count: 1,
          manual_item_count: 0,
          total_nominal_realisasi: 1000000,
          updated_at: '2026-05-30T00:00:00.000Z',
          physical_path: 'D:\\secret\\file.pdf',
          token: 'signed-token',
        } as any],
      },
      {
        label: 'Pemberkasan Arsip Aktif',
        folders: [{
          berkas_id: '77777777-7777-4777-8777-777777777777',
          klasifikasi_id: '88888888-8888-4888-8888-888888888888',
          klasifikasi_kode_snapshot: 'RM',
          klasifikasi_nama_snapshot: 'Rapat Mingguan',
          status_berkas: 'CLOSED',
          status_arsip: 'AKTIF',
          nomor_spm: 'SPM-001/2026',
          closed_at: '2026-05-30T00:00:00.000Z',
          item_count: 2,
          workflow_item_count: 1,
          manual_item_count: 1,
          total_nominal_realisasi: 1250000,
          updated_at: '2026-05-30T00:00:00.000Z',
        }],
      },
    ])

    expect(csv).toContain('No,Kategori / Section,Jenis Pembayaran,Status Berkas,Status Arsip,Jumlah Dokumen,Dokumen Workflow,Dokumen Manual,Total Nominal,Nomor SPM,Tanggal Ditutup,Terakhir Diperbarui')
    expect(csv).toContain('Berkas Terbuka')
    expect(csv).toContain('Pemberkasan Arsip Aktif')
    expect(csv).toContain('BB - Belanja Barang')
    expectNoSensitiveOutput(csv)
  })

  it('provides clear lifecycle list CSV filenames', () => {
    expect(BERKAS_INAKTIF_LIST_CSV_FILENAME).toBe('daftar-arsip-inaktif.csv')
    expect(BERKAS_USUL_MUSNAH_LIST_CSV_FILENAME).toBe('daftar-usul-musnah.csv')
  })

  it('exports workflow and manual detail item rows with user-friendly provenance only', () => {
    const csv = createBerkasDetailItemsCsv([
      {
        item_id: ITEM_FILE_KEY,
        item_key: 'item-1',
        item_file_key: ITEM_FILE_KEY,
        dokumen_id: DOKUMEN_ID,
        source_type: 'WORKFLOW',
        source_title: 'Laporan Pembayaran',
        source_date: '2026-05-20',
        source_nominal_realisasi: 1000000,
        source_created_by_display_name: 'Pegawai Workflow',
        attachment_count: 2,
        workflow: {
          status: 'ARCHIVED',
          fungsi_nama: 'Fungsi Keuangan',
          kegiatan_nama: 'Kegiatan Pembayaran',
        },
        manual: null,
        warnings: [],
      } as any,
      {
        item_id: '99999999-9999-4999-8999-999999999999',
        item_key: 'item-2',
        item_file_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        manual_arsip_id: MANUAL_ARSIP_ID,
        source_type: 'MANUAL',
        source_title: 'Dokumen Manual',
        source_date: '2026-05-21',
        source_nominal_realisasi: 250000,
        source_created_by_display_name: 'Pegawai Manual',
        attachment_count: 1,
        workflow: null,
        manual: {
          category_name: 'Kategori Manual',
          keterangan: 'Keterangan manual aman',
        },
        warnings: ['SOURCE_NOT_FOUND'],
      } as any,
    ])

    expect(csv).toContain('No,Sumber,Nama Dokumen,Tanggal Dokumen,Dibuat Oleh,Nominal,Jumlah Lampiran,Keterangan / Provenance,Catatan')
    expect(csv).toContain('Workflow,Laporan Pembayaran')
    expect(csv).toContain('Status: ARCHIVED; Fungsi: Fungsi Keuangan; Kegiatan: Kegiatan Pembayaran')
    expect(csv).toContain('Manual,Dokumen Manual')
    expect(csv).toContain('Kategori: Kategori Manual; Keterangan: Keterangan manual aman')
    expect(csv).toContain('Data sumber tidak ditemukan')
    expectNoSensitiveOutput(csv)
  })
})

function expectNoSensitiveOutput(value: string): void {
  expect(value).not.toContain('berkas_id')
  expect(value).not.toContain('item_id')
  expect(value).not.toContain('item_file_key')
  expect(value).not.toContain(BERKAS_ID)
  expect(value).not.toContain(ITEM_FILE_KEY)
  expect(value).not.toContain(DOKUMEN_ID)
  expect(value).not.toContain(MANUAL_ARSIP_ID)
  expect(value).not.toContain('canonical_arsip_id')
  expect(value).not.toContain('dokumen_id')
  expect(value).not.toContain('manual_arsip_id')
  expect(value).not.toContain('logical_path')
  expect(value).not.toContain('physical_path')
  expect(value).not.toContain('signed_url')
  expect(value).not.toContain('signedUrl')
  expect(value).not.toContain('signed-token')
  expect(value).not.toContain('token')
  expect(value).not.toContain('D:\\')
  expect(value).not.toContain('/storage/')
  expect(value).not.toContain('FILE_CONTENT')
}
