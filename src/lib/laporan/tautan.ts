// Server-only module. Do not import from client components.
import { randomBytes } from 'node:crypto'

import type { LaporanTautan } from '#/db/schema/app'
import {
  getLocalServerSession,
  hasLocalRole,
  type LocalServerSession,
} from '#/lib/auth/local-server-auth'
import { ARCHIVE_STATUS } from '#/lib/constants/archive-status'
import { ROLES } from '#/lib/constants/roles'
import { DocumentZipTooManyEntriesError, streamDocumentZip } from '#/lib/export/document-zip'
import {
  buildLaporanExportZipFilename,
  buildLaporanZipEntries,
  buildManualArsipZipEntries,
} from '#/lib/export/laporan-zip-entries'
import { buildFormalFilename } from '#/lib/file-helpers'
import { loadDestroyedArchiveIds } from '#/lib/laporan/manual-realisasi'
import { ROUTES } from '#/lib/constants/routes'
import {
  buildTautanLampiranLinkPath,
  renderTautanErrorPage,
  verifyTautanLampiranSignature,
} from '#/lib/laporan/tautan-lampiran-link'
import * as repository from '#/lib/laporan/tautan-repository'
import {
  TAUTAN_LOGIN_REQUIRED_CODE,
  TAUTAN_MAX_DOKUMEN,
  TAUTAN_SUMBER_LABEL,
  buildLoginHref,
  buildTautanPath,
  isTautanLampiranRef,
  isTautanLampiranSignature,
  isTautanToken,
  type TautanDetailResponse,
  type TautanDokumenItem,
  type TautanFilePurpose,
  type TautanListItem,
} from '#/lib/laporan/tautan-shared'
import { createManualArsipAttachmentFileResponse, isUuid } from '#/lib/manual-arsip'
import type { CreateTautanRequest } from '#/lib/schemas/tautan'
import { resolveDocumentLampiranLogicalPathForExport } from '#/lib/storage/document-file-access'
import { createLogicalPathFileResponse } from '#/lib/storage/internal-file-access'

/**
 * Tautan Laporan ("ekspor sebagai link").
 *
 * Model otorisasi:
 * - Saat DIBUAT, daftar dokumen dari klien disaring terhadap hak PEMBUAT dengan
 *   aturan yang sama seperti ekspor ZIP halaman asalnya (id di luar cakupan
 *   dibuang diam-diam, seperti ekspor). Hasilnya disimpan sebagai snapshot.
 * - Saat DIBUKA, tautan memberi akses ke isi snapshot atas nama pembuatnya.
 *   Ada dua jenis akses, dipilih pembuat saat membuat tautan:
 *     LOGIN  - pembuka wajib login (role apa pun). Bawaan.
 *     PUBLIK - siapa pun yang memegang tautan boleh membuka tanpa akun. Satu-
 *              satunya penghalang adalah token acak 192-bit di URL, jadi tautan
 *              ini diperlakukan seperti kata sandi: bagikan hanya ke yang berhak.
 *   Yang diperiksa ulang hanya tautan masih aktif, dokumen termasuk snapshot,
 *   dan file belum dimusnahkan/dibersihkan (pemeriksaan file yang sama dengan
 *   ekspor ZIP).
 * - Tautan berlaku sampai dicabut pembuatnya.
 */

const PUBLIC_BASE_URL_ENV = 'DMS_PUBLIC_BASE_URL'
const TAUTAN_TOKEN_BYTES = 24

export const TAUTAN_NOT_FOUND_MESSAGE = 'Tautan tidak ditemukan. Periksa kembali alamat tautan.'
export const TAUTAN_REVOKED_MESSAGE = 'Tautan ini sudah dicabut oleh pembuatnya.'

type Failure = { ok: false; status: number; error: string }

export function generateTautanToken(): string {
  return randomBytes(TAUTAN_TOKEN_BYTES).toString('base64url')
}

/** Basis URL publik opsional; null bila kosong/tidak valid (klien memakai alamat browser). */
export function getTautanPublicBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env[PUBLIC_BASE_URL_ENV]?.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
}

