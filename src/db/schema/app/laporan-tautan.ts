import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from '../auth/users'
import { googleDriveAkun } from './google-drive-akun'

const appSchema = pgSchema('app')

export const LAPORAN_TAUTAN_SUMBER_VALUES = ['LAPORAN_SAYA', 'LAPORAN_KEGIATAN', 'LAPORAN_KINERJA'] as const
export type LaporanTautanSumber = typeof LAPORAN_TAUTAN_SUMBER_VALUES[number]

// LOGIN: pembuka wajib login (role apa pun). PUBLIK: siapa pun yang memegang
// tautan boleh membuka tanpa akun (seperti "siapa saja yang punya link" di Drive).
// DRIVE: salinan lampiran disimpan di folder Google Drive dan dibagikan lewat
// link folder itu; token DMS-nya tidak bisa dipakai untuk membuka apa pun.
export const LAPORAN_TAUTAN_AKSES_VALUES = ['LOGIN', 'PUBLIK', 'DRIVE'] as const
export type LaporanTautanAkses = typeof LAPORAN_TAUTAN_AKSES_VALUES[number]

// Status salinan Drive (hanya untuk akses DRIVE):
// MENUNGGU -> MENGUNGGAH -> SIAP | GAGAL; setelah dicabut MENGHAPUS -> DIHAPUS.
export const LAPORAN_TAUTAN_DRIVE_STATUS_VALUES = [
  'MENUNGGU',
  'MENGUNGGAH',
  'SIAP',
  'GAGAL',
  'MENGHAPUS',
  'DIHAPUS',
] as const
export type LaporanTautanDriveStatus = typeof LAPORAN_TAUTAN_DRIVE_STATUS_VALUES[number]

// Dokumen snapshot yang tidak ikut disalin ke Drive (mis. berkasnya sudah dimusnahkan).
export type LaporanTautanDriveDilewati = { label: string; alasan: string }

// Tautan laporan yang dibagikan ke aplikasi lain (lihat src/lib/laporan/tautan.ts).
// Isinya snapshot: daftar dokumen dikunci saat tautan dibuat dan sudah
// diotorisasi terhadap pembuatnya. Pembuka cukup login (role apa pun) untuk
// tautan LOGIN, dan tidak perlu akun sama sekali untuk tautan PUBLIK. Tautan
// DRIVE dibuka lewat link folder Google Drive (drive_folder_url).
// Token disimpan apa adanya (bukan hash seperti auth.sessions) supaya pembuat
// bisa menyalin ulang tautannya dari Riwayat Tautan; tautan berlaku sampai
// dicabut (revoked_at). Baris ini sekaligus jejak siapa membagikan apa.
export const laporanTautan = appSchema.table(
  'laporan_tautan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: text('token').notNull().unique(),
    sumber: text('sumber').$type<LaporanTautanSumber>().notNull(),
    akses: text('akses').$type<LaporanTautanAkses>().notNull().default('LOGIN'),
    judul: text('judul').notNull(),
    keterangan: text('keterangan'),
    dokumenIds: jsonb('dokumen_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    manualArsipIds: jsonb('manual_arsip_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by')
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    jumlahAkses: integer('jumlah_akses').notNull().default(0),
    // Kolom drive_* hanya terisi untuk akses DRIVE (lihat laporan_tautan_drive_check).
    // Akun yang dipakai saat tautan dibuat; tidak berubah walau akun aktif diganti.
    driveAkunId: uuid('drive_akun_id')
      .references(() => googleDriveAkun.id, { onDelete: 'restrict', onUpdate: 'no action' }),
    // Disimpan sebelum file pertama diunggah supaya percobaan ulang memakai folder yang sama.
    driveFolderId: text('drive_folder_id'),
    // webViewLink folder; diisi saat SIAP.
    driveFolderUrl: text('drive_folder_url'),
    driveStatus: text('drive_status').$type<LaporanTautanDriveStatus>(),
    driveDaftarIsiFileId: text('drive_daftar_isi_file_id'),
    driveFolderDicobaPada: timestamp('drive_folder_dicoba_pada', { withTimezone: true }),
    driveDokumenDilewati: jsonb('drive_dokumen_dilewati')
      .$type<LaporanTautanDriveDilewati[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (table) => [
    index('idx_laporan_tautan_created_by_created_at').on(table.createdBy, table.createdAt),
    check(
      'laporan_tautan_sumber_check',
      sql`${table.sumber} in ('LAPORAN_SAYA', 'LAPORAN_KEGIATAN', 'LAPORAN_KINERJA')`,
    ),
    check('laporan_tautan_akses_check', sql`${table.akses} in ('LOGIN', 'PUBLIK', 'DRIVE')`),
    check(
      'laporan_tautan_drive_check',
      sql`(${table.akses} = 'DRIVE') = (${table.driveAkunId} IS NOT NULL AND ${table.driveStatus} IS NOT NULL)`,
    ),
    check(
      'laporan_tautan_drive_status_check',
      sql`${table.driveStatus} IS NULL OR ${table.driveStatus} in ('MENUNGGU', 'MENGUNGGAH', 'SIAP', 'GAGAL', 'MENGHAPUS', 'DIHAPUS')`,
    ),
    index('idx_laporan_tautan_drive_akun').on(table.driveAkunId),
  ],
)

export type LaporanTautan = typeof laporanTautan.$inferSelect
export type NewLaporanTautan = typeof laporanTautan.$inferInsert
