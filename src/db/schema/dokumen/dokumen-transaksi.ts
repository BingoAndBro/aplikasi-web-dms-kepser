import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from '../auth/users'
import {
  masterFungsi,
  masterJenisDokumen,
  masterKegiatan,
  masterKomponen,
} from '../master'

const dokumenSchema = pgSchema('dokumen')

export type LampiranUrlsJson = Array<{
  kelengkapan_id: string
  nama: string
  url: string
  uploaded_at?: string
}>

export const dokumenTransaksi = dokumenSchema.table(
  'dokumen_transaksi',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    judul: text('judul').notNull(),
    fungsiId: uuid('fungsi_id')
      .notNull()
      .references(() => masterFungsi.id, { onDelete: 'restrict', onUpdate: 'no action' }),
    kegiatanJenisId: uuid('kegiatan_jenis_id')
      .notNull()
      .references(() => masterKegiatan.id, { onDelete: 'restrict', onUpdate: 'no action' }),
    isKetuaTim: boolean('is_ketua_tim').notNull().default(false),
    // Canonical values: DRAFT, IN_PPK_VALIDATION, IN_BENDAHARA_APPROVAL,
    // NEED_REVISION, COMPLETED, TERSIMPAN.
    status: text('status').notNull().default('DRAFT'),
    // Canonical values: PPK, BENDAHARA, null.
    currentStep: text('current_step'),
    // Canonical values: USER, PPK, null.
    revisionTarget: text('revision_target'),
    revisionNotes: text('revision_notes'),
    lampiranUrls: jsonb('lampiran_urls').$type<LampiranUrlsJson>().notNull().default(sql`'[]'::jsonb`),
    tahun: integer('tahun').notNull(),
    tanggal: text('tanggal').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    jenisPermintaanId: uuid('jenis_permintaan_id'),
    kategoriPermintaanId: uuid('kategori_permintaan_id'),
    detailPermintaanId: uuid('detail_permintaan_id'),
    nominalRealisasi: numeric('nominal_realisasi', { precision: 15, scale: 2 }).default('0'),
    isNonMaterial: boolean('is_non_material').default(false),
    keteranganDetail: text('keterangan_detail'),
    jenisDokumenId: uuid('jenis_dokumen_id')
      .references(() => masterJenisDokumen.id, { onDelete: 'no action', onUpdate: 'no action' }),
    komponenId: uuid('komponen_id')
      .references(() => masterKomponen.id, { onDelete: 'restrict', onUpdate: 'no action' }),
    namaDokumen: text('nama_dokumen'),
    // Kondisi lampiran fisik -- TERPISAH dari `status` (posisi proses/FSM).
    // Diisi lewat dua jalur: pembersihan non-material oleh ketua tim
    // ('PEMBERSIHAN_NON_MATERIAL'), atau pemusnahan berkas oleh kasubag
    // ('BERKAS_DIMUSNAHKAN'). Hanya untuk tampilan (badge "File Dibersihkan");
    // otoritas pemblokiran akses arsip tetap join ke berkasArsip.statusArsip.
    lampiranDibersihkanAt: timestamp('lampiran_dibersihkan_at', { withTimezone: true }),
    lampiranDibersihkanBy: uuid('lampiran_dibersihkan_by')
      .references(() => users.id, { onDelete: 'set null', onUpdate: 'no action' }),
    lampiranDibersihkanAlasan: text('lampiran_dibersihkan_alasan'),
  },
  (table) => [
    index('idx_dokumen_transaksi_created_by').on(table.createdBy),
    index('idx_dokumen_transaksi_created_by_status').on(table.createdBy, table.status),
    index('idx_dokumen_transaksi_status').on(table.status),
    index('idx_dokumen_transaksi_status_current_step').on(table.status, table.currentStep),
    index('idx_dokumen_transaksi_revision_target').on(table.revisionTarget),
    index('idx_dokumen_transaksi_fungsi_id').on(table.fungsiId),
    index('idx_dokumen_transaksi_kegiatan_jenis_id').on(table.kegiatanJenisId),
    index('idx_dokumen_transaksi_created_at').on(table.createdAt),
    index('idx_dokumen_transaksi_updated_at').on(table.updatedAt),
    index('idx_dokumen_transaksi_status_updated_at').on(table.status, table.updatedAt),
    index('idx_dokumen_transaksi_laporan_saya').on(table.createdBy, table.tahun),
    index('idx_dokumen_transaksi_laporan_kegiatan').on(table.kegiatanJenisId, table.tahun),
    index('idx_dokumen_transaksi_jenis_permintaan_id').on(table.jenisPermintaanId),
    index('idx_dokumen_transaksi_kategori_permintaan_id').on(table.kategoriPermintaanId),
    index('idx_dokumen_transaksi_detail_permintaan_id').on(table.detailPermintaanId),
    index('idx_dokumen_transaksi_komponen_id').on(table.komponenId),
    index('idx_dokumen_transaksi_lampiran_dibersihkan_at').on(table.lampiranDibersihkanAt),
    check(
      'dokumen_nominal_realisasi_positive',
      sql`${table.nominalRealisasi} is null or ${table.nominalRealisasi} >= 0`,
    ),
    check(
      'dokumen_lampiran_dibersihkan_alasan_check',
      sql`${table.lampiranDibersihkanAlasan} is null or ${table.lampiranDibersihkanAlasan} in ('BERKAS_DIMUSNAHKAN', 'PEMBERSIHAN_NON_MATERIAL')`,
    ),
  ],
)

export type DokumenTransaksi = typeof dokumenTransaksi.$inferSelect
export type NewDokumenTransaksi = typeof dokumenTransaksi.$inferInsert
