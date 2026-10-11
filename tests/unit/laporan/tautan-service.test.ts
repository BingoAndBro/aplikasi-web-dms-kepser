import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LocalServerSession } from '#/lib/auth/local-server-auth'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const DOC_A = '33333333-3333-4333-8333-333333333333'
const DOC_B = '44444444-4444-4444-8444-444444444444'
const DOC_OUTSIDE = '66666666-6666-4666-8666-666666666666'
const MANUAL_A = '77777777-7777-4777-8777-777777777777'
const ATTACHMENT_A = '88888888-8888-4888-8888-888888888888'
const KEGIATAN_ID = '55555555-5555-4555-8555-555555555555'
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'

const mocks = vi.hoisted(() => ({
  repository: {
    selectSayaDokumenIds: vi.fn(),
    selectKetuaTimKegiatanIds: vi.fn(),
    selectKegiatanDokumenIds: vi.fn(),
    selectManualArsipIdsByKegiatan: vi.fn(),
    selectKinerjaDokumenIds: vi.fn(),
    selectExistingManualArsipIds: vi.fn(),
    insertTautan: vi.fn(),
    findTautanByToken: vi.fn(),
    findTautanById: vi.fn(),
    recordTautanAccess: vi.fn(),
    loadTautanDokumenRows: vi.fn(),
    loadTautanManualRows: vi.fn(),
    loadTautanManualAttachments: vi.fn(),
  },
  getLocalServerSession: vi.fn(),
  loadDestroyedArchiveIds: vi.fn(),
  resolveDocumentLampiranLogicalPathForExport: vi.fn(),
  createLogicalPathFileResponse: vi.fn(),
  createManualArsipAttachmentFileResponse: vi.fn(),
}))

vi.mock('#/lib/laporan/tautan-repository', () => mocks.repository)

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: LocalServerSession, role: string) => session.roles.includes(role as never),
}))

vi.mock('#/lib/laporan/manual-realisasi', () => ({
  loadDestroyedArchiveIds: mocks.loadDestroyedArchiveIds,
}))

vi.mock('#/lib/storage/document-file-access', () => ({
  resolveDocumentLampiranLogicalPathForExport: mocks.resolveDocumentLampiranLogicalPathForExport,
}))

vi.mock('#/lib/storage/internal-file-access', () => ({
  createLogicalPathFileResponse: mocks.createLogicalPathFileResponse,
}))

