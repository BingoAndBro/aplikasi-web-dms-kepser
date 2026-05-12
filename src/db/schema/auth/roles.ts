import {
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const authSchema = pgSchema('auth')

export const roles = authSchema.table(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nama: text('nama').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('auth_roles_nama_unique').on(table.nama),
  ],
)

export type AuthRole = typeof roles.$inferSelect
export type NewAuthRole = typeof roles.$inferInsert
