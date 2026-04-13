import { pgTable, uuid, text, timestamp, unique } from 'drizzle-orm/pg-core'

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

// Type exports
export type Role = typeof roles.$inferSelect
export type NewRole = typeof roles.$inferInsert
export type UserRole = typeof userRoles.$inferSelect
export type NewUserRole = typeof userRoles.$inferInsert
