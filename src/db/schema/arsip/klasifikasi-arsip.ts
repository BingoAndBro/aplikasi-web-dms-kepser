import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const arsipSchema = pgSchema('arsip')

export const masterKlasifikasiArsip = arsipSchema.table(
  'master_klasifikasi_arsip',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nama: text('nama').notNull(),
    deskripsi: text('deskripsi'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow(),
    parentId: uuid('parent_id')
      .references((): any => masterKlasifikasiArsip.id, { onDelete: 'set null' }),
    kode: text('kode'),
  },
  (table) => [
    uniqueIndex('master_klasifikasi_arsip_nama_unique').on(table.nama),
    uniqueIndex('idx_master_klasifikasi_kode_unique')
      .on(table.kode)
      .where(sql`${table.kode} is not null`),
    index('idx_master_klasifikasi_active')
      .on(table.isActive)
      .where(sql`${table.isActive} = true`),
    index('idx_master_klasifikasi_parent_id')
      .on(table.parentId)
      .where(sql`${table.parentId} is not null`),
  ],
)

export type MasterKlasifikasiArsip = typeof masterKlasifikasiArsip.$inferSelect
export type NewMasterKlasifikasiArsip = typeof masterKlasifikasiArsip.$inferInsert
