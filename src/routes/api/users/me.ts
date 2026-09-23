import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db, pool } from '#/db/client'
import { users } from '#/db/schema/auth'
import {
  createUnauthorizedResponse,
  getLocalServerSession,
} from '#/lib/auth/local-server-auth'
import { requireSameOrigin } from '#/lib/security/same-origin'
import {
  createProfileAvatarUrl,
  ProfileAvatarError,
  readProfileAvatarContent,
  removeProfileAvatarContent,
  writeProfileAvatarContent,
} from '#/lib/storage/profile-avatar'
import { parseUserProfileResponse } from '#/lib/user-response'
import { parseUserMetadata } from '#/lib/user-metadata'

// ---------------------------------------------------------------------------
// GET /api/users/me — Get current user profile
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/me')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)

        if (!session) {
          return createUnauthorizedResponse('Unauthorized')
        }

        const [profile] = await db
          .select({
            email: users.email,
            namaLengkap: users.namaLengkap,
            nipNrp: users.nipNrp,
            departemen: users.departemen,
          })
          .from(users)
          .where(eq(users.id, session.user.id))
          .limit(1)

        if (!profile) {
          return createUnauthorizedResponse('Unauthorized')
        }

        const avatarSchemaReady = await hasProfileAvatarColumns()
        const avatarProfile = avatarSchemaReady
          ? await loadCurrentUserAvatarProfile(session.user.id)
          : null

        if (new URL(request.url).searchParams.get('avatar') === '1') {
          if (!avatarSchemaReady || !avatarProfile) {
            return Response.json({ error: 'Foto profil belum tersedia' }, { status: 404 })
          }
          return serveCurrentUserAvatar(avatarProfile)
        }

        const hasDisplayableAvatar =
          Boolean(avatarProfile?.avatarStorageKey)
          && Boolean(avatarProfile?.avatarUpdatedAt)
          && isAllowedResponseAvatarMimeType(avatarProfile?.avatarMimeType ?? null)
        const avatarUrl = hasDisplayableAvatar
          ? createProfileAvatarUrl(avatarProfile?.avatarUpdatedAt)
          : null

        return Response.json(parseUserProfileResponse({
          user: {
            id: session.user.id,
            username: session.user.username,
            email: profile.email,
            metadata: parseUserMetadata({
              nama_lengkap: profile.namaLengkap,
              nip_nrp: profile.nipNrp,
              departemen: profile.departemen,
            }),
            roles: session.roles,
            activeRole: session.activeRole,
            avatar_url: avatarUrl,
            avatar_mime_type: hasDisplayableAvatar ? avatarProfile?.avatarMimeType ?? null : null,
            avatar_size_bytes: hasDisplayableAvatar ? avatarProfile?.avatarSizeBytes ?? null : null,
            avatar_updated_at: hasDisplayableAvatar ? avatarProfile?.avatarUpdatedAt?.toISOString() ?? null : null,
          },
        }))
      },
      POST: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const session = await getLocalServerSession(request)
        if (!session) {
          return createUnauthorizedResponse('Unauthorized')
        }

        if (new URL(request.url).searchParams.get('avatar') !== '1') {
          return Response.json({ error: 'Unsupported profile update' }, { status: 400 })
        }

        if (!(await hasProfileAvatarColumns())) {
          return Response.json({ error: 'Fitur foto profil belum siap. Jalankan migrasi avatar profil terlebih dahulu.' }, { status: 503 })
        }

        const current = await loadCurrentUserAvatarProfile(session.user.id)

        if (!current) {
          return createUnauthorizedResponse('Unauthorized')
        }

        let formData: FormData
        try {
          formData = await request.formData()
        } catch {
          return Response.json({ error: 'Form data tidak valid' }, { status: 400 })
        }

        const file = formData.get('file')
        if (!(file instanceof File)) {
          return Response.json({ error: 'File foto tidak ditemukan' }, { status: 400 })
        }

        let fileContent: ArrayBuffer
        try {
          fileContent = await file.arrayBuffer()
        } catch {
          return Response.json({ error: 'Gagal membaca file foto' }, { status: 400 })
        }

        let storedAvatar: Awaited<ReturnType<typeof writeProfileAvatarContent>>
        try {
          storedAvatar = await writeProfileAvatarContent({
            ownerUserId: session.user.id,
            file: {
              name: file.name,
              type: file.type,
              size: file.size,
            },
            content: fileContent,
          })
        } catch (error) {
          return profileAvatarErrorResponse(error)
        }

        const avatarUpdatedAt = new Date()

        try {
          await db
            .update(users)
            .set({
              avatarStorageKey: storedAvatar.storageKey,
              avatarMimeType: storedAvatar.mimeType,
              avatarSizeBytes: storedAvatar.size,
              avatarUpdatedAt,
              updatedAt: avatarUpdatedAt,
            })
            .where(eq(users.id, session.user.id))
        } catch {
          await removeProfileAvatarContent(storedAvatar.storageKey).catch(() => undefined)
          return Response.json({ error: 'Gagal menyimpan foto profil' }, { status: 500 })
        }

        if (current.avatarStorageKey) {
          await removeProfileAvatarContent(current.avatarStorageKey).catch(() => undefined)
        }

        return Response.json({
          success: true,
          avatar_url: createProfileAvatarUrl(avatarUpdatedAt),
          avatar_mime_type: storedAvatar.mimeType,
          avatar_size_bytes: storedAvatar.size,
          avatar_updated_at: avatarUpdatedAt.toISOString(),
        })
      },
      DELETE: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const session = await getLocalServerSession(request)
        if (!session) {
          return createUnauthorizedResponse('Unauthorized')
        }

        if (new URL(request.url).searchParams.get('avatar') !== '1') {
          return Response.json({ error: 'Unsupported profile update' }, { status: 400 })
        }

        if (!(await hasProfileAvatarColumns())) {
          return Response.json({ error: 'Fitur foto profil belum siap. Jalankan migrasi avatar profil terlebih dahulu.' }, { status: 503 })
        }

        const current = await loadCurrentUserAvatarProfile(session.user.id)

        if (!current) {
          return createUnauthorizedResponse('Unauthorized')
        }

        const avatarUpdatedAt = new Date()

        try {
          await db
            .update(users)
            .set({
              avatarStorageKey: null,
              avatarMimeType: null,
              avatarSizeBytes: null,
              avatarUpdatedAt: null,
              updatedAt: avatarUpdatedAt,
            })
            .where(eq(users.id, session.user.id))
        } catch {
          return Response.json({ error: 'Gagal menghapus foto profil' }, { status: 500 })
        }

        if (current.avatarStorageKey) {
          await removeProfileAvatarContent(current.avatarStorageKey).catch(() => undefined)
        }

        return Response.json({
          success: true,
          avatar_url: null,
          avatar_mime_type: null,
          avatar_size_bytes: null,
          avatar_updated_at: null,
        })
      },
    },
  },
})

