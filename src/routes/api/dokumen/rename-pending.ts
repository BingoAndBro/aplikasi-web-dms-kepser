import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { createAdminClient } from '#/lib/supabase-admin'
import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import { getDokumenById } from '#/lib/dokumen-helpers'
import {
  classifyLocalPendingMovePath,
  generateLocalFormalTargetLogicalPath,
  LocalPendingMoveError,
  moveLocalPendingFileToFormal,
} from '#/lib/storage/local-pending-move'

const renamePendingBodySchema = z.object({
  dokId: z.string().min(1),
  lampiranUrls: z.array(z.any()),
  userId: z.string().optional(),
}).passthrough()

// ---------------------------------------------------------------------------
// POST /api/dokumen/rename-pending
// Rename pending file to formal storage path.
//
// Body: { dokId: string, lampiranUrls: LampiranUrl[], userId: string }
// Response: { success: true, renamed: { oldPath: string, newPath: string }[] }
//           or { error: string } with status 500
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/rename-pending')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        let bodyJson: unknown
        try {
          bodyJson = await request.json()
        } catch {
          return Response.json({ error: 'Invalid request body' }, { status: 400 })
        }

        const parsedBody = renamePendingBodySchema.safeParse(bodyJson)
        if (!parsedBody.success) {
          return Response.json({ error: 'Missing dokId or lampiranUrls' }, { status: 400 })
        }

        const body = parsedBody.data
        const { dokId, lampiranUrls, userId } = body

        if (userId !== session.userId) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        const admin = createAdminClient()
        const dokumen = await getDokumenById(admin, dokId)
        if (!dokumen) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }
        if (dokumen.created_by !== session.userId) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        const renamed: { oldPath: string; newPath: string }[] = []
        const errors: { path: string; error: string }[] = []

        for (const lamp of lampiranUrls) {
          if (!lamp.url || typeof lamp.url !== 'string') {
            continue
          }

          const oldPath = lamp.url

          let classification: ReturnType<typeof classifyLocalPendingMovePath>
          try {
            classification = classifyLocalPendingMovePath(oldPath)
          } catch {
            return Response.json({ error: 'Path lampiran tidak valid' }, { status: 400 })
          }

          if (classification === 'formal' || classification === 'unsupported') {
            continue
          }

          const targetUuid = crypto.randomUUID()
          let newPath: string

          try {
            newPath = generateLocalFormalTargetLogicalPath({
              sourceLogicalPath: oldPath,
              ownerUserId: session.userId,
              dokumenId: dokId,
              targetUuid,
            })
          } catch (error) {
            return localPendingMoveErrorResponse(error, oldPath)
          }

          try {
            const result = await moveLocalPendingFileToFormal({
              sourceLogicalPath: oldPath,
              ownerUserId: session.userId,
              dokumenId: dokId,
              targetUuid,
            })

            if (result.action === 'moved') {
              renamed.push({ oldPath: result.sourceLogicalPath, newPath: result.targetLogicalPath })
            }
          } catch (error) {
            const message = pendingMoveErrorMessage(error)
            errors.push({ path: oldPath, error: message })
            return localPendingMoveErrorResponse(error, oldPath, newPath)
          }
        }

        return Response.json({
          success: true,
          renamed,
          errors: errors.length > 0 ? errors : undefined,
        })
      },
    },
  },
})

function localPendingMoveErrorResponse(error: unknown, oldPath: string, newPath?: string): Response {
  if (error instanceof LocalPendingMoveError) {
    switch (error.code) {
      case 'owner-mismatch':
        return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
      case 'invalid-source-path':
        return Response.json({ error: 'Path lampiran tidak valid' }, { status: 400 })
      case 'invalid-document-id':
      case 'invalid-owner-id':
      case 'invalid-target-path':
      case 'invalid-target-uuid':
      case 'source-not-file':
      case 'missing-source':
      case 'move-failed':
      case 'target-exists':
      case 'unsupported-source-path':
        return Response.json({
          error: `Gagal memproses file: ${pendingMoveErrorMessage(error)}`,
          details: {
            failedPath: oldPath,
            newPath,
            reason: pendingMoveErrorMessage(error),
          },
        }, { status: 500 })
    }
  }

  return Response.json({
    error: 'Gagal memproses file: Terjadi kesalahan',
    details: {
      failedPath: oldPath,
      newPath,
      reason: 'Terjadi kesalahan',
    },
  }, { status: 500 })
}

function pendingMoveErrorMessage(error: unknown): string {
  if (!(error instanceof LocalPendingMoveError)) {
    return 'Terjadi kesalahan'
  }

  switch (error.code) {
    case 'missing-source':
      return 'File lokal tidak ditemukan'
    case 'target-exists':
      return 'Target file sudah ada'
    case 'source-not-file':
      return 'File sumber tidak valid'
    case 'move-failed':
      return 'Pemindahan file gagal'
    case 'unsupported-source-path':
      return 'Path lampiran tidak didukung'
    case 'invalid-document-id':
    case 'invalid-owner-id':
    case 'invalid-source-path':
    case 'invalid-target-path':
    case 'invalid-target-uuid':
    case 'owner-mismatch':
      return 'Path lampiran tidak valid'
  }
}
