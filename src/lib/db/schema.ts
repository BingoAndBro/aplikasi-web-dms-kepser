import { pgTable, uuid, text, timestamp, unique, boolean, integer, numeric } from 'drizzle-orm/pg-core'

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  nama: text('nama').notNull().unique(),
  deskripsi: text('deskripsi'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Note: auth.users adalah tabel Supabase yang dikelola terpisah.
// Kita tidak bisa buat FK constraint langsung dari aplikasi.
// Di level aplikasi, kita hanya STORE user_id (UUID dari Supabase auth).
// RLS di database tetap berjalan karena user_id merujuk ke auth.users.
export const userRoles = pgTable('user_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(), // UUID dari auth.users
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdRoleIdUnique: unique().on(table.userId, table.roleId),
}))

// master_fungsi: departemen/fungsi BPS
export const masterFungsi = pgTable('master_fungsi', {
  id: uuid('id').primaryKey().defaultRandom(),
  nama: text('nama').notNull().unique(),
  deskripsi: text('deskripsi'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// master_kegiatan: jenis kegiatan per fungsi
export const masterKegiatan = pgTable('master_kegiatan', {
  id: uuid('id').primaryKey().defaultRandom(),
  fungsiId: uuid('fungsi_id').notNull().references(() => masterFungsi.id, { onDelete: 'restrict' }),
  nama: text('nama').notNull(),
  deskripsi: text('deskripsi'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// master_kelengkapan_dokumen: dokumen wajib per kegiatan × role (Ketua Tim vs Anggota)
export const masterKelengkapanDokumen = pgTable('master_kelengkapan_dokumen', {
  id: uuid('id').primaryKey().defaultRandom(),
  kegiatanId: uuid('kegiatan_id').notNull().references(() => masterKegiatan.id, { onDelete: 'cascade' }),
  isKetuaTim: boolean('is_ketua_tim').notNull(),
  namaDokumen: text('nama_dokumen').notNull(),
  required: boolean('required').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Type exports
export type Role = typeof roles.$inferSelect
export type NewRole = typeof roles.$inferInsert
export type UserRole = typeof userRoles.$inferSelect
export type NewUserRole = typeof userRoles.$inferInsert
export type MasterFungsi = typeof masterFungsi.$inferSelect
export type NewMasterFungsi = typeof masterFungsi.$inferInsert
export type MasterKegiatan = typeof masterKegiatan.$inferSelect
export type NewMasterKegiatan = typeof masterKegiatan.$inferInsert
export type MasterKelengkapan = typeof masterKelengkapanDokumen.$inferSelect
export type NewMasterKelengkapan = typeof masterKelengkapanDokumen.$inferInsert

// ---------------------------------------------------------------------------
// dokumen_transaksi — dokumen yang diajukan pegawai
// ---------------------------------------------------------------------------

export const dokumenTransaksi = pgTable('dokumen_transaksi', {
  id: uuid('id').primaryKey().defaultRandom(),
  judul: text('judul').notNull(),
  fungsiId: uuid('fungsi_id').notNull().references(() => masterFungsi.id, { onDelete: 'restrict' }),
  kegiatanJenisId: uuid('kegiatan_jenis_id').notNull().references(() => masterKegiatan.id, { onDelete: 'restrict' }),
  isKetuaTim: boolean('is_ketua_tim').default(false).notNull(),
  status: text('status').notNull().default('DRAFT'),
  currentStep: text('current_step'),
  revisionTarget: text('revision_target'),
  revisionNotes: text('revision_notes'),
  lampiranUrls: text('lampiran_urls').notNull().default('[]'), // JSON array
  tahun: integer('tahun').notNull(),
  tanggal: text('tanggal').notNull(), // ISO date string yyyy-MM-dd
  createdBy: uuid('created_by').notNull(), // UUID from auth.users (no FK)
  nominalRealisasi: numeric('nominal_realisasi', { precision: 15, scale: 2 }),
  isNonMaterial: boolean('is_non_material').default(false).notNull(),
  keteranganDetail: text('keterangan_detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// log_aktivitas — audit trail (append-only, NO UPDATE/DELETE)
// ---------------------------------------------------------------------------

export const logAktivitas = pgTable('log_aktivitas', {
  id: uuid('id').primaryKey().defaultRandom(),
  dokumenId: uuid('dokumen_id').notNull().references(() => dokumenTransaksi.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(), // UUID from auth.users (no FK)
  aksi: text('aksi').notNull(), // SUBMIT, RESUBMIT, PPK_APPROVE, PPK_REJECT, PPSPM_APPROVE, PPSPM_REJECT, ARCHIVE, ARCHIVE_SKIP
  catatan: text('catatan'),
  stepUrutan: integer('step_urutan'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
})

// Type exports
export type DokumenTransaksi = typeof dokumenTransaksi.$inferSelect
export type NewDokumenTransaksi = typeof dokumenTransaksi.$inferInsert
export type LogAktivitas = typeof logAktivitas.$inferSelect
export type NewLogAktivitas = typeof logAktivitas.$inferInsert

// ---------------------------------------------------------------------------
// ketua_tim_assignments — assignment user sebagai Ketua Tim pada kegiatan
// ---------------------------------------------------------------------------

export const ketuaTimAssignments = pgTable('ketua_tim_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  kegiatanId: uuid('kegiatan_id').notNull().references(() => masterKegiatan.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by'),
}, (table) => ({
  kegiatanUnique: unique().on(table.kegiatanId),
}))

// Type exports
export type KetuaTimAssignment = typeof ketuaTimAssignments.$inferSelect
export type NewKetuaTimAssignment = typeof ketuaTimAssignments.$inferInsert
