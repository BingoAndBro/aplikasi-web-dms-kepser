// Server-only module. Do not import from client components.
import { createHash, randomBytes } from 'node:crypto'

import {
  SESSION_TOKEN_BYTES,
  SESSION_TOKEN_HASH_ALGORITHM,
} from './session-constants'

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/
const GENERATED_TOKEN_LENGTH = base64urlLengthForBytes(SESSION_TOKEN_BYTES)
const SHA256_BASE64URL_LENGTH = base64urlLengthForBytes(32)

export function generateSessionToken(): string {
  return toBase64url(randomBytes(SESSION_TOKEN_BYTES))
}

export function hashSessionToken(rawToken: string): string {
  if (!isNonEmptyString(rawToken)) {
    throw new Error('Session token must be a non-empty string.')
  }

  return toBase64url(
    createHash(SESSION_TOKEN_HASH_ALGORITHM).update(rawToken).digest(),
  )
}

export function isLikelySessionToken(rawToken: string): boolean {
  return isBase64urlString(rawToken, GENERATED_TOKEN_LENGTH)
}

export function isLikelySessionTokenHash(tokenHash: string): boolean {
  return isBase64urlString(tokenHash, SHA256_BASE64URL_LENGTH)
}

function toBase64url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function isBase64urlString(value: string, expectedLength: number): boolean {
  return (
    typeof value === 'string'
    && value.length === expectedLength
    && BASE64URL_PATTERN.test(value)
  )
}

function isNonEmptyString(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function base64urlLengthForBytes(byteLength: number): number {
  return Math.ceil((byteLength * 4) / 3)
}

