import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from '../auth/users'
import { arsip } from './arsip'

const arsipSchema = pgSchema('arsip')

export const arsipUsulMusnah = arsipSchema.table(
  'arsip_usul_musnah',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    arsipId: uuid('arsip_id')
      .notNull()
      .references(() => arsip.id, { onDelete: 'no action', onUpdate: 'no action' }),
    // Canonical current values: MENUNGGU, DISETUJUI, DITOLAK.
    status: text('status').notNull().default('MENUNGGU'),
    catatan: text('catatan'),
    diusulkanOleh: uuid('diusulkan_oleh')
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    decidedBy: uuid('decided_by')
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    createdAt: timestamp('created_at').defaultNow(),
    decidedAt: timestamp('decided_at'),
  },
  (table) => [
    uniqueIndex('arsip_usul_musnah_arsip_id_unique').on(table.arsipId),
    index('idx_arsip_usul_musnah_arsip_id').on(table.arsipId),
    index('idx_arsip_usul_musnah_status').on(table.status),
    index('idx_arsip_usul_musnah_diusulkan_oleh').on(table.diusulkanOleh),
    index('idx_arsip_usul_musnah_created_at').on(table.createdAt),
    check(
      'arsip_usul_musnah_status_check',
      sql`${table.status} in ('MENUNGGU', 'DISETUJUI', 'DITOLAK')`,
    ),
  ],
)

export type ArsipUsulMusnah = typeof arsipUsulMusnah.$inferSelect
export type NewArsipUsulMusnah = typeof arsipUsulMusnah.$inferInsert
