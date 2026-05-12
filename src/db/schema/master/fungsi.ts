import {
  boolean,
  index,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const masterSchema = pgSchema('master')

export const masterFungsi = masterSchema.table(
  'master_fungsi',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nama: text('nama').notNull(),
    deskripsi: text('deskripsi'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('master_fungsi_nama_unique').on(table.nama),
    index('idx_master_fungsi_is_active').on(table.isActive),
    index('idx_master_fungsi_nama').on(table.nama),
  ],
)

export type MasterFungsi = typeof masterFungsi.$inferSelect
export type NewMasterFungsi = typeof masterFungsi.$inferInsert
