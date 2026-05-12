import {
  boolean,
  index,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

const masterSchema = pgSchema('master')

export const masterJenisDokumen = masterSchema.table(
  'master_jenis_dokumen',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nama: text('nama').notNull(),
    deskripsi: text('deskripsi'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_master_jenis_dokumen_is_active').on(table.isActive),
    index('idx_master_jenis_dokumen_nama').on(table.nama),
    uniqueIndex('master_jenis_dokumen_nama_active_unique')
      .on(table.nama)
      .where(sql`${table.isActive} = true`),
  ],
)

export type MasterJenisDokumen = typeof masterJenisDokumen.$inferSelect
export type NewMasterJenisDokumen = typeof masterJenisDokumen.$inferInsert
