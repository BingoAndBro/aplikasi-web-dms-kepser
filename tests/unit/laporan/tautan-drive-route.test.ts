// Section 08 tautan Google Drive: rute "Coba lagi" pembuat dan penolakan
// semua pembuka DMS untuk tautan DRIVE (404 identik dengan "tidak ditemukan").
import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const DOC_A = '33333333-3333-4333-8333-333333333333'
const MANUAL_A = '77777777-7777-4777-8777-777777777777'
const ATTACHMENT_A = '88888888-8888-4888-8888-888888888888'
const TAUTAN_ID = '99999999-9999-4999-8999-999999999999'
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'
const ORIGIN = 'http://localhost'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  cobaLagiTautanDrive: vi.fn(),
  triggerDriveRunner: vi.fn(),
  findTautanByToken: vi.fn(),
  findTautanById: vi.fn(),
  recordTautanAccess: vi.fn(),
  loadTautanDokumenRows: vi.fn(),
  loadTautanManualRows: vi.fn(),
  loadTautanManualAttachments: vi.fn(),
  resolveDocumentLampiranLogicalPathForExport: vi.fn(),
  createLogicalPathFileResponse: vi.fn(),
  createManualArsipAttachmentFileResponse: vi.fn(),
  streamDocumentZip: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/lib/google-drive/tautan-drive-repository', () => ({ cobaLagiTautanDrive: mocks.cobaLagiTautanDrive }))
vi.mock('#/lib/google-drive/runner', () => ({ triggerDriveRunner: mocks.triggerDriveRunner }))

vi.mock('#/lib/laporan/tautan-repository', () => ({
  findTautanByToken: mocks.findTautanByToken,
  findTautanById: mocks.findTautanById,
  recordTautanAccess: mocks.recordTautanAccess,
  loadTautanDokumenRows: mocks.loadTautanDokumenRows,
  loadTautanManualRows: mocks.loadTautanManualRows,
  loadTautanManualAttachments: mocks.loadTautanManualAttachments,
}))

vi.mock('#/lib/storage/document-file-access', () => ({
  resolveDocumentLampiranLogicalPathForExport: mocks.resolveDocumentLampiranLogicalPathForExport,
}))

vi.mock('#/lib/storage/internal-file-access', async (importOriginal) => ({
  ...await importOriginal<typeof import('#/lib/storage/internal-file-access')>(),
  createLogicalPathFileResponse: mocks.createLogicalPathFileResponse,
}))

vi.mock('#/lib/manual-arsip', () => ({
  createManualArsipAttachmentFileResponse: mocks.createManualArsipAttachmentFileResponse,
  isUuid: (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
}))

vi.mock('#/lib/laporan/manual-realisasi', () => ({
  loadDestroyedArchiveIds: vi.fn(async () => ({ dokumenIds: [], manualArsipIds: [] })),
}))

vi.mock('#/lib/export/laporan-zip-entries', () => ({
  buildLaporanExportZipFilename: (prefix: string) => `${prefix}.zip`,
  buildLaporanZipEntries: vi.fn(async () => []),
  buildManualArsipZipEntries: vi.fn(async () => []),
}))

vi.mock('#/lib/export/document-zip', async (importOriginal) => ({
  ...await importOriginal<typeof import('#/lib/export/document-zip')>(),
  streamDocumentZip: mocks.streamDocumentZip,
}))

import { buildTautanLampiranLinkPath } from '#/lib/laporan/tautan-lampiran-link'
import { Route as CobaLagiRoute } from '#/routes/api/laporan/tautan.$id.coba-lagi'
import { Route as DetailRoute } from '#/routes/api/tautan.$token'
import { Route as DokumenDownloadRoute } from '#/routes/api/tautan.$token.dokumen.$dokumenId.download.$lampiranIndex'
import { Route as DokumenPreviewRoute } from '#/routes/api/tautan.$token.dokumen.$dokumenId.preview.$lampiranIndex'
import { Route as ExportZipRoute } from '#/routes/api/tautan.$token.export-zip'
import { Route as ManualDownloadRoute } from '#/routes/api/tautan.$token.manual-arsip.$manualArsipId.attachments.$attachmentId.download'
import { Route as ManualPreviewRoute } from '#/routes/api/tautan.$token.manual-arsip.$manualArsipId.attachments.$attachmentId.preview'
import { Route as LampiranRoute } from '#/routes/lampiran.$tautanId.$dokumenId.$ref.$sig'

type Handler = (args: { request: Request; params?: Record<string, string> }) => Promise<Response>

function handler(route: unknown, method: 'GET' | 'POST'): Handler {
  return (route as { options: { server: { handlers: Record<string, Handler> } } }).options.server.handlers[method]
}

const session = {
  user: { id: USER_ID, username: 'budi' },
  userId: USER_ID,
  roles: ['PEGAWAI'],
  activeRole: 'PEGAWAI',
  sessionId: 'session-1',
}

function tautanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TAUTAN_ID,
    token: TOKEN,
    sumber: 'LAPORAN_KEGIATAN',
    akses: 'DRIVE',
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
    driveAkunId: '22222222-2222-4222-8222-222222222222',
    driveFolderId: 'folder-1',
    driveFolderUrl: 'https://drive.google.com/drive/folders/folder-1',
    driveStatus: 'SIAP',
    driveDaftarIsiFileId: null,
    driveFolderDicobaPada: null,
    driveDokumenDilewati: [],
    creatorDisplayName: 'Budi',
    creatorNamaLengkap: null,
    creatorUsername: 'budi',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  mocks.getLocalServerSession.mockResolvedValue(session)
})

