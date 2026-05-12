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
import { masterFungsi } from './fungsi'

const masterSchema = pgSchema('master')

export const masterKegiatan = masterSchema.table(
  'master_kegiatan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fungsiId: uuid('fungsi_id')
      .notNull()
      .references(() => masterFungsi.id, { onDelete: 'restrict' }),
    nama: text('nama').notNull(),
    deskripsi: text('deskripsi'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_master_kegiatan_fungsi_id').on(table.fungsiId),
    index('idx_master_kegiatan_is_active').on(table.isActive),
    index('idx_master_kegiatan_fungsi_active').on(table.fungsiId, table.isActive),
    uniqueIndex('master_kegiatan_fungsi_id_nama_active_unique')
      .on(table.fungsiId, table.nama)
      .where(sql`${table.isActive} = true`),
  ],
)

export type MasterKegiatan = typeof masterKegiatan.$inferSelect
export type NewMasterKegiatan = typeof masterKegiatan.$inferInsert
