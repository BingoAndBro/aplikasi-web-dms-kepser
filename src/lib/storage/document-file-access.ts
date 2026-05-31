// Server-only module. Do not import from client components.
import { and, eq } from 'drizzle-orm'

import { db } from '#/db/client'
import { berkasArsip, berkasArsipItem } from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  getLocalServerSession,
  type LocalServerSession,
} from '#/lib/auth/local-server-auth'
import {
  ARCHIVE_SOURCE_TYPE,
  BERKAS_ARCHIVE_STATUS,
  BERKAS_STATUS,
} from '#/lib/constants/archive-status'
import { ROLES } from '#/lib/constants/roles'
import { assertSafeLogicalStoragePath } from '#/lib/storage/local-storage-paths'
import { createInternalFileAccessUrl } from '#/lib/storage/internal-file-access-url'
import type { FileAccessTokenPayload } from '#/lib/storage/file-access-token'

type DocumentAccessRouteMode = 'central' | 'ppk' | 'bendahara'
type DocumentAccessPurpose = 'preview' | 'download'
type DocumentAccessSession = Pick<LocalServerSession, 'userId' | 'roles' | 'sessionId'>

type DocumentRow = {
  id: string
  createdBy: string
  status: string
  revisionTarget: string | null
  lampiranUrls: unknown
}

type LampiranFileReference = {
  url: string
}

type DocumentAccessContext = {
  document: DocumentRow
  isInDestroyedBerkas: boolean
}

type FileReferenceResult =
  | { ok: true; logicalPath: string }
  | { ok: false; status: number; message: string }

const PREVIEW_TOKEN_EXPIRES_IN_SECONDS = 900
const DOWNLOAD_TOKEN_EXPIRES_IN_SECONDS = 3600
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const NON_NEGATIVE_INTEGER_PATTERN = /^(0|[1-9]\d*)$/

export async function createDocumentLampiranAccessUrlResponse({
  request,
  params,
  mode,
  purpose,
  secret,
}: {
  request: Request
  params: Record<string, string>
  mode: DocumentAccessRouteMode
  purpose: DocumentAccessPurpose
  secret: string
}): Promise<Response> {
  const session = await getLocalServerSession(request)

  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const documentId = params.id
  if (!isUuid(documentId)) {
    return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
  }

  const lampiranIndex = parseLampiranIndex(params.lampiranIndex)
  if (lampiranIndex === null) {
    return Response.json({ error: 'Lampiran tidak ditemukan' }, { status: 404 })
  }

  let context: DocumentAccessContext | null
  try {
    context = await loadDocumentAccessContext(documentId)
  } catch {
    return Response.json({ error: routeFailureMessage(purpose) }, { status: 500 })
  }

  if (!context) {
    return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
  }

  if (!canRouteAccessDocument(mode, session, context.document)) {
    return Response.json({ error: routeForbiddenMessage(mode) }, { status: 403 })
  }

  const fileReference = resolveDocumentLampiranReference(context, lampiranIndex)
  if (!fileReference.ok) {
    return Response.json({ error: fileReference.message }, { status: fileReference.status })
  }

  try {
    const issuedAt = Date.now()
    const expiresInSeconds = purpose === 'download'
      ? DOWNLOAD_TOKEN_EXPIRES_IN_SECONDS
      : PREVIEW_TOKEN_EXPIRES_IN_SECONDS
    const signedUrl = createInternalFileAccessUrl({
      secret,
      payload: {
        version: 1,
        purpose,
        documentId,
        lampiranIndex,
        subjectUserId: session.userId,
        sessionId: session.sessionId,
        contentDisposition: purpose === 'download' ? 'attachment' : 'inline',
        statusCheck: 'document',
        issuedAt,
        expiresAt: issuedAt + expiresInSeconds * 1000,
      },
    })

    return Response.json({ signedUrl })
  } catch {
    return Response.json({ error: routeFailureMessage(purpose) }, { status: 500 })
  }
}

export async function resolveDocumentLampiranAccessForToken({
  payload,
  session,
}: {
  payload: FileAccessTokenPayload
  session: DocumentAccessSession
}): Promise<FileReferenceResult> {
  if (!payload.documentId || payload.lampiranIndex === undefined) {
    return { ok: false, status: 501, message: 'Token type is not supported by this access route foundation yet' }
  }

  if (payload.subjectUserId && payload.subjectUserId !== session.userId) {
    return { ok: false, status: 403, message: 'Akses ditolak' }
  }

  if (payload.sessionId && payload.sessionId !== session.sessionId) {
    return { ok: false, status: 403, message: 'Akses ditolak' }
  }

  if (!isUuid(payload.documentId)) {
    return { ok: false, status: 404, message: 'Dokumen tidak ditemukan' }
  }

  let context: DocumentAccessContext | null
  try {
    context = await loadDocumentAccessContext(payload.documentId)
  } catch {
    return { ok: false, status: 500, message: 'File access failed' }
  }

  if (!context) {
    return { ok: false, status: 404, message: 'Dokumen tidak ditemukan' }
  }

  if (!canSessionReadDocument(session, context.document)) {
    return { ok: false, status: 403, message: 'Akses ditolak' }
  }

  return resolveDocumentLampiranReference(context, payload.lampiranIndex)
}

