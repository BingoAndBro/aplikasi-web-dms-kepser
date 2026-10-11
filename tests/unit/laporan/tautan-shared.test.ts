import { describe, expect, it } from 'vitest'

import {
  buildLoginHref,
  buildTautanLampiranPath,
  buildTautanDokumenFileUrl,
  buildTautanExportZipEndpoint,
  buildTautanManualFileUrl,
  buildTautanPath,
  isTautanLampiranPath,
  isTautanToken,
  resolveTautanUrl,
  sanitizeLoginNext,
} from '#/lib/laporan/tautan-shared'

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345' // 32 karakter base64url, seperti randomBytes(24)

describe('tautan token & path', () => {
  it('accepts base64url tokens and rejects anything else', () => {
    expect(isTautanToken(TOKEN)).toBe(true)
    expect(isTautanToken('a-b_c'.repeat(4))).toBe(true)
    expect(isTautanToken('short')).toBe(false)
    expect(isTautanToken(`${TOKEN}/../x`)).toBe(false)
    expect(isTautanToken(`${TOKEN}?x=1`)).toBe(false)
    expect(isTautanToken('x'.repeat(129))).toBe(false)
  })

  it('builds the page path and API URLs', () => {
    expect(buildTautanPath(TOKEN)).toBe(`/tautan/${TOKEN}`)
    expect(buildTautanExportZipEndpoint(TOKEN)).toBe(`/api/tautan/${TOKEN}/export-zip`)
    expect(buildTautanDokumenFileUrl(TOKEN, 'doc-1', 2, 'preview'))
      .toBe(`/api/tautan/${TOKEN}/dokumen/doc-1/preview/2`)
    expect(buildTautanManualFileUrl(TOKEN, 'man-1', 'att-1', 'download'))
      .toBe(`/api/tautan/${TOKEN}/manual-arsip/man-1/attachments/att-1/download`)
  })
})

describe('resolveTautanUrl', () => {
  const path = `/tautan/${TOKEN}`

  it('prefers the configured public base URL', () => {
    expect(resolveTautanUrl(path, 'http://10.72.214.55:3000/', 'https://localhost:3000'))
      .toBe(`http://10.72.214.55:3000${path}`)
  })

  it('keeps a sub-path prefix of the public base URL', () => {
    expect(resolveTautanUrl(path, 'https://satker.example.go.id/dms/', 'https://localhost:3000'))
      .toBe(`https://satker.example.go.id/dms${path}`)
  })

  it('falls back to the browser origin when no (valid) public base URL is set', () => {
    expect(resolveTautanUrl(path, null, 'http://10.72.214.55:3000')).toBe(`http://10.72.214.55:3000${path}`)
    expect(resolveTautanUrl(path, 'not a url', 'http://10.72.214.55:3000')).toBe(`http://10.72.214.55:3000${path}`)
    expect(resolveTautanUrl(path, 'javascript:alert(1)', 'https://abc.ngrok.app')).toBe(`https://abc.ngrok.app${path}`)
  })

  it('returns the relative path when nothing usable is available', () => {
    expect(resolveTautanUrl(path, null, '')).toBe(path)
  })
})

describe('login ?next= (tautan only, no open redirect)', () => {
  it('allows only a tautan page path', () => {
    expect(sanitizeLoginNext(`/tautan/${TOKEN}`)).toBe(`/tautan/${TOKEN}`)
  })

  it.each([
    null,
    undefined,
    '',
    '/pegawai',
    '/pegawai/laporan/saya',
    '//evil.com',
    'https://evil.com/tautan/' + TOKEN,
    '/tautan/',
    `/tautan/${TOKEN}/../../admin`,
    `/tautan/${TOKEN}?x=//evil.com`,
    '/tautan//evil.com',
  ])('rejects %s', (value) => {
    expect(sanitizeLoginNext(value)).toBeNull()
  })

  it('carries next only when leaving a tautan page', () => {
    expect(buildLoginHref('/login', `/tautan/${TOKEN}`)).toBe(`/login?next=${encodeURIComponent(`/tautan/${TOKEN}`)}`)
    expect(buildLoginHref('/login', '/pegawai/laporan/saya')).toBe('/login')
    expect(buildLoginHref('/login', '/')).toBe('/login')
  })
})

describe('tautan per lampiran path', () => {
  const TAUTAN_ID = '99999999-9999-4999-8999-999999999999'
  const DOKUMEN_ID = '33333333-3333-4333-8333-333333333333'
  const ATTACHMENT_ID = '88888888-8888-4888-8888-888888888888'
  const SIG = 'AbCdEfGhIjKlMnOpQrStUv' // 22 karakter base64url

  it('builds /lampiran/<tautanId>/<dokumenId>/<ref>/<sig>', () => {
    expect(buildTautanLampiranPath({ tautanId: TAUTAN_ID, dokumenId: DOKUMEN_ID, ref: '2', sig: SIG }))
      .toBe(`/lampiran/${TAUTAN_ID}/${DOKUMEN_ID}/2/${SIG}`)
  })

  it('recognises index and uuid refs and nothing else', () => {
    expect(isTautanLampiranPath(`/lampiran/${TAUTAN_ID}/${DOKUMEN_ID}/0/${SIG}`)).toBe(true)
    expect(isTautanLampiranPath(`/lampiran/${TAUTAN_ID}/${DOKUMEN_ID}/${ATTACHMENT_ID}/${SIG}`)).toBe(true)
    expect(isTautanLampiranPath(`/lampiran/${TAUTAN_ID}/${DOKUMEN_ID}/01/${SIG}`)).toBe(false)
    expect(isTautanLampiranPath(`/lampiran/${TAUTAN_ID}/${DOKUMEN_ID}/-1/${SIG}`)).toBe(false)
    expect(isTautanLampiranPath(`/lampiran/${TAUTAN_ID}/${DOKUMEN_ID}/0/short`)).toBe(false)
    expect(isTautanLampiranPath(`/lampiran/${TAUTAN_ID}/${DOKUMEN_ID}/0/${SIG}/extra`)).toBe(false)
    expect(isTautanLampiranPath(`/lampiran/not-a-uuid/${DOKUMEN_ID}/0/${SIG}`)).toBe(false)
  })

  it('lets login return to a lampiran link but still blocks open redirects', () => {
    const path = `/lampiran/${TAUTAN_ID}/${DOKUMEN_ID}/0/${SIG}`

    expect(sanitizeLoginNext(path)).toBe(path)
    expect(buildLoginHref('/login', path)).toBe(`/login?next=${encodeURIComponent(path)}`)
    expect(sanitizeLoginNext(`${path}?x=//evil.com`)).toBeNull()
    expect(sanitizeLoginNext(`${path}/../../admin`)).toBeNull()
    expect(sanitizeLoginNext('/lampiran/')).toBeNull()
    expect(sanitizeLoginNext('//lampiran/x')).toBeNull()
  })
})
