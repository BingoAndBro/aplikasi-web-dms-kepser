// Dipakai server dan klien -- jangan impor modul server di sini.
import type { LaporanTautanAkses, LaporanTautanSumber } from '#/db/schema/app/laporan-tautan'

export type { LaporanTautanAkses, LaporanTautanSumber }

/**
 * Tautan Laporan: "ekspor sebagai link". Klien mengunggah tautan (bukan file)
 * ke aplikasi lain, jadi isi laporan dibagikan sebagai satu tautan permanen
 * yang dibuka setelah login (role apa pun). Daftar dokumennya snapshot saat
 * tautan dibuat; tautan berlaku sampai dicabut pembuatnya.
 */
export const TAUTAN_SUMBER = {
  LAPORAN_SAYA: 'LAPORAN_SAYA',
  LAPORAN_KEGIATAN: 'LAPORAN_KEGIATAN',
  LAPORAN_KINERJA: 'LAPORAN_KINERJA',
} as const satisfies Record<LaporanTautanSumber, LaporanTautanSumber>

export const TAUTAN_SUMBER_LABEL: Record<LaporanTautanSumber, string> = {
  LAPORAN_SAYA: 'Laporan Saya',
  LAPORAN_KEGIATAN: 'Laporan Kegiatan',
  LAPORAN_KINERJA: 'Laporan Kinerja',
}

export const TAUTAN_AKSES = {
  LOGIN: 'LOGIN',
  PUBLIK: 'PUBLIK',
} as const satisfies Record<LaporanTautanAkses, LaporanTautanAkses>

export const TAUTAN_AKSES_LABEL: Record<LaporanTautanAkses, string> = {
  LOGIN: 'Terbatas',
  PUBLIK: 'Publik',
}

/**
 * Isi `code` pada respons 401 tautan LOGIN yang dibuka tanpa sesi, supaya
 * halaman tautan tahu harus mengarahkan ke login (bukan menampilkan galat).
 */
export const TAUTAN_LOGIN_REQUIRED_CODE = 'LOGIN_REQUIRED'

/** Sama dengan batas ekspor ZIP (EXPORT_MAX_DOCUMENTS), supaya "Unduh Semua" di tautan selalu bisa. */
export const TAUTAN_MAX_DOKUMEN = 500
export const TAUTAN_JUDUL_MAX_LENGTH = 200
export const TAUTAN_KETERANGAN_MAX_LENGTH = 500

const TAUTAN_PATH_PREFIX = '/tautan/'
const TAUTAN_LAMPIRAN_PATH_PREFIX = '/lampiran/'
// randomBytes(24).toString('base64url') = 32 karakter; beri ruang bila panjangnya berubah.
const TAUTAN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

export function isTautanToken(value: string): boolean {
  return TAUTAN_TOKEN_PATTERN.test(value)
}

export function buildTautanPath(token: string): string {
  return `${TAUTAN_PATH_PREFIX}${encodeURIComponent(token)}`
}

/**
 * URL absolut untuk disalin. `publicBaseUrl` (env DMS_PUBLIC_BASE_URL) dipakai
 * bila diisi; bila tidak, pakai alamat yang sedang dibuka pembuat di browser
 * (mis. http://10.72.214.55:3000 atau domain ngrok). APP_URL sengaja tidak
 * dipakai: nilainya https://localhost:3000, yang tidak bisa dibuka orang lain.
 */
export function resolveTautanUrl(path: string, publicBaseUrl: string | null, fallbackOrigin: string): string {
  const base = normalizeBaseUrl(publicBaseUrl) ?? normalizeBaseUrl(fallbackOrigin)
  return base ? `${base}${path}` : path
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    // Pertahankan sub-path bila aplikasi dipasang di bawah prefix (mis. /dms).
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
}

/**
 * Tujuan setelah login (`/login?next=`). Sengaja hanya halaman tautan: link
 * yang diklik dari aplikasi lain harus kembali ke tautannya setelah login,
 * sementara halaman lain tetap mendarat di dashboard role. Allowlist ketat ini
 * juga mencegah open redirect (`//evil.com`, `https://...`, dst.).
 */
export function sanitizeLoginNext(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.startsWith(TAUTAN_LAMPIRAN_PATH_PREFIX)) {
    return isTautanLampiranPath(value) ? value : null
  }
  if (!value.startsWith(TAUTAN_PATH_PREFIX)) return null
  const token = value.slice(TAUTAN_PATH_PREFIX.length)
  return isTautanToken(token) ? `${TAUTAN_PATH_PREFIX}${token}` : null
}

export function buildLoginHref(loginPath: string, currentPathname: string): string {
  const next = sanitizeLoginNext(currentPathname)
  return next ? `${loginPath}?next=${encodeURIComponent(next)}` : loginPath
}

export type TautanFilePurpose = 'preview' | 'download'

