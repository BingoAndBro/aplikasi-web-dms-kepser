import {
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from '../auth/users'
import { dokumenTransaksi } from './dokumen-transaksi'

const dokumenSchema = pgSchema('dokumen')

export const logAktivitas = dokumenSchema.table(
  'log_aktivitas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dokumenId: uuid('dokumen_id')
      .notNull()
      .references(() => dokumenTransaksi.id, { onDelete: 'cascade', onUpdate: 'no action' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'no action', onUpdate: 'no action' }),
    aksi: text('aksi').notNull(),
    catatan: text('catatan'),
    stepUrutan: integer('step_urutan'),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('log_aktivitas_dokumen_id_idx').on(table.dokumenId),
    index('log_aktivitas_user_id_idx').on(table.userId),
    index('idx_log_aktivitas_dokumen_timestamp').on(table.dokumenId, table.timestamp),
    index('idx_log_aktivitas_dokumen_aksi').on(table.dokumenId, table.aksi),
  ],
)

// log_aktivitas is append-only by application contract. Do not add
// application update/delete behavior for this table.
export type LogAktivitas = typeof logAktivitas.$inferSelect
export type NewLogAktivitas = typeof logAktivitas.$inferInsert
