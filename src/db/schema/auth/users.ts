import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const authSchema = pgSchema('auth')

export const users = authSchema.table(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    passwordHashAlgorithm: text('password_hash_algorithm').notNull().default('argon2id'),
    displayName: text('display_name'),
    namaLengkap: text('nama_lengkap'),
    nipNrp: text('nip_nrp'),
    departemen: text('departemen'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    isActive: boolean('is_active').notNull().default(true),
    inactiveReason: text('inactive_reason'),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    deactivatedBy: uuid('deactivated_by'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    passwordUpdatedAt: timestamp('password_updated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('auth_users_email_unique').on(table.email),
    index('idx_auth_users_is_active').on(table.isActive),
    index('idx_auth_users_deactivated_by').on(table.deactivatedBy),
  ],
)

export type AuthUser = typeof users.$inferSelect
export type NewAuthUser = typeof users.$inferInsert
