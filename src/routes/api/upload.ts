import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { lstat, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import {
  createLocalUploadDescriptor,
  LocalUploadError,
  writeLocalUploadContent,
} from '#/lib/storage/local-upload'
import {
  DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE,
  DOCUMENT_UPLOAD_INVALID_FILE_MESSAGE,
  DOCUMENT_UPLOAD_INVALID_FORMAT_MESSAGE,
  DOCUMENT_UPLOAD_TOO_LARGE_MESSAGE,
} from '#/lib/upload/document-upload-policy'
import {
  assertSafeLogicalStoragePath,
  classifyStoragePath,
  getLocalStorageRoot,
  resolvePhysicalStoragePath,
  storagePathBelongsToUser,
} from '#/lib/storage/local-storage-paths'

const CLEANUP_PENDING_QUERY_VALUE = 'pending'
const ABSOLUTE_PATH_PREFIX_PATTERN = /^[\\/]+/

const cleanupPendingBodySchema = z.union([
  z.object({ url: z.string().min(1) }),
  z.object({ urls: z.array(z.string().min(1)).max(50) }),
])

type PendingCleanupEntry = {
  url: string
  reason?: string
}

type PendingCleanupCandidate =
  | {
    ok: true
    logicalPath: string
    physicalPath: string
  }
  | {
    ok: false
    logicalPath: string
    error: string
  }

// ---------------------------------------------------------------------------
// POST /api/upload - Upload lampiran file to local filesystem storage.
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/upload')({
  ssr: false,
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const searchParams = new URL(request.url).searchParams
        if (searchParams.get('cleanup') === CLEANUP_PENDING_QUERY_VALUE) {
          return handlePendingCleanupRequest(request, session.userId)
        }

        let formData: FormData
        try {
          formData = await request.formData()
        } catch {
          return Response.json({ error: 'Invalid form data' }, { status: 400 })
        }

        const file = formData.get('file')
        if (!(file instanceof File)) {
          return Response.json({ error: 'File tidak ditemukan' }, { status: 400 })
        }

        const kelengkapanId = formData.get('kelengkapan_id')
        const namaDokumen = formData.get('nama_dokumen')

        if (
          typeof kelengkapanId !== 'string'
          || typeof namaDokumen !== 'string'
          || !kelengkapanId
          || !namaDokumen
        ) {
          return Response.json({ error: 'kelengkapan_id dan nama_dokumen wajib diisi' }, { status: 400 })
        }

        let descriptor: ReturnType<typeof createLocalUploadDescriptor>
        try {
          descriptor = createLocalUploadDescriptor({
            ownerUserId: session.userId,
            kelengkapanId,
            file: {
              name: file.name,
              type: file.type,
              size: file.size,
            },
          })
        } catch (error) {
          return localUploadErrorResponse(error)
        }

        let fileContent: ArrayBuffer
        try {
          fileContent = await file.arrayBuffer()
        } catch {
          return Response.json({ error: 'Gagal membaca file' }, { status: 400 })
        }

        try {
          await writeLocalUploadContent({
            logicalPath: descriptor.logicalPath,
            content: fileContent,
            expectedBytes: file.size,
            expectedContentType: descriptor.contentType,
            expectedExtension: descriptor.extension,
          })
        } catch (error) {
          if (error instanceof LocalUploadError) {
            return localUploadErrorResponse(error)
          }

          console.error('[upload] Local storage write failed:', { code: 'unknown' })
          return Response.json({ error: DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE }, { status: 500 })
        }

        return Response.json({
          url: descriptor.logicalPath,
          nama: namaDokumen,
          kelengkapan_id: descriptor.kelengkapanId,
          uploaded_at: new Date().toISOString(),
        }, { status: 201 })
      },
    },
  },
})