describe('POST /api/laporan/tautan/$id/coba-lagi', () => {
  const post = handler(CobaLagiRoute, 'POST')
  const path = `/api/laporan/tautan/${TAUTAN_ID}/coba-lagi`
  const call = (origin = ORIGIN, id = TAUTAN_ID) => post({
    request: new Request(`http://localhost${path}`, { method: 'POST', headers: { Origin: origin } }),
    params: { id },
  })

  it('rejects cross-origin requests with 403 before reading the session', async () => {
    const response = await call('https://evil.example')

    expect(response.status).toBe(403)
    expect(mocks.getLocalServerSession).not.toHaveBeenCalled()
    expect(mocks.cobaLagiTautanDrive).not.toHaveBeenCalled()
  })

  it('requires a session (401)', async () => {
    mocks.getLocalServerSession.mockResolvedValue(null)

    const response = await call()

    expect(response.status).toBe(401)
    expect(mocks.cobaLagiTautanDrive).not.toHaveBeenCalled()
  })

  it('answers 404 for a non-uuid id without touching the database', async () => {
    const response = await call(ORIGIN, 'bukan-uuid')

    expect(response.status).toBe(404)
    expect(mocks.cobaLagiTautanDrive).not.toHaveBeenCalled()
  })

  it.each(['PEGAWAI', 'PPK', 'PPSPM', 'KEPALA_SUB_BAGIAN_UMUM', 'PENANGGUNG_JAWAB_KINERJA', 'ADMIN'])(
    'any role may retry only its OWN tautan: not creator / missing / revoked / not DRIVE -> 404 (%s)',
    async (role) => {
      mocks.getLocalServerSession.mockResolvedValue({ ...session, roles: [role], activeRole: role })
      mocks.cobaLagiTautanDrive.mockResolvedValue('TIDAK_DITEMUKAN')

      const response = await call()

      expect(response.status).toBe(404)
      expect(mocks.cobaLagiTautanDrive).toHaveBeenCalledWith({ tautanId: TAUTAN_ID, userId: USER_ID, now: expect.any(Date) })
      expect(mocks.triggerDriveRunner).not.toHaveBeenCalled()
    },
  )

  it('answers 409 when the tautan is not in GAGAL state', async () => {
    mocks.cobaLagiTautanDrive.mockResolvedValue('BUKAN_GAGAL')

    const response = await call()

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'Tautan tidak dalam keadaan gagal' })
    expect(mocks.triggerDriveRunner).not.toHaveBeenCalled()
  })

  it('reschedules a GAGAL tautan and triggers the runner', async () => {
    mocks.cobaLagiTautanDrive.mockResolvedValue('DIJADWALKAN')

    const response = await call()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(mocks.triggerDriveRunner).toHaveBeenCalledTimes(1)
  })

  it('500 without leaking the error', async () => {
    mocks.cobaLagiTautanDrive.mockRejectedValue(new Error('duplicate key drive_job_satu_menunggu'))

    const response = await call()

    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('drive_job')
    expect(mocks.triggerDriveRunner).not.toHaveBeenCalled()
  })
})

