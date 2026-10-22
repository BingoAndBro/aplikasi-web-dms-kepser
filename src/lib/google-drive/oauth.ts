// Server-only module. Do not import from client components.
//
// Alur OAuth "Desktop app" salin-tempel (K6, SPEC 7.1): server membuat state +
// PKCE, ADMIN login di Google, lalu menempel alamat loopback dari tab yang
// gagal dimuat. State disimpan di memori proses (satu proses server, lihat
// claude-spec.md asumsi 1), terikat ke ID sesi ADMIN, TTL 10 menit, sekali
// pakai. Semua galat keluar sebagai OAuthFlowError dengan pesan Indonesia;
// code, token, client secret, dan respons Google tidak pernah ikut ke pesan,
// cause, atau log.
import { randomBytes } from 'node:crypto'
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library'

import {
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_OAUTH_REDIRECT_URI,
  GOOGLE_OAUTH_SCOPES,
  type DriveConfig,
} from '#/lib/google-drive/config'
import type { MulaiHubungMode } from '#/lib/google-drive/shared'

export const OAUTH_STATE_TTL_MS = 10 * 60_000
export const OAUTH_STATE_MAKS_ENTRI = 20
const ALAMAT_MAKS_PANJANG = 2048
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost'])

export type OAuthFlowErrorKode =
  | 'ALAMAT_TIDAK_VALID'
  | 'STATE_KEDALUWARSA'
  | 'STATE_SESI_BERBEDA'
  | 'IZIN_DITOLAK'
  | 'TANPA_REFRESH_TOKEN'
  | 'IZIN_DRIVE_TIDAK_DIBERIKAN'
  | 'EMAIL_TIDAK_TERVERIFIKASI'
  | 'PENUKARAN_GAGAL'

const PESAN: Record<OAuthFlowErrorKode, string> = {
  ALAMAT_TIDAK_VALID:
    'Alamat yang ditempel tidak dikenali. Salin seluruh alamat dari tab yang gagal dimuat (diawali http://127.0.0.1).',
  STATE_KEDALUWARSA: 'Sesi menghubungkan sudah kedaluwarsa — ulangi dari langkah 1.',
  STATE_SESI_BERBEDA: 'Alamat ini dibuat dari sesi login lain — ulangi dari langkah 1.',
  IZIN_DITOLAK: 'Izin ditolak di halaman Google.',
  TANPA_REFRESH_TOKEN: 'Google tidak mengirim refresh token — ulangi dari langkah 1.',
  IZIN_DRIVE_TIDAK_DIBERIKAN: 'Izin akses Google Drive tidak dicentang — ulangi dan centang izin Drive.',
  EMAIL_TIDAK_TERVERIFIKASI: 'Email akun Google belum terverifikasi — gunakan akun lain.',
  PENUKARAN_GAGAL: 'Google tidak dapat memverifikasi login — ulangi dari langkah 1.',
}

export class OAuthFlowError extends Error {
  readonly kode: OAuthFlowErrorKode
  readonly pesan: string

  constructor(kode: OAuthFlowErrorKode) {
    super(PESAN[kode])
    this.name = 'OAuthFlowError'
    this.kode = kode
    this.pesan = PESAN[kode]
  }
}

/** Bagian OAuth2Client yang dipakai alur ini (diinjeksi agar tes tanpa jaringan). */
export type OAuthClientLike = {
  generateCodeVerifierAsync(): Promise<{ codeVerifier: string; codeChallenge?: string }>
  generateAuthUrl(opts: {
    access_type: 'offline'
    prompt: 'consent'
    scope: string[]
    state: string
    code_challenge: string
    code_challenge_method: CodeChallengeMethod
    redirect_uri: string
    login_hint?: string
  }): string
  getToken(opts: { code: string; codeVerifier: string; redirect_uri: string }): Promise<{
    tokens: { refresh_token?: string | null; id_token?: string | null; scope?: string }
  }>
  verifyIdToken(opts: { idToken: string; audience: string }): Promise<{
    getPayload(): { email?: string; email_verified?: boolean } | undefined
  }>
}

export type OAuthDeps = {
  config: DriveConfig
  createOAuthClient?: (config: DriveConfig) => OAuthClientLike
}

function defaultOAuthClient(config: DriveConfig): OAuthClientLike {
  return new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: GOOGLE_OAUTH_REDIRECT_URI,
  }) as unknown as OAuthClientLike
}

type StateEntry = {
  sessionId: string
  mode: MulaiHubungMode
  akunId: string | null
  codeVerifier: string
  expiresAt: number
}

export type OAuthStateTerambil = Pick<StateEntry, 'mode' | 'akunId' | 'codeVerifier'>

// Map menjaga urutan sisip, jadi entri pertama selalu yang tertua.
const stateStore = new Map<string, StateEntry>()

export function resetOAuthStoreForTest(): void {
  stateStore.clear()
}

function simpanState(state: string, entry: StateEntry, now: Date): void {
  for (const [key, value] of stateStore) {
    if (value.expiresAt <= now.getTime()) stateStore.delete(key)
  }
  while (stateStore.size >= OAUTH_STATE_MAKS_ENTRI) {
    const oldest = stateStore.keys().next().value
    if (oldest === undefined) break
    stateStore.delete(oldest)
  }
  stateStore.set(state, entry)
}