export function buildTautanDokumenFileUrl(
  token: string,
  dokumenId: string,
  lampiranIndex: number,
  purpose: TautanFilePurpose,
): string {
  return `/api/tautan/${encodeURIComponent(token)}/dokumen/${encodeURIComponent(dokumenId)}/${purpose}/${lampiranIndex}`
}

export function buildTautanManualFileUrl(
  token: string,
  manualArsipId: string,
  attachmentId: string,
  purpose: TautanFilePurpose,
): string {
  return `/api/tautan/${encodeURIComponent(token)}/manual-arsip/${encodeURIComponent(manualArsipId)}/attachments/${encodeURIComponent(attachmentId)}/${purpose}`
}

// ---- Tautan per lampiran ----
//
// /lampiran/<tautanId>/<dokumenId>/<ref>/<sig> membuka SATU berkas langsung
// (tanpa halaman aplikasi). Tidak memuat token batch: `sig` adalah HMAC yang
// berkunci token batch (lihat tautan-lampiran-link.ts), jadi pemegangnya tidak
// bisa menurunkan alamat halaman batch maupun lampiran lain.

const UUID_SEGMENT = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const LAMPIRAN_REF_SEGMENT = `(?:0|[1-9][0-9]{0,5}|${UUID_SEGMENT})`
const LAMPIRAN_SIGNATURE_SEGMENT = '[A-Za-z0-9_-]{22}'

export const TAUTAN_LAMPIRAN_SIGNATURE_LENGTH = 22

const TAUTAN_LAMPIRAN_PATH_PATTERN = new RegExp(
  `^${TAUTAN_LAMPIRAN_PATH_PREFIX}(${UUID_SEGMENT})/(${UUID_SEGMENT})/(${LAMPIRAN_REF_SEGMENT})/(${LAMPIRAN_SIGNATURE_SEGMENT})$`,
)

/** `ref`: indeks lampiran (dokumen alur) atau uuid lampiran (dokumen manual). */
export function isTautanLampiranRef(value: string): boolean {
  return new RegExp(`^${LAMPIRAN_REF_SEGMENT}$`).test(value)
}

export function isTautanLampiranSignature(value: string): boolean {
  return new RegExp(`^${LAMPIRAN_SIGNATURE_SEGMENT}$`).test(value)
}

export function isTautanLampiranPath(value: string): boolean {
  return TAUTAN_LAMPIRAN_PATH_PATTERN.test(value)
}

export function buildTautanLampiranPath({
  tautanId,
  dokumenId,
  ref,
  sig,
}: {
  tautanId: string
  dokumenId: string
  ref: string
  sig: string
}): string {
  return `${TAUTAN_LAMPIRAN_PATH_PREFIX}${encodeURIComponent(tautanId)}/${encodeURIComponent(dokumenId)}/${encodeURIComponent(ref)}/${encodeURIComponent(sig)}`
}

export function buildTautanExportZipEndpoint(token: string): string {
  return `/api/tautan/${encodeURIComponent(token)}/export-zip`
}

// ---- Bentuk respons API (dipakai halaman & dialog) ----

export type TautanCreateResponse = {
  id: string
  akses: LaporanTautanAkses
  path: string
  public_base_url: string | null
  jumlah_dokumen: number
  jumlah_diabaikan: number
}

export type TautanListItem = {
  id: string
  sumber: LaporanTautanSumber
  akses: LaporanTautanAkses
  judul: string
  keterangan: string | null
  path: string
  jumlah_dokumen: number
  jumlah_akses: number
  created_at: string
  last_accessed_at: string | null
  revoked_at: string | null
}

export type TautanListResponse = {
  tautan: TautanListItem[]
  public_base_url: string | null
}

export type TautanLampiranItem = {
  /** Indeks lampiran (dokumen alur) atau id lampiran (dokumen manual). */
  ref: string
  nama: string
  is_pdf: boolean
  /** Path tautan per lampiran (/lampiran/...): membuka berkasnya langsung di halaman baru. */
  link_path: string
}

export type TautanDokumenItem = {
  id: string
  sumber: 'WORKFLOW' | 'MANUAL'
  judul: string
  fungsi_nama: string | null
  kegiatan_nama: string | null
  tanggal: string
  status: string | null
  pengaju_nama: string | null
  /** null bila lampiran masih bisa dibuka; selain itu alasan lampiran tidak tersedia. */
  lampiran_tidak_tersedia: string | null
  lampiran: TautanLampiranItem[]
}

export type TautanDetailResponse = {
  judul: string
  sumber: LaporanTautanSumber
  akses: LaporanTautanAkses
  keterangan: string | null
  dibuat_oleh: string
  created_at: string
  /** Dokumen snapshot yang sudah tidak ada lagi (mis. dihapus permanen pemiliknya). */
  jumlah_tidak_tersedia: number
  dokumen: TautanDokumenItem[]
}
