import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DRIVE_FOLDER_MIME_TYPE,
  DRIVE_HTTP_TIMEOUT_MS,
  GOOGLE_OAUTH_REDIRECT_URI,
  type DriveConfig,
} from '#/lib/google-drive/config'
import { createGoogleDriveClient } from '#/lib/google-drive/drive-client'
import { DriveApiError } from '#/lib/google-drive/drive-errors'

const CONFIG: DriveConfig = { clientId: 'cid', clientSecret: 'csecret', tokenKey: Buffer.alloc(32, 1) }
const REFRESH_TOKEN = '1//refresh-token-uji'

function gaxiosError(status: number, data?: unknown) {
  return Object.assign(new Error(`status ${status}`), { status, response: { status, data } })
}

const mocks = {
  filesCreate: vi.fn(),
  filesGet: vi.fn(),
  filesList: vi.fn(),
  filesUpdate: vi.fn(),
  filesDelete: vi.fn(),
  permissionsCreate: vi.fn(),
  setCredentials: vi.fn(),
  revokeToken: vi.fn(),
  driveFactory: vi.fn(),
  oauthClientFactory: vi.fn(),
}

function client() {
  return createGoogleDriveClient({
    refreshToken: REFRESH_TOKEN,
    config: CONFIG,
    deps: {
      driveFactory: mocks.driveFactory as never,
      oauthClientFactory: mocks.oauthClientFactory as never,
    },
  })
}

async function rejection(promise: Promise<unknown>): Promise<DriveApiError> {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(DriveApiError)
  return error as DriveApiError
}

beforeEach(() => {
  vi.clearAllMocks()
  const oauth = { setCredentials: mocks.setCredentials, revokeToken: mocks.revokeToken }
  mocks.oauthClientFactory.mockReturnValue(oauth)
  mocks.driveFactory.mockReturnValue({
    files: {
      create: mocks.filesCreate,
      get: mocks.filesGet,
      list: mocks.filesList,
      update: mocks.filesUpdate,
      delete: mocks.filesDelete,
    },
    permissions: { create: mocks.permissionsCreate },
  })
})

describe('createGoogleDriveClient', () => {
  it('membuat OAuth2Client dengan redirect tetap + refresh token, dan drive v3 tanpa retry dengan timeout', () => {
    client()
    expect(mocks.oauthClientFactory).toHaveBeenCalledWith({
      clientId: 'cid',
      clientSecret: 'csecret',
      redirectUri: GOOGLE_OAUTH_REDIRECT_URI,
    })
    expect(mocks.setCredentials).toHaveBeenCalledWith({ refresh_token: REFRESH_TOKEN })
    const oauth = mocks.oauthClientFactory.mock.results[0].value
    expect(mocks.driveFactory).toHaveBeenCalledWith({
      version: 'v3',
      auth: oauth,
      retry: false,
      timeout: DRIVE_HTTP_TIMEOUT_MS,
    })
  })

  it('bisa dibuat dengan dependensi Google asli tanpa memanggil jaringan', () => {
    expect(() => createGoogleDriveClient({ refreshToken: REFRESH_TOKEN, config: CONFIG })).not.toThrow()
  })
})

