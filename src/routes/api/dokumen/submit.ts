import { createFileRoute } from '@tanstack/react-router'
import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import { ROLES } from '#/lib/constants/roles'
import {
  preflightSubmitFiles,
  type SubmitFilePreflightIssue,
  type SubmitFilePreflightOperation,
} from '#/lib/dokumen/submit-file-preflight'
import { createSubmitDiskPreflightChecker } from '#/lib/dokumen/submit-disk-preflight-checker'
import {
  createLocalSubmitActorFromSession,
  executeLocalSubmitWritePlan,
  prepareLocalSubmitWriteBridge,
  type LocalSubmitBridgeIssue,
} from '#/lib/dokumen/local-submit-write-bridge'
import { createLocalSubmitBridgeRepository } from '#/lib/dokumen/local-submit-repository'
import { createLiveLocalSubmitDrizzleAdapter } from '#/lib/dokumen/local-submit-drizzle-adapter'
import type { LampiranUrl } from '#/lib/dokumen/types'
import { createAndSubmitDokumenSchema, validateNominalForMaterial } from '#/lib/schemas/dokumen'
import { buildSubmitMovePlan } from '#/lib/storage/submit-move-plan'
import { assertSafeLogicalStoragePath } from '#/lib/storage/local-storage-paths'
import {
  LocalPendingMoveError,
  moveLocalPendingFileToFormal,
} from '#/lib/storage/local-pending-move'

function isLocalAuthDryRunRequest(request: Request): boolean {
  return new URL(request.url).searchParams.get('useLocalAuthDryRun') === 'true'
}

function isLocalPreflightDryRunRequest(request: Request): boolean {
  return new URL(request.url).searchParams.get('useLocalPreflightDryRun') === 'true'
}

async function handleLocalAuthDryRun(request: Request): Promise<Response> {
  const localSession = await getLocalServerSession(request)

  if (!localSession?.userId || !localSession.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!localSession.roles.includes(ROLES.PEGAWAI)) {
    return Response.json({ error: 'Akses ditolak' }, { status: 403 })
  }

  return Response.json({
    dryRun: true,
    boundary: 'local-auth',
    submitCompatible: true,
    writePathExecuted: false,
    filesystemMovementExecuted: false,
    message: 'Local auth boundary validated; submit write path was not executed.',
  }, { status: 200 })
}

