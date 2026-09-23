import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route } from '#/routes/api/dokumen/rename-pending'

const TEST_ROOT = path.resolve('.tmp', 'rename-pending-local-route-root')
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_OWNER_ID = '99999999-9999-4999-8999-999999999999'
const DOKUMEN_ID = '22222222-2222-4222-8222-222222222222'
const KELENGKAPAN_ID = '33333333-3333-4333-8333-333333333333'
const TARGET_UUID = '44444444-4444-4444-8444-444444444444'
const SECOND_TARGET_UUID = '55555555-5555-4555-8555-555555555555'
const TIMESTAMP = 1778064971564
const UPLOAD_PENDING_PATH = `${OWNER_ID}/${KELENGKAPAN_ID}_${TIMESTAMP}_Daftar_Absensi.pdf`
const DASH_PENDING_PATH = `${OWNER_ID}/${TIMESTAMP}-abc123xyz-Daftar_Absensi.pdf`
const FORMAL_PATH = `${OWNER_ID}/${DOKUMEN_ID}/${TARGET_UUID}.pdf`
const UNSUPPORTED_PATH = `${OWNER_ID}/notes/readme.txt`

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
  dbFrom: vi.fn(),
  dbWhere: vi.fn(),
  dbLimit: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
}))

vi.mock('#/db/client', () => ({
  db: {
    select: mocks.dbSelect,
  },
}))

type RenamePendingHandler = (args: { request: Request }) => Promise<Response>

const renamePendingHandler = (Route as unknown as {
  options: { server: { handlers: { POST: RenamePendingHandler } } }
}).options.server.handlers.POST

