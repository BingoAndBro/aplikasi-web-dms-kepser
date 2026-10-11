import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from '../auth/users'

const appSchema = pgSchema('app')

export const LAPORAN_TAUTAN_SUMBER_VALUES = ['LAPORAN_SAYA', 'LAPORAN_KEGIATAN', 'LAPORAN_KINERJA'] as const
export type LaporanTautanSumber = typeof LAPORAN_TAUTAN_SUMBER_VALUES[number]

// LOGIN: pembuka wajib login (role apa pun). PUBLIK: siapa pun yang memegang
// tautan boleh membuka tanpa akun (seperti "siapa saja yang punya link" di Drive).
export const LAPORAN_TAUTAN_AKSES_VALUES = ['LOGIN', 'PUBLIK'] as const
export type LaporanTautanAkses = typeof LAPORAN_TAUTAN_AKSES_VALUES[number]

// Tautan laporan yang dibagikan ke aplikasi lain (lihat src/lib/laporan/tautan.ts).
// Isinya snapshot: daftar dokumen dikunci saat tautan dibuat dan sudah
// diotorisasi terhadap pembuatnya. Pembuka cukup login (role apa pun) untuk
// tautan LOGIN, dan tidak perlu akun sama sekali untuk tautan PUBLIK.
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
  },
  (table) => [
    index('idx_laporan_tautan_created_by_created_at').on(table.createdBy, table.createdAt),
    check(
      'laporan_tautan_sumber_check',
      sql`${table.sumber} in ('LAPORAN_SAYA', 'LAPORAN_KEGIATAN', 'LAPORAN_KINERJA')`,
    ),
    check('laporan_tautan_akses_check', sql`${table.akses} in ('LOGIN', 'PUBLIK')`),
  ],
)

export type LaporanTautan = typeof laporanTautan.$inferSelect
export type NewLaporanTautan = typeof laporanTautan.$inferInsert
