// Server-only local user read queries for admin user-management surfaces.
import { asc, eq } from 'drizzle-orm'

import { db } from '#/db/client'
import { roles as rolesTable, userRoles, users } from '#/db/schema/auth'
import { ROLE_NAMES, type RoleName } from '#/lib/constants/roles'
import { createUserAvatarUrl, isAllowedProfileAvatarResponseMimeType } from '#/lib/storage/profile-avatar'
import type { UserMetadata, UserWithRoles } from '#/lib/types/user'
import { parseUserMetadata } from '#/lib/user-metadata'

type LocalUserRow = {
  id: string
  username: string
  email: string | null
  displayName: string | null
  namaLengkap: string | null
  nipNrp: string | null
  departemen: string | null
  metadata: Record<string, unknown>
  isActive: boolean
  deactivatedAt: Date | null
  createdAt: Date
  updatedAt: Date
  avatarStorageKey: string | null
  avatarMimeType: string | null
  avatarSizeBytes: number | null
  avatarUpdatedAt: Date | null
}

type LocalUserWithRolesRow = {
  user: LocalUserRow
  roleName: string | null
}

export async function getLocalUsersWithRoles(): Promise<UserWithRoles[]> {
  const rows = await baseLocalUserQuery()
    .orderBy(asc(users.createdAt), asc(users.username), asc(rolesTable.nama))

  return groupLocalUserRows(rows)
}

export async function getLocalUserWithRoles(userId: string): Promise<UserWithRoles | null> {
  const rows = await baseLocalUserQuery()
    .where(eq(users.id, userId))
    .orderBy(asc(rolesTable.nama))

  return groupLocalUserRows(rows)[0] ?? null
}

function baseLocalUserQuery() {
  return db
    .select({
      user: {
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        namaLengkap: users.namaLengkap,
        nipNrp: users.nipNrp,
        departemen: users.departemen,
        metadata: users.metadata,
        isActive: users.isActive,
        deactivatedAt: users.deactivatedAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        avatarStorageKey: users.avatarStorageKey,
        avatarMimeType: users.avatarMimeType,
        avatarSizeBytes: users.avatarSizeBytes,
        avatarUpdatedAt: users.avatarUpdatedAt,
      },
      roleName: rolesTable.nama,
    })
    .from(users)
    .leftJoin(userRoles, eq(users.id, userRoles.userId))
    .leftJoin(rolesTable, eq(userRoles.roleId, rolesTable.id))
}

function groupLocalUserRows(rows: LocalUserWithRolesRow[]): UserWithRoles[] {
  const grouped = new Map<string, { user: LocalUserRow; roles: RoleName[] }>()

  for (const row of rows) {
    const existing = grouped.get(row.user.id)
    const entry = existing ?? { user: row.user, roles: [] }

    if (isRoleName(row.roleName) && !entry.roles.includes(row.roleName)) {
      entry.roles.push(row.roleName)
    }

    if (!existing) {
      grouped.set(row.user.id, entry)
    }
  }

  return [...grouped.values()].map(({ user, roles }) => {
    const avatarMimeType = isAllowedProfileAvatarResponseMimeType(user.avatarMimeType)
      ? user.avatarMimeType
      : null
    const hasDisplayableAvatar =
      Boolean(user.avatarStorageKey)
      && Boolean(user.avatarUpdatedAt)
      && avatarMimeType !== null

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      metadata: toUserMetadata(user),
      roles: sortRoles(roles),
      isActive: user.isActive,
      disabledAt: user.deactivatedAt ? user.deactivatedAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      avatar_url: hasDisplayableAvatar ? createUserAvatarUrl(user.id, user.avatarUpdatedAt) : null,
      avatar_mime_type: hasDisplayableAvatar ? avatarMimeType : null,
      avatar_size_bytes: hasDisplayableAvatar ? user.avatarSizeBytes : null,
      avatar_updated_at: hasDisplayableAvatar ? user.avatarUpdatedAt?.toISOString() ?? null : null,
    }
  })
}

function toUserMetadata(user: LocalUserRow): UserMetadata {
  const metadata = parseUserMetadata(user.metadata)

  return parseUserMetadata({
    ...metadata,
    nama_lengkap: pickProfileString(user.namaLengkap)
      ?? pickProfileString(user.displayName)
      ?? metadata.nama_lengkap,
    nip_nrp: pickProfileString(user.nipNrp) ?? metadata.nip_nrp,
    departemen: pickProfileString(user.departemen) ?? metadata.departemen,
  })
}

function pickProfileString(value: string | null): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function sortRoles(input: RoleName[]): RoleName[] {
  return [...input].sort((a, b) => ROLE_NAMES.indexOf(a) - ROLE_NAMES.indexOf(b))
}

function isRoleName(value: string | null): value is RoleName {
  return typeof value === 'string' && ROLE_NAMES.includes(value as RoleName)
}
