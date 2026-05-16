// Server-only module. Do not import from client components.
// Additional guardrails:
// - Treat this as isolated planning-helper foundation work only.
// - Prefer pure deterministic planning functions with explicit inputs/outputs.
// - Do not perform hidden filesystem IO through helper imports or indirect utilities.
// - If path semantics are unclear, classify conservatively as unsupported.
// - Do not reduce grep counts by editing source files.
import { randomUUID } from 'node:crypto'

import {
  assertSafeLogicalStoragePath,
  classifyStoragePath,
  getFileExtension,
  getLogicalPathOwnerId,
  sanitizeStoragePathSegment,
} from '#/lib/storage/local-storage-paths'

export type SubmitMovePlanPathClassification =
  | 'pending-dash'
  | 'pending-upload-api'
  | 'formal'
  | 'unsupported'
  | 'invalid'

export type SubmitMovePlanIssueCode =
  | 'invalid-document-id'
  | 'invalid-owner-id'
  | 'invalid-source-extension'
  | 'invalid-source-path'
  | 'invalid-target-path'
  | 'invalid-target-uuid'
  | 'missing-url'
  | 'owner-mismatch'
  | 'unsupported-source-path'

export type SubmitMovePlanAttachment = {
  url?: unknown
  [key: string]: unknown
}

export type SubmitMovePlanIssue = {
  code: SubmitMovePlanIssueCode
  message: string
}

export type SubmitMovePlanEntry<TAttachment extends SubmitMovePlanAttachment = SubmitMovePlanAttachment> = {
  index: number
  action: 'planned-move' | 'unchanged' | 'unsupported' | 'invalid'
  attachment: TAttachment
  plannedAttachment: TAttachment
  sourceLogicalPath: string | null
  targetLogicalPath: string | null
  sourceClassification: SubmitMovePlanPathClassification
  issue: SubmitMovePlanIssue | null
}

export type SubmitMovePlan<TAttachment extends SubmitMovePlanAttachment = SubmitMovePlanAttachment> = {
  ownerUserId: string
  dokumenId: string
  entries: SubmitMovePlanEntry<TAttachment>[]
  moves: {
    index: number
    oldPath: string
    newPath: string
  }[]
  plannedAttachments: TAttachment[]
  issues: Array<SubmitMovePlanIssue & { index: number }>
  hasBlockingIssues: boolean
}

export type BuildSubmitMovePlanInput<TAttachment extends SubmitMovePlanAttachment = SubmitMovePlanAttachment> = {
  ownerUserId: string
  /**
   * Submit currently formalizes files before the real document id exists.
   * Keep temp-id as the default until route/write compatibility proves a safer
   * real document id ordering.
   */
  dokumenId?: string
  attachments: readonly TAttachment[]
  targetUuidFactory?: () => string
}

const DEFAULT_SUBMIT_DOKUMEN_ID = 'temp-id'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function buildSubmitMovePlan<TAttachment extends SubmitMovePlanAttachment>({
  ownerUserId,
  dokumenId = DEFAULT_SUBMIT_DOKUMEN_ID,
  attachments,
  targetUuidFactory = randomUUID,
}: BuildSubmitMovePlanInput<TAttachment>): SubmitMovePlan<TAttachment> {
  const ownerSegmentResult = validateExactSafeSegment(ownerUserId, 'invalid-owner-id')
  const documentSegmentResult = validateExactSafeSegment(dokumenId, 'invalid-document-id')

  const entries = attachments.map((attachment, index) => {
    if (!ownerSegmentResult.ok) {
      return createInvalidEntry(index, attachment, ownerSegmentResult.issue)
    }

    if (!documentSegmentResult.ok) {
      return createInvalidEntry(index, attachment, documentSegmentResult.issue)
    }

    return buildSubmitMovePlanEntry({
      attachment,
      index,
      ownerUserId: ownerSegmentResult.value,
      dokumenId: documentSegmentResult.value,
      targetUuidFactory,
    })
  })

  const moves = entries
    .filter(isPlannedMoveEntry)
    .map(entry => ({
      index: entry.index,
      oldPath: entry.sourceLogicalPath,
      newPath: entry.targetLogicalPath,
    }))

  const issues = entries.flatMap(entry => {
    if (!entry.issue) return []

    return [{ index: entry.index, ...entry.issue }]
  })

  return {
    ownerUserId: ownerSegmentResult.ok ? ownerSegmentResult.value : ownerUserId,
    dokumenId: documentSegmentResult.ok ? documentSegmentResult.value : dokumenId,
    entries,
    moves,
    plannedAttachments: entries.map(entry => entry.plannedAttachment),
    issues,
    hasBlockingIssues: issues.length > 0,
  }
}

