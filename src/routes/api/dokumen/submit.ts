import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
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
import {
  createAndSubmitDokumenSchema,
  getDokumenValidationErrorMessage,
  validateNominalForMaterial,
  validateWorkflowChainForCharacteristic,
} from '#/lib/schemas/dokumen'
import { buildSubmitMovePlan } from '#/lib/storage/submit-move-plan'
import {
  assertSafeLogicalStoragePath,
  getPendingUploadOriginalFilename,
} from '#/lib/storage/local-storage-paths'
import { moveLocalPendingFileToFormal } from '#/lib/storage/local-pending-move'
import {
  rollbackLocalAttachmentMovements,
  type LocalAttachmentMovedFile,
} from '#/lib/storage/local-attachment-replacement'

const SUBMIT_FILE_MOVEMENT_FAILED_MESSAGE = 'Gagal mengajukan dokumen, silakan coba lagi'

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
      error: describeSubmitPreflightIssues(preflight.issues, payload.lampiranUrls),
      writePathExecuted: false,
      filesystemMovementExecuted: false,
      issues: preflight.issues.map(issue => toSafePreflightIssue(issue, payload.lampiranUrls)),
    }, { status: 400 })
  }

  const moveRequiredOperations = preflight.operations.filter(isMoveRequiredOperation)
  // Files moved pending -> formal inside the submit transaction; kept here so a
  // failed commit can put them back in pending.
  const moved: LocalAttachmentMovedFile[] = []
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

    // Files move after the dokumen/status/log inserts and before commit: a
    // failed move throws, the transaction rolls back and no row is committed.
    result = await executeLocalSubmitWritePlan(repository, prepared.plan, {
      afterWrites: moveRequiredOperations.length > 0
        ? () => moveSubmitFilesOrRollback({
          ownerUserId: localSession.userId,
          operations: moveRequiredOperations,
          moved,
        })
        : undefined,
    })
  } catch (error) {
    if (error instanceof SubmitFileMovementError) {
      if (!error.rollbackOk) {
        console.error('[API/dokumen/submit] pending file rollback failed after move failure')
      }
      return Response.json({ error: SUBMIT_FILE_MOVEMENT_FAILED_MESSAGE }, { status: 500 })
    }

    // The transaction failed after files were already moved (e.g. commit
    // failure): the rows are gone, so the files go back to pending too.
    if (moved.length > 0) {
      const rollback = await rollbackLocalAttachmentMovements(moved)
      if (!rollback.ok) {
        console.error('[API/dokumen/submit] pending file rollback failed after transaction failure')
      }
      return Response.json({ error: SUBMIT_FILE_MOVEMENT_FAILED_MESSAGE }, { status: 500 })
    }

    return Response.json({ error: 'Gagal mengajukan dokumen' }, { status: 500 })
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
      error: describeSubmitPreflightIssues(preflight.issues, attachments),
      issues: preflight.issues.map(issue => toSafePreflightIssue(issue, attachments)),
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

type PreflightAttachmentLabelSource = { url: string; nama?: unknown }

function toSafePreflightIssue(
  issue: SubmitFilePreflightIssue,
  attachments: readonly PreflightAttachmentLabelSource[],
) {
  return {
    code: issue.code,
    message: describeSubmitPreflightIssue(issue.clientCategory, [attachmentLabel(attachments[issue.index])]),
    index: issue.index,
    clientCategory: issue.clientCategory,
    sourceClassification: issue.sourceClassification,
    movePlanIssueCode: issue.movePlanIssueCode,
    checkKind: issue.checkKind,
    sourceLogicalPath: safeLogicalPathForResponse(issue.sourceLogicalPath),
    targetLogicalPath: safeLogicalPathForResponse(issue.targetLogicalPath),
  }
}

// User-facing (Indonesian) explanation of why submit stopped before writing
// anything: which lampiran, what went wrong and what the Pegawai should do.
// Issues are grouped per category so one sentence covers several lampiran.
function describeSubmitPreflightIssues(
  issues: readonly SubmitFilePreflightIssue[],
  attachments: readonly PreflightAttachmentLabelSource[],
): string {
  const labelsByCategory = new Map<SubmitFilePreflightIssue['clientCategory'], string[]>()
  for (const issue of issues) {
    const labels = labelsByCategory.get(issue.clientCategory) ?? []
    const label = attachmentLabel(attachments[issue.index])
    if (!labels.includes(label)) labels.push(label)
    labelsByCategory.set(issue.clientCategory, labels)
  }

  const sentences = [...labelsByCategory.entries()]
    .map(([category, labels]) => describeSubmitPreflightIssue(category, labels))

  return `Dokumen belum diajukan. ${sentences.join(' ')}`
}

function describeSubmitPreflightIssue(
  category: SubmitFilePreflightIssue['clientCategory'],
  labels: readonly string[],
): string {
  const subject = labels.length > 1 ? `Lampiran ${labels.join(', ')}` : `Lampiran ${labels[0]}`

  switch (category) {
    case 'local-storage-missing':
      return `${subject} tidak ditemukan di penyimpanan sementara (kemungkinan sudah terhapus atau kedaluwarsa). `
        + 'Hapus lampiran tersebut, unggah ulang filenya, lalu ajukan kembali.'
    case 'local-storage-conflict':
      return `${subject} tidak dapat dipindahkan ke penyimpanan tetap karena lokasi tujuannya sudah terpakai. `
        + 'Silakan ajukan kembali; bila masih gagal, unggah ulang lampiran tersebut.'
    case 'preflight-unavailable':
      return `Penyimpanan file sedang tidak dapat diperiksa untuk ${subject.charAt(0).toLowerCase()}${subject.slice(1)}. `
        + 'Silakan coba beberapa saat lagi.'
    default:
      return `${subject} tidak valid atau bukan milik akun Anda. `
        + 'Hapus lampiran tersebut, unggah ulang filenya, lalu ajukan kembali.'
  }
}

// `"Kuitansi" (bukti.pdf)` — kelengkapan name plus the original filename that is
// embedded in pending upload paths; never exposes the full storage path.
function attachmentLabel(attachment: PreflightAttachmentLabelSource | undefined): string {
  if (!attachment) return 'yang dipilih'

  const nama = typeof attachment.nama === 'string' ? attachment.nama.trim() : ''
  const fileName = getPendingUploadOriginalFilename(attachment.url)

  if (nama && fileName) return `"${nama}" (${fileName})`
  if (nama) return `"${nama}"`
  if (fileName) return `"${fileName}"`
  return 'yang dipilih'
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

class SubmitFileMovementError extends Error {
  constructor(readonly rollbackOk: boolean) {
    super('SUBMIT_FILE_MOVEMENT_FAILED')
    this.name = 'SubmitFileMovementError'
  }
}

// Moves every planned pending file to its formal target. On the first failure
// the files already moved are returned to pending and the error aborts the
// surrounding submit transaction.
async function moveSubmitFilesOrRollback({
  ownerUserId,
  operations,
  moved,
}: {
  ownerUserId: string
  operations: Array<SubmitFilePreflightOperation & { action: 'move-required' }>
  moved: LocalAttachmentMovedFile[]
}): Promise<void> {
  for (const operation of operations) {
    try {
      const target = parsePlannedSubmitTarget(operation.targetLogicalPath)
      if (!target) throw new Error('invalid-target-path')

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
        throw new Error('move-result-mismatch')
      }

      moved.push({
        index: operation.index,
        sourceLogicalPath: operation.sourceLogicalPath,
        targetLogicalPath: operation.targetLogicalPath,
      })
    } catch {
      const rollback = await rollbackLocalAttachmentMovements([...moved])
      if (rollback.ok) moved.length = 0
      throw new SubmitFileMovementError(rollback.ok)
    }
  }
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
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = createAndSubmitDokumenSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({
            error: getDokumenValidationErrorMessage(parsed.error),
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

        // Validate the workflow chain field required per characteristic:
        // Material -> komponenId, Non-Material -> namaDokumen.
        const chainValidation = validateWorkflowChainForCharacteristic(
          parsed.data.is_non_material,
          { komponenId: parsed.data.komponenId, namaDokumen: parsed.data.namaDokumen }
        )
        if (!chainValidation.valid) {
          return Response.json({ error: chainValidation.error }, { status: 400 })
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