vi.mock('#/lib/manual-arsip', () => ({
  createManualArsipAttachmentFileResponse: mocks.createManualArsipAttachmentFileResponse,
  isUuid: (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
}))

vi.mock('#/lib/export/laporan-zip-entries', () => ({
  buildLaporanExportZipFilename: (prefix: string) => `${prefix}.zip`,
  buildLaporanZipEntries: vi.fn(async () => []),
  buildManualArsipZipEntries: vi.fn(async () => []),
}))

vi.mock('#/lib/export/document-zip', () => ({
  DocumentZipTooManyEntriesError: class extends Error {},
  streamDocumentZip: vi.fn(async () => new Response('zip')),
}))

import {
  buildTautanDetail,
  createTautanDokumenFileResponse,
  createTautanForSession,
  createTautanManualFileResponse,
  createTautanZipResponse,
  generateTautanToken,
  getTautanPublicBaseUrl,
  handleTautanDokumenFileRequest,
  handleTautanLampiranRequest,
  requireTautanViewer,
  resetAnonymousZipThrottleForTest,
  resolveActiveTautan,
  toTautanListItem,
} from '#/lib/laporan/tautan'
import { buildTautanLampiranLinkPath } from '#/lib/laporan/tautan-lampiran-link'
import type { CreateTautanRequest } from '#/lib/schemas/tautan'

function session(roles: string[] = ['PEGAWAI']): LocalServerSession {
  return {
    user: { id: USER_ID, username: 'budi', displayName: 'Budi Santoso' },
    userId: USER_ID,
    roles: roles as LocalServerSession['roles'],
    activeRole: roles[0] as LocalServerSession['activeRole'],
    sessionId: 'session-1',
  }
}

function request(overrides: Partial<CreateTautanRequest> = {}): CreateTautanRequest {
  return {
    sumber: 'LAPORAN_SAYA',
    akses: 'LOGIN',
    judul: 'Laporan Saya - Oktober 2026',
    keterangan: 'Periode: Oktober 2026',
    dokumen_ids: [DOC_A],
    manual_arsip_ids: [],
    ...overrides,
  }
}

function tautanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    token: TOKEN,
    sumber: 'LAPORAN_KEGIATAN' as const,
    akses: 'LOGIN' as 'LOGIN' | 'PUBLIK',
    judul: 'Laporan Kegiatan X',
    keterangan: null,
    dokumenIds: [DOC_A],
    manualArsipIds: [MANUAL_A],
    createdBy: USER_ID,
    createdAt: new Date('2026-10-11T02:00:00.000Z'),
    revokedAt: null,
    revokedBy: null,
    lastAccessedAt: null,
    jumlahAkses: 0,
    creatorDisplayName: 'Budi Santoso',
    creatorNamaLengkap: null,
    creatorUsername: 'budi',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetAnonymousZipThrottleForTest()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mocks.repository.insertTautan.mockImplementation(async (values: Record<string, unknown>) => tautanRow({
    ...values,
    createdAt: new Date('2026-10-11T02:00:00.000Z'),
  }))
})