describe('DriveClient', () => {
  it('createFolder mengirim mimeType folder, parents, appProperties, dan fields id', async () => {
    mocks.filesCreate.mockResolvedValue({ data: { id: 'folder-1' } })
    await expect(client().createFolder({ name: 'Laporan', parentId: 'root-1', appProperties: { dmsTautanId: 't1' } }))
      .resolves.toEqual({ id: 'folder-1' })
    expect(mocks.filesCreate).toHaveBeenCalledWith({
      requestBody: {
        name: 'Laporan',
        mimeType: DRIVE_FOLDER_MIME_TYPE,
        parents: ['root-1'],
        appProperties: { dmsTautanId: 't1' },
      },
      fields: 'id',
    })
  })

  it('createFolder tanpa parentId tidak mengirim parents (folder akar di My Drive)', async () => {
    mocks.filesCreate.mockResolvedValue({ data: { id: 'root-1' } })
    await client().createFolder({ name: 'DMS Kepser', appProperties: { dmsRoot: '1' } })
    expect(mocks.filesCreate.mock.calls[0][0].requestBody.parents).toBeUndefined()
  })

  it('uploadFile mengirim requestBody + media { mimeType, body }', async () => {
    mocks.filesCreate.mockResolvedValue({ data: { id: 'file-1' } })
    const body = Readable.from(['isi'])
    await expect(client().uploadFile({
      parentId: 'folder-1',
      name: 'Lampiran.pdf',
      mimeType: 'application/pdf',
      body,
      appProperties: { dmsKunci: 'DOKUMEN:d1:0' },
    })).resolves.toEqual({ id: 'file-1' })
    expect(mocks.filesCreate).toHaveBeenCalledWith({
      requestBody: { name: 'Lampiran.pdf', parents: ['folder-1'], appProperties: { dmsKunci: 'DOKUMEN:d1:0' } },
      media: { mimeType: 'application/pdf', body },
      fields: 'id',
    })
  })

  it('updateFileContent mengirim media ke files.update', async () => {
    mocks.filesUpdate.mockResolvedValue({ data: {} })
    await client().updateFileContent({ fileId: 'f1', mimeType: 'text/plain', body: 'isi baru' })
    expect(mocks.filesUpdate).toHaveBeenCalledWith({
      fileId: 'f1',
      media: { mimeType: 'text/plain', body: 'isi baru' },
      fields: 'id',
    })
  })

  it('shareAnyoneReader mengirim izin anyone/reader', async () => {
    mocks.permissionsCreate.mockResolvedValue({ data: { id: 'perm' } })
    await client().shareAnyoneReader('folder-1')
    expect(mocks.permissionsCreate).toHaveBeenCalledWith({
      fileId: 'folder-1',
      requestBody: { type: 'anyone', role: 'reader' },
      fields: 'id',
    })
  })

  it('getWebViewLink mengembalikan link; kosong -> PERMANEN', async () => {
    mocks.filesGet.mockResolvedValueOnce({ data: { webViewLink: 'https://drive.google.com/drive/folders/f1' } })
    await expect(client().getWebViewLink('f1')).resolves.toBe('https://drive.google.com/drive/folders/f1')
    expect(mocks.filesGet).toHaveBeenCalledWith({ fileId: 'f1', fields: 'webViewLink' })

    mocks.filesGet.mockResolvedValueOnce({ data: {} })
    expect((await rejection(client().getWebViewLink('f1'))).kategori).toBe('PERMANEN')
  })

  it('fileExists: true untuk file aktif, false untuk 404 dan trashed, melempar untuk kategori lain', async () => {
    mocks.filesGet.mockResolvedValueOnce({ data: { id: 'f1', trashed: false } })
    await expect(client().fileExists('f1')).resolves.toBe(true)
    expect(mocks.filesGet).toHaveBeenCalledWith({ fileId: 'f1', fields: 'id, trashed' })

    mocks.filesGet.mockRejectedValueOnce(gaxiosError(404))
    await expect(client().fileExists('f1')).resolves.toBe(false)

    mocks.filesGet.mockResolvedValueOnce({ data: { id: 'f1', trashed: true } })
    await expect(client().fileExists('f1')).resolves.toBe(false)

    mocks.filesGet.mockRejectedValueOnce(gaxiosError(503))
    expect((await rejection(client().fileExists('f1'))).kategori).toBe('SEMENTARA')
  })

  it('findChildByAppProperty memakai sintaks appProperties has dan mengembalikan id pertama atau null', async () => {
    mocks.filesList.mockResolvedValueOnce({ data: { files: [{ id: 'child-1' }] } })
    await expect(client().findChildByAppProperty({ parentId: 'folder-1', key: 'dmsKunci', value: 'DOKUMEN:d1:0' }))
      .resolves.toBe('child-1')
    expect(mocks.filesList).toHaveBeenCalledWith({
      q: "'folder-1' in parents and appProperties has { key='dmsKunci' and value='DOKUMEN:d1:0' } and trashed = false",
      fields: 'files(id)',
      pageSize: 1,
      spaces: 'drive',
    })

    mocks.filesList.mockResolvedValueOnce({ data: { files: [] } })
    await expect(client().findChildByAppProperty({ parentId: 'folder-1', key: 'k', value: 'v' })).resolves.toBeNull()
  })

  it.each([
    ['petik pada value', { parentId: 'p', key: 'k', value: "a' or name contains 'x" }],
    ['backslash pada value', { parentId: 'p', key: 'k', value: 'a\\b' }],
    ['petik pada key', { parentId: 'p', key: "k'", value: 'v' }],
    ['petik pada parentId', { parentId: "p' or '1'='1", key: 'k', value: 'v' }],
    ['value kosong', { parentId: 'p', key: 'k', value: '' }],
  ])('findChildByAppProperty menolak %s sebelum memanggil API', async (_label, args) => {
    expect((await rejection(client().findChildByAppProperty(args))).kategori).toBe('PERMANEN')
    expect(mocks.filesList).not.toHaveBeenCalled()
  })

  it('deleteFile memanggil files.delete; 404 dilempar sebagai TIDAK_DITEMUKAN', async () => {
    mocks.filesDelete.mockResolvedValueOnce({ data: '' })
    await client().deleteFile('f1')
    expect(mocks.filesDelete).toHaveBeenCalledWith({ fileId: 'f1' })

    mocks.filesDelete.mockRejectedValueOnce(gaxiosError(404))
    expect((await rejection(client().deleteFile('f1'))).kategori).toBe('TIDAK_DITEMUKAN')
  })

  it('revokeToken mencabut refresh token lewat OAuth2Client', async () => {
    mocks.revokeToken.mockResolvedValue({ data: {} })
    await client().revokeToken()
    expect(mocks.revokeToken).toHaveBeenCalledWith(REFRESH_TOKEN)
  })

  it('setiap galat diklasifikasi tanpa membawa isi respons mentah', async () => {
    const secret = 'ya29.rahasia-respons'
    mocks.filesCreate.mockRejectedValue(gaxiosError(403, {
      error: { message: secret, errors: [{ reason: 'storageQuotaExceeded', message: secret }] },
    }))
    const error = await rejection(client().uploadFile({
      parentId: 'p', name: 'a.pdf', mimeType: 'application/pdf', body: 'x', appProperties: {},
    }))
    expect(error.kategori).toBe('KUOTA_PENUH')
    expect(`${error.message} ${JSON.stringify(error)}`).not.toContain(secret)

    mocks.revokeToken.mockRejectedValue(gaxiosError(400, { error: 'invalid_grant' }))
    expect((await rejection(client().revokeToken())).kategori).toBe('TOKEN_TIDAK_VALID')

    mocks.filesCreate.mockResolvedValue({ data: {} })
    expect((await rejection(client().createFolder({ name: 'x', appProperties: {} }))).kategori).toBe('PERMANEN')
  })
})

describe('batas modul Google', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? walk(path) : [path]
    })
  }

  it('hanya drive-client.ts (dan oauth.ts) yang mengimpor @googleapis/drive / google-auth-library', () => {
    const allowed = new Set(['src/lib/google-drive/drive-client.ts', 'src/lib/google-drive/oauth.ts'])
    const offenders = walk('src')
      .filter((path) => /\.(ts|tsx)$/.test(path))
      .map((path) => path.split('\\').join('/'))
      .filter((path) => !allowed.has(path))
      .filter((path) => /from '(@googleapis\/drive|google-auth-library)'|import\('(@googleapis\/drive|google-auth-library)'\)/
        .test(readFileSync(path, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('drive-client.ts tidak mencetak apa pun ke console', () => {
    expect(readFileSync('src/lib/google-drive/drive-client.ts', 'utf8')).not.toMatch(/console\./)
  })
})
