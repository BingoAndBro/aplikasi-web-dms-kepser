// Server-only module. Do not import from client components.
import argon2 from 'argon2'

const ARGON2ID_PREFIX = '$argon2id$'

export const PASSWORD_HASH_ALGORITHM = 'argon2id' as const

// Centralized Argon2id work factors for auth.users.password_hash.
const PASSWORD_HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const

export async function hashPassword(password: string): Promise<string> {
  assertUsablePassword(password)

  const hash = await argon2.hash(password, PASSWORD_HASH_OPTIONS)
  assertArgon2idHash(hash)

  return hash
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (!isArgon2idHash(hash) || !isUsablePassword(password)) {
    return false
  }

  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

function isArgon2idHash(hash: string): boolean {
  return typeof hash === 'string' && hash.startsWith(ARGON2ID_PREFIX)
}

function assertArgon2idHash(hash: string): void {
  if (!isArgon2idHash(hash)) {
    throw new Error('Expected an Argon2id encoded password hash.')
  }
}

function assertUsablePassword(password: string): void {
  if (!isUsablePassword(password)) {
    throw new Error('Password must be a non-empty string.')
  }
}

function isUsablePassword(password: string): boolean {
  return typeof password === 'string' && password.trim().length > 0
}
