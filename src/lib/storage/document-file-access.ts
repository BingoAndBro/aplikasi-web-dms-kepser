// Server-only module. Do not import from client components.
import { and, eq } from 'drizzle-orm'

import { db } from '#/db/client'
import { berkasArsip, berkasArsipItem } from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { ketuaTimAssignments } from '#/db/schema/master'
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
  kegiatanJenisId: string
  lampiranUrls: unknown
  lampiranDibersihkanAt: Date | string | null
}

type LampiranFileReference = {
  url: string
}

export type DocumentAccessContext = {
  document: DocumentRow
  isInDestroyedBerkas: boolean
  /**
   * Lampiran fisik sudah dibersihkan -- baik lewat pembersihan non-material
   * oleh ketua tim, maupun (via `isInDestroyedBerkas`) pemusnahan berkas oleh
   * kasubag. Kolom ini murni untuk tampilan/pesan; `isInDestroyedBerkas` di
   * atas tetap otoritas pemblokiran akses arsip material dan TIDAK berubah.
   */
  isLampiranCleaned: boolean
}

export type FileReferenceResult =
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

  if (!(await canRouteAccessDocument(mode, session, context.document))) {
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

  if (!(await canSessionReadDocument(session, context.document))) {
    return { ok: false, status: 403, message: 'Akses ditolak' }
  }

  return resolveDocumentLampiranReference(context, payload.lampiranIndex)
}

/**
 * Non-HTTP resolver for server-side ZIP export (RP-07/RP-05): returns a
 * document attachment's logical path without issuing a signed token. Callers
 * (export endpoints) are responsible for their own ownership/kegiatan
 * re-authorization before invoking this — it only re-checks berkas/DIMUSNAHKAN
 * status and path safety, mirroring the token path's file-level checks.
 */
export async function resolveDocumentLampiranLogicalPathForExport({
  documentId,
  lampiranIndex,
}: {
  documentId: string
  lampiranIndex: number
}): Promise<FileReferenceResult> {
  if (!isUuid(documentId)) {
    return { ok: false, status: 404, message: 'Dokumen tidak ditemukan' }
  }

  let context: DocumentAccessContext | null
  try {
    context = await loadDocumentAccessContext(documentId)
  } catch {
    return { ok: false, status: 500, message: 'Gagal memuat referensi file' }
  }

  if (!context) {
    return { ok: false, status: 404, message: 'Dokumen tidak ditemukan' }
  }

  return resolveDocumentLampiranReference(context, lampiranIndex)
}

/**
 * Exported for RP-05 export endpoints to memoize per documentId across a
 * document's multiple lampiran indexes within one request (avoids the N
 * queries-per-attachment cost of calling resolveDocumentLampiranLogicalPathForExport
 * once per index) — see RP-07 Step 2/Step 8.
 */
export async function loadDocumentAccessContextForExport(documentId: string): Promise<DocumentAccessContext | null> {
  return loadDocumentAccessContext(documentId)
}

export function resolveDocumentLampiranReferenceFromContext(
  context: DocumentAccessContext,
  lampiranIndex: number,
): FileReferenceResult {
  return resolveDocumentLampiranReference(context, lampiranIndex)
}

async function loadDocumentAccessContext(documentId: string): Promise<DocumentAccessContext | null> {
  const documentRows = await db
    .select({
      id: dokumenTransaksi.id,
      createdBy: dokumenTransaksi.createdBy,
      status: dokumenTransaksi.status,
      revisionTarget: dokumenTransaksi.revisionTarget,
      kegiatanJenisId: dokumenTransaksi.kegiatanJenisId,
      lampiranUrls: dokumenTransaksi.lampiranUrls,
      lampiranDibersihkanAt: dokumenTransaksi.lampiranDibersihkanAt,
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
    isLampiranCleaned: document.lampiranDibersihkanAt !== null,
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

  if (context.isLampiranCleaned) {
    return {
      ok: false,
      status: 410,
      message: 'Data file sudah dibersihkan',
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

async function canRouteAccessDocument(
  mode: DocumentAccessRouteMode,
  session: DocumentAccessSession,
  document: DocumentRow,
): Promise<boolean> {
  // Route peran eksplisit (/api/ppk/..., /api/bendahara/...) tetap murni
  // role-gated -- tidak ada jalur ketua tim di sini.
  if (mode === 'ppk') {
    return session.roles.includes(ROLES.PPK) && canPpkReadDocument(document)
  }

  if (mode === 'bendahara') {
    return session.roles.includes(ROLES.BENDAHARA) && canBendaharaReadDocument(document)
  }

  return canSessionReadDocument(session, document)
}

async function canSessionReadDocument(
  session: DocumentAccessSession,
  document: DocumentRow,
): Promise<boolean> {
  if (isAdminOnlySession(session)) return false
  if (document.createdBy === session.userId) return true

  // Cabang peran MEMBERI izin, bukan menolak: satu user bisa memegang
  // beberapa peran, jadi yang tidak cocok harus jatuh ke cek berikutnya.
  if (session.roles.includes(ROLES.PPK) && canPpkReadDocument(document)) return true
  if (session.roles.includes(ROLES.BENDAHARA) && canBendaharaReadDocument(document)) return true
  if (session.roles.includes(ROLES.KEPALA_SUB_BAGIAN_UMUM) && document.status === 'COMPLETED') {
    return true
  }

  // Ketua tim boleh membuka lampiran dokumen di kegiatan yang ia pimpin --
  // konsisten dengan "Ekspor Semua File (ZIP)" di Laporan Kegiatan yang
  // sudah memberi mereka seluruh file kegiatan itu.
  const assignment = await db
    .select({ id: ketuaTimAssignments.id })
    .from(ketuaTimAssignments)
    .where(and(
      eq(ketuaTimAssignments.userId, session.userId),
      eq(ketuaTimAssignments.kegiatanId, document.kegiatanJenisId),
    ))
    .limit(1)

  return assignment.length > 0
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
  ].includes(document.status)
}

function canBendaharaReadDocument(document: DocumentRow): boolean {
  return document.status === 'IN_BENDAHARA_APPROVAL'
    || document.status === 'COMPLETED'
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
