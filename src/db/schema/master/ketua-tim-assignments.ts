import {
  index,
  pgSchema,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from '../auth/users'
import { masterKegiatan } from './kegiatan'

const masterSchema = pgSchema('master')

export const ketuaTimAssignments = masterSchema.table(
  'ketua_tim_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kegiatanId: uuid('kegiatan_id')
      .notNull()
      .references(() => masterKegiatan.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by')
      .references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('ketua_tim_kegiatan_unique').on(table.kegiatanId),
    index('idx_ketua_tim_user_id').on(table.userId),
    index('idx_ketua_tim_kegiatan_id').on(table.kegiatanId),
  ],
)

// Compatibility invariant: one kegiatan has one active assignment row, while a
// user can be assigned to many kegiatan. Do not change this to unique
// (user_id, kegiatan_id) without a separate workflow decision.
export type KetuaTimAssignment = typeof ketuaTimAssignments.$inferSelect
export type NewKetuaTimAssignment = typeof ketuaTimAssignments.$inferInsert
