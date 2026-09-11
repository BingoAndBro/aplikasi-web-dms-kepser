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
import { masterKomponen } from './komponen'

const masterSchema = pgSchema('master')

export const masterJenisPermintaan = masterSchema.table(
  'master_jenis_permintaan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    komponenId: uuid('komponen_id')
      .notNull()
      .references(() => masterKomponen.id, { onDelete: 'restrict' }),
    nama: text('nama').notNull(),
    deskripsi: text('deskripsi'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_master_jenis_permintaan_komponen_id').on(table.komponenId),
    index('idx_master_jenis_permintaan_komponen_active').on(table.komponenId, table.isActive),
    index('idx_master_jenis_permintaan_nama').on(table.nama),
    uniqueIndex('master_jenis_permintaan_komponen_id_nama_active_unique')
      .on(table.komponenId, table.nama)
      .where(sql`${table.isActive} = true`),
  ],
)

export type MasterJenisPermintaan = typeof masterJenisPermintaan.$inferSelect
export type NewMasterJenisPermintaan = typeof masterJenisPermintaan.$inferInsert