export async function mulaiHubung({
  sessionId,
  mode,
  akunId = null,
  loginHint,
  now,
  deps,
}: {
  sessionId: string
  mode: MulaiHubungMode
  akunId?: string | null
  loginHint?: string
  now: Date
  deps: OAuthDeps
}): Promise<{ authUrl: string }> {
  const client = (deps.createOAuthClient ?? defaultOAuthClient)(deps.config)
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync()
  if (!codeChallenge) throw new Error('PKCE code challenge tidak terbentuk')

  const state = randomBytes(32).toString('base64url')
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [...GOOGLE_OAUTH_SCOPES],
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    redirect_uri: GOOGLE_OAUTH_REDIRECT_URI,
    ...(loginHint ? { login_hint: loginHint } : {}),
  })

  simpanState(state, { sessionId, mode, akunId, codeVerifier, expiresAt: now.getTime() + OAUTH_STATE_TTL_MS }, now)
  return { authUrl }
}

export type PastedAddress =
  | { kind: 'code'; state: string; code: string }
  | { kind: 'error'; state: string; error: string }

/**
 * Alamat tempelan harus `http://127.0.0.1` atau `http://localhost` (port apa
 * pun) dengan `state` dan salah satu `code`/`error`. Pertukaran code tetap
 * memakai redirect konstanta, bukan port dari alamat ini.
 */
export function parsePastedAddress(text: string): PastedAddress {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > ALAMAT_MAKS_PANJANG) throw new OAuthFlowError('ALAMAT_TIDAK_VALID')

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new OAuthFlowError('ALAMAT_TIDAK_VALID')
  }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname) || url.username || url.password) {
    throw new OAuthFlowError('ALAMAT_TIDAK_VALID')
  }

  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const code = url.searchParams.get('code')
  if (!state) throw new OAuthFlowError('ALAMAT_TIDAK_VALID')
  if (error) return { kind: 'error', state, error }
  if (code) return { kind: 'code', state, code }
  throw new OAuthFlowError('ALAMAT_TIDAK_VALID')
}

/**
 * Ambil (dan habiskan) state. State milik sesi lain tidak dihabiskan, supaya
 * percobaan dari sesi lain tidak menggagalkan alur ADMIN pemiliknya.
 */
export function ambilState({ state, sessionId, now }: { state: string; sessionId: string; now: Date }): OAuthStateTerambil {
  const entry = stateStore.get(state)
  if (!entry || entry.expiresAt <= now.getTime()) {
    stateStore.delete(state)
    throw new OAuthFlowError('STATE_KEDALUWARSA')
  }
  if (entry.sessionId !== sessionId) throw new OAuthFlowError('STATE_SESI_BERBEDA')

  stateStore.delete(state)
  return { mode: entry.mode, akunId: entry.akunId, codeVerifier: entry.codeVerifier }
}

/**
 * Tukar code + code_verifier. `tokens.scope` berisi scope yang benar-benar
 * diberikan (dokumentasi Google untuk aplikasi terpasang); pada consent
 * granular pengguna bisa tidak mencentang Drive, jadi `drive.file` wajib ada.
 * `scope` yang tidak dikirim diperlakukan sebagai izin tidak diberikan.
 */
export async function tukarCode({
  code,
  codeVerifier,
  deps,
}: {
  code: string
  codeVerifier: string
  deps: OAuthDeps
}): Promise<{ refreshToken: string; email: string }> {
  const client = (deps.createOAuthClient ?? defaultOAuthClient)(deps.config)

  let tokens: Awaited<ReturnType<OAuthClientLike['getToken']>>['tokens']
  try {
    ;({ tokens } = await client.getToken({ code, codeVerifier, redirect_uri: GOOGLE_OAUTH_REDIRECT_URI }))
  } catch {
    // Galat asli bisa memuat code atau respons Google: tidak diteruskan.
    throw new OAuthFlowError('PENUKARAN_GAGAL')
  }

  const refreshToken = tokens.refresh_token
  if (!refreshToken) throw new OAuthFlowError('TANPA_REFRESH_TOKEN')

  const granted = (tokens.scope ?? '').split(/\s+/).filter(Boolean)
  if (!granted.includes(GOOGLE_DRIVE_FILE_SCOPE)) throw new OAuthFlowError('IZIN_DRIVE_TIDAK_DIBERIKAN')

  const idToken = tokens.id_token
  if (!idToken) throw new OAuthFlowError('PENUKARAN_GAGAL')

  let payload: ReturnType<Awaited<ReturnType<OAuthClientLike['verifyIdToken']>>['getPayload']>
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: deps.config.clientId })
    payload = ticket.getPayload()
  } catch {
    throw new OAuthFlowError('PENUKARAN_GAGAL')
  }
  if (!payload) throw new OAuthFlowError('PENUKARAN_GAGAL')

  const email = payload.email?.trim().toLowerCase()
  if (!email || payload.email_verified !== true) throw new OAuthFlowError('EMAIL_TIDAK_TERVERIFIKASI')

  return { refreshToken, email }
}
