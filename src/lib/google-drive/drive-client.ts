// Server-only module. Do not import from client components.
//
// Satu-satunya pintu ke Google Drive API. Semua galat keluar sebagai
// DriveApiError terklasifikasi (drive-errors.ts) sehingga pemanggil tidak
// pernah melihat respons mentah Google. Retry bawaan gaxios dimatikan: jeda
// coba ulang diatur antrean job (jobs.ts). Tes memakai FakeDrive
// (tests/unit/google-drive/helpers/fake-drive.ts) yang mengimplementasikan
// interface yang sama.
import type { Readable } from 'node:stream'
import { drive as createDriveApi, type drive_v3 } from '@googleapis/drive'
import { OAuth2Client } from 'google-auth-library'

import {
  DRIVE_FOLDER_MIME_TYPE,
  DRIVE_HTTP_TIMEOUT_MS,
  GOOGLE_OAUTH_REDIRECT_URI,
  type DriveConfig,
} from '#/lib/google-drive/config'
import { DriveApiError, classifyDriveError } from '#/lib/google-drive/drive-errors'

export type DriveAppProperties = Record<string, string>
export type DriveUploadBody = NodeJS.ReadableStream | Readable | string

export interface DriveClient {
  createFolder(input: { name: string; parentId?: string; appProperties: DriveAppProperties }): Promise<{ id: string }>
  /** false bila file tidak ada (404) atau ada di tempat sampah. */
  fileExists(fileId: string): Promise<boolean>
  /** Anak langsung `parentId` (tidak di tempat sampah) dengan appProperty `key=value`, atau null. */
  findChildByAppProperty(input: { parentId: string; key: string; value: string }): Promise<string | null>
  uploadFile(input: {
    parentId: string
    name: string
    mimeType: string
    body: DriveUploadBody
    appProperties: DriveAppProperties
  }): Promise<{ id: string }>
  updateFileContent(input: { fileId: string; mimeType: string; body: DriveUploadBody }): Promise<void>
  /** Izin "siapa saja yang memegang link" sebagai pembaca. */
  shareAnyoneReader(fileId: string): Promise<void>
  getWebViewLink(fileId: string): Promise<string>
  /** Hapus permanen (bukan ke tempat sampah). 404 dilempar sebagai TIDAK_DITEMUKAN; pemanggil memutuskan. */
  deleteFile(fileId: string): Promise<void>
  /** Cabut refresh token di Google (dipakai saat akun diputus). */
  revokeToken(): Promise<void>
}

type DriveApi = Pick<drive_v3.Drive, 'files' | 'permissions'>
type OAuthClientLike = Pick<OAuth2Client, 'setCredentials' | 'revokeToken'>

export type GoogleDriveClientDeps = {
  driveFactory?: (options: drive_v3.Options) => DriveApi
  oauthClientFactory?: (options: { clientId: string; clientSecret: string; redirectUri: string }) => OAuthClientLike
}

// Nilai yang disisipkan ke kueri files.list hanya id/kunci buatan sistem;
// karakter lain (terutama ' dan \) ditolak alih-alih di-escape.
const QUERY_VALUE_PATTERN = /^[A-Za-z0-9:_-]+$/

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throw classifyDriveError(error)
  }
}

function requireId(id: string | null | undefined): string {
  // Respons sukses tanpa id tidak bisa dipakai melanjutkan sinkron.
  if (!id) throw new DriveApiError('PERMANEN')
  return id
}

export function createGoogleDriveClient({
  refreshToken,
  config,
  deps = {},
}: {
  refreshToken: string
  config: DriveConfig
  deps?: GoogleDriveClientDeps
}): DriveClient {
  const oauthClientFactory = deps.oauthClientFactory ?? ((options) => new OAuth2Client(options))
  const driveFactory = deps.driveFactory ?? ((options) => createDriveApi(options))

  const auth = oauthClientFactory({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: GOOGLE_OAUTH_REDIRECT_URI,
  })
  auth.setCredentials({ refresh_token: refreshToken })
  const api = driveFactory({
    version: 'v3',
    auth: auth as OAuth2Client,
    retry: false,
    timeout: DRIVE_HTTP_TIMEOUT_MS,
  })

  return {
    createFolder: ({ name, parentId, appProperties }) => guarded(async () => {
      const response = await api.files.create({
        requestBody: {
          name,
          mimeType: DRIVE_FOLDER_MIME_TYPE,
          parents: parentId ? [parentId] : undefined,
          appProperties,
        },
        fields: 'id',
      })
      return { id: requireId(response.data.id) }
    }),

    fileExists: async (fileId) => {
      try {
        const response = await api.files.get({ fileId, fields: 'id, trashed' })
        return response.data.trashed !== true
      } catch (error) {
        const classified = classifyDriveError(error)
        if (classified.kategori === 'TIDAK_DITEMUKAN') return false
        throw classified
      }
    },

    findChildByAppProperty: ({ parentId, key, value }) => guarded(async () => {
      if (![parentId, key, value].every((part) => QUERY_VALUE_PATTERN.test(part))) {
        throw new DriveApiError('PERMANEN')
      }
      // Sintaks resmi: appProperties has { key='…' and value='…' } (Drive API v3, "Search for files").
      const response = await api.files.list({
        q: `'${parentId}' in parents and appProperties has { key='${key}' and value='${value}' } and trashed = false`,
        fields: 'files(id)',
        pageSize: 1,
        spaces: 'drive',
      })
      return response.data.files?.[0]?.id ?? null
    }),

    uploadFile: ({ parentId, name, mimeType, body, appProperties }) => guarded(async () => {
      const response = await api.files.create({
        requestBody: { name, parents: [parentId], appProperties },
        media: { mimeType, body },
        fields: 'id',
      })
      return { id: requireId(response.data.id) }
    }),

    updateFileContent: ({ fileId, mimeType, body }) => guarded(async () => {
      await api.files.update({ fileId, media: { mimeType, body }, fields: 'id' })
    }),

    shareAnyoneReader: (fileId) => guarded(async () => {
      await api.permissions.create({
        fileId,
        requestBody: { type: 'anyone', role: 'reader' },
        fields: 'id',
      })
    }),

    getWebViewLink: (fileId) => guarded(async () => {
      const response = await api.files.get({ fileId, fields: 'webViewLink' })
      const link = response.data.webViewLink
      if (!link) throw new DriveApiError('PERMANEN')
      return link
    }),

    deleteFile: (fileId) => guarded(async () => {
      await api.files.delete({ fileId })
    }),

    revokeToken: () => guarded(async () => {
      await auth.revokeToken(refreshToken)
    }),
  }
}
