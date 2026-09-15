import { jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

const appSchema = pgSchema('app')

export const appSettings = appSchema.table('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
})

export type AppSetting = typeof appSettings.$inferSelect
export type NewAppSetting = typeof appSettings.$inferInsert
