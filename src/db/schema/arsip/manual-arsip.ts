import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from '../auth/users'
import { masterFungsi } from '../master/fungsi'
import { masterKegiatan } from '../master/kegiatan'
import { masterKomponen } from '../master/komponen'
import { masterKlasifikasiArsip } from './klasifikasi-arsip'

const arsipSchema = pgSchema('arsip')

export type ManualArsipMetadataJson = Record<string, unknown>

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
    fungsiId: uuid('fungsi_id')
      .notNull()
      .references(() => masterFungsi.id, { onDelete: 'restrict', onUpdate: 'no action' }),
    kegiatanId: uuid('kegiatan_id')
      .notNull()
      .references(() => masterKegiatan.id, { onDelete: 'restrict', onUpdate: 'no action' }),
    komponenId: uuid('komponen_id')
      .notNull()
      .references(() => masterKomponen.id, { onDelete: 'restrict', onUpdate: 'no action' }),
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
    index('idx_manual_arsip_fungsi_id').on(table.fungsiId),
    index('idx_manual_arsip_kegiatan_id').on(table.kegiatanId),
    index('idx_manual_arsip_komponen_id').on(table.komponenId),
    index('idx_manual_arsip_klasifikasi_id').on(table.klasifikasiId),
    index('idx_manual_arsip_status_arsip').on(table.statusArsip),
    index('idx_manual_arsip_tanggal').on(table.tanggal),
    index('idx_manual_arsip_tanggal_diarsipkan').on(table.tanggalDiarsipkan),
    index('idx_manual_arsip_created_by').on(table.createdBy),
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
export type ManualArsip = typeof manualArsip.$inferSelect
export type NewManualArsip = typeof manualArsip.$inferInsert
export type ManualArsipAttachment = typeof manualArsipAttachment.$inferSelect
export type NewManualArsipAttachment = typeof manualArsipAttachment.$inferInsert
