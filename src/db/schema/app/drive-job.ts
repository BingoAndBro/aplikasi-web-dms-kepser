import { sql } from 'drizzle-orm'
import { check, index, integer, pgSchema, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { googleDriveAkun } from './google-drive-akun'
import { laporanTautan } from './laporan-tautan'

const appSchema = pgSchema('app')

// SINKRON_TAUTAN: buat folder tautan, unggah lampiran, DAFTAR_ISI.txt, bagikan.
// HAPUS_TAUTAN: hapus folder tautan yang dicabut.
// HAPUS_FILE: hapus semua baris file berstatus MENGHAPUS pada tautan itu.
export const DRIVE_JOB_JENIS_VALUES = ['SINKRON_TAUTAN', 'HAPUS_TAUTAN', 'HAPUS_FILE'] as const
export type DriveJobJenis = typeof DRIVE_JOB_JENIS_VALUES[number]

// MENUNGGU -> PROSES -> SELESAI | GAGAL | DIBATALKAN; PROSES -> MENUNGGU saat
// dijadwalkan ulang. PROSES yang terkunci terlalu lama boleh diklaim ulang.
export const DRIVE_JOB_STATUS_VALUES = ['MENUNGGU', 'PROSES', 'SELESAI', 'GAGAL', 'DIBATALKAN'] as const
export type DriveJobStatus = typeof DRIVE_JOB_STATUS_VALUES[number]

// Kategori galat Google Drive (lihat src/lib/google-drive/drive-errors.ts).
export const DRIVE_GALAT_KATEGORI_VALUES = [
  'SEMENTARA',
  'TOKEN_TIDAK_VALID',
  'KUOTA_PENUH',
  'TIDAK_DITEMUKAN',
  'PERMANEN',
  'AKUN_DIPUTUS',
] as const
export type DriveGalatKategori = typeof DRIVE_GALAT_KATEGORI_VALUES[number]

// Antrean kerja Google Drive yang diproses runner di proses server
// (src/lib/google-drive/jobs.ts). galat_pesan berisi pesan pendek berbahasa
// Indonesia, tidak pernah respons mentah Google.
export const driveJob = appSchema.table(
  'drive_job',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jenis: text('jenis').$type<DriveJobJenis>().notNull(),
    akunId: uuid('akun_id')
      .notNull()
      .references(() => googleDriveAkun.id, { onDelete: 'restrict', onUpdate: 'no action' }),
    tautanId: uuid('tautan_id')
      .notNull()
      .references(() => laporanTautan.id, { onDelete: 'no action', onUpdate: 'no action' }),
    // HAPUS_* = 0 (lebih dulu), SINKRON_TAUTAN = 10.
    prioritas: integer('prioritas').notNull(),
    status: text('status').$type<DriveJobStatus>().notNull(),
    percobaan: integer('percobaan').notNull().default(0),
    jadwalBerikut: timestamp('jadwal_berikut', { withTimezone: true }).notNull().defaultNow(),
    dikunciPada: timestamp('dikunci_pada', { withTimezone: true }),
    galatKategori: text('galat_kategori').$type<DriveGalatKategori>(),
    galatPesan: text('galat_pesan'),
    dibuatPada: timestamp('dibuat_pada', { withTimezone: true }).notNull().defaultNow(),
    selesaiPada: timestamp('selesai_pada', { withTimezone: true }),
  },
  (table) => [
    index('idx_drive_job_antrean').on(table.status, table.prioritas, table.jadwalBerikut),
    index('idx_drive_job_tautan').on(table.tautanId),
    // Satu job MENUNGGU per (tautan, jenis); enqueue kedua cukup memajukan jadwal.
    uniqueIndex('drive_job_satu_menunggu')
      .on(table.tautanId, table.jenis)
      .where(sql`${table.status} = 'MENUNGGU'`),
    check(
      'drive_job_jenis_check',
      sql`${table.jenis} in ('SINKRON_TAUTAN', 'HAPUS_TAUTAN', 'HAPUS_FILE')`,
    ),
    check(
      'drive_job_status_check',
      sql`${table.status} in ('MENUNGGU', 'PROSES', 'SELESAI', 'GAGAL', 'DIBATALKAN')`,
    ),
    check(
      'drive_job_galat_kategori_check',
      sql`${table.galatKategori} IS NULL OR ${table.galatKategori} in ('SEMENTARA', 'TOKEN_TIDAK_VALID', 'KUOTA_PENUH', 'TIDAK_DITEMUKAN', 'PERMANEN', 'AKUN_DIPUTUS')`,
    ),
  ],
)

export type DriveJob = typeof driveJob.$inferSelect
export type NewDriveJob = typeof driveJob.$inferInsert
