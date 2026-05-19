import { roleArraySchema } from './schemas/auth'
import {
  userListResponseSchema,
  userProfileResponseSchema,
  userResponseSchema,
} from './schemas/user'
import { parseUserMetadata } from './user-metadata'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeUser(value: unknown): unknown {
  if (!isRecord(value)) return value

  return {
    ...value,
    metadata: parseUserMetadata(value.metadata),
    roles: parseRoleArray(value.roles),
  }
}

function parseRoleArray(value: unknown) {
  const parsed = roleArraySchema.safeParse(value)
  return parsed.success ? parsed.data : []
}

export function parseUserProfileResponse(value: unknown): unknown {
  if (!isRecord(value)) return value

  const candidate = {
    ...value,
    user: normalizeUser(value.user),
  }

  const parsed = userProfileResponseSchema.safeParse(candidate)
  return parsed.success ? parsed.data : value
}

export function parseUserResponse(value: unknown): unknown {
  if (!isRecord(value)) return value

  const candidate = {
    ...value,
    user: normalizeUser(value.user),
  }

  const parsed = userResponseSchema.safeParse(candidate)
  return parsed.success ? parsed.data : value
}

export function parseUserListResponse(value: unknown): unknown {
  if (!isRecord(value)) return value

  const candidate = {
    ...value,
    users: Array.isArray(value.users) ? value.users.map(normalizeUser) : value.users,
  }

  const parsed = userListResponseSchema.safeParse(candidate)
  return parsed.success ? parsed.data : value
}
