import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import { classifyStoragePath } from '#/lib/storage/local-storage-paths'
import {
  createLocalUploadDescriptor,
  generateLocalUploadPendingLogicalPath,
  LocalUploadError,
  LOCAL_UPLOAD_MAX_BYTES,
  sanitizeClientUploadFilename,
  validateLocalUploadFileMetadata,
  validateLocalUploadKelengkapanId,
  writeLocalUploadContent,
} from '#/lib/storage/local-upload'

const TEST_ROOT = path.resolve('.tmp', 'local-upload-root')
const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const KELENGKAPAN_ID = '22222222-2222-4222-8222-222222222222'
const USER_CUSTOM_KELENGKAPAN_ID = 'user-custom-33333333-3333-4333-8333-333333333333'
const TIMESTAMP = 1778064971564
const ALLOWED_UPLOAD_CASES = [
  {
    extension: 'pdf',
    type: 'application/pdf',
  },
  {
    extension: 'doc',
    type: 'application/msword',
  },
  {
    extension: 'docx',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  {
    extension: 'xls',
    type: 'application/vnd.ms-excel',
  },
  {
    extension: 'xlsx',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
] as const

describe('local upload helper foundation', () => {
  beforeEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_ROOT, { force: true, recursive: true })
  })

  it('validates allowed upload metadata and sanitizes compatible filenames', () => {
    const validated = validateLocalUploadFileMetadata({
      name: 'Daftar Absensi (Final).PDF',
      type: 'application/pdf',
      size: 1024,
    })

    expect(validated).toEqual({
      originalFilename: 'Daftar Absensi (Final).PDF',
      sanitizedFilename: 'Daftar_Absensi__Final_.PDF',
      contentType: 'application/pdf',
      extension: 'pdf',
      size: 1024,
    })
  })

  it('accepts every allowed MIME type and extension pair', () => {
    for (const { extension, type } of ALLOWED_UPLOAD_CASES) {
      const validated = validateLocalUploadFileMetadata({
        name: `upload.${extension}`,
        type,
        size: 10,
      })

      expect(validated).toMatchObject({
        sanitizedFilename: `upload.${extension}`,
        contentType: type,
        extension,
      })
      expectNoPhysicalPathExposure(validated)
    }
  })

  it('accepts the maximum upload size exactly and rejects one byte over', () => {
    expect(validateLocalUploadFileMetadata({
      name: 'max-size.pdf',
      type: 'application/pdf',
      size: LOCAL_UPLOAD_MAX_BYTES,
    })).toMatchObject({
      size: LOCAL_UPLOAD_MAX_BYTES,
      extension: 'pdf',
    })

    expect(() => validateLocalUploadFileMetadata({
      name: 'too-large.pdf',
      type: 'application/pdf',
      size: LOCAL_UPLOAD_MAX_BYTES + 1,
    })).toThrowError(new LocalUploadError(
      'Upload file exceeds the maximum allowed size.',
      'invalid-file-size',
    ))
  })

  it('rejects disallowed upload MIME types, extensions, mismatches, and oversize files', () => {
    expect(() => validateLocalUploadFileMetadata({
      name: 'report.pdf',
      type: 'text/plain',
      size: 10,
    })).toThrowError(new LocalUploadError('Upload file type is not allowed.', 'invalid-file-type'))

    expect(() => validateLocalUploadFileMetadata({
      name: 'report.exe',
      type: 'application/pdf',
      size: 10,
    })).toThrowError(new LocalUploadError('Upload file extension is not allowed.', 'invalid-file-extension'))

    expect(() => validateLocalUploadFileMetadata({
      name: 'report.pdf',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 10,
    })).toThrowError(new LocalUploadError(
      'Upload file extension does not match its declared type.',
      'invalid-file-extension',
    ))

    expect(() => validateLocalUploadFileMetadata({
      name: 'report.pdf',
      type: 'application/pdf',
      size: LOCAL_UPLOAD_MAX_BYTES + 1,
    })).toThrowError(new LocalUploadError(
      'Upload file exceeds the maximum allowed size.',
      'invalid-file-size',
    ))
  })

  it('rejects path-like, traversal-like, empty, and meaningless client filenames', () => {
    for (const unsafeFilename of [
      '../report.pdf',
      '..\\report.pdf',
      'folder/report.pdf',
      'C:\\storage\\report.pdf',
      'https://example.test/report.pdf',
      '...',
      '   ',
    ]) {
      expect(() => sanitizeClientUploadFilename(unsafeFilename)).toThrow(LocalUploadError)
    }
  })

  it('rejects CR/LF filenames and safely sanitizes other control characters', () => {
    expect(() => sanitizeClientUploadFilename('report\r\n.pdf')).toThrow(LocalUploadError)

    const sanitized = sanitizeClientUploadFilename('report\u0000draft.pdf')

    expect(sanitized).toBe('report_draft.pdf')
    expectSafeClientFilename(sanitized)
    expectNoPhysicalPathExposure(sanitized)
  })

  it('validates kelengkapan ids compatible with the current upload route', () => {
    expect(validateLocalUploadKelengkapanId(KELENGKAPAN_ID)).toBe(KELENGKAPAN_ID)
    expect(validateLocalUploadKelengkapanId(USER_CUSTOM_KELENGKAPAN_ID)).toBe(
      USER_CUSTOM_KELENGKAPAN_ID,
    )
    expect(() => validateLocalUploadKelengkapanId('user-custom-not-a-uuid')).toThrow(
      LocalUploadError,
    )
  })

  it('generates upload API compatible logical pending paths without physical path data', () => {
    const logicalPath = generateLocalUploadPendingLogicalPath({
      ownerUserId: OWNER_ID,
      kelengkapanId: USER_CUSTOM_KELENGKAPAN_ID,
      sanitizedFilename: 'Daftar_Absensi.pdf',
      timestamp: TIMESTAMP,
    })

    expect(logicalPath).toBe(
      `${OWNER_ID}/${USER_CUSTOM_KELENGKAPAN_ID}_${TIMESTAMP}_Daftar_Absensi.pdf`,
    )
    expect(classifyStoragePath(logicalPath)).toBe('pending-upload-api')
    expectNoPhysicalPathExposure(logicalPath)
    expect(path.isAbsolute(logicalPath)).toBe(false)
  })

  it('rejects unsafe server-derived owner path segments', () => {
    expect(() => generateLocalUploadPendingLogicalPath({
      ownerUserId: 'owner/../other',
      kelengkapanId: KELENGKAPAN_ID,
      sanitizedFilename: 'report.pdf',
      timestamp: TIMESTAMP,
    })).toThrowError(new LocalUploadError('Upload owner segment is not safe.', 'invalid-owner-id'))
  })

  it('creates an upload descriptor with only logical client-safe metadata', () => {
    const descriptor = createLocalUploadDescriptor({
      ownerUserId: OWNER_ID,
      kelengkapanId: KELENGKAPAN_ID,
      timestamp: TIMESTAMP,
      file: {
        name: 'SPJ final.xlsx',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 3,
      },
    })

    expect(descriptor).toMatchObject({
      kelengkapanId: KELENGKAPAN_ID,
      logicalPath: `${OWNER_ID}/${KELENGKAPAN_ID}_${TIMESTAMP}_SPJ_final.xlsx`,
      sanitizedFilename: 'SPJ_final.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
      size: 3,
    })
    expectNoPhysicalPathExposure(descriptor)
  })

  it('writes upload content under the local root while returning only logical path and byte count', async () => {
    const logicalPath = `${OWNER_ID}/${KELENGKAPAN_ID}_${TIMESTAMP}_report.pdf`
    const result = await writeLocalUploadContent({
      root: TEST_ROOT,
      logicalPath,
      content: Buffer.from('%PDF-1.4 test upload'),
      expectedBytes: 20,
    })

    expect(result).toEqual({
      logicalPath,
      bytesWritten: 20,
    })
    expectNoPhysicalPathExposure(result)
    expect(path.isAbsolute(result.logicalPath)).toBe(false)
    expect(await readFile(path.join(TEST_ROOT, OWNER_ID, `${KELENGKAPAN_ID}_${TIMESTAMP}_report.pdf`), 'utf8'))
      .toBe('%PDF-1.4 test upload')
  })

  it('preserves no-overwrite semantics and does not replace existing file content', async () => {
    const logicalPath = `${OWNER_ID}/${KELENGKAPAN_ID}_${TIMESTAMP}_report.pdf`
    const physicalPath = path.join(TEST_ROOT, OWNER_ID, `${KELENGKAPAN_ID}_${TIMESTAMP}_report.pdf`)

    await mkdir(path.dirname(physicalPath), { recursive: true })
    await writeFile(physicalPath, 'original')

    await expect(writeLocalUploadContent({
      root: TEST_ROOT,
      logicalPath,
      content: Buffer.from('replacement'),
    })).rejects.toMatchObject({
      code: 'target-exists',
    })

    const targetExistsError = await captureError(() => writeLocalUploadContent({
      root: TEST_ROOT,
      logicalPath,
      content: Buffer.from('replacement'),
    }))

    expect(targetExistsError).toMatchObject({ code: 'target-exists' })
    expectNoPhysicalPathExposure(targetExistsError)
    expect(await readFile(physicalPath, 'utf8')).toBe('original')
  })

  it('rejects unsafe logical write paths and content length mismatches before writing', async () => {
    const traversalError = await captureError(() => writeLocalUploadContent({
      root: TEST_ROOT,
      logicalPath: `${OWNER_ID}/../report.pdf`,
      content: Buffer.from('content'),
    }))

    expect(traversalError).toBeInstanceOf(Error)
    expect(String((traversalError as Error).message)).toContain('traversal')
    expectNoPhysicalPathExposure(traversalError)

    await expect(writeLocalUploadContent({
      root: TEST_ROOT,
      logicalPath: `${OWNER_ID}/../report.pdf`,
      content: Buffer.from('content'),
    })).rejects.toThrow('traversal')

    const mismatchError = await captureError(() => writeLocalUploadContent({
      root: TEST_ROOT,
      logicalPath: `${OWNER_ID}/${KELENGKAPAN_ID}_${TIMESTAMP}_report.pdf`,
      content: Buffer.from('content'),
      expectedBytes: 999,
    }))

    expect(mismatchError).toMatchObject({ code: 'invalid-content-size' })
    expectNoPhysicalPathExposure(mismatchError)

    await expect(writeLocalUploadContent({
      root: TEST_ROOT,
      logicalPath: `${OWNER_ID}/${KELENGKAPAN_ID}_${TIMESTAMP}_report.pdf`,
      content: Buffer.from('content'),
      expectedBytes: 999,
    })).rejects.toMatchObject({
      code: 'invalid-content-size',
    })
  })

  it('keeps helper results free of physical path and storage root details', async () => {
    const descriptor = createLocalUploadDescriptor({
      ownerUserId: OWNER_ID,
      kelengkapanId: KELENGKAPAN_ID,
      timestamp: TIMESTAMP,
      file: {
        name: 'clean-report.pdf',
        type: 'application/pdf',
        size: 7,
      },
    })
    const writeResult = await writeLocalUploadContent({
      root: TEST_ROOT,
      logicalPath: descriptor.logicalPath,
      content: Buffer.from('content'),
      expectedBytes: 7,
    })

    expectNoPhysicalPathExposure(descriptor)
    expectNoPhysicalPathExposure(writeResult)
    expect(path.isAbsolute(descriptor.logicalPath)).toBe(false)
    expect(path.isAbsolute(writeResult.logicalPath)).toBe(false)
  })
})

async function captureError(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation()
  } catch (error) {
    return error
  }

  throw new Error('Expected operation to throw.')
}

function expectNoPhysicalPathExposure(value: unknown): void {
  const serialized = stringifyForAssertion(value)

  expect(serialized).not.toContain(TEST_ROOT)
  expect(serialized).not.toContain(TEST_ROOT.replace(/\\/g, '/'))
}

function stringifyForAssertion(value: unknown): string {
  if (value instanceof Error) {
    return JSON.stringify({
      name: value.name,
      message: value.message,
      code: 'code' in value ? value.code : undefined,
    })
  }

  return JSON.stringify(value)
}

function expectSafeClientFilename(filename: string): void {
  expect(filename).not.toMatch(/[\u0000-\u001f\u007f]/)
  expect(filename).not.toContain('/')
  expect(filename).not.toContain('\\')
  expect(filename).not.toContain('..')
  expect(path.isAbsolute(filename)).toBe(false)
}