describe('DMS openers never serve a DRIVE tautan', () => {
  const NOT_FOUND = { error: 'Tautan tidak ditemukan. Periksa kembali alamat tautan.' }
  const OPENERS: Array<{ name: string; route: unknown; params: Record<string, string> }> = [
    { name: 'detail', route: DetailRoute, params: { token: TOKEN } },
    { name: 'export-zip', route: ExportZipRoute, params: { token: TOKEN } },
    { name: 'dokumen preview', route: DokumenPreviewRoute, params: { token: TOKEN, dokumenId: DOC_A, lampiranIndex: '0' } },
    { name: 'dokumen download', route: DokumenDownloadRoute, params: { token: TOKEN, dokumenId: DOC_A, lampiranIndex: '0' } },
    { name: 'manual preview', route: ManualPreviewRoute, params: { token: TOKEN, manualArsipId: MANUAL_A, attachmentId: ATTACHMENT_A } },
    { name: 'manual download', route: ManualDownloadRoute, params: { token: TOKEN, manualArsipId: MANUAL_A, attachmentId: ATTACHMENT_A } },
  ]

  const states = [
    ['MENUNGGU', null],
    ['SIAP', null],
    ['GAGAL', null],
    ['MENGHAPUS', new Date('2026-10-12T00:00:00.000Z')],
    ['DIHAPUS', new Date('2026-10-12T00:00:00.000Z')],
  ] as const

  for (const opener of OPENERS) {
    it(`/api/tautan/<token> ${opener.name}: 404 identical to an unknown token, with or without a session`, async () => {
      const get = handler(opener.route, 'GET')
      const open = () => get({ request: new Request(`http://localhost/api/tautan/${TOKEN}`), params: opener.params })

      mocks.findTautanByToken.mockResolvedValue(null)
      const unknown = await open()
      const unknownBody = await unknown.json()
      expect(unknown.status).toBe(404)
      expect(unknownBody).toEqual(NOT_FOUND)

      for (const viewer of [session, null]) {
        mocks.getLocalServerSession.mockResolvedValue(viewer)
        for (const [driveStatus, revokedAt] of states) {
          mocks.findTautanByToken.mockResolvedValue(tautanRow({ driveStatus, revokedAt }))
          const response = await open()
          expect(response.status).toBe(404)
          await expect(response.json()).resolves.toEqual(unknownBody)
        }
      }

      expect(mocks.recordTautanAccess).not.toHaveBeenCalled()
      expect(mocks.resolveDocumentLampiranLogicalPathForExport).not.toHaveBeenCalled()
      expect(mocks.createManualArsipAttachmentFileResponse).not.toHaveBeenCalled()
      expect(mocks.streamDocumentZip).not.toHaveBeenCalled()
    })
  }

  it('/lampiran/...: 404 page identical to an unknown tautan for every DRIVE state', async () => {
    const get = handler(LampiranRoute, 'GET')
    const open = async (tautan: ReturnType<typeof tautanRow> | null) => {
      mocks.findTautanById.mockResolvedValue(tautan)
      const linkPath = buildTautanLampiranLinkPath(tautanRow() as never, DOC_A, '0')
      const [, , tautanId, dokumenId, ref, sig] = linkPath.split('/')
      const response = await get({ request: new Request(`http://localhost${linkPath}`), params: { tautanId, dokumenId, ref, sig } })
      return { status: response.status, type: response.headers.get('content-type'), body: await response.text() }
    }

    const unknown = await open(null)
    expect(unknown.status).toBe(404)

    for (const viewer of [session, null]) {
      mocks.getLocalServerSession.mockResolvedValue(viewer)
      for (const [driveStatus, revokedAt] of states) {
        await expect(open(tautanRow({ driveStatus, revokedAt }))).resolves.toEqual(unknown)
      }
    }
    expect(unknown.body).not.toContain(TOKEN)
    expect(mocks.recordTautanAccess).not.toHaveBeenCalled()
    expect(mocks.resolveDocumentLampiranLogicalPathForExport).not.toHaveBeenCalled()
  })
})
