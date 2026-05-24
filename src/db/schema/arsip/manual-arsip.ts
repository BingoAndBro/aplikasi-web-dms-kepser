import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from '../auth/users'
import { arsip } from './arsip'
import { masterKlasifikasiArsip } from './klasifikasi-arsip'

const arsipSchema = pgSchema('arsip')

export type ManualArsipMetadataJson = Record<string, unknown>

export const manualArsipCategory = arsipSchema.table(
  'manual_arsip_category',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nama: text('nama').notNull(),
    deskripsi: text('deskripsi'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('manual_arsip_category_nama_unique').on(table.nama),
    index('idx_manual_arsip_category_is_active').on(table.isActive),
  ],
)

export const manualArsip = arsipSchema.table(
  'manual_arsip',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nama: text('nama').notNull(),
    tanggal: date('tanggal').notNull(),
    nomorSurat: text('nomor_surat'),
    tanggalDiarsipkan: date('tanggal_diarsipkan'),
    keterangan: text('keterangan').notNull(),
    nominalRealisasi: numeric('nominal_realisasi', { precision: 15, scale: 2 }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => manualArsipCategory.id, { onDelete: 'restrict', onUpdate: 'no action' }),
    klasifikasiId: uuid('klasifikasi_id')
      .references(() => masterKlasifikasiArsip.id, { onDelete: 'set null', onUpdate: 'no action' }),
    klasifikasiKodeSnapshot: text('klasifikasi_kode_snapshot'),
    klasifikasiNamaSnapshot: text('klasifikasi_nama_snapshot'),
    retensiAktif: text('retensi_aktif'),
    retensiInaktif: text('retensi_inaktif'),
    masaAktifBerakhir: date('masa_aktif_berakhir'),
    masaInaktifBerakhir: date('masa_inaktif_berakhir'),
    archivedBy: uuid('archived_by')
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    canonicalArsipId: uuid('canonical_arsip_id')
      .references(() => arsip.id, { onDelete: 'set null', onUpdate: 'no action' }),
    // Canonical active lifecycle values: AKTIF, INAKTIF, USUL_MUSNAH, DIMUSNAHKAN.
    statusArsip: text('status_arsip').notNull().default('AKTIF'),
    metadata: jsonb('metadata').$type<ManualArsipMetadataJson>().notNull().default(sql`'{}'::jsonb`),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    inactivatedAt: timestamp('inactivated_at', { withTimezone: true }),
    inactivatedBy: uuid('inactivated_by')
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    proposedDestroyAt: timestamp('proposed_destroy_at', { withTimezone: true }),
    proposedDestroyBy: uuid('proposed_destroy_by')
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    destroyedAt: timestamp('destroyed_at', { withTimezone: true }),
    destroyedBy: uuid('destroyed_by')
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
  },
  (table) => [
    index('idx_manual_arsip_category_id').on(table.categoryId),
    index('idx_manual_arsip_klasifikasi_id').on(table.klasifikasiId),
    index('idx_manual_arsip_status_arsip').on(table.statusArsip),
    index('idx_manual_arsip_tanggal').on(table.tanggal),
    index('idx_manual_arsip_tanggal_diarsipkan').on(table.tanggalDiarsipkan),
    index('idx_manual_arsip_created_by').on(table.createdBy),
    uniqueIndex('manual_arsip_canonical_arsip_id_unique')
      .on(table.canonicalArsipId)
      .where(sql`${table.canonicalArsipId} is not null`),
    check(
      'manual_arsip_status_arsip_check',
      sql`${table.statusArsip} in ('AKTIF', 'INAKTIF', 'USUL_MUSNAH', 'DIMUSNAHKAN')`,
    ),
    check(
      'manual_arsip_nominal_realisasi_positive',
      sql`${table.nominalRealisasi} is null or ${table.nominalRealisasi} >= 0`,
    ),
  ],
)

export const manualArsipAttachment = arsipSchema.table(
  'manual_arsip_attachment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    manualArsipId: uuid('manual_arsip_id')
      .notNull()
      .references(() => manualArsip.id, { onDelete: 'no action', onUpdate: 'no action' }),
    logicalPath: text('logical_path').notNull(),
    originalFilename: text('original_filename').notNull(),
    judulLampiran: text('judul_lampiran').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').$type<ManualArsipMetadataJson>().notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    index('idx_manual_arsip_attachment_manual_arsip_id').on(table.manualArsipId),
    index('idx_manual_arsip_attachment_created_by').on(table.createdBy),
    check('manual_arsip_attachment_size_bytes_nonnegative', sql`${table.sizeBytes} >= 0`),
    check('manual_arsip_attachment_judul_lampiran_nonempty', sql`length(trim(${table.judulLampiran})) > 0`),
  ],
)

// Manual archive file paths are logical storage paths only. Future file-access
// routes must revalidate authorization and deny access when status_arsip is DIMUSNAHKAN.
export type ManualArsipCategory = typeof manualArsipCategory.$inferSelect
export type NewManualArsipCategory = typeof manualArsipCategory.$inferInsert
export type ManualArsip = typeof manualArsip.$inferSelect
export type NewManualArsip = typeof manualArsip.$inferInsert
export type ManualArsipAttachment = typeof manualArsipAttachment.$inferSelect
export type NewManualArsipAttachment = typeof manualArsipAttachment.$inferInsert
