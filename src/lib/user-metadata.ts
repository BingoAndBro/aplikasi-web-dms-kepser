import { userMetadataSchema } from './schemas/user'
import type { UserMetadata } from './types/user'

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

export function parseUserMetadata(rawMetadata: unknown): UserMetadata {
  const candidate = rawMetadata && typeof rawMetadata === 'object'
    ? {
        nama_lengkap: pickString((rawMetadata as Record<string, unknown>).nama_lengkap),
        nip_nrp: pickString((rawMetadata as Record<string, unknown>).nip_nrp),
        departemen: pickString((rawMetadata as Record<string, unknown>).departemen),
      }
    : {}

  const parsed = userMetadataSchema.safeParse(candidate)
  return parsed.success ? parsed.data : {}
}
