import { eq } from 'drizzle-orm'
import type { db } from '../client'
import { roles } from '../schema/auth'
import { CANONICAL_SEED_ROLES } from './constants'

type SeedDb = typeof db

export async function seedRoles(database: SeedDb) {
  for (const role of CANONICAL_SEED_ROLES) {
    await database
      .insert(roles)
      .values(role)
      .onConflictDoUpdate({
        target: roles.nama,
        set: {
          description: role.description,
        },
      })

    const [existing] = await database
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.nama, role.nama))
      .limit(1)

    if (!existing) {
      throw new Error(`Failed to verify seeded role: ${role.nama}`)
    }
  }
}