describe('/api/dokumen/rename-pending local move route implementation', () => {
  const previousStorageRoot = process.env.DMS_LOCAL_STORAGE_ROOT

  beforeEach(async () => {
    vi.useRealTimers()
    vi.clearAllMocks()
    process.env.DMS_LOCAL_STORAGE_ROOT = TEST_ROOT
    await rm(TEST_ROOT, { force: true, recursive: true })

    mocks.dbSelect.mockReturnValue({ from: mocks.dbFrom })
    mocks.dbFrom.mockReturnValue({ where: mocks.dbWhere })
    mocks.dbWhere.mockReturnValue({ limit: mocks.dbLimit })
    mocks.dbLimit.mockResolvedValue([{
      id: DOKUMEN_ID,
      created_by: OWNER_ID,
    }])
    mocks.getLocalServerSession.mockResolvedValue({
      user: {
        id: OWNER_ID,
        username: 'pegawai',
      },
      userId: OWNER_ID,
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
      sessionId: 'test-session-id',
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.useRealTimers()

    if (previousStorageRoot === undefined) {
      delete process.env.DMS_LOCAL_STORAGE_ROOT
    } else {
      process.env.DMS_LOCAL_STORAGE_ROOT = previousStorageRoot
    }

    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  it('returns compatible unauthorized JSON before reading the document', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await renamePendingHandler({
      request: createJsonRequest({
        dokId: DOKUMEN_ID,
        userId: OWNER_ID,
        lampiranUrls: [],
      }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('preserves invalid body and missing field error responses', async () => {
    const invalidJsonResponse = await renamePendingHandler({
      request: new Request('http://localhost/api/dokumen/rename-pending', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost',
        },
        body: '{',
      }),
    })

    expect(invalidJsonResponse.status).toBe(400)
    expect(await invalidJsonResponse.json()).toEqual({ error: 'Invalid request body' })

    const missingFieldsResponse = await renamePendingHandler({
      request: createJsonRequest({
        dokId: DOKUMEN_ID,
        userId: OWNER_ID,
      }),
    })

    expect(missingFieldsResponse.status).toBe(400)
    expect(await missingFieldsResponse.json()).toEqual({ error: 'Missing dokId or lampiranUrls' })
  })

  it('treats body userId as compatibility input and rejects mismatches', async () => {
    const response = await renamePendingHandler({
      request: createJsonRequest({
        dokId: DOKUMEN_ID,
        userId: OTHER_OWNER_ID,
        lampiranUrls: [],
      }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Anda tidak memiliki akses' })
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('preserves document not found and owner mismatch responses', async () => {
    mocks.dbLimit.mockResolvedValueOnce([])

    const notFoundResponse = await renamePendingHandler({
      request: createJsonRequest({
        dokId: DOKUMEN_ID,
        userId: OWNER_ID,
        lampiranUrls: [],
      }),
    })

    expect(notFoundResponse.status).toBe(404)
    expect(await notFoundResponse.json()).toEqual({ error: 'Dokumen tidak ditemukan' })

    mocks.dbLimit.mockResolvedValueOnce([{
      id: DOKUMEN_ID,
      created_by: OTHER_OWNER_ID,
    }])

    const forbiddenResponse = await renamePendingHandler({
      request: createJsonRequest({
        dokId: DOKUMEN_ID,
        userId: OWNER_ID,
        lampiranUrls: [],
      }),
    })

    expect(forbiddenResponse.status).toBe(403)
    expect(await forbiddenResponse.json()).toEqual({ error: 'Anda tidak memiliki akses' })
  })

  it('moves an underscore pending local file and returns compatible logical paths', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(TARGET_UUID)
    await writeLogicalFile(UPLOAD_PENDING_PATH, 'local upload content')

    const response = await renamePendingHandler({
      request: createJsonRequest({
        dokId: DOKUMEN_ID,
        userId: OWNER_ID,
        lampiranUrls: [
          {
            kelengkapan_id: KELENGKAPAN_ID,
            nama: 'Daftar Absensi',
            url: UPLOAD_PENDING_PATH,
            uploaded_at: new Date(TIMESTAMP).toISOString(),
          },
        ],
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      success: true,
      renamed: [
        {
          oldPath: UPLOAD_PENDING_PATH,
          newPath: FORMAL_PATH,
        },
      ],
    })
    expectNoStorageRootExposure(body)
    await expect(stat(physicalPathFor(UPLOAD_PENDING_PATH))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(physicalPathFor(FORMAL_PATH), 'utf8')).toBe('local upload content')
  })

  it('moves a dash pending local file when it exists locally', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(TARGET_UUID)
    await writeLogicalFile(DASH_PENDING_PATH, 'dash local content')

    const response = await renamePendingHandler({
      request: createJsonRequest({
        dokId: DOKUMEN_ID,
        userId: OWNER_ID,
        lampiranUrls: [{ url: DASH_PENDING_PATH }],
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.renamed).toEqual([
      {
        oldPath: DASH_PENDING_PATH,
        newPath: FORMAL_PATH,
      },
    ])
    expect(await readFile(physicalPathFor(FORMAL_PATH), 'utf8')).toBe('dash local content')
  })

  it('skips already formal and safe unsupported paths to preserve the current route contract', async () => {
    const response = await renamePendingHandler({
      request: createJsonRequest({
        dokId: DOKUMEN_ID,
        userId: OWNER_ID,
        lampiranUrls: [
          { url: FORMAL_PATH },
          { url: UNSUPPORTED_PATH },
          { nama: 'Tanpa URL' },
        ],
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      renamed: [],
    })
  })

  it('rejects source owner mismatch before filesystem movement', async () => {
    const otherOwnerPending = `${OTHER_OWNER_ID}/${KELENGKAPAN_ID}_${TIMESTAMP}_Daftar_Absensi.pdf`
    await writeLogicalFile(otherOwnerPending, 'other owner content')

    const response = await renamePendingHandler({
      request: createJsonRequest({
        dokId: DOKUMEN_ID,
        userId: OWNER_ID,
        lampiranUrls: [{ url: otherOwnerPending }],
      }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Anda tidak memiliki akses' })
    expect(await readFile(physicalPathFor(otherOwnerPending), 'utf8')).toBe('other owner content')
  })

  it('returns a controlled missing local source error without Supabase fallback', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(TARGET_UUID)

    const response = await renamePendingHandler({
      request: createJsonRequest({
        dokId: DOKUMEN_ID,
        userId: OWNER_ID,
        lampiranUrls: [{ url: UPLOAD_PENDING_PATH }],
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: 'Gagal memproses file: File lokal tidak ditemukan',
      details: {
        failedPath: UPLOAD_PENDING_PATH,
        newPath: FORMAL_PATH,
        reason: 'File lokal tidak ditemukan',
      },
    })
    expectNoStorageRootExposure(body)
    expect(mocks.dbSelect).toHaveBeenCalledTimes(1)
  })

  it('returns a controlled no-overwrite error without exposing physical paths', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(TARGET_UUID)
    await writeLogicalFile(UPLOAD_PENDING_PATH, 'source content')
    await writeLogicalFile(FORMAL_PATH, 'existing formal content')

    const response = await renamePendingHandler({
      request: createJsonRequest({
        dokId: DOKUMEN_ID,
        userId: OWNER_ID,
        lampiranUrls: [{ url: UPLOAD_PENDING_PATH }],
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: 'Gagal memproses file: Target file sudah ada',
      details: {
        failedPath: UPLOAD_PENDING_PATH,
        newPath: FORMAL_PATH,
        reason: 'Target file sudah ada',
      },
    })
    expectNoStorageRootExposure(body)
    expect(await readFile(physicalPathFor(UPLOAD_PENDING_PATH), 'utf8')).toBe('source content')
    expect(await readFile(physicalPathFor(FORMAL_PATH), 'utf8')).toBe('existing formal content')
  })

  it('moves multiple pending files and aborts on the first controlled failure', async () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(TARGET_UUID)
      .mockReturnValueOnce(SECOND_TARGET_UUID)
    await writeLogicalFile(UPLOAD_PENDING_PATH, 'first file content')
    const missingDashPath = `${OWNER_ID}/${TIMESTAMP}-missing-Daftar_Absensi.pdf`

    const response = await renamePendingHandler({
      request: createJsonRequest({
        dokId: DOKUMEN_ID,
        userId: OWNER_ID,
        lampiranUrls: [
          { url: UPLOAD_PENDING_PATH },
          { url: missingDashPath },
        ],
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: 'Gagal memproses file: File lokal tidak ditemukan',
      details: {
        failedPath: missingDashPath,
        newPath: `${OWNER_ID}/${DOKUMEN_ID}/${SECOND_TARGET_UUID}.pdf`,
        reason: 'File lokal tidak ditemukan',
      },
    })
    expect(await readFile(physicalPathFor(FORMAL_PATH), 'utf8')).toBe('first file content')
  })
})

function createJsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/dokumen/rename-pending', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
    },
    body: JSON.stringify(body),
  })
}

async function writeLogicalFile(logicalPath: string, content: string): Promise<void> {
  const physicalPath = physicalPathFor(logicalPath)

  await mkdir(path.dirname(physicalPath), { recursive: true })
  await writeFile(physicalPath, content)
}

function physicalPathFor(logicalPath: string): string {
  return path.join(TEST_ROOT, ...logicalPath.split('/'))
}

function expectNoStorageRootExposure(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain(TEST_ROOT)
  expect(serialized).not.toContain(TEST_ROOT.replace(/\\/g, '/'))
}
