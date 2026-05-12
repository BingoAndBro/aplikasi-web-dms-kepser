import { index, pgSchema, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core'
import { roles } from './roles'
import { users } from './users'

const authSchema = pgSchema('auth')

export const userRoles = authSchema.table(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'auth_user_roles_user_id_role_id_pk',
      columns: [table.userId, table.roleId],
    }),
    index('idx_auth_user_roles_user_id').on(table.userId),
    index('idx_auth_user_roles_role_id').on(table.roleId),
  ],
)

// ADMIN remains a dedicated account mode. Cross-row exclusivity cannot be
// expressed with a simple join-table check constraint, so service/seed/admin
// mutation logic must reject ADMIN combined with any non-admin role.
export type AuthUserRole = typeof userRoles.$inferSelect
export type NewAuthUserRole = typeof userRoles.$inferInsert
