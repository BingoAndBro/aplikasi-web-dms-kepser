import { sql } from 'drizzle-orm'
import { check, index, integer, pgSchema, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { laporanTautan } from './laporan-tautan'

const appSchema = pgSchema('app')

export const LAPORAN_TAUTAN_DRIVE_FILE_SUMBER_VALUES = ['DOKUMEN', 'MANUAL_ARSIP'] as const
export type LaporanTautanDriveFileSumber = typeof LAPORAN_TAUTAN_DRIVE_FILE_SUMBER_VALUES[number]

// MENUNGGU -> TERUNGGAH | DILEWATI; TERUNGGAH -> MENGHAPUS -> DIHAPUS.
// DILEWATI: file sudah tidak tersedia saat akan diunggah (atau dihapus sebelum terunggah).
export const LAPORAN_TAUTAN_DRIVE_FILE_STATUS_VALUES = [
  'MENUNGGU',
  'TERUNGGAH',
  'MENGHAPUS',
  'DIHAPUS',
  'DILEWATI',
] as const
export type LaporanTautanDriveFileStatus = typeof LAPORAN_TAUTAN_DRIVE_FILE_STATUS_VALUES[number]

// Penyebab file dihapus dari Drive; dipakai untuk catatan di DAFTAR_ISI.txt.
export const LAPORAN_TAUTAN_DRIVE_FILE_KETERANGAN_HAPUS_VALUES = [
  'DICABUT',
  'DIMUSNAHKAN',
  'DIBERSIHKAN',
  'DIHAPUS_PEMILIK',
] as const
export type LaporanTautanDriveFileKeteranganHapus =
  typeof LAPORAN_TAUTAN_DRIVE_FILE_KETERANGAN_HAPUS_VALUES[number]

// Satu baris per lampiran yang disalin ke folder Drive tautan. kunci_lampiran
// (DOKUMEN:<dokumen_id>:<index> / MANUAL:<manual_arsip_id>:<attachment_id>)
// unik per tautan supaya percobaan ulang tidak mengunggah file ganda.
// SENGAJA TANPA .references() pada dokumen_id/manual_arsip_id/attachment_id:
// baris ini harus tetap ada setelah dokumennya dihapus permanen, agar runner
// masih bisa menghapus salinannya di Drive.
export const laporanTautanDriveFile = appSchema.table(
  'laporan_tautan_drive_file',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tautanId: uuid('tautan_id')
      .notNull()
      .references(() => laporanTautan.id, { onDelete: 'no action', onUpdate: 'no action' }),
    sumber: text('sumber').$type<LaporanTautanDriveFileSumber>().notNull(),
    dokumenId: uuid('dokumen_id'),
    lampiranIndex: integer('lampiran_index'),
    manualArsipId: uuid('manual_arsip_id'),
    attachmentId: uuid('attachment_id'),
    kunciLampiran: text('kunci_lampiran').notNull(),
    // Nama formal, sama dengan entri ZIP.
    namaFile: text('nama_file').notNull(),
    labelDokumen: text('label_dokumen').notNull(),
    urutan: integer('urutan').notNull(),
    contentType: text('content_type').notNull(),
    driveFileId: text('drive_file_id'),
    status: text('status').$type<LaporanTautanDriveFileStatus>().notNull().default('MENUNGGU'),
    keteranganHapus: text('keterangan_hapus').$type<LaporanTautanDriveFileKeteranganHapus>(),
    dicobaPada: timestamp('dicoba_pada', { withTimezone: true }),
    diunggahPada: timestamp('diunggah_pada', { withTimezone: true }),
    dihapusPada: timestamp('dihapus_pada', { withTimezone: true }),
  },
  (table) => [
    unique('laporan_tautan_drive_file_kunci_unique').on(table.tautanId, table.kunciLampiran),
    index('idx_laporan_tautan_drive_file_dokumen').on(table.dokumenId),
    index('idx_laporan_tautan_drive_file_manual_arsip').on(table.manualArsipId),
    index('idx_laporan_tautan_drive_file_tautan_status').on(table.tautanId, table.status),
    check(
      'laporan_tautan_drive_file_sumber_check',
      sql`${table.sumber} in ('DOKUMEN', 'MANUAL_ARSIP')`,
    ),
    check(
      'laporan_tautan_drive_file_status_check',
      sql`${table.status} in ('MENUNGGU', 'TERUNGGAH', 'MENGHAPUS', 'DIHAPUS', 'DILEWATI')`,
    ),
    check(
      'laporan_tautan_drive_file_keterangan_hapus_check',
      sql`${table.keteranganHapus} IS NULL OR ${table.keteranganHapus} in ('DICABUT', 'DIMUSNAHKAN', 'DIBERSIHKAN', 'DIHAPUS_PEMILIK')`,
    ),
    check(
      'laporan_tautan_drive_file_sumber_kolom_check',
      sql`(${table.sumber} <> 'DOKUMEN' OR (${table.dokumenId} IS NOT NULL AND ${table.lampiranIndex} IS NOT NULL))
        AND (${table.sumber} <> 'MANUAL_ARSIP' OR (${table.manualArsipId} IS NOT NULL AND ${table.attachmentId} IS NOT NULL))`,
    ),
  ],
)

export type LaporanTautanDriveFile = typeof laporanTautanDriveFile.$inferSelect
export type NewLaporanTautanDriveFile = typeof laporanTautanDriveFile.$inferInsert
