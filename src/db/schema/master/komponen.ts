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
import { masterKegiatan } from './kegiatan'

const masterSchema = pgSchema('master')

export const masterKomponen = masterSchema.table(
  'master_komponen',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kegiatanId: uuid('kegiatan_id')
      .notNull()
      .references(() => masterKegiatan.id, { onDelete: 'restrict' }),
    nama: text('nama').notNull(),
    deskripsi: text('deskripsi'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_master_komponen_kegiatan_id').on(table.kegiatanId),
    index('idx_master_komponen_is_active').on(table.isActive),
    index('idx_master_komponen_kegiatan_active').on(table.kegiatanId, table.isActive),
    uniqueIndex('master_komponen_kegiatan_id_nama_active_unique')
      .on(table.kegiatanId, table.nama)
      .where(sql`${table.isActive} = true`),
  ],
)

export type MasterKomponen = typeof masterKomponen.$inferSelect
export type NewMasterKomponen = typeof masterKomponen.$inferInsert
