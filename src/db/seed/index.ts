import { db, pool } from '../client'
import { seedMasterData, seedKetuaTimFixture } from './master-data'
import { seedRoles } from './roles'
import { seedDevelopmentUsers } from './users'

async function main() {
  console.log('Starting local PostgreSQL seed foundation...')

  console.log('Seeding canonical roles...')
  await seedRoles(db)

  console.log('Seeding development users when enabled...')
  const userSeedResult = await seedDevelopmentUsers(db)

  console.log('Seeding minimal master data...')
  const masterData = await seedMasterData(db)

  console.log('Seeding optional Ketua Tim fixture when safe...')
  await seedKetuaTimFixture(db, {
    kegiatanId: masterData.kegiatanId,
    users: userSeedResult.userIds,
  })

  console.log('Seed foundation completed.')
}

main()
  .catch((error) => {
    console.error('Seed foundation failed.')
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
