// Server-only Drizzle client foundation for the local PostgreSQL migration.
//
// A PostgreSQL runtime driver is not declared in package.json yet. Keep this
// placeholder out of application routes until a driver is selected and added.

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required for the local PostgreSQL Drizzle client.',
  )
}

const missingDriverMessage =
  'PostgreSQL driver dependency is missing. Add an approved Drizzle PostgreSQL driver before using src/db/client.ts.'

type MissingDriverDb = {
  readonly __driverMissing: true
}

function createMissingDriverDb(): MissingDriverDb {
  return new Proxy(
    { __driverMissing: true },
    {
      get(target, property) {
        if (property === '__driverMissing') {
          return target.__driverMissing
        }
        throw new Error(missingDriverMessage)
      },
    },
  ) as MissingDriverDb
}

export const db = createMissingDriverDb()