async function handleLocalDbSubmit(
  request: Request,
  payload: ReturnType<typeof createAndSubmitDokumenSchema.parse>,
): Promise<Response> {
  const localSession = await getLocalServerSession(request)

  if (!localSession?.userId || !localSession.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const actorResult = createLocalSubmitActorFromSession(localSession)
  if (!actorResult.ok) {
    return Response.json({ error: 'Akses ditolak' }, { status: 403 })
  }

  const movePlan = buildSubmitMovePlan({
    ownerUserId: localSession.userId,
    attachments: payload.lampiranUrls,
  })
  const preflight = await preflightSubmitFiles({
    actorUserId: localSession.userId,
    movePlan,
    existenceChecker: createSubmitDiskPreflightChecker(),
  })

  if (!preflight.ok) {
    return Response.json({
      error: 'Local submit preflight failed; submit write path was not executed.',
      writePathExecuted: false,
      filesystemMovementExecuted: false,
      issues: preflight.issues.map(toSafePreflightIssue),
    }, { status: 400 })
  }

  const moveRequiredOperations = preflight.operations.filter(isMoveRequiredOperation)
  let result: Awaited<ReturnType<typeof executeLocalSubmitWritePlan>>

  try {
    const adapter = await createLiveLocalSubmitDrizzleAdapter()
    const repository = createLocalSubmitBridgeRepository(adapter)
    const prepared = await prepareLocalSubmitWriteBridge({
      actor: actorResult.actor,
      payload,
      repository,
      lampiranUrls: preflight.plannedAttachments as LampiranUrl[],
    })

    if (!prepared.ok) {
      return localSubmitBridgeIssueResponse(prepared.issue)
    }

    result = await executeLocalSubmitWritePlan(repository, prepared.plan)
  } catch {
    return Response.json({ error: 'Gagal mengajukan dokumen' }, { status: 500 })
  }

  if (moveRequiredOperations.length > 0) {
    const movement = await executeLocalSubmitMovements({
      ownerUserId: localSession.userId,
      operations: moveRequiredOperations,
    })

    if (!movement.ok) {
      return Response.json({
        error: 'Local file movement failed after local DB submit.',
        code: 'local-file-movement-failed',
        writePathExecuted: true,
        filesystemMovementExecuted: movement.attempted,
        compensationRequired: true,
        partialMovement: movement.partialMovement,
        movedCount: movement.movedCount,
        issues: [movement.issue],
      }, { status: 500 })
    }
  }

  return Response.json({ success: true, dokumen: result.dokumen }, { status: 201 })
}

async function handleLocalPreflightDryRun(
  request: Request,
  attachments: Array<{ url: string; [key: string]: unknown }>,
): Promise<Response> {
  const localSession = await getLocalServerSession(request)

  if (!localSession?.userId || !localSession.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!localSession.roles.includes(ROLES.PEGAWAI)) {
    return Response.json({ error: 'Akses ditolak' }, { status: 403 })
  }

  const movePlan = buildSubmitMovePlan({
    ownerUserId: localSession.userId,
    attachments,
  })
  const preflight = await preflightSubmitFiles({
    actorUserId: localSession.userId,
    movePlan,
    existenceChecker: createSubmitDiskPreflightChecker(),
  })

  if (!preflight.ok) {
    return Response.json({
      dryRun: true,
      boundary: 'local-preflight',
      submitCompatible: true,
      preflightOk: false,
      writePathExecuted: false,
      filesystemMovementExecuted: false,
      error: 'Local submit preflight failed; submit write path was not executed.',
      issues: preflight.issues.map(toSafePreflightIssue),
    }, { status: 400 })
  }

  return Response.json({
    dryRun: true,
    boundary: 'local-preflight',
    submitCompatible: true,
    preflightOk: true,
    writePathExecuted: false,
    filesystemMovementExecuted: false,
    message: 'Local submit preflight validated; submit write path was not executed.',
  }, { status: 200 })
}

function localSubmitBridgeIssueResponse(issue: LocalSubmitBridgeIssue): Response {
  if (issue.code === 'ketua-tim-assignment-missing') {
    return Response.json({ error: issue.message }, { status: 403 })
  }

  if (issue.code === 'transition-failed') {
    return Response.json({ error: issue.message }, { status: 500 })
  }

  return Response.json({ error: issue.message }, { status: 400 })
}

function toSafePreflightIssue(issue: SubmitFilePreflightIssue) {
  return {
    code: issue.code,
    message: issue.message,
    index: issue.index,
    clientCategory: issue.clientCategory,
    sourceClassification: issue.sourceClassification,
    movePlanIssueCode: issue.movePlanIssueCode,
    checkKind: issue.checkKind,
    sourceLogicalPath: safeLogicalPathForResponse(issue.sourceLogicalPath),
    targetLogicalPath: safeLogicalPathForResponse(issue.targetLogicalPath),
  }
}

function safeLogicalPathForResponse(logicalPath: string | null): string | null {
  if (!logicalPath) return null

  try {
    return assertSafeLogicalStoragePath(logicalPath) === logicalPath
      ? logicalPath
      : null
  } catch {
    return null
  }
}

function isMoveRequiredOperation(
  operation: SubmitFilePreflightOperation,
): operation is SubmitFilePreflightOperation & { action: 'move-required' } {
  return operation.action === 'move-required'
}

async function executeLocalSubmitMovements({
  ownerUserId,
  operations,
}: {
  ownerUserId: string
  operations: Array<SubmitFilePreflightOperation & { action: 'move-required' }>
}): Promise<
  | { ok: true }
  | {
    ok: false
    attempted: boolean
    partialMovement: boolean
    movedCount: number
    issue: LocalSubmitMovementIssue
  }
> {
  let movedCount = 0

  for (const operation of operations) {
    const target = parsePlannedSubmitTarget(operation.targetLogicalPath)
    if (!target) {
      return {
        ok: false,
        attempted: false,
        partialMovement: movedCount > 0,
        movedCount,
        issue: createLocalSubmitMovementIssue({
          code: 'invalid-target-path',
          index: operation.index,
          sourceLogicalPath: operation.sourceLogicalPath,
          targetLogicalPath: operation.targetLogicalPath,
        }),
      }
    }

    try {
      const result = await moveLocalPendingFileToFormal({
        sourceLogicalPath: operation.sourceLogicalPath,
        ownerUserId,
        dokumenId: target.dokumenId,
        targetUuid: target.targetUuid,
      })

      if (
        result.action !== 'moved'
        || result.sourceLogicalPath !== operation.sourceLogicalPath
        || result.targetLogicalPath !== operation.targetLogicalPath
      ) {
        return {
          ok: false,
          attempted: true,
          partialMovement: movedCount > 0,
          movedCount,
          issue: createLocalSubmitMovementIssue({
            code: 'move-result-mismatch',
            index: operation.index,
            sourceLogicalPath: operation.sourceLogicalPath,
            targetLogicalPath: operation.targetLogicalPath,
          }),
        }
      }

      movedCount += 1
    } catch (error) {
      return {
        ok: false,
        attempted: true,
        partialMovement: movedCount > 0,
        movedCount,
        issue: createLocalSubmitMovementIssue({
          code: mapLocalSubmitMovementErrorCode(error),
          index: operation.index,
          sourceLogicalPath: operation.sourceLogicalPath,
          targetLogicalPath: operation.targetLogicalPath,
        }),
      }
    }
  }

  return { ok: true }
}

type LocalSubmitMovementIssue = {
  code:
    | 'invalid-target-path'
    | 'missing-source'
    | 'move-failed'
    | 'move-result-mismatch'
    | 'target-exists'
    | 'unsupported-source-path'
  index: number
  clientCategory:
    | 'local-storage-conflict'
    | 'local-storage-missing'
    | 'preflight-unavailable'
    | 'validation'
  sourceLogicalPath: string | null
  targetLogicalPath: string | null
}

function createLocalSubmitMovementIssue({
  code,
  index,
  sourceLogicalPath,
  targetLogicalPath,
}: {
  code: LocalSubmitMovementIssue['code']
  index: number
  sourceLogicalPath: string
  targetLogicalPath: string
}): LocalSubmitMovementIssue {
  return {
    code,
    index,
    clientCategory: localSubmitMovementClientCategory(code),
    sourceLogicalPath: safeLogicalPathForResponse(sourceLogicalPath),
    targetLogicalPath: safeLogicalPathForResponse(targetLogicalPath),
  }
}

function localSubmitMovementClientCategory(
  code: LocalSubmitMovementIssue['code'],
): LocalSubmitMovementIssue['clientCategory'] {
  if (code === 'missing-source') return 'local-storage-missing'
  if (code === 'target-exists') return 'local-storage-conflict'
  if (code === 'invalid-target-path' || code === 'unsupported-source-path') return 'validation'
  return 'preflight-unavailable'
}

function mapLocalSubmitMovementErrorCode(error: unknown): LocalSubmitMovementIssue['code'] {
  if (error instanceof LocalPendingMoveError) {
    if (error.code === 'missing-source') return 'missing-source'
    if (error.code === 'target-exists') return 'target-exists'
    if (error.code === 'unsupported-source-path') return 'unsupported-source-path'
  }

  return 'move-failed'
}

function parsePlannedSubmitTarget(
  targetLogicalPath: string,
): { dokumenId: string; targetUuid: string } | null {
  let safePath: string

  try {
    safePath = assertSafeLogicalStoragePath(targetLogicalPath)
  } catch {
    return null
  }

  const parts = safePath.split('/')
  if (parts.length !== 3) return null

  const dokumenId = parts[1]
  const fileName = parts[2]
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex <= 0) return null

  const targetUuid = fileName.slice(0, dotIndex)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUuid)) {
    return null
  }

  return {
    dokumenId,
    targetUuid: targetUuid.toLowerCase(),
  }
}

// ---------------------------------------------------------------------------
// POST /api/dokumen/submit — Combined create + submit in one request
// Used by the Ajukan Dokumen form (Section 05)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/submit')({
  ssr: false,
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = createAndSubmitDokumenSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: parsed.error.flatten(),
          }, { status: 400 })
        }

        // Validate nominal_realisasi for Material documents
        const nominalValidation = validateNominalForMaterial(
          parsed.data.is_non_material,
          parsed.data.nominal_realisasi
        )
        if (!nominalValidation.valid) {
          return Response.json({ error: nominalValidation.error }, { status: 400 })
        }

        if (isLocalAuthDryRunRequest(request)) {
          return handleLocalAuthDryRun(request)
        }

        if (isLocalPreflightDryRunRequest(request)) {
          return handleLocalPreflightDryRun(request, parsed.data.lampiranUrls)
        }

        // Default submit is local-backed. The previous `useLocalDbSubmit=true`
        // trigger is now a redundant diagnostic alias because all non-dry-run
        // submit requests execute this local path.
        return handleLocalDbSubmit(request, parsed.data)
      },
    },
  },
})