type CurrentUserAvatarProfile = {
  avatarStorageKey: string | null
  avatarMimeType: string | null
  avatarSizeBytes: number | null
  avatarUpdatedAt: Date | null
}

let profileAvatarColumnsReadyCache = false

async function hasProfileAvatarColumns(): Promise<boolean> {
  if (profileAvatarColumnsReadyCache) {
    return true
  }

  const result = await pool.query<{ column_name: string }>(
    `
      select column_name
      from information_schema.columns
      where table_schema = $1
        and table_name = $2
        and column_name = any($3::text[])
    `,
    [
      'auth',
      'users',
      ['avatar_storage_key', 'avatar_mime_type', 'avatar_size_bytes', 'avatar_updated_at'],
    ],
  )

  const columns = new Set(result.rows.map((row) => row.column_name))
  const hasAllColumns =
    columns.has('avatar_storage_key')
    && columns.has('avatar_mime_type')
    && columns.has('avatar_size_bytes')
    && columns.has('avatar_updated_at')

  if (hasAllColumns) {
    profileAvatarColumnsReadyCache = true
  }

  return hasAllColumns
}

async function loadCurrentUserAvatarProfile(userId: string): Promise<CurrentUserAvatarProfile | null> {
  const [profile] = await db
    .select({
      avatarStorageKey: users.avatarStorageKey,
      avatarMimeType: users.avatarMimeType,
      avatarSizeBytes: users.avatarSizeBytes,
      avatarUpdatedAt: users.avatarUpdatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  return profile ?? null
}

async function serveCurrentUserAvatar(profile: {
  avatarStorageKey: string | null
  avatarMimeType: string | null
}): Promise<Response> {
  if (!profile.avatarStorageKey || !isAllowedResponseAvatarMimeType(profile.avatarMimeType)) {
    return Response.json({ error: 'Foto profil belum tersedia' }, { status: 404 })
  }

  let content: Buffer | null
  try {
    content = await readProfileAvatarContent(profile.avatarStorageKey)
  } catch {
    return Response.json({ error: 'Foto profil belum tersedia' }, { status: 404 })
  }
  if (!content) {
    return Response.json({ error: 'Foto profil belum tersedia' }, { status: 404 })
  }

  return new Response(new Uint8Array(content), {
    headers: {
      'Content-Type': profile.avatarMimeType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function profileAvatarErrorResponse(error: unknown): Response {
  if (!(error instanceof ProfileAvatarError)) {
    return Response.json({ error: 'Gagal mengunggah foto profil' }, { status: 500 })
  }

  switch (error.code) {
    case 'invalid-file-size':
    case 'invalid-content-size':
      return Response.json({ error: 'Ukuran foto terlalu besar. Maksimal 2 MB.' }, { status: 400 })
    case 'invalid-file-extension':
    case 'invalid-file-type':
      return Response.json({ error: 'Format foto tidak didukung. Gunakan JPG, PNG, atau WebP.' }, { status: 400 })
    case 'invalid-file-signature':
    case 'invalid-file-name':
    case 'invalid-owner-id':
      return Response.json({ error: 'File foto tidak valid. Pilih gambar lain.' }, { status: 400 })
    case 'read-failed':
    case 'target-exists':
    case 'write-failed':
      return Response.json({ error: 'Gagal mengunggah foto profil. Coba lagi.' }, { status: 500 })
  }
}

function isAllowedResponseAvatarMimeType(value: string | null): value is 'image/jpeg' | 'image/png' | 'image/webp' {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp'
}