function buildSubmitMovePlanEntry<TAttachment extends SubmitMovePlanAttachment>({
  attachment,
  index,
  ownerUserId,
  dokumenId,
  targetUuidFactory,
}: {
  attachment: TAttachment
  index: number
  ownerUserId: string
  dokumenId: string
  targetUuidFactory: () => string
}): SubmitMovePlanEntry<TAttachment> {
  if (typeof attachment.url !== 'string' || attachment.url.trim() === '') {
    return createInvalidEntry(index, attachment, {
      code: 'missing-url',
      message: 'Attachment URL is required for submit move planning.',
    })
  }

  const sourceResult = normalizeSourceLogicalPath(attachment.url)
  if (!sourceResult.ok) {
    return createInvalidEntry(index, attachment, sourceResult.issue, attachment.url)
  }

  const sourceLogicalPath = sourceResult.value
  const ownerId = getLogicalPathOwnerId(sourceLogicalPath)

  if (ownerId !== ownerUserId) {
    return createInvalidEntry(index, attachment, {
      code: 'owner-mismatch',
      message: 'Attachment owner segment does not match the submit actor.',
    }, sourceLogicalPath)
  }

  const classification = classifyStoragePath(sourceLogicalPath)
  if (classification === 'formal') {
    return {
      index,
      action: 'unchanged',
      attachment,
      plannedAttachment: attachment,
      sourceLogicalPath,
      targetLogicalPath: sourceLogicalPath,
      sourceClassification: 'formal',
      issue: null,
    }
  }

  if (classification !== 'pending-dash' && classification !== 'pending-upload-api') {
    return {
      index,
      action: 'unsupported',
      attachment,
      plannedAttachment: attachment,
      sourceLogicalPath,
      targetLogicalPath: null,
      sourceClassification: 'unsupported',
      issue: {
        code: 'unsupported-source-path',
        message: 'Attachment path is safe but not a supported submit move source.',
      },
    }
  }

  const extension = getFileExtension(sourceLogicalPath)
  if (!/^[a-z0-9]+$/.test(extension)) {
    return createInvalidEntry(index, attachment, {
      code: 'invalid-source-extension',
      message: 'Attachment source extension is not valid for submit move planning.',
    }, sourceLogicalPath)
  }

  const targetUuidResult = createTargetUuid(targetUuidFactory)
  if (!targetUuidResult.ok) {
    return createInvalidEntry(index, attachment, targetUuidResult.issue, sourceLogicalPath)
  }

  const targetLogicalPathResult = buildFormalTargetLogicalPath({
    ownerUserId,
    dokumenId,
    targetUuid: targetUuidResult.value,
    extension,
  })
  if (!targetLogicalPathResult.ok) {
    return createInvalidEntry(index, attachment, targetLogicalPathResult.issue, sourceLogicalPath)
  }

  const plannedAttachment = {
    ...attachment,
    url: targetLogicalPathResult.value,
  }

  return {
    index,
    action: 'planned-move',
    attachment,
    plannedAttachment,
    sourceLogicalPath,
    targetLogicalPath: targetLogicalPathResult.value,
    sourceClassification: classification,
    issue: null,
  }
}

function createInvalidEntry<TAttachment extends SubmitMovePlanAttachment>(
  index: number,
  attachment: TAttachment,
  issue: SubmitMovePlanIssue,
  sourceLogicalPath: string | null = null,
): SubmitMovePlanEntry<TAttachment> {
  return {
    index,
    action: 'invalid',
    attachment,
    plannedAttachment: attachment,
    sourceLogicalPath,
    targetLogicalPath: null,
    sourceClassification: 'invalid',
    issue,
  }
}

function isPlannedMoveEntry<TAttachment extends SubmitMovePlanAttachment>(
  entry: SubmitMovePlanEntry<TAttachment>,
): entry is SubmitMovePlanEntry<TAttachment> & {
  action: 'planned-move'
  sourceLogicalPath: string
  targetLogicalPath: string
} {
  return entry.action === 'planned-move'
    && entry.sourceLogicalPath !== null
    && entry.targetLogicalPath !== null
}

function normalizeSourceLogicalPath(logicalPath: string): ValidationResult<string> {
  try {
    return {
      ok: true,
      value: assertSafeLogicalStoragePath(logicalPath),
    }
  } catch {
    return {
      ok: false,
      issue: {
        code: 'invalid-source-path',
        message: 'Attachment source path is not safe.',
      },
    }
  }
}

function buildFormalTargetLogicalPath({
  ownerUserId,
  dokumenId,
  targetUuid,
  extension,
}: {
  ownerUserId: string
  dokumenId: string
  targetUuid: string
  extension: string
}): ValidationResult<string> {
  try {
    const targetLogicalPath = assertSafeLogicalStoragePath(
      `${ownerUserId}/${dokumenId}/${targetUuid}.${extension}`,
    )

    if (classifyStoragePath(targetLogicalPath) !== 'formal') {
      return {
        ok: false,
        issue: {
          code: 'invalid-target-path',
          message: 'Submit move target path is not formal.',
        },
      }
    }

    return {
      ok: true,
      value: targetLogicalPath,
    }
  } catch {
    return {
      ok: false,
      issue: {
        code: 'invalid-target-path',
        message: 'Submit move target path is not safe.',
      },
    }
  }
}

function createTargetUuid(targetUuidFactory: () => string): ValidationResult<string> {
  let targetUuid: string

  try {
    targetUuid = targetUuidFactory()
  } catch {
    return {
      ok: false,
      issue: {
        code: 'invalid-target-uuid',
        message: 'Submit move target UUID could not be generated.',
      },
    }
  }

  const trimmed = targetUuid.trim()
  if (!UUID_PATTERN.test(trimmed)) {
    return {
      ok: false,
      issue: {
        code: 'invalid-target-uuid',
        message: 'Submit move target UUID is not valid.',
      },
    }
  }

  return {
    ok: true,
    value: trimmed.toLowerCase(),
  }
}

function validateExactSafeSegment(
  segment: string,
  code: 'invalid-document-id' | 'invalid-owner-id',
): ValidationResult<string> {
  const trimmed = segment.trim()

  try {
    const sanitized = sanitizeStoragePathSegment(trimmed)
    if (sanitized !== trimmed) {
      return {
        ok: false,
        issue: {
          code,
          message: 'Submit move path segment is not safe.',
        },
      }
    }

    return {
      ok: true,
      value: sanitized,
    }
  } catch {
    return {
      ok: false,
      issue: {
        code,
        message: 'Submit move path segment is not safe.',
      },
    }
  }
}

type ValidationResult<T> =
  | {
    ok: true
    value: T
  }
  | {
    ok: false
    issue: SubmitMovePlanIssue
  }