function localUploadErrorResponse(error: unknown): Response {
  if (!(error instanceof LocalUploadError)) {
    return Response.json({ error: DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE }, { status: 500 })
  }

  switch (error.code) {
    case 'invalid-kelengkapan-id':
      return Response.json({ error: 'ID kelengkapan tidak valid' }, { status: 400 })
    case 'invalid-file-size':
    case 'invalid-content-size':
      return Response.json({ error: DOCUMENT_UPLOAD_TOO_LARGE_MESSAGE }, { status: 400 })
    case 'invalid-file-extension':
    case 'invalid-file-type':
      return Response.json({ error: DOCUMENT_UPLOAD_INVALID_FORMAT_MESSAGE }, { status: 400 })
    case 'invalid-file-empty':
    case 'invalid-file-name':
    case 'invalid-file-signature':
    case 'invalid-owner-id':
    case 'invalid-timestamp':
      return Response.json({ error: DOCUMENT_UPLOAD_INVALID_FILE_MESSAGE }, { status: 400 })
    case 'target-exists':
    case 'write-failed':
      return Response.json({ error: DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE }, { status: 500 })
  }
}

async function handlePendingCleanupRequest(request: Request, ownerUserId: string): Promise<Response> {
  let bodyJson: unknown
  try {
    bodyJson = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = cleanupPendingBodySchema.safeParse(bodyJson)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const requestedUrls = 'urls' in parsed.data ? parsed.data.urls : [parsed.data.url]
  const uniqueUrls = [...new Set(requestedUrls)]
  const deleted: string[] = []
  const skipped: PendingCleanupEntry[] = []
  const errors: PendingCleanupEntry[] = []

  for (const url of uniqueUrls) {
    const candidate = preparePendingCleanupCandidate(url, ownerUserId)

    if (!candidate.ok) {
      errors.push({ url: candidate.logicalPath, reason: candidate.error })
      continue
    }

    const inspection = await inspectPendingCleanupFile(candidate.physicalPath)
    if (inspection === 'missing') {
      skipped.push({ url: candidate.logicalPath, reason: 'missing' })
      continue
    }

    if (inspection !== 'ok') {
      errors.push({ url: candidate.logicalPath, reason: inspection })
      continue
    }

    try {
      await unlink(candidate.physicalPath)
      deleted.push(candidate.logicalPath)
    } catch (error) {
      if (isNodeErrorCode(error, 'ENOENT')) {
        skipped.push({ url: candidate.logicalPath, reason: 'missing' })
        continue
      }

      errors.push({ url: candidate.logicalPath, reason: 'delete-failed' })
    }
  }

  return Response.json({
    success: errors.length === 0,
    deleted,
    skipped,
    errors,
  })
}

function preparePendingCleanupCandidate(url: string, ownerUserId: string): PendingCleanupCandidate {
  let logicalPath: string
  const rawUrl = url.trim()

  if (ABSOLUTE_PATH_PREFIX_PATTERN.test(rawUrl)) {
    return { ok: false, logicalPath: '[unsafe-path]', error: 'invalid-path' }
  }

  try {
    logicalPath = assertSafeLogicalStoragePath(rawUrl)
  } catch {
    return { ok: false, logicalPath: '[unsafe-path]', error: 'invalid-path' }
  }

  const classification = classifyStoragePath(logicalPath)
  if (classification !== 'pending-upload-api' && classification !== 'pending-dash') {
    return { ok: false, logicalPath, error: 'not-pending' }
  }

  if (!storagePathBelongsToUser(logicalPath, ownerUserId)) {
    return { ok: false, logicalPath, error: 'owner-mismatch' }
  }

  try {
    return {
      ok: true,
      logicalPath,
      physicalPath: resolvePhysicalStoragePath(getLocalStorageRoot(), logicalPath),
    }
  } catch {
    return { ok: false, logicalPath, error: 'invalid-path' }
  }
}

async function inspectPendingCleanupFile(
  physicalPath: string,
): Promise<'ok' | 'missing' | 'not-a-file' | 'path-outside-root'> {
  try {
    const stats = await lstat(physicalPath)
    if (!stats.isFile()) return 'not-a-file'

    const [resolvedRoot, resolvedFile] = await Promise.all([
      realpath(getLocalStorageRoot()),
      realpath(physicalPath),
    ])

    return isPhysicalPathInsideRoot(resolvedRoot, resolvedFile)
      ? 'ok'
      : 'path-outside-root'
  } catch (error) {
    if (isNodeErrorCode(error, 'ENOENT')) return 'missing'
    return 'not-a-file'
  }
}

function isPhysicalPathInsideRoot(storageRoot: string, physicalPath: string): boolean {
  const relativePath = path.relative(storageRoot, physicalPath)

  return relativePath !== ''
    && !relativePath.startsWith('..')
    && !path.isAbsolute(relativePath)
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === code
}
