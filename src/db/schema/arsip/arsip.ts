import { sql } from 'drizzle-orm'
import {
  boolean,
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
import { dokumenTransaksi } from '../dokumen/dokumen-transaksi'
import { masterKlasifikasiArsip } from './klasifikasi-arsip'

const arsipSchema = pgSchema('arsip')

export type ArchiveSourceType = 'WORKFLOW' | 'MANUAL'

export type LampiranSnapshotJson = Array<{
  kelengkapan_id: string
  nama: string
  url: string
  uploaded_at?: string
}>

export const arsip = arsipSchema.table(
  'arsip',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dokumenId: uuid('dokumen_id')
      .references(() => dokumenTransaksi.id, { onDelete: 'no action', onUpdate: 'no action' }),
    sourceType: text('source_type').$type<ArchiveSourceType>().notNull().default('WORKFLOW'),
    namaArsip: text('nama_arsip'),
    nomorSurat: text('nomor_surat'),
    klasifikasi: text('klasifikasi'),
    klasifikasiId: uuid('klasifikasi_id')
      .references(() => masterKlasifikasiArsip.id, { onDelete: 'set null', onUpdate: 'no action' }),
    klasifikasiKodeSnapshot: text('klasifikasi_kode_snapshot'),
    klasifikasiNamaSnapshot: text('klasifikasi_nama_snapshot'),
    retensiAktif: text('retensi_aktif'),
    retensiInaktif: text('retensi_inaktif'),
    masaAktifBerakhir: date('masa_aktif_berakhir'),
    masaInaktifBerakhir: date('masa_inaktif_berakhir'),
    // Canonical active lifecycle values: AKTIF, INAKTIF, USUL_MUSNAH, DIMUSNAHKAN.
    statusArsip: text('status_arsip').notNull().default('AKTIF'),
    isDitolak: boolean('is_ditolak').notNull().default(false),
    catatanArsiparis: text('catatan_arsiparis'),
    archivedBy: uuid('archived_by')
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    archivedAt: timestamp('archived_at').defaultNow(),
    createdBy: uuid('created_by')
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    lampiranSnapshot: jsonb('lampiran_snapshot').$type<LampiranSnapshotJson | [] | null>(),
    musnahAt: timestamp('musnah_at', { withTimezone: true }),
    musnahBy: uuid('musnah_by')
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    musnahCatatan: text('musnah_catatan'),
    nominalRealisasi: numeric('nominal_realisasi', { precision: 15, scale: 2 }),
  },
  (table) => [
    index('idx_arsip_source_type').on(table.sourceType),
    index('idx_arsip_status_arsip').on(table.statusArsip),
    index('idx_arsip_dokumen_id').on(table.dokumenId),
    index('idx_arsip_klasifikasi_id').on(table.klasifikasiId),
    index('idx_arsip_masa_aktif_berakhir')
      .on(table.masaAktifBerakhir)
      .where(sql`${table.statusArsip} = 'AKTIF'`),
    index('idx_arsip_masa_inaktif_berakhir')
      .on(table.masaInaktifBerakhir)
      .where(sql`${table.statusArsip} = 'INAKTIF'`),
    index('idx_arsip_archived_at').on(table.archivedAt),
    index('idx_arsip_musnah_by').on(table.musnahBy),
    check('arsip_source_type_check', sql`${table.sourceType} in ('WORKFLOW', 'MANUAL')`),
  ],
)

// DIMUSNAHKAN archive rows remain queryable history, but preview/download
// authorization must deny access based on status_arsip in API/storage code.
export type Arsip = typeof arsip.$inferSelect
export type NewArsip = typeof arsip.$inferInsert