describe('createTautanForSession — snapshot is scoped to the creator', () => {
  it('Laporan Saya: keeps only the creator\'s own final documents, in the requested order', async () => {
    mocks.repository.selectSayaDokumenIds.mockResolvedValue([DOC_B, DOC_A])

    const result = await createTautanForSession(session(), request({ dokumen_ids: [DOC_A, DOC_OUTSIDE, DOC_B, DOC_A] }))

    expect(mocks.repository.selectSayaDokumenIds).toHaveBeenCalledWith(USER_ID, [DOC_A, DOC_OUTSIDE, DOC_B])
    expect(result.ok).toBe(true)
    expect(mocks.repository.insertTautan).toHaveBeenCalledWith(expect.objectContaining({
      sumber: 'LAPORAN_SAYA',
      dokumenIds: [DOC_A, DOC_B],
      manualArsipIds: [],
      createdBy: USER_ID,
    }))
    if (result.ok) expect(result.jumlahDiabaikan).toBe(1)
  })

  it('Laporan Kegiatan: scopes workflow and manual documents to the kegiatan the creator leads', async () => {
    mocks.repository.selectKetuaTimKegiatanIds.mockResolvedValue([KEGIATAN_ID])
    mocks.repository.selectKegiatanDokumenIds.mockResolvedValue([DOC_A])
    mocks.repository.selectManualArsipIdsByKegiatan.mockResolvedValue([MANUAL_A])

    const result = await createTautanForSession(session(), request({
      sumber: 'LAPORAN_KEGIATAN',
      dokumen_ids: [DOC_A, DOC_OUTSIDE],
      manual_arsip_ids: [MANUAL_A],
    }))

    expect(mocks.repository.selectKegiatanDokumenIds).toHaveBeenCalledWith([KEGIATAN_ID], [DOC_A, DOC_OUTSIDE])
    expect(mocks.repository.selectManualArsipIdsByKegiatan).toHaveBeenCalledWith([KEGIATAN_ID], [MANUAL_A])
    expect(result.ok).toBe(true)
    expect(mocks.repository.insertTautan).toHaveBeenCalledWith(expect.objectContaining({
      dokumenIds: [DOC_A],
      manualArsipIds: [MANUAL_A],
    }))
  })

  it('Laporan Kinerja: requires the PJ Kinerja role', async () => {
    const result = await createTautanForSession(session(['PEGAWAI', 'PPK']), request({ sumber: 'LAPORAN_KINERJA' }))

    expect(result).toMatchObject({ ok: false, status: 403 })
    expect(mocks.repository.selectKinerjaDokumenIds).not.toHaveBeenCalled()
    expect(mocks.repository.insertTautan).not.toHaveBeenCalled()
  })

  it('Laporan Kinerja: PJ Kinerja shares satker-wide final documents', async () => {
    mocks.repository.selectKinerjaDokumenIds.mockResolvedValue([DOC_A])
    mocks.repository.selectExistingManualArsipIds.mockResolvedValue([MANUAL_A])

    const result = await createTautanForSession(session(['PENANGGUNG_JAWAB_KINERJA']), request({
      sumber: 'LAPORAN_KINERJA',
      dokumen_ids: [DOC_A],
      manual_arsip_ids: [MANUAL_A],
    }))

    expect(result.ok).toBe(true)
  })

  it('rejects a snapshot with nothing left after scoping', async () => {
    mocks.repository.selectSayaDokumenIds.mockResolvedValue([])

    const result = await createTautanForSession(session(), request({ dokumen_ids: [DOC_OUTSIDE] }))

    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(mocks.repository.insertTautan).not.toHaveBeenCalled()
  })

  it('rejects more than 500 documents before touching the database', async () => {
    const ids = Array.from({ length: 501 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)

    const result = await createTautanForSession(session(), request({ dokumen_ids: ids }))

    expect(result).toMatchObject({ ok: false, status: 413 })
    if (!result.ok) expect(result.error).toContain('501')
    expect(mocks.repository.selectSayaDokumenIds).not.toHaveBeenCalled()
  })

  it('generates an unguessable base64url token for each link', () => {
    const first = generateTautanToken()
    const second = generateTautanToken()
    expect(first).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(first).not.toBe(second)
  })
})

describe('opening a tautan', () => {
  it('returns 404 for malformed or unknown tokens and 410 for revoked ones', async () => {
    await expect(resolveActiveTautan('../../etc')).resolves.toMatchObject({ ok: false, status: 404 })
    expect(mocks.repository.findTautanByToken).not.toHaveBeenCalled()

    mocks.repository.findTautanByToken.mockResolvedValueOnce(null)
    await expect(resolveActiveTautan(TOKEN)).resolves.toMatchObject({ ok: false, status: 404 })

    mocks.repository.findTautanByToken.mockResolvedValueOnce(tautanRow({ revokedAt: new Date() }))
    await expect(resolveActiveTautan(TOKEN)).resolves.toMatchObject({ ok: false, status: 410 })
  })

  it('asks a logged-out visitor of a LOGIN tautan to log in, with a machine-readable code', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)
    mocks.repository.findTautanByToken.mockResolvedValue(tautanRow({ akses: 'LOGIN' }))

    const response = await requireTautanViewer(new Request('http://localhost/api/tautan/x'), TOKEN)

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(401)
    await expect((response as Response).json()).resolves.toMatchObject({ code: 'LOGIN_REQUIRED' })
  })

  it('lets a logged-out visitor open a PUBLIK tautan (session is null)', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)
    mocks.repository.findTautanByToken.mockResolvedValue(tautanRow({ akses: 'PUBLIK' }))

    const viewer = await requireTautanViewer(new Request('http://localhost/api/tautan/x'), TOKEN)

    expect(viewer).not.toBeInstanceOf(Response)
    expect(viewer).toMatchObject({ session: null })
  })

  it('still answers 404 / 410 for PUBLIK tautan that are unknown or revoked, without a session', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    mocks.repository.findTautanByToken.mockResolvedValueOnce(null)
    const unknown = await requireTautanViewer(new Request('http://localhost/api/tautan/x'), TOKEN)
    expect((unknown as Response).status).toBe(404)

    mocks.repository.findTautanByToken.mockResolvedValueOnce(tautanRow({ akses: 'PUBLIK', revokedAt: new Date() }))
    const revoked = await requireTautanViewer(new Request('http://localhost/api/tautan/x'), TOKEN)
    expect((revoked as Response).status).toBe(410)
  })

  it('lets any logged-in role open an active LOGIN tautan', async () => {
    mocks.getLocalServerSession.mockResolvedValue(session(['ADMIN']))
    mocks.repository.findTautanByToken.mockResolvedValue(tautanRow())

    const viewer = await requireTautanViewer(new Request('http://localhost/api/tautan/x'), TOKEN)

    expect(viewer).not.toBeInstanceOf(Response)
  })

  it('builds the detail with unavailable-file flags for destroyed / cleaned documents', async () => {
    mocks.repository.loadTautanDokumenRows.mockResolvedValue([
      {
        id: DOC_A,
        judul: 'Dokumen A',
        fungsi_nama: 'Fungsi 1',
        kegiatan_nama: 'Kegiatan X',
        tanggal: '2026-10-01',
        status: 'COMPLETED',
        pengaju_nama: 'Budi',
        lampiran_dibersihkan_at: null,
        lampiran_urls: [
          { kelengkapan_id: 'k1', nama: 'Kuitansi', url: 'u/a/1.pdf', uploaded_at: '' },
          { kelengkapan_id: 'k2', nama: '', url: 'u/a/2.png', uploaded_at: '' },
        ],
      },
      {
        id: DOC_B,
        judul: 'Dokumen B',
        fungsi_nama: undefined,
        kegiatan_nama: undefined,
        tanggal: '2026-09-01',
        status: 'TERSIMPAN',
        pengaju_nama: null,
        lampiran_dibersihkan_at: '2026-09-30T00:00:00.000Z',
        lampiran_urls: [],
      },
    ])
    mocks.repository.loadTautanManualRows.mockResolvedValue([{
      id: MANUAL_A,
      nama: 'Dokumen Manual',
      tanggal: '2026-10-05',
      fungsi_nama: null,
      kegiatan_nama: 'Kegiatan X',
      komponen_nama: null,
      status_arsip: 'DIMUSNAHKAN',
      pengaju_nama: 'KSBU',
    }])
    mocks.repository.loadTautanManualAttachments.mockResolvedValue([
      { id: ATTACHMENT_A, manual_arsip_id: MANUAL_A, judul_lampiran: 'Scan', content_type: 'application/pdf' },
    ])
    mocks.loadDestroyedArchiveIds.mockResolvedValue({ dokumenIds: [DOC_A], manualArsipIds: [MANUAL_A] })

    const detail = await buildTautanDetail(tautanRow({ dokumenIds: [DOC_A, DOC_B, DOC_OUTSIDE] }))

    expect(detail.dibuat_oleh).toBe('Budi Santoso')
    // DOC_OUTSIDE no longer exists (e.g. hard-deleted) -> counted, not shown.
    expect(detail.jumlah_tidak_tersedia).toBe(1)
    expect(detail.dokumen.map(dok => dok.id)).toEqual([MANUAL_A, DOC_A, DOC_B]) // newest first
    const [manual, docA, docB] = detail.dokumen
    expect(docA.lampiran_tidak_tersedia).toBe('Berkas dokumen ini sudah dimusnahkan')
    expect(docA.lampiran).toEqual([
      { ref: '0', nama: 'Kuitansi', is_pdf: true, link_path: buildTautanLampiranLinkPath(tautanRow(), DOC_A, '0') },
      { ref: '1', nama: 'Lampiran 2', is_pdf: false, link_path: buildTautanLampiranLinkPath(tautanRow(), DOC_A, '1') },
    ])
    expect(docB.lampiran_tidak_tersedia).toBe('Lampiran dokumen ini sudah dibersihkan')
    expect(manual).toMatchObject({ sumber: 'MANUAL', status: null, lampiran_tidak_tersedia: 'Berkas dokumen ini sudah dimusnahkan' })
    expect(manual.lampiran).toEqual([{
      ref: ATTACHMENT_A,
      nama: 'Scan',
      is_pdf: true,
      link_path: buildTautanLampiranLinkPath(tautanRow(), MANUAL_A, ATTACHMENT_A),
    }])
    // Tautan lampiran tidak membocorkan token batch.
    for (const lampiran of [...docA.lampiran, ...manual.lampiran]) {
      expect(lampiran.link_path).not.toContain(TOKEN)
      expect(lampiran.link_path).toMatch(/^\/lampiran\//)
    }
  })
})

