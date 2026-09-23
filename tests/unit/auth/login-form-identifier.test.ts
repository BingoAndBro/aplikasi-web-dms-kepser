import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('login form uses a username/NIP identifier, not an email field', () => {
  it('src/routes/login.tsx no longer renders an email input and offers username/NIP copy', () => {
    const source = readFileSync('src/routes/login.tsx', 'utf8')

    expect(source).not.toContain('type="email"')
    expect(source).not.toContain('autoComplete="email"')
    expect(source).toContain('Username atau NIP')
    expect(source).toContain('autoComplete="username"')
  })
})
