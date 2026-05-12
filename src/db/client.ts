// Server-only Drizzle client foundation for the local PostgreSQL migration.
// Do not import this from client components or browser-executed modules.

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required to initialize the local PostgreSQL Drizzle client.',
  )
}

export const pool = new Pool({
  connectionString: databaseUrl,
})

export const db = drizzle(pool)
