import { pgTable, uuid, text, timestamp, unique, boolean } from 'drizzle-orm/pg-core'

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
