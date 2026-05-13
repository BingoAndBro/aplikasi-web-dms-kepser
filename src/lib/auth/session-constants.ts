// Server-only module. Do not import from client components.

export const SESSION_COOKIE_NAME = 'dms_session'
export const ACTIVE_ROLE_COOKIE_NAME = 'dms_active_role'

export const SESSION_TOKEN_BYTES = 32
export const SESSION_TOKEN_HASH_ALGORITHM = 'sha256'

export const SESSION_DURATION_SECONDS = 8 * 60 * 60
export const REMEMBER_ME_DURATION_SECONDS = 30 * 24 * 60 * 60