const NON_NEGATIVE_INTEGER_PATTERN = /^(0|[1-9]\d*)$/

export function parseTautanLampiranIndex(value: string | undefined): number | null {
  if (!value || !NON_NEGATIVE_INTEGER_PATTERN.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export { isUuid }

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

function keepInOrder(ids: readonly string[], allowed: readonly string[]): string[] {
  const allowedSet = new Set(allowed)
  return ids.filter(id => allowedSet.has(id))
}

// ---- Membuat tautan ----

export async function createTautanForSession(
  session: LocalServerSession,
  input: CreateTautanRequest,
): Promise<{ ok: true; tautan: LaporanTautan; jumlahDiabaikan: number } | Failure> {
  const requestedDokumenIds = unique(input.dokumen_ids)
  const requestedManualIds = unique(input.manual_arsip_ids)
  const requestedCount = requestedDokumenIds.length + requestedManualIds.length

  if (requestedCount > TAUTAN_MAX_DOKUMEN) {
    return {
      ok: false,
      status: 413,
      error: `Filter menghasilkan ${requestedCount} dokumen. Maksimal ${TAUTAN_MAX_DOKUMEN} per tautan — persempit periode atau kegiatan.`,
    }
  }

  const scoped = await scopeSnapshotToCreator(session, input.sumber, requestedDokumenIds, requestedManualIds)
  if (!scoped.ok) return scoped

  const dokumenIds = keepInOrder(requestedDokumenIds, scoped.dokumenIds)
  const manualArsipIds = keepInOrder(requestedManualIds, scoped.manualArsipIds)
  const keptCount = dokumenIds.length + manualArsipIds.length

  if (keptCount === 0) {
    return { ok: false, status: 400, error: 'Tidak ada dokumen yang bisa dibagikan dari filter ini.' }
  }

  const tautan = await repository.insertTautan({
    token: generateTautanToken(),
    sumber: input.sumber,
    akses: input.akses,
    judul: input.judul,
    keterangan: input.keterangan,
    dokumenIds,
    manualArsipIds,
    createdBy: session.user.id,
  })

  return { ok: true, tautan, jumlahDiabaikan: requestedCount - keptCount }
}

/** Aturan cakupan per halaman asal, sama dengan ekspor ZIP halaman tersebut. */
async function scopeSnapshotToCreator(
  session: LocalServerSession,
  sumber: CreateTautanRequest['sumber'],
  dokumenIds: readonly string[],
  manualArsipIds: readonly string[],
): Promise<{ ok: true; dokumenIds: string[]; manualArsipIds: string[] } | Failure> {
  if (sumber === 'LAPORAN_SAYA') {
    return {
      ok: true,
      dokumenIds: await repository.selectSayaDokumenIds(session.user.id, dokumenIds),
      manualArsipIds: [],
    }
  }

  if (sumber === 'LAPORAN_KEGIATAN') {
    const kegiatanIds = await repository.selectKetuaTimKegiatanIds(session.user.id)
    return {
      ok: true,
      dokumenIds: await repository.selectKegiatanDokumenIds(kegiatanIds, dokumenIds),
      manualArsipIds: await repository.selectManualArsipIdsByKegiatan(kegiatanIds, manualArsipIds),
    }
  }

  if (!hasLocalRole(session, ROLES.PENANGGUNG_JAWAB_KINERJA)) {
    return { ok: false, status: 403, error: 'Hanya Penanggung Jawab Kinerja yang dapat membagikan Laporan Kinerja.' }
  }

  return {
    ok: true,
    dokumenIds: await repository.selectKinerjaDokumenIds(dokumenIds),
    manualArsipIds: await repository.selectExistingManualArsipIds(manualArsipIds),
  }
}

export function toTautanListItem(tautan: LaporanTautan): TautanListItem {
  return {
    id: tautan.id,
    sumber: tautan.sumber,
    akses: tautan.akses,
    judul: tautan.judul,
    keterangan: tautan.keterangan,
    path: buildTautanPath(tautan.token),
    jumlah_dokumen: tautan.dokumenIds.length + tautan.manualArsipIds.length,
    jumlah_akses: tautan.jumlahAkses,
    created_at: tautan.createdAt.toISOString(),
    last_accessed_at: tautan.lastAccessedAt ? tautan.lastAccessedAt.toISOString() : null,
    revoked_at: tautan.revokedAt ? tautan.revokedAt.toISOString() : null,
  }
}

// ---- Membuka tautan ----

export async function resolveActiveTautan(
  token: string,
): Promise<{ ok: true; tautan: repository.TautanWithCreator } | Failure> {
  if (!isTautanToken(token)) {
    return { ok: false, status: 404, error: TAUTAN_NOT_FOUND_MESSAGE }
  }

  const tautan = await repository.findTautanByToken(token)
  if (!tautan) {
    return { ok: false, status: 404, error: TAUTAN_NOT_FOUND_MESSAGE }
  }

  if (tautan.revokedAt) {
    return { ok: false, status: 410, error: TAUTAN_REVOKED_MESSAGE }
  }

  return { ok: true, tautan }
}

/**
 * Pintu semua endpoint pembuka tautan. Tautan dicari dulu karena jenis aksesnya
 * menentukan apakah sesi diperlukan:
 * - tidak ada / dicabut -> 404 / 410 (untuk siapa pun; token 192-bit tidak bisa
 *   ditebak, jadi ini tidak membuka apa-apa yang belum dipegang pemanggil)
 * - akses PUBLIK        -> lolos tanpa sesi (session bernilai null)
 * - akses LOGIN         -> 401 + code LOGIN_REQUIRED bila belum login
 */
export async function requireTautanViewer(
  request: Request,
  token: string | undefined,
): Promise<{ session: LocalServerSession | null; tautan: repository.TautanWithCreator } | Response> {
  const noStore = { 'Cache-Control': 'no-store' }

  const resolved = await resolveActiveTautan(token ?? '')
  if (!resolved.ok) {
    return Response.json({ error: resolved.error }, { status: resolved.status, headers: noStore })
  }

  const session = await getLocalServerSession(request)
  if (!session && resolved.tautan.akses !== 'PUBLIK') {
    return Response.json(
      { error: 'Unauthorized', code: TAUTAN_LOGIN_REQUIRED_CODE },
      { status: 401, headers: noStore },
    )
  }

  return { session, tautan: resolved.tautan }
}

function creatorName(tautan: repository.TautanWithCreator): string {
  return tautan.creatorDisplayName ?? tautan.creatorNamaLengkap ?? tautan.creatorUsername ?? 'Tidak diketahui'
}

function isPdfPath(value: string): boolean {
  return value.toLowerCase().split('?')[0].endsWith('.pdf')
}

export async function buildTautanDetail(tautan: repository.TautanWithCreator): Promise<TautanDetailResponse> {
  const [dokumenRows, manualRows, destroyed] = await Promise.all([
    repository.loadTautanDokumenRows(tautan.dokumenIds),
    repository.loadTautanManualRows(tautan.manualArsipIds),
    loadDestroyedArchiveIds(),
  ])
  const attachments = await repository.loadTautanManualAttachments(manualRows.map(row => row.id))
  const destroyedDokumenIds = new Set(destroyed.dokumenIds)

  const workflowItems: TautanDokumenItem[] = dokumenRows.map(row => ({
    id: row.id,
    sumber: 'WORKFLOW',
    judul: row.judul,
    fungsi_nama: row.fungsi_nama ?? null,
    kegiatan_nama: row.kegiatan_nama ?? null,
    tanggal: row.tanggal,
    status: row.status,
    pengaju_nama: row.pengaju_nama,
    lampiran_tidak_tersedia: destroyedDokumenIds.has(row.id)
      ? 'Berkas dokumen ini sudah dimusnahkan'
      : row.lampiran_dibersihkan_at
        ? 'Lampiran dokumen ini sudah dibersihkan'
        : null,
    lampiran: row.lampiran_urls.map((lampiran, index) => ({
      ref: String(index),
      nama: lampiran.nama || `Lampiran ${index + 1}`,
      is_pdf: isPdfPath(lampiran.url),
      link_path: buildTautanLampiranLinkPath(tautan, row.id, String(index)),
    })),
  }))

  const manualItems: TautanDokumenItem[] = manualRows.map(row => ({
    id: row.id,
    sumber: 'MANUAL',
    judul: row.nama,
    fungsi_nama: row.fungsi_nama,
    kegiatan_nama: row.kegiatan_nama,
    tanggal: row.tanggal,
    status: null,
    pengaju_nama: row.pengaju_nama,
    lampiran_tidak_tersedia: row.status_arsip === ARCHIVE_STATUS.DIMUSNAHKAN
      ? 'Berkas dokumen ini sudah dimusnahkan'
      : null,
    lampiran: attachments
      .filter(attachment => attachment.manual_arsip_id === row.id)
      .map(attachment => ({
        ref: attachment.id,
        nama: attachment.judul_lampiran,
        is_pdf: attachment.content_type.trim().toLowerCase() === 'application/pdf',
        link_path: buildTautanLampiranLinkPath(tautan, row.id, attachment.id),
      })),
  }))

  const dokumen = [...workflowItems, ...manualItems].sort((a, b) => (
    b.tanggal.localeCompare(a.tanggal) || a.judul.localeCompare(b.judul, 'id-ID')
  ))

  return {
    judul: tautan.judul,
    sumber: tautan.sumber,
    akses: tautan.akses,
    keterangan: tautan.keterangan,
    dibuat_oleh: creatorName(tautan),
    created_at: tautan.createdAt.toISOString(),
    jumlah_tidak_tersedia: tautan.dokumenIds.length + tautan.manualArsipIds.length - dokumen.length,
    dokumen,
  }
}

// ---- File di dalam tautan ----

export async function createTautanDokumenFileResponse({
  tautan,
  dokumenId,
  lampiranIndex,
  purpose,
}: {
  tautan: LaporanTautan
  dokumenId: string
  lampiranIndex: number
  purpose: TautanFilePurpose
}): Promise<Response> {
  if (!tautan.dokumenIds.includes(dokumenId)) {
    return Response.json({ error: 'Dokumen tidak termasuk dalam tautan ini' }, { status: 404 })
  }

  // Cek file-level yang sama dengan ekspor ZIP: berkas dimusnahkan / lampiran
  // dibersihkan -> 410, indeks di luar daftar -> 404.
  const reference = await resolveDocumentLampiranLogicalPathForExport({ documentId: dokumenId, lampiranIndex })
  if (!reference.ok) {
    return Response.json({ error: reference.message }, { status: reference.status })
  }

  const [row] = await repository.loadTautanDokumenRows([dokumenId])
  const lampiran = row?.lampiran_urls[lampiranIndex]

  return createLogicalPathFileResponse({
    logicalPath: reference.logicalPath,
    purpose,
    downloadFilename: row && lampiran ? buildFormalFilename(row, lampiran) : undefined,
  })
}

export async function createTautanManualFileResponse({
  tautan,
  manualArsipId,
  attachmentId,
  purpose,
}: {
  tautan: LaporanTautan
  manualArsipId: string
  attachmentId: string
  purpose: TautanFilePurpose
}): Promise<Response> {
  if (!tautan.manualArsipIds.includes(manualArsipId)) {
    return Response.json({ error: 'Dokumen tidak termasuk dalam tautan ini' }, { status: 404 })
  }

  // 410 bila berkas penaungnya DIMUSNAHKAN; lampiran diperiksa milik manualArsipId.
  return createManualArsipAttachmentFileResponse({ manualArsipId, attachmentId, purpose })
}

/** Handler bersama GET /api/tautan/$token/dokumen/$dokumenId/(preview|download)/$lampiranIndex. */
export async function handleTautanDokumenFileRequest({
  request,
  params,
  purpose,
}: {
  request: Request
  params: Record<string, string>
  purpose: TautanFilePurpose
}): Promise<Response> {
  try {
    const viewer = await requireTautanViewer(request, params.token)
    if (viewer instanceof Response) return viewer

    const lampiranIndex = parseTautanLampiranIndex(params.lampiranIndex)
    if (!isUuid(params.dokumenId ?? '') || lampiranIndex === null) {
      return Response.json({ error: 'Lampiran tidak ditemukan' }, { status: 404 })
    }

    return await createTautanDokumenFileResponse({
      tautan: viewer.tautan,
      dokumenId: params.dokumenId,
      lampiranIndex,
      purpose,
    })
  } catch {
    console.error(`[tautan/$token/dokumen] ${purpose} error`)
    return Response.json({ error: 'Gagal mengakses file lampiran' }, { status: 500 })
  }
}

/** Handler bersama GET /api/tautan/$token/manual-arsip/$manualArsipId/attachments/$attachmentId/(preview|download). */
export async function handleTautanManualFileRequest({
  request,
  params,
  purpose,
}: {
  request: Request
  params: Record<string, string>
  purpose: TautanFilePurpose
}): Promise<Response> {
  try {
    const viewer = await requireTautanViewer(request, params.token)
    if (viewer instanceof Response) return viewer

    if (!isUuid(params.manualArsipId ?? '') || !isUuid(params.attachmentId ?? '')) {
      return Response.json({ error: 'Lampiran dokumen manual tidak ditemukan' }, { status: 404 })
    }

    return await createTautanManualFileResponse({
      tautan: viewer.tautan,
      manualArsipId: params.manualArsipId,
      attachmentId: params.attachmentId,
      purpose,
    })
  } catch {
    console.error(`[tautan/$token/manual-arsip] ${purpose} error`)
    return Response.json({ error: 'Gagal mengakses file lampiran' }, { status: 500 })
  }
}

/**
 * GET /lampiran/$tautanId/$dokumenId/$ref/$sig -- membuka SATU lampiran langsung
 * (inline, tanpa halaman aplikasi), untuk ditempel ke aplikasi lain.
 *
 * Urutan: bentuk param -> batch ada -> tanda tangan sah -> belum dicabut ->
 * (akses LOGIN: wajib sesi, bila tidak diarahkan ke login lalu kembali) ->
 * dokumen termasuk snapshot -> berkas masih ada. Semua galat berupa halaman
 * HTML kecil karena dibuka langsung di tab browser.
 */
export async function handleTautanLampiranRequest({
  request,
  params,
}: {
  request: Request
  params: Record<string, string>
}): Promise<Response> {
  const notFound = () => renderTautanErrorPage(404, TAUTAN_NOT_FOUND_MESSAGE)

  try {
    const { tautanId, dokumenId, ref, sig } = params
    if (
      !isUuid(tautanId ?? '')
      || !isUuid(dokumenId ?? '')
      || !isTautanLampiranRef(ref ?? '')
      || !isTautanLampiranSignature(sig ?? '')
    ) {
      return notFound()
    }

    const tautan = await repository.findTautanById(tautanId)
    // Tanda tangan salah dijawab sama dengan "tidak ada": tidak membocorkan id yang valid.
    if (!tautan || !verifyTautanLampiranSignature({
      tautanId: tautan.id,
      tautanToken: tautan.token,
      dokumenId,
      ref,
      sig,
    })) {
      return notFound()
    }

    if (tautan.revokedAt) {
      return renderTautanErrorPage(410, TAUTAN_REVOKED_MESSAGE)
    }

    if (tautan.akses !== 'PUBLIK') {
      const session = await getLocalServerSession(request)
      if (!session) {
        // Login dulu, lalu kembali langsung ke berkas (full navigation, lihat login.tsx).
        return new Response(null, {
          status: 303,
          headers: {
            Location: buildLoginHref(ROUTES.LOGIN, new URL(request.url).pathname),
            'Cache-Control': 'no-store',
          },
        })
      }
    }

    let response: Response
    if (tautan.dokumenIds.includes(dokumenId)) {
      const lampiranIndex = parseTautanLampiranIndex(ref)
      if (lampiranIndex === null) return notFound()

      response = await createTautanDokumenFileResponse({
        tautan,
        dokumenId,
        lampiranIndex,
        purpose: 'preview',
      })
    } else if (tautan.manualArsipIds.includes(dokumenId)) {
      if (!isUuid(ref)) return notFound()

      response = await createTautanManualFileResponse({
        tautan,
        manualArsipId: dokumenId,
        attachmentId: ref,
        purpose: 'preview',
      })
    } else {
      return notFound()
    }

    if (!response.ok) {
      return renderTautanErrorPage(response.status, await readErrorMessage(response))
    }

    try {
      await repository.recordTautanAccess(tautan.id)
    } catch {
      // Penghitung akses hanya informasi; jangan gagalkan pembukaan berkas.
      console.error('[lampiran] gagal mencatat akses')
    }

    return response
  } catch {
    console.error('[lampiran] open error')
    return renderTautanErrorPage(500, 'Gagal membuka berkas lampiran. Coba lagi beberapa saat lagi.')
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.clone().json()
    if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
      return payload.error
    }
  } catch {
    // Bukan JSON: pakai pesan bawaan di bawah.
  }

  return response.status === 404
    ? TAUTAN_NOT_FOUND_MESSAGE
    : 'Berkas lampiran ini tidak dapat dibuka.'
}

// Pengunjung tanpa akun bisa memicu ZIP hingga 500 dokumen; tahan per tautan
// supaya satu tautan publik tidak bisa dipakai membebani server berulang kali.
const ANONYMOUS_ZIP_COOLDOWN_MS = 10_000
const anonymousZipLastAt = new Map<string, number>()

function takeAnonymousZipSlot(tautanId: string, now: number = Date.now()): number {
  for (const [id, at] of anonymousZipLastAt) {
    if (now - at >= ANONYMOUS_ZIP_COOLDOWN_MS) anonymousZipLastAt.delete(id)
  }

  const last = anonymousZipLastAt.get(tautanId)
  if (last !== undefined && now - last < ANONYMOUS_ZIP_COOLDOWN_MS) {
    return Math.ceil((ANONYMOUS_ZIP_COOLDOWN_MS - (now - last)) / 1000)
  }

  anonymousZipLastAt.set(tautanId, now)
  return 0
}

/** Hanya untuk tes. */
export function resetAnonymousZipThrottleForTest() {
  anonymousZipLastAt.clear()
}

export async function createTautanZipResponse(
  session: LocalServerSession | null,
  tautan: repository.TautanWithCreator,
): Promise<Response> {
  if (!session) {
    const retryAfter = takeAnonymousZipSlot(tautan.id)
    if (retryAfter > 0) {
      return Response.json(
        { error: `Unduhan ZIP sedang disiapkan. Coba lagi dalam ${retryAfter} detik.` },
        { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } },
      )
    }
  }

  try {
    const [dokumenRows, manualRows] = await Promise.all([
      repository.loadTautanDokumenRows(tautan.dokumenIds),
      repository.loadTautanManualRows(tautan.manualArsipIds),
    ])
    const entries = [
      ...await buildLaporanZipEntries(dokumenRows),
      ...await buildManualArsipZipEntries(manualRows),
    ]

    return await streamDocumentZip(entries, {
      requesterLabel: session ? (session.user.displayName ?? session.user.username) : 'Pengunjung tautan publik',
      requesterRole: session ? session.activeRole : 'PUBLIK',
      sourceDescription: `Tautan ${TAUTAN_SUMBER_LABEL[tautan.sumber]} "${tautan.judul}" (dibagikan oleh ${creatorName(tautan)})`,
      filename: buildLaporanExportZipFilename('Tautan', tautan.judul),
    })
  } catch (error) {
    if (error instanceof DocumentZipTooManyEntriesError) {
      return Response.json({ error: error.message }, { status: 413 })
    }

    console.error('[tautan.export-zip] zip stream error')
    return Response.json({ error: 'Gagal membuat ekspor ZIP' }, { status: 500 })
  }
}
