import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('0017_username_login_identity migration', () => {
  it('exists and is registered in the manual drizzle journal', () => {
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
      entries: { idx: number, tag: string }[]
    }

    const entry = journal.entries.find((e) => e.idx === 17)
    expect(entry?.tag).toBe('0017_username_login_identity')

    // Should not throw: confirms the file exists at the path the journal tag implies.
    expect(() => readFileSync(`drizzle/${entry?.tag}.sql`, 'utf8')).not.toThrow()
  })

  it('adds username/nip_nrp uniqueness and drops the email uniqueness', () => {
    const sql = readFileSync('drizzle/0017_username_login_identity.sql', 'utf8')

    expect(sql).toContain('"auth_users_username_unique"')
    expect(sql).toContain('"auth_users_nip_nrp_unique"')
    expect(sql).toContain('DROP INDEX IF EXISTS "auth"."auth_users_email_unique"')
    expect(sql).toContain('ALTER COLUMN "email" DROP NOT NULL')
  })

  it('enforces a username format CHECK identical to the application-level isValidUsername() regex', () => {
    const sql = readFileSync('drizzle/0017_username_login_identity.sql', 'utf8')
    const userTypes = readFileSync('src/lib/types/user.ts', 'utf8')

    const sqlCheckMatch = sql.match(/CHECK \(username ~ '(\^\[a-z0-9._-\]\{3,30\}\$)' AND username ~ '(\[a-z\])'\)/)
    expect(sqlCheckMatch, 'expected a username format CHECK constraint in the migration').not.toBeNull()

    const appRegexMatch = userTypes.match(/const usernameRegex = \/(\^\[a-z0-9._-\]\{3,30\}\$)\//)
    expect(appRegexMatch, 'expected isValidUsername() to define usernameRegex').not.toBeNull()

    expect(sqlCheckMatch?.[1]).toBe(appRegexMatch?.[1])
    expect(userTypes).toContain("/[a-z]/.test(username)")
  })
})
