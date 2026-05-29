import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from '../auth/users'
import { dokumenTransaksi } from '../dokumen/dokumen-transaksi'
import { arsip } from './arsip'
import { masterKlasifikasiArsip } from './klasifikasi-arsip'
import { manualArsip } from './manual-arsip'

const arsipSchema = pgSchema('arsip')

export type BerkasStatus = 'OPEN' | 'CLOSED'

export const berkasArsip = arsipSchema.table(
  'berkas_arsip',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    klasifikasiId: uuid('klasifikasi_id')
      .notNull()
      .references(() => masterKlasifikasiArsip.id, { onDelete: 'restrict', onUpdate: 'no action' }),
    klasifikasiKodeSnapshot: text('klasifikasi_kode_snapshot'),
    klasifikasiNamaSnapshot: text('klasifikasi_nama_snapshot').notNull(),
    statusBerkas: text('status_berkas').$type<BerkasStatus>().notNull().default('OPEN'),
    nomorSpm: text('nomor_spm'),
    retensiAktif: text('retensi_aktif'),
    retensiInaktif: text('retensi_inaktif'),
    masaAktifBerakhir: date('masa_aktif_berakhir'),
    masaInaktifBerakhir: date('masa_inaktif_berakhir'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by')
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_berkas_arsip_klasifikasi_id').on(table.klasifikasiId),
    index('idx_berkas_arsip_status_berkas').on(table.statusBerkas),
    index('idx_berkas_arsip_closed_at').on(table.closedAt),
    index('idx_berkas_arsip_created_by').on(table.createdBy),
    uniqueIndex('berkas_arsip_open_klasifikasi_unique')
      .on(table.klasifikasiId)
      .where(sql`${table.statusBerkas} = 'OPEN'`),
    check('berkas_arsip_status_berkas_check', sql`${table.statusBerkas} in ('OPEN', 'CLOSED')`),
    check(
      'berkas_arsip_closed_metadata_check',
      sql`(${table.statusBerkas} = 'OPEN' and ${table.closedAt} is null and ${table.closedBy} is null)
        or (${table.statusBerkas} = 'CLOSED' and ${table.closedAt} is not null and ${table.closedBy} is not null)`,
    ),
  ],
)

export const berkasArsipItem = arsipSchema.table(
  'berkas_arsip_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    berkasId: uuid('berkas_id')
      .notNull()
      .references(() => berkasArsip.id, { onDelete: 'no action', onUpdate: 'no action' }),
    sourceType: text('source_type').$type<'WORKFLOW' | 'MANUAL'>().notNull(),
    dokumenId: uuid('dokumen_id')
      .references(() => dokumenTransaksi.id, { onDelete: 'no action', onUpdate: 'no action' }),
    manualArsipId: uuid('manual_arsip_id')
      .references(() => manualArsip.id, { onDelete: 'no action', onUpdate: 'no action' }),
    canonicalArsipId: uuid('canonical_arsip_id')
      .references(() => arsip.id, { onDelete: 'set null', onUpdate: 'no action' }),
    addedBy: uuid('added_by')
      .notNull()
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_berkas_arsip_item_berkas_id').on(table.berkasId),
    index('idx_berkas_arsip_item_source_type').on(table.sourceType),
    index('idx_berkas_arsip_item_added_by').on(table.addedBy),
    index('idx_berkas_arsip_item_canonical_arsip_id').on(table.canonicalArsipId),
    uniqueIndex('berkas_arsip_item_dokumen_id_unique')
      .on(table.dokumenId)
      .where(sql`${table.dokumenId} is not null`),
    uniqueIndex('berkas_arsip_item_manual_arsip_id_unique')
      .on(table.manualArsipId)
      .where(sql`${table.manualArsipId} is not null`),
    check('berkas_arsip_item_source_type_check', sql`${table.sourceType} in ('WORKFLOW', 'MANUAL')`),
    check(
      'berkas_arsip_item_source_reference_check',
      sql`(${table.sourceType} = 'WORKFLOW' and ${table.dokumenId} is not null and ${table.manualArsipId} is null)
        or (${table.sourceType} = 'MANUAL' and ${table.manualArsipId} is not null and ${table.dokumenId} is null)`,
    ),
  ],
)

// Phase 13F only adds the folder/berkas foundation. Runtime helpers must still
// enforce that CLOSED folders cannot accept new items before wiring writes.
export type BerkasArsip = typeof berkasArsip.$inferSelect
export type NewBerkasArsip = typeof berkasArsip.$inferInsert
export type BerkasArsipItem = typeof berkasArsipItem.$inferSelect
export type NewBerkasArsipItem = typeof berkasArsipItem.$inferInsert
