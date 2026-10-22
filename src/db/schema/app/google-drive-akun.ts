import { sql } from 'drizzle-orm'
import { check, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { users } from '../auth/users'

const appSchema = pgSchema('app')

// AKTIF: akun yang dipakai untuk tautan DRIVE baru (paling banyak satu).
// NONAKTIF: akun lama setelah diganti; tautan lamanya tetap dikelola lewat akun ini.
// DIPUTUS: final; refresh token dihapus dan job-nya tidak bisa diproses lagi.
export const GOOGLE_DRIVE_AKUN_STATUS_VALUES = ['AKTIF', 'NONAKTIF', 'DIPUTUS'] as const
export type GoogleDriveAkunStatus = typeof GOOGLE_DRIVE_AKUN_STATUS_VALUES[number]

// Akun Google yang dihubungkan ADMIN untuk menyimpan salinan Tautan Laporan
// berakses DRIVE (lihat src/lib/google-drive/). Refresh token disimpan
// terenkripsi AES-256-GCM (format v1:<iv>:<tag>:<data>) dengan kunci di env,
// dan dikosongkan saat akun diputus. Email disimpan huruf kecil.
export const googleDriveAkun = appSchema.table(
  'google_drive_akun',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    refreshTokenEnc: text('refresh_token_enc'),
    // Folder "DMS Kepser" buatan aplikasi di Drive akun ini.
    rootFolderId: text('root_folder_id'),
    status: text('status').$type<GoogleDriveAkunStatus>().notNull(),
    // Diisi saat token ditolak Google / gagal didekripsi; job akun ini dijeda
    // sampai ADMIN menghubungkan ulang.
    perluHubungUlangSejak: timestamp('perlu_hubung_ulang_sejak', { withTimezone: true }),
    dihubungkanOleh: uuid('dihubungkan_oleh')
      .notNull()
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    dihubungkanPada: timestamp('dihubungkan_pada', { withTimezone: true }).notNull().defaultNow(),
    dinonaktifkanPada: timestamp('dinonaktifkan_pada', { withTimezone: true }),
    diputusOleh: uuid('diputus_oleh')
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    diputusPada: timestamp('diputus_pada', { withTimezone: true }),
  },
  (table) => [
    // Hanya satu akun AKTIF; ganti akun menonaktifkan yang lama lebih dulu.
    uniqueIndex('google_drive_akun_satu_aktif')
      .on(table.status)
      .where(sql`${table.status} = 'AKTIF'`),
    // Menghubungkan ulang email yang sama memperbarui baris yang ada.
    uniqueIndex('google_drive_akun_email_belum_diputus')
      .on(table.email)
      .where(sql`${table.status} <> 'DIPUTUS'`),
    check(
      'google_drive_akun_status_check',
      sql`${table.status} in ('AKTIF', 'NONAKTIF', 'DIPUTUS')`,
    ),
  ],
)

export type GoogleDriveAkun = typeof googleDriveAkun.$inferSelect
export type NewGoogleDriveAkun = typeof googleDriveAkun.$inferInsert
