import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { masterDetailPermintaan } from './detail-permintaan'
import { masterJenisPermintaan } from './jenis-permintaan'
import { masterKategoriPermintaan } from './kategori-permintaan'
import { masterKegiatan } from './kegiatan'
import { masterKomponen } from './komponen'

const masterSchema = pgSchema('master')

export const masterKelengkapanDokumen = masterSchema.table(
  'master_kelengkapan_dokumen',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kegiatanId: uuid('kegiatan_id')
      .notNull()
      .references(() => masterKegiatan.id, { onDelete: 'cascade' }),
    isKetuaTim: boolean('is_ketua_tim').notNull(),
    namaDokumen: text('nama_dokumen').notNull(),
    required: boolean('required').notNull().default(true),
    komponenId: uuid('komponen_id')
      .references(() => masterKomponen.id, { onDelete: 'restrict' }),
    jenisPermintaanId: uuid('jenis_permintaan_id')
      .references(() => masterJenisPermintaan.id, { onDelete: 'restrict' }),
    kategoriPermintaanId: uuid('kategori_permintaan_id')
      .references(() => masterKategoriPermintaan.id, { onDelete: 'restrict' }),
    detailPermintaanId: uuid('detail_permintaan_id')
      .references(() => masterDetailPermintaan.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_master_kelengkapan_kegiatan_id').on(table.kegiatanId),
    index('idx_master_kelengkapan_is_ketua_tim').on(table.isKetuaTim),
    index('idx_master_kelengkapan_chain').on(
      table.kegiatanId,
      table.isKetuaTim,
      table.komponenId,
      table.jenisPermintaanId,
      table.kategoriPermintaanId,
      table.detailPermintaanId,
    ),
    check(
      'master_kelengkapan_jenis_requires_komponen_check',
      sql`${table.jenisPermintaanId} is null or ${table.komponenId} is not null`,
    ),
    check(
      'master_kelengkapan_kategori_requires_jenis_check',
      sql`${table.kategoriPermintaanId} is null or ${table.jenisPermintaanId} is not null`,
    ),
    check(
      'master_kelengkapan_detail_requires_kategori_check',
      sql`${table.detailPermintaanId} is null or ${table.kategoriPermintaanId} is not null`,
    ),
  ],
)

// Parent/child chain consistency across rows mirrors the current trigger in
// supabase/migrations/018_validate_kelengkapan_chain.sql and remains a later
// migration/service validation concern.
export type MasterKelengkapanDokumen = typeof masterKelengkapanDokumen.$inferSelect
export type NewMasterKelengkapanDokumen = typeof masterKelengkapanDokumen.$inferInsert