describe('files inside a tautan', () => {
  it('refuses a workflow document that is not part of the snapshot', async () => {
    const response = await createTautanDokumenFileResponse({
      tautan: tautanRow(),
      dokumenId: DOC_OUTSIDE,
      lampiranIndex: 0,
      purpose: 'download',
    })

    expect(response.status).toBe(404)
    expect(mocks.resolveDocumentLampiranLogicalPathForExport).not.toHaveBeenCalled()
  })

  it('passes through the file-level 410 for destroyed/cleaned attachments', async () => {
    mocks.resolveDocumentLampiranLogicalPathForExport.mockResolvedValue({ ok: false, status: 410, message: 'Data file sudah dimusnahkan' })

    const response = await createTautanDokumenFileResponse({
      tautan: tautanRow(),
      dokumenId: DOC_A,
      lampiranIndex: 0,
      purpose: 'preview',
    })

    expect(response.status).toBe(410)
    expect(mocks.createLogicalPathFileResponse).not.toHaveBeenCalled()
  })

  it('streams a snapshot attachment with the formal download filename', async () => {
    mocks.resolveDocumentLampiranLogicalPathForExport.mockResolvedValue({ ok: true, logicalPath: 'u/a/1.pdf' })
    mocks.repository.loadTautanDokumenRows.mockResolvedValue([{
      id: DOC_A,
      judul: 'Dokumen A',
      tanggal: '2026-10-01',
      kegiatan_nama: 'Kegiatan X',
      is_non_material: true,
      nama_dokumen: 'Notulen',
      lampiran_urls: [{ kelengkapan_id: 'k1', nama: 'Notulen Rapat', url: 'u/a/1.pdf', uploaded_at: '' }],
    }])
    mocks.createLogicalPathFileResponse.mockResolvedValue(new Response('pdf', { status: 200 }))

    const response = await createTautanDokumenFileResponse({
      tautan: tautanRow(),
      dokumenId: DOC_A,
      lampiranIndex: 0,
      purpose: 'download',
    })

    expect(response.status).toBe(200)
    expect(mocks.createLogicalPathFileResponse).toHaveBeenCalledWith({
      logicalPath: 'u/a/1.pdf',
      purpose: 'download',
      downloadFilename: 'Notulen Rapat_Notulen_Kegiatan X_2026-10-01.pdf',
    })
  })

  it('refuses a manual document that is not part of the snapshot', async () => {
    const response = await createTautanManualFileResponse({
      tautan: tautanRow({ manualArsipIds: [] }),
      manualArsipId: MANUAL_A,
      attachmentId: ATTACHMENT_A,
      purpose: 'preview',
    })

    expect(response.status).toBe(404)
    expect(mocks.createManualArsipAttachmentFileResponse).not.toHaveBeenCalled()
  })

  it('validates route params before resolving a file', async () => {
    mocks.getLocalServerSession.mockResolvedValue(session())
    mocks.repository.findTautanByToken.mockResolvedValue(tautanRow())

    const response = await handleTautanDokumenFileRequest({
      request: new Request('http://localhost/x'),
      params: { token: TOKEN, dokumenId: DOC_A, lampiranIndex: '-1' },
      purpose: 'preview',
    })

    expect(response.status).toBe(404)
    expect(mocks.resolveDocumentLampiranLogicalPathForExport).not.toHaveBeenCalled()
  })
})

