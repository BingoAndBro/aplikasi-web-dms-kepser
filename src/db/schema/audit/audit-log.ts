import { sql } from 'drizzle-orm'
import {
  check,
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from '../auth/users'

const auditSchema = pgSchema('audit')

// Canonical entity_type values: DOKUMEN.
export const AUDIT_ENTITY_TYPE_VALUES = ['DOKUMEN'] as const
export type AuditEntityType = typeof AUDIT_ENTITY_TYPE_VALUES[number]

// Canonical aksi values:
// - DOKUMEN_LAMPIRAN_DIBERSIHKAN: ketua tim membersihkan lampiran dokumen non-material.
// - DOKUMEN_DIHAPUS_PERMANEN: pegawai hard-delete dokumen non-material miliknya.
// - BERKAS_LAMPIRAN_DIBERSIHKAN: kasubag memusnahkan berkas; dokumen anggota ikut tercatat.
export const AUDIT_LOG_AKSI_VALUES = [
  'DOKUMEN_LAMPIRAN_DIBERSIHKAN',
  'DOKUMEN_DIHAPUS_PERMANEN',
  'BERKAS_LAMPIRAN_DIBERSIHKAN',
] as const
export type AuditLogAksi = typeof AUDIT_LOG_AKSI_VALUES[number]

// Jejak audit lintas fitur, dibuat agar tetap terbaca setelah baris entitasnya
// dihapus permanen (hard delete). SENGAJA TANPA .references() pada entityId --
// entitas boleh lenyap tanpa memblokir penghapusan dan tanpa cascade menghapus
// jejaknya sendiri (lihat log_aktivitas.dokumen_id yang justru cascade). Bukti
// keberadaan & isi entitas yang sudah hilang disimpan di metadataSnapshot.
export const auditLog = auditSchema.table(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: text('entity_type').$type<AuditEntityType>().notNull(),
    entityId: uuid('entity_id').notNull(),
    aksi: text('aksi').$type<AuditLogAksi>().notNull(),
    actorUserId: uuid('actor_user_id')
      .references(() => users.id, { onDelete: 'set null', onUpdate: 'no action' }),
    metadataSnapshot: jsonb('metadata_snapshot').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_audit_log_entity').on(table.entityType, table.entityId),
    index('idx_audit_log_actor_created_at').on(table.actorUserId, table.createdAt),
    index('idx_audit_log_aksi_created_at').on(table.aksi, table.createdAt),
    check('audit_log_entity_type_check', sql`${table.entityType} in ('DOKUMEN')`),
    check(
      'audit_log_aksi_check',
      sql`${table.aksi} in (
        'DOKUMEN_LAMPIRAN_DIBERSIHKAN',
        'DOKUMEN_DIHAPUS_PERMANEN',
        'BERKAS_LAMPIRAN_DIBERSIHKAN'
      )`,
    ),
  ],
)

export type AuditLog = typeof auditLog.$inferSelect
export type NewAuditLog = typeof auditLog.$inferInsert
