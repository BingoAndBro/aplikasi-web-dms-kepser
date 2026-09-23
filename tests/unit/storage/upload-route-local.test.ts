import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { classifyStoragePath } from '#/lib/storage/local-storage-paths'
import { LOCAL_UPLOAD_MAX_BYTES } from '#/lib/storage/local-upload'
import { Route } from '#/routes/api/upload'

const TEST_ROOT = path.resolve('.tmp', 'upload-route-local-root')
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const KELENGKAPAN_ID = '22222222-2222-4222-8222-222222222222'
const USER_CUSTOM_KELENGKAPAN_ID = 'user-custom-33333333-3333-4333-8333-333333333333'
const TIMESTAMP = 1778064971564
const PDF_CONTENT = '%PDF-1.4 local upload route'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
}))

type UploadHandler = (args: { request: Request }) => Promise<Response>

const uploadHandler = (Route as unknown as {
  options: { server: { handlers: { POST: UploadHandler } } }
}).options.server.handlers.POST

describe('/api/upload local route implementation', () => {
  const previousStorageRoot = process.env.DMS_LOCAL_STORAGE_ROOT

  beforeEach(async () => {
    vi.useRealTimers()
    vi.clearAllMocks()
    process.env.DMS_LOCAL_STORAGE_ROOT = TEST_ROOT
    await rm(TEST_ROOT, { force: true, recursive: true })

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

  it('returns compatible unauthorized JSON before parsing or writing files', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await uploadHandler({
      request: createUploadRequest(),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    await expectPathMissing(OWNER_ID)
  })

  it('returns compatible invalid form data JSON when multipart parsing fails', async () => {
    const response = await uploadHandler({
      request: new Request('http://localhost/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data; boundary=expected-boundary',
          Origin: 'http://localhost',
        },
        body: '--different-boundary\r\nContent-Disposition: form-data; name="file"\r\n\r\n',
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid form data' })
  })

  it('writes a local pending upload and returns the existing response shape with status 201', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(TIMESTAMP))

    const response = await uploadHandler({
      request: createUploadRequest({
        filename: 'Daftar Absensi (Final).PDF',
        content: PDF_CONTENT,
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(Object.keys(body).sort()).toEqual([
      'kelengkapan_id',
      'nama',
      'uploaded_at',
      'url',
    ])
    expect(body).toMatchObject({
      url: `${OWNER_ID}/${KELENGKAPAN_ID}_${TIMESTAMP}_Daftar_Absensi__Final_.PDF`,
      nama: 'Daftar Absensi',
      kelengkapan_id: KELENGKAPAN_ID,
    })
    expect(Date.parse(body.uploaded_at)).not.toBeNaN()
    expect(classifyStoragePath(body.url)).toBe('pending-upload-api')
    expectNoStorageRootExposure(body)

    const storedContent = await readFile(
      path.join(TEST_ROOT, OWNER_ID, `${KELENGKAPAN_ID}_${TIMESTAMP}_Daftar_Absensi__Final_.PDF`),
      'utf8',
    )
    expect(storedContent).toBe(PDF_CONTENT)
  })

  it('uses the local session user id as the owner segment and never accepts an owner from form data', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(TIMESTAMP))

    const formData = createUploadFormData({
      kelengkapanId: USER_CUSTOM_KELENGKAPAN_ID,
      filename: 'pendukung.pdf',
    })
    formData.set('userId', 'attacker-user')

    const response = await uploadHandler({
      request: new Request('http://localhost/api/upload', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost',
        },
        body: formData,
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.url).toBe(
      `${OWNER_ID}/${USER_CUSTOM_KELENGKAPAN_ID}_${TIMESTAMP}_pendukung.pdf`,
    )
    expect(body.url).not.toContain('attacker-user')
  })

  it('returns compatible missing-file and missing-field errors', async () => {
    const missingFileForm = new FormData()
    missingFileForm.set('kelengkapan_id', KELENGKAPAN_ID)
    missingFileForm.set('nama_dokumen', 'Daftar Absensi')

    const missingFileResponse = await uploadHandler({
      request: new Request('http://localhost/api/upload', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost',
        },
        body: missingFileForm,
      }),
    })

    expect(missingFileResponse.status).toBe(400)
    expect(await missingFileResponse.json()).toEqual({ error: 'File tidak ditemukan' })

    const missingFieldsResponse = await uploadHandler({
      request: createUploadRequest({
        kelengkapanId: '',
        namaDokumen: '',
      }),
    })

    expect(missingFieldsResponse.status).toBe(400)
    expect(await missingFieldsResponse.json()).toEqual({
      error: 'kelengkapan_id dan nama_dokumen wajib diisi',
    })
  })

  it('returns the compatible invalid kelengkapan id error', async () => {
    const response = await uploadHandler({
      request: createUploadRequest({
        kelengkapanId: 'not-a-uuid',
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'ID kelengkapan tidak valid' })
  })

  it('returns compatible type errors for disallowed MIME, extension, and MIME-extension mismatch', async () => {
    for (const request of [
      createUploadRequest({ filename: 'report.pdf', type: 'text/plain' }),
      createUploadRequest({ filename: 'report.exe', type: 'application/pdf' }),
      createUploadRequest({
        filename: 'report.pdf',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ]) {
      const response = await uploadHandler({ request })

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        error: 'Format file tidak didukung. Gunakan PDF, DOC, DOCX, XLS, XLSX, JPG, atau PNG.',
      })
    }
  })

  it('returns the compatible max-size error before writing content', async () => {
    const response = await uploadHandler({
      request: createUploadRequest({
        content: new Uint8Array(LOCAL_UPLOAD_MAX_BYTES + 1),
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Ukuran file terlalu besar. Maksimal 5 MB per file.' })
    await expectPathMissing(OWNER_ID)
  })

  it('rejects spoofed PDF content before writing content', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(TIMESTAMP))

    const response = await uploadHandler({
      request: createUploadRequest({
        filename: 'spoofed.pdf',
        type: 'application/pdf',
        content: '<svg></svg>',
      }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'File tidak valid. Pilih file lain.' })
    await expectPathMissing(OWNER_ID)
  })

  it('returns a generic upload failure on local no-overwrite collision and keeps existing content', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(TIMESTAMP))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const relativeTarget = path.join(OWNER_ID, `${KELENGKAPAN_ID}_${TIMESTAMP}_report.pdf`)
    const physicalTarget = path.join(TEST_ROOT, relativeTarget)
    await mkdir(path.dirname(physicalTarget), { recursive: true })
    await writeFile(physicalTarget, 'original')

    const response = await uploadHandler({
      request: createUploadRequest({ filename: 'report.pdf' }),
    })
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Gagal mengunggah file. Coba lagi.' })
    expectNoStorageRootExposure(body)
    expect(consoleError).not.toHaveBeenCalled()
    expect(await readFile(physicalTarget, 'utf8')).toBe('original')
  })

  it('does not expose the storage root in validation errors', async () => {
    const response = await uploadHandler({
      request: createUploadRequest({
        filename: '../report.pdf',
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'File tidak valid. Pilih file lain.' })
    expectNoStorageRootExposure(body)
  })
})

function createUploadRequest(input: Partial<UploadInput> = {}): Request {
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost',
    },
    body: createUploadFormData(input),
  })
}

function createUploadFormData(input: Partial<UploadInput> = {}): FormData {
  const {
    filename = 'report.pdf',
    type = 'application/pdf',
    content = PDF_CONTENT,
    kelengkapanId = KELENGKAPAN_ID,
    namaDokumen = 'Daftar Absensi',
  } = input
  const formData = new FormData()

  formData.set('file', new File([content], filename, { type }))
  formData.set('kelengkapan_id', kelengkapanId)
  formData.set('nama_dokumen', namaDokumen)

  return formData
}

type UploadInput = {
  filename: string
  type: string
  content: BlobPart
  kelengkapanId: string
  namaDokumen: string
}

async function expectPathMissing(...segments: string[]): Promise<void> {
  await expect(readFile(path.join(TEST_ROOT, ...segments))).rejects.toMatchObject({
    code: 'ENOENT',
  })
}

function expectNoStorageRootExposure(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain(TEST_ROOT)
  expect(serialized).not.toContain(TEST_ROOT.replace(/\\/g, '/'))
}
