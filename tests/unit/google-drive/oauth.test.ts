import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_OAUTH_REDIRECT_URI,
  type DriveConfig,
} from '#/lib/google-drive/config'
import {
  OAUTH_STATE_MAKS_ENTRI,
  OAUTH_STATE_TTL_MS,
  OAuthFlowError,
  ambilState,
  mulaiHubung,
  parsePastedAddress,
  resetOAuthStoreForTest,
  tukarCode,
  type OAuthClientLike,
} from '#/lib/google-drive/oauth'

const NOW = new Date('2026-10-22T03:00:00.000Z')
const config: DriveConfig = {
  clientId: 'client-uji.apps.googleusercontent.com',
  clientSecret: 'rahasia-uji',
  tokenKey: Buffer.alloc(32, 7),
}
const SESI = 'sesi-admin-1'
const at = (ms: number) => new Date(NOW.getTime() + ms)

const RAHASIA_CODE = '4/0Ab-kode-otorisasi-rahasia'
const RAHASIA_REFRESH = '1//refresh-token-rahasia'
const RAHASIA_ID_TOKEN = 'eyJ.id-token.rahasia'

function fakeClient(overrides: Partial<{
  tokens: Record<string, unknown>
  getTokenError: unknown
  payload: Record<string, unknown> | undefined
  verifyError: unknown
}> = {}) {
  const getToken = vi.fn(async () => {
    if (overrides.getTokenError) throw overrides.getTokenError
    return {
      tokens: overrides.tokens ?? {
        refresh_token: RAHASIA_REFRESH,
        access_token: 'ya29.akses',
        id_token: RAHASIA_ID_TOKEN,
        scope: `openid ${GOOGLE_DRIVE_FILE_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
      },
    }
  })
  const verifyIdToken = vi.fn(async () => {
    if (overrides.verifyError) throw overrides.verifyError
    const payload = 'payload' in overrides ? overrides.payload : { email: 'Admin.Kantor@Gmail.com', email_verified: true }
    return { getPayload: () => payload }
  })
  const client = {
    generateCodeVerifierAsync: vi.fn(async () => ({ codeVerifier: 'v'.repeat(64), codeChallenge: 'tantangan' })),
    generateAuthUrl: vi.fn((_opts: Parameters<OAuthClientLike['generateAuthUrl']>[0]) => 'https://accounts.google.com/o/oauth2/v2/auth?palsu=1'),
    getToken,
    verifyIdToken,
  } satisfies OAuthClientLike
  return client
}

async function expectKode(run: () => unknown, kode: OAuthFlowError['kode']) {
  let caught: unknown
  try {
    await run()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(OAuthFlowError)
  expect((caught as OAuthFlowError).kode).toBe(kode)
  return caught as OAuthFlowError
}

beforeEach(() => {
  resetOAuthStoreForTest()
})

describe('mulaiHubung', () => {
  it('membuat URL login offline + consent, scope K8, PKCE S256, redirect konstanta, dan state', async () => {
    const { authUrl } = await mulaiHubung({ sessionId: SESI, mode: 'HUBUNGKAN', now: NOW, deps: { config } })
    const url = new URL(authUrl)
    const params = url.searchParams

    expect(url.origin).toBe('https://accounts.google.com')
    expect(params.get('access_type')).toBe('offline')
    expect(params.get('prompt')).toBe('consent')
    expect(params.get('response_type')).toBe('code')
    expect(params.get('client_id')).toBe(config.clientId)
    expect(params.get('redirect_uri')).toBe(GOOGLE_OAUTH_REDIRECT_URI)
    expect(params.get('scope')?.split(' ').sort()).toEqual([GOOGLE_DRIVE_FILE_SCOPE, 'email', 'openid'].sort())
    expect(params.get('code_challenge_method')).toBe('S256')
    expect(params.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(params.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(params.has('login_hint')).toBe(false)
    // Rahasia client tidak pernah ikut ke URL.
    expect(authUrl).not.toContain(config.clientSecret)
  })

  it('HUBUNGKAN_ULANG mengisi login_hint dengan email akun', async () => {
    const { authUrl } = await mulaiHubung({
      sessionId: SESI, mode: 'HUBUNGKAN_ULANG', akunId: 'akun-1', loginHint: 'admin@example.test', now: NOW, deps: { config },
    })
    expect(new URL(authUrl).searchParams.get('login_hint')).toBe('admin@example.test')
  })

  it('state yang dibuat bisa diambil sekali oleh sesi yang sama beserta mode, akun, dan code_verifier', async () => {
    const client = fakeClient()
    await mulaiHubung({
      sessionId: SESI, mode: 'HUBUNGKAN_ULANG', akunId: 'akun-1', now: NOW,
      deps: { config, createOAuthClient: () => client },
    })
    const opts = client.generateAuthUrl.mock.calls[0][0]
    expect(opts.code_challenge).toBe('tantangan')

    const entry = ambilState({ state: opts.state, sessionId: SESI, now: at(60_000) })
    expect(entry).toEqual({ mode: 'HUBUNGKAN_ULANG', akunId: 'akun-1', codeVerifier: 'v'.repeat(64) })
    await expectKode(() => ambilState({ state: opts.state, sessionId: SESI, now: at(60_000) }), 'STATE_KEDALUWARSA')
  })
})

describe('store state OAuth', () => {
  async function buatState(sessionId: string, now: Date) {
    const client = fakeClient()
    await mulaiHubung({ sessionId, mode: 'HUBUNGKAN', now, deps: { config, createOAuthClient: () => client } })
    return client.generateAuthUrl.mock.calls[0][0].state
  }

  it('state tidak dikenal atau lewat TTL 10 menit -> STATE_KEDALUWARSA', async () => {
    expect(OAUTH_STATE_TTL_MS).toBe(10 * 60_000)
    await expectKode(() => ambilState({ state: 'tidak-ada', sessionId: SESI, now: NOW }), 'STATE_KEDALUWARSA')

    const state = await buatState(SESI, NOW)
    await expectKode(() => ambilState({ state, sessionId: SESI, now: at(OAUTH_STATE_TTL_MS + 1) }), 'STATE_KEDALUWARSA')
  })

  it('state milik sesi lain -> STATE_SESI_BERBEDA dan tidak menghabiskan state pemiliknya', async () => {
    const state = await buatState(SESI, NOW)
    await expectKode(() => ambilState({ state, sessionId: 'sesi-lain', now: NOW }), 'STATE_SESI_BERBEDA')
    expect(ambilState({ state, sessionId: SESI, now: NOW }).mode).toBe('HUBUNGKAN')
  })

  it('membuang entri tertua saat lebih dari 20 dan entri kedaluwarsa', async () => {
    expect(OAUTH_STATE_MAKS_ENTRI).toBe(20)
    const states: string[] = []
    for (let i = 0; i < OAUTH_STATE_MAKS_ENTRI + 1; i += 1) states.push(await buatState(SESI, at(i)))

    await expectKode(() => ambilState({ state: states[0], sessionId: SESI, now: at(100) }), 'STATE_KEDALUWARSA')
    expect(ambilState({ state: states[1], sessionId: SESI, now: at(100) }).mode).toBe('HUBUNGKAN')
    expect(ambilState({ state: states[OAUTH_STATE_MAKS_ENTRI], sessionId: SESI, now: at(100) }).mode).toBe('HUBUNGKAN')

    // Entri kedaluwarsa dibuang saat state baru dibuat, sehingga tidak menggeser entri yang masih hidup.
    resetOAuthStoreForTest()
    const lama = await buatState(SESI, NOW)
    const segar: string[] = []
    for (let i = 0; i < OAUTH_STATE_MAKS_ENTRI; i += 1) segar.push(await buatState(SESI, at(OAUTH_STATE_TTL_MS + 1 + i)))
    const nanti = at(OAUTH_STATE_TTL_MS + 100)
    await expectKode(() => ambilState({ state: lama, sessionId: SESI, now: nanti }), 'STATE_KEDALUWARSA')
    expect(ambilState({ state: segar[0], sessionId: SESI, now: nanti }).mode).toBe('HUBUNGKAN')
  })
})

describe('parsePastedAddress', () => {
  it('menerima 127.0.0.1 dan localhost (port apa pun) dengan state + code', () => {
    expect(parsePastedAddress('  http://127.0.0.1:53682/?state=s1&code=c1&scope=x  ')).toEqual({
      kind: 'code', state: 's1', code: 'c1',
    })
    expect(parsePastedAddress('http://localhost:9999/?code=c2&state=s2')).toEqual({ kind: 'code', state: 's2', code: 'c2' })
    expect(parsePastedAddress('http://127.0.0.1/?state=s3&code=c3')).toEqual({ kind: 'code', state: 's3', code: 'c3' })
  })

  it('mengenali error=access_denied beserta state', () => {
    expect(parsePastedAddress('http://127.0.0.1:53682/?error=access_denied&state=s1')).toEqual({
      kind: 'error', state: 's1', error: 'access_denied',
    })
  })

  it.each([
    ['host bukan loopback', 'http://evil.com/?state=s&code=c'],
    ['subdomain menyamar', 'http://127.0.0.1.evil.com/?state=s&code=c'],
    ['https', 'https://127.0.0.1:53682/?state=s&code=c'],
    ['javascript:', 'javascript:alert(1)//?state=s&code=c'],
    ['teks acak', 'halo admin'],
    ['kosong', '   '],
    ['tanpa state', 'http://127.0.0.1:53682/?code=c'],
    ['state kosong', 'http://127.0.0.1:53682/?state=&code=c'],
    ['tanpa code maupun error', 'http://127.0.0.1:53682/?state=s'],
    ['kredensial di URL', 'http://user:pw@127.0.0.1:53682/?state=s&code=c'],
    ['terlalu panjang', `http://127.0.0.1:53682/?state=s&code=${'c'.repeat(2100)}`],
  ])('%s -> ALAMAT_TIDAK_VALID', async (_label, text) => {
    const error = await expectKode(() => parsePastedAddress(text), 'ALAMAT_TIDAK_VALID')
    expect(error.message).toBe(
      'Alamat yang ditempel tidak dikenali. Salin seluruh alamat dari tab yang gagal dimuat (diawali http://127.0.0.1).',
    )
  })
})

describe('tukarCode', () => {
  it('menukar code + code_verifier dengan redirect konstanta -> refresh token dan email huruf kecil', async () => {
    const client = fakeClient()
    const createOAuthClient = vi.fn(() => client)
    const result = await tukarCode({ code: RAHASIA_CODE, codeVerifier: 'v'.repeat(64), deps: { config, createOAuthClient } })

    expect(result).toEqual({ refreshToken: RAHASIA_REFRESH, email: 'admin.kantor@gmail.com' })
    expect(createOAuthClient).toHaveBeenCalledWith(config)
    expect(client.getToken).toHaveBeenCalledWith({
      code: RAHASIA_CODE, codeVerifier: 'v'.repeat(64), redirect_uri: GOOGLE_OAUTH_REDIRECT_URI,
    })
    expect(client.verifyIdToken).toHaveBeenCalledWith({ idToken: RAHASIA_ID_TOKEN, audience: config.clientId })
  })

  it('tanpa refresh_token -> TANPA_REFRESH_TOKEN', async () => {
    const client = fakeClient({ tokens: { id_token: RAHASIA_ID_TOKEN, scope: GOOGLE_DRIVE_FILE_SCOPE } })
    const error = await expectKode(
      () => tukarCode({ code: RAHASIA_CODE, codeVerifier: 'v', deps: { config, createOAuthClient: () => client } }),
      'TANPA_REFRESH_TOKEN',
    )
    expect(error.message).toBe('Google tidak mengirim refresh token — ulangi dari langkah 1.')
  })

  it.each([
    ['scope tanpa drive.file (izin Drive tidak dicentang)', 'openid https://www.googleapis.com/auth/userinfo.email'],
    ['scope mirip tetapi bukan drive.file', `${GOOGLE_DRIVE_FILE_SCOPE}.extra openid`],
    ['scope kosong', ''],
    ['scope tidak dikirim', undefined],
  ])('%s -> IZIN_DRIVE_TIDAK_DIBERIKAN', async (_label, scope) => {
    const tokens: Record<string, unknown> = { refresh_token: RAHASIA_REFRESH, id_token: RAHASIA_ID_TOKEN }
    if (scope !== undefined) tokens.scope = scope
    const client = fakeClient({ tokens })
    const error = await expectKode(
      () => tukarCode({ code: RAHASIA_CODE, codeVerifier: 'v', deps: { config, createOAuthClient: () => client } }),
      'IZIN_DRIVE_TIDAK_DIBERIKAN',
    )
    expect(error.message).toBe('Izin akses Google Drive tidak dicentang — ulangi dan centang izin Drive.')
    expect(client.verifyIdToken).not.toHaveBeenCalled()
  })

  it('email_verified false atau email kosong -> EMAIL_TIDAK_TERVERIFIKASI', async () => {
    for (const payload of [{ email: 'a@b.test', email_verified: false }, { email_verified: true }, { email: 'a@b.test' }]) {
      const client = fakeClient({ payload })
      await expectKode(
        () => tukarCode({ code: RAHASIA_CODE, codeVerifier: 'v', deps: { config, createOAuthClient: () => client } }),
        'EMAIL_TIDAK_TERVERIFIKASI',
      )
    }
  })

  it('penukaran ditolak Google, id_token tidak ada, atau verifikasi gagal -> PENUKARAN_GAGAL', async () => {
    const googleError = Object.assign(new Error(`invalid_grant ${RAHASIA_CODE}`), {
      response: { status: 400, data: { error: 'invalid_grant', error_description: `Bad code ${RAHASIA_CODE}` } },
    })
    const cases = [
      fakeClient({ getTokenError: googleError }),
      fakeClient({ tokens: { refresh_token: RAHASIA_REFRESH, scope: GOOGLE_DRIVE_FILE_SCOPE } }),
      fakeClient({ verifyError: new Error(`Wrong recipient ${RAHASIA_ID_TOKEN}`) }),
      fakeClient({ payload: undefined }),
    ]
    for (const client of cases) {
      const error = await expectKode(
        () => tukarCode({ code: RAHASIA_CODE, codeVerifier: 'v', deps: { config, createOAuthClient: () => client } }),
        'PENUKARAN_GAGAL',
      )
      expect(error.cause).toBeUndefined()
    }
  })

  it('pesan galat tidak memuat code, token, secret, atau respons Google', async () => {
    const googleError = Object.assign(new Error(`boom ${RAHASIA_CODE}`), {
      response: { status: 400, data: { error: 'invalid_grant', error_description: RAHASIA_REFRESH } },
    })
    const clients = [
      fakeClient({ getTokenError: googleError }),
      fakeClient({ tokens: { id_token: RAHASIA_ID_TOKEN, scope: GOOGLE_DRIVE_FILE_SCOPE } }),
      fakeClient({ tokens: { refresh_token: RAHASIA_REFRESH, id_token: RAHASIA_ID_TOKEN, scope: 'openid' } }),
      fakeClient({ verifyError: new Error(RAHASIA_ID_TOKEN) }),
    ]
    for (const client of clients) {
      const error = await tukarCode({ code: RAHASIA_CODE, codeVerifier: 'v', deps: { config, createOAuthClient: () => client } })
        .then(() => null, (e: unknown) => e as OAuthFlowError)
      expect(error).toBeInstanceOf(OAuthFlowError)
      const dump = `${error!.message} ${error!.pesan} ${error!.stack ?? ''} ${JSON.stringify(error)}`
      for (const rahasia of [RAHASIA_CODE, RAHASIA_REFRESH, RAHASIA_ID_TOKEN, config.clientSecret, 'invalid_grant']) {
        expect(dump).not.toContain(rahasia)
      }
    }
  })
})

describe('OAuthFlowError', () => {
  it('IZIN_DITOLAK dan STATE_* memakai pesan Indonesia SPEC', () => {
    expect(new OAuthFlowError('IZIN_DITOLAK').message).toBe('Izin ditolak di halaman Google.')
    expect(new OAuthFlowError('STATE_KEDALUWARSA').message).toBe('Sesi menghubungkan sudah kedaluwarsa — ulangi dari langkah 1.')
    expect(new OAuthFlowError('STATE_SESI_BERBEDA').pesan).toMatch(/ulangi dari langkah 1/)
  })
})