async function loadDocumentAccessContext(documentId: string): Promise<DocumentAccessContext | null> {
  const documentRows = await db
    .select({
      id: dokumenTransaksi.id,
      createdBy: dokumenTransaksi.createdBy,
      status: dokumenTransaksi.status,
      revisionTarget: dokumenTransaksi.revisionTarget,
      lampiranUrls: dokumenTransaksi.lampiranUrls,
    })
    .from(dokumenTransaksi)
    .where(eq(dokumenTransaksi.id, documentId))
    .limit(1)

  const document = documentRows[0]
  if (!document) return null

  const destroyedBerkasRows = await db
    .select({
      id: berkasArsip.id,
    })
    .from(berkasArsipItem)
    .innerJoin(berkasArsip, eq(berkasArsipItem.berkasId, berkasArsip.id))
    .where(and(
      eq(berkasArsipItem.sourceType, ARCHIVE_SOURCE_TYPE.WORKFLOW),
      eq(berkasArsipItem.dokumenId, documentId),
      eq(berkasArsip.statusBerkas, BERKAS_STATUS.CLOSED),
      eq(berkasArsip.statusArsip, BERKAS_ARCHIVE_STATUS.DIMUSNAHKAN),
    ))
    .limit(1)

  return {
    document,
    isInDestroyedBerkas: destroyedBerkasRows.length > 0,
  }
}

function resolveDocumentLampiranReference(
  context: DocumentAccessContext,
  lampiranIndex: number,
): FileReferenceResult {
  if (context.isInDestroyedBerkas) {
    return {
      ok: false,
      status: 410,
      message: 'Data file sudah dimusnahkan',
    }
  }

  const lampiranSource = parseLampiranFileReferences(context.document.lampiranUrls)

  if (lampiranIndex < 0 || lampiranIndex >= lampiranSource.length) {
    return { ok: false, status: 404, message: 'Lampiran tidak ditemukan' }
  }

  const lampiran = lampiranSource[lampiranIndex]
  if (!lampiran?.url) {
    return { ok: false, status: 404, message: 'Lampiran tidak ditemukan' }
  }

  try {
    return { ok: true, logicalPath: assertSafeLogicalStoragePath(lampiran.url) }
  } catch {
    return { ok: false, status: 404, message: 'File tidak ditemukan' }
  }
}

function parseLampiranFileReferences(value: unknown): LampiranFileReference[] {
  let candidate = value

  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate)
    } catch {
      return []
    }
  }

  if (!Array.isArray(candidate)) return []

  return candidate
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || !('url' in entry)) return null
      const url = (entry as { url: unknown }).url
      return typeof url === 'string' && url.trim() ? { url } : null
    })
    .filter((entry): entry is LampiranFileReference => entry !== null)
}

function canRouteAccessDocument(
  mode: DocumentAccessRouteMode,
  session: DocumentAccessSession,
  document: DocumentRow,
): boolean {
  if (mode === 'ppk') {
    return session.roles.includes(ROLES.PPK) && canPpkReadDocument(document)
  }

  if (mode === 'bendahara') {
    return session.roles.includes(ROLES.BENDAHARA) && canBendaharaReadDocument(document)
  }

  return canSessionReadDocument(session, document)
}

function canSessionReadDocument(
  session: DocumentAccessSession,
  document: DocumentRow,
): boolean {
  if (!isAdminOnlySession(session) && document.createdBy === session.userId) return true
  if (session.roles.includes(ROLES.PPK)) return canPpkReadDocument(document)
  if (session.roles.includes(ROLES.BENDAHARA)) return canBendaharaReadDocument(document)
  if (session.roles.includes(ROLES.KEPALA_SUB_BAGIAN_UMUM)) {
    return document.status === 'COMPLETED' || document.status === 'ARCHIVED'
  }

  return false
}

function isAdminOnlySession(session: DocumentAccessSession): boolean {
  return session.roles.length > 0 && session.roles.every(role => role === ROLES.ADMIN)
}

function canPpkReadDocument(document: DocumentRow): boolean {
  return [
    'IN_PPK_VALIDATION',
    'IN_BENDAHARA_APPROVAL',
    'NEED_REVISION',
    'COMPLETED',
    'ARCHIVED',
  ].includes(document.status)
}

function canBendaharaReadDocument(document: DocumentRow): boolean {
  return document.status === 'IN_BENDAHARA_APPROVAL'
    || document.status === 'COMPLETED'
    || document.status === 'ARCHIVED'
    || (document.status === 'NEED_REVISION' && document.revisionTarget === 'PPK')
}

function parseLampiranIndex(value: string | undefined): number | null {
  if (!value || !NON_NEGATIVE_INTEGER_PATTERN.test(value)) return null

  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function isUuid(value: string | undefined): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function routeForbiddenMessage(mode: DocumentAccessRouteMode): string {
  return mode === 'central' ? 'Anda tidak memiliki akses' : 'Akses ditolak'
}

function routeFailureMessage(purpose: DocumentAccessPurpose): string {
  return purpose === 'download'
    ? 'Gagal membuat link download'
    : 'Gagal membuat link pratinjau'
}
