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
import { masterJenisPermintaan } from './jenis-permintaan'

const masterSchema = pgSchema('master')

export const masterKategoriPermintaan = masterSchema.table(
  'master_kategori_permintaan',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jenisPermintaanId: uuid('jenis_permintaan_id')
      .notNull()
      .references(() => masterJenisPermintaan.id, { onDelete: 'restrict' }),
    nama: text('nama').notNull(),
    deskripsi: text('deskripsi'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_master_kategori_permintaan_jenis_id').on(table.jenisPermintaanId),
    index('idx_master_kategori_permintaan_jenis_active').on(table.jenisPermintaanId, table.isActive),
    uniqueIndex('master_kategori_permintaan_jenis_id_nama_active_unique')
      .on(table.jenisPermintaanId, table.nama)
      .where(sql`${table.isActive} = true`),
  ],
)

export type MasterKategoriPermintaan = typeof masterKategoriPermintaan.$inferSelect
export type NewMasterKategoriPermintaan = typeof masterKategoriPermintaan.$inferInsert
