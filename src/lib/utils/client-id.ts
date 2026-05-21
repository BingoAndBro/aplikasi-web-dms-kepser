type ClientIdCrypto = {
  randomUUID?: () => string
  getRandomValues?: (array: Uint8Array) => Uint8Array
}

// Non-security temporary client IDs only. Do not use for auth, sessions,
// CSRF, password reset, authorization, or file-access tokens.
export function createClientId(
  prefix = 'client',
  cryptoSource: ClientIdCrypto | undefined = globalThis.crypto,
): string {
  const id = createClientIdValue(cryptoSource)
  return prefix ? `${prefix}-${id}` : id
}

function createClientIdValue(cryptoSource: ClientIdCrypto | undefined): string {
  if (typeof cryptoSource?.randomUUID === 'function') {
    try {
      return cryptoSource.randomUUID()
    } catch {
      // Fall through to older browser-compatible paths.
    }
  }

  if (typeof cryptoSource?.getRandomValues === 'function') {
    try {
      return createUuidLikeValue(cryptoSource)
    } catch {
      // Fall through to the non-security last resort below.
    }
  }

  return `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function createUuidLikeValue(cryptoSource: Required<Pick<ClientIdCrypto, 'getRandomValues'>>): string {
  const bytes = new Uint8Array(16)
  cryptoSource.getRandomValues(bytes)

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0'))

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-')
}
