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

export const masterJenisPermintaan = masterSchema.table(
  'master_jenis_permintaan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nama: text('nama').notNull(),
    deskripsi: text('deskripsi'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_master_jenis_permintaan_nama').on(table.nama),
    uniqueIndex('master_jenis_permintaan_nama_active_unique')
      .on(table.nama)
      .where(sql`${table.isActive} = true`),
  ],
)

export type MasterJenisPermintaan = typeof masterJenisPermintaan.$inferSelect
export type NewMasterJenisPermintaan = typeof masterJenisPermintaan.$inferInsert
