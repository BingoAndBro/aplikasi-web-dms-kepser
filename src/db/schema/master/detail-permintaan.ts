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
import { masterKategoriPermintaan } from './kategori-permintaan'

const masterSchema = pgSchema('master')

export const masterDetailPermintaan = masterSchema.table(
  'master_detail_permintaan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kategoriPermintaanId: uuid('kategori_permintaan_id')
      .notNull()
      .references(() => masterKategoriPermintaan.id, { onDelete: 'restrict' }),
    nama: text('nama').notNull(),
    deskripsi: text('deskripsi'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_master_detail_permintaan_kategori_id').on(table.kategoriPermintaanId),
    index('idx_master_detail_permintaan_kategori_active').on(table.kategoriPermintaanId, table.isActive),
    uniqueIndex('master_detail_permintaan_kategori_id_nama_active_unique')
      .on(table.kategoriPermintaanId, table.nama)
      .where(sql`${table.isActive} = true`),
  ],
)

export type MasterDetailPermintaan = typeof masterDetailPermintaan.$inferSelect
export type NewMasterDetailPermintaan = typeof masterDetailPermintaan.$inferInsert