describe('misc', () => {
  it('reads DMS_PUBLIC_BASE_URL only when it is a valid http(s) URL', () => {
    expect(getTautanPublicBaseUrl({ DMS_PUBLIC_BASE_URL: 'http://10.72.214.55:3000/' })).toBe('http://10.72.214.55:3000')
    expect(getTautanPublicBaseUrl({ DMS_PUBLIC_BASE_URL: '  ' })).toBeNull()
    expect(getTautanPublicBaseUrl({ DMS_PUBLIC_BASE_URL: 'ftp://x' })).toBeNull()
    expect(getTautanPublicBaseUrl({})).toBeNull()
  })

  it('maps a row to the list item without leaking anything but the page path', () => {
    const item = toTautanListItem(tautanRow({ jumlahAkses: 3, akses: 'PUBLIK' }))

    expect(item).toMatchObject({
      path: `/tautan/${TOKEN}`,
      akses: 'PUBLIK',
      jumlah_dokumen: 2,
      jumlah_akses: 3,
      revoked_at: null,
    })
  })
})

describe('tautan akses', () => {
  it('defaults to LOGIN and stores PUBLIK only when explicitly requested', async () => {
    mocks.repository.selectSayaDokumenIds.mockResolvedValue([DOC_A])

    await createTautanForSession(session(), request())
    expect(mocks.repository.insertTautan).toHaveBeenLastCalledWith(expect.objectContaining({ akses: 'LOGIN' }))

    await createTautanForSession(session(), request({ akses: 'PUBLIK' }))
    expect(mocks.repository.insertTautan).toHaveBeenLastCalledWith(expect.objectContaining({ akses: 'PUBLIK' }))
  })

  it('does not widen the snapshot for PUBLIK: it is scoped to the creator exactly like LOGIN', async () => {
    mocks.repository.selectSayaDokumenIds.mockResolvedValue([])

    const result = await createTautanForSession(session(), request({ akses: 'PUBLIK', dokumen_ids: [DOC_OUTSIDE] }))

    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(mocks.repository.insertTautan).not.toHaveBeenCalled()
  })

  it('throttles ZIP exports per tautan for anonymous visitors only', async () => {
    mocks.repository.loadTautanDokumenRows.mockResolvedValue([])
    mocks.repository.loadTautanManualRows.mockResolvedValue([])
    const publik = tautanRow({ akses: 'PUBLIK' })

    const first = await createTautanZipResponse(null, publik)
    const second = await createTautanZipResponse(null, publik)
    const otherTautan = await createTautanZipResponse(null, tautanRow({ akses: 'PUBLIK', id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }))

    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
    expect(Number(second.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(otherTautan.status).toBe(200)

    // Logged-in users are never throttled, even on the same tautan.
    const loggedInA = await createTautanZipResponse(session(), publik)
    const loggedInB = await createTautanZipResponse(session(), publik)
    expect(loggedInA.status).toBe(200)
    expect(loggedInB.status).toBe(200)
  })
})

describe('tautan per lampiran (/lampiran/...)', () => {
  const TAUTAN_ID = '99999999-9999-4999-8999-999999999999'

  function paramsOf(path: string) {
    const [, , tautanId, dokumenId, ref, sig] = path.split('/')
    return { tautanId, dokumenId, ref, sig }
  }

  async function open(path: string) {
    return handleTautanLampiranRequest({
      request: new Request(`http://localhost${path}`),
      params: paramsOf(path),
    })
  }

  function mockWorkflowFile() {
    mocks.resolveDocumentLampiranLogicalPathForExport.mockResolvedValue({ ok: true, logicalPath: 'u/a/1.pdf' })
    mocks.repository.loadTautanDokumenRows.mockResolvedValue([{
      id: DOC_A,
      judul: 'Dokumen A',
      tanggal: '2026-10-01',
      kegiatan_nama: 'Kegiatan X',
      is_non_material: true,
      nama_dokumen: 'Notulen',
      lampiran_urls: [{ kelengkapan_id: 'k1', nama: 'Notulen Rapat', url: 'u/a/1.pdf', uploaded_at: '' }],
    }])
    mocks.createLogicalPathFileResponse.mockResolvedValue(new Response('pdf', { status: 200 }))
  }

  it('signs per tautan, dokumen and lampiran, and never embeds the batch token', () => {
    const base = buildTautanLampiranLinkPath(tautanRow(), DOC_A, '0')

    expect(base).toBe(buildTautanLampiranLinkPath(tautanRow(), DOC_A, '0'))
    expect(base).not.toContain(TOKEN)
    expect(base.startsWith(`/lampiran/${TAUTAN_ID}/${DOC_A}/0/`)).toBe(true)
    expect(buildTautanLampiranLinkPath(tautanRow(), DOC_A, '1')).not.toBe(base)
    expect(buildTautanLampiranLinkPath(tautanRow(), DOC_B, '0')).not.toBe(base)
    expect(buildTautanLampiranLinkPath(tautanRow({ token: 'ZyXwVuTsRqPoNmLkJiHgFeDcBa987654' }), DOC_A, '0')).not.toBe(base)
  })

  it('serves a PUBLIK lampiran inline without a session and counts the access', async () => {
    const tautan = tautanRow({ akses: 'PUBLIK' })
    mocks.repository.findTautanById.mockResolvedValue(tautan)
    mocks.getLocalServerSession.mockResolvedValue(null)
    mockWorkflowFile()

    const response = await open(buildTautanLampiranLinkPath(tautan, DOC_A, '0'))

    expect(response.status).toBe(200)
    expect(mocks.createLogicalPathFileResponse).toHaveBeenCalledWith(expect.objectContaining({
      logicalPath: 'u/a/1.pdf',
      purpose: 'preview',
    }))
    expect(mocks.repository.recordTautanAccess).toHaveBeenCalledWith(TAUTAN_ID)
  })

  it('sends a logged-out visitor of a LOGIN tautan to login and back to the same file', async () => {
    const tautan = tautanRow({ akses: 'LOGIN' })
    mocks.repository.findTautanById.mockResolvedValue(tautan)
    mocks.getLocalServerSession.mockResolvedValue(null)
    const path = buildTautanLampiranLinkPath(tautan, DOC_A, '0')

    const response = await open(path)

    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(`/login?next=${encodeURIComponent(path)}`)
    expect(mocks.createLogicalPathFileResponse).not.toHaveBeenCalled()
    expect(mocks.repository.recordTautanAccess).not.toHaveBeenCalled()
  })

  it('lets a logged-in visitor open a LOGIN lampiran', async () => {
    const tautan = tautanRow({ akses: 'LOGIN' })
    mocks.repository.findTautanById.mockResolvedValue(tautan)
    mocks.getLocalServerSession.mockResolvedValue(session(['PPK']))
    mockWorkflowFile()

    const response = await open(buildTautanLampiranLinkPath(tautan, DOC_A, '0'))

    expect(response.status).toBe(200)
  })

  it('answers 404 (same page) for a tampered signature, another lampiran ref, or an unknown tautan', async () => {
    const tautan = tautanRow({ akses: 'PUBLIK' })
    mocks.repository.findTautanById.mockResolvedValue(tautan)
    const valid = buildTautanLampiranLinkPath(tautan, DOC_A, '0')
    const tampered = `${valid.slice(0, -1)}${valid.endsWith('A') ? 'B' : 'A'}`
    const otherRef = valid.replace(`/${DOC_A}/0/`, `/${DOC_A}/1/`)

    const first = await open(tampered)
    const second = await open(otherRef)

    expect(first.status).toBe(404)
    expect(second.status).toBe(404)
    expect(await first.text()).toBe(await second.text())
    expect(mocks.createLogicalPathFileResponse).not.toHaveBeenCalled()

    mocks.repository.findTautanById.mockResolvedValue(null)
    expect((await open(valid)).status).toBe(404)
  })

  it('rejects malformed params without touching the database', async () => {
    const response = await handleTautanLampiranRequest({
      request: new Request('http://localhost/lampiran/x'),
      params: { tautanId: 'x', dokumenId: DOC_A, ref: '0', sig: 'short' },
    })

    expect(response.status).toBe(404)
    expect(mocks.repository.findTautanById).not.toHaveBeenCalled()
  })

  it('answers 410 as an HTML page once the batch is revoked', async () => {
    const tautan = tautanRow({ akses: 'PUBLIK', revokedAt: new Date('2026-10-12T00:00:00.000Z') })
    mocks.repository.findTautanById.mockResolvedValue(tautan)

    const response = await open(buildTautanLampiranLinkPath(tautan, DOC_A, '0'))

    expect(response.status).toBe(410)
    expect(response.headers.get('Content-Type')).toContain('text/html')
    expect(await response.text()).toContain('sudah dicabut')
    expect(mocks.createLogicalPathFileResponse).not.toHaveBeenCalled()
  })

  it('turns a destroyed / cleaned file into an escaped HTML 410 page', async () => {
    const tautan = tautanRow({ akses: 'PUBLIK' })
    mocks.repository.findTautanById.mockResolvedValue(tautan)
    mocks.resolveDocumentLampiranLogicalPathForExport.mockResolvedValue({ ok: false, status: 410, message: 'Data file sudah dimusnahkan <b>' })

    const response = await open(buildTautanLampiranLinkPath(tautan, DOC_A, '0'))
    const html = await response.text()

    expect(response.status).toBe(410)
    expect(response.headers.get('Content-Type')).toContain('text/html')
    expect(html).toContain('Data file sudah dimusnahkan &lt;b&gt;')
    expect(html).not.toContain('<b>')
    expect(mocks.repository.recordTautanAccess).not.toHaveBeenCalled()
  })

  it('refuses a document outside the snapshot even with a valid signature', async () => {
    const tautan = tautanRow({ akses: 'PUBLIK', dokumenIds: [DOC_B] })
    mocks.repository.findTautanById.mockResolvedValue(tautan)

    const response = await open(buildTautanLampiranLinkPath(tautan, DOC_OUTSIDE, '0'))

    expect(response.status).toBe(404)
    expect(mocks.resolveDocumentLampiranLogicalPathForExport).not.toHaveBeenCalled()
  })

  it('opens a manual (KSBU) attachment of a snapshot document', async () => {
    const tautan = tautanRow({ akses: 'PUBLIK' })
    mocks.repository.findTautanById.mockResolvedValue(tautan)
    mocks.createManualArsipAttachmentFileResponse.mockResolvedValue(new Response('pdf', { status: 200 }))

    const response = await open(buildTautanLampiranLinkPath(tautan, MANUAL_A, ATTACHMENT_A))

    expect(response.status).toBe(200)
    expect(mocks.createManualArsipAttachmentFileResponse).toHaveBeenCalledWith({
      manualArsipId: MANUAL_A,
      attachmentId: ATTACHMENT_A,
      purpose: 'preview',
    })
  })

  it('still opens the file when the access counter fails', async () => {
    const tautan = tautanRow({ akses: 'PUBLIK' })
    mocks.repository.findTautanById.mockResolvedValue(tautan)
    mocks.repository.recordTautanAccess.mockRejectedValue(new Error('db down'))
    mocks.createManualArsipAttachmentFileResponse.mockResolvedValue(new Response('pdf', { status: 200 }))

    const response = await open(buildTautanLampiranLinkPath(tautan, MANUAL_A, ATTACHMENT_A))

    expect(response.status).toBe(200)
  })
})
