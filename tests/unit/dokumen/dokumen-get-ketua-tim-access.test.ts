import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_PEGAWAI_ID = '22222222-2222-4222-8222-222222222222'
const KETUA_TIM_ID = '33333333-3333-4333-8333-333333333333'
const DOKUMEN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const KEGIATAN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OTHER_KEGIATAN_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/db/client', () => ({
  db: { select: mocks.dbSelect },
}))

import { Route as DokumenIdRoute } from '#/routes/api/dokumen.$id'

type RouteGetHandler = (args: { request: Request; params: Record<string, string> }) => Promise<Response>

const getHandler = (DokumenIdRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

function makeGetRequest(): Request {
  return new Request(`http://localhost/api/dokumen/${DOKUMEN_ID}`, { method: 'GET' })
}

function baseDokumenRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: DOKUMEN_ID,
    judul: 'Laporan Bulanan Januari',
    fungsi_id: null,
    kegiatan_jenis_id: KEGIATAN_ID,
    is_ketua_tim: false,
    status: 'TERSIMPAN',
    current_step: null,
    revision_target: null,
    revision_notes: null,
    lampiran_urls: [],
    tahun: 2026,
    tanggal: '2026-01-15',
    created_by: OWNER_ID,
    nominal_realisasi: null,
    is_non_material: true,
    keterangan_detail: null,
    created_at: new Date(),
    updated_at: new Date(),
    jenis_permintaan_id: null,
    kategori_permintaan_id: null,
    detail_permintaan_id: null,
    komponen_id: null,
    nama_dokumen: 'Laporan Bulanan Januari',
    lampiran_dibersihkan_at: new Date('2026-02-01'),
    lampiran_dibersihkan_alasan: 'PEMBERSIHAN_NON_MATERIAL',
    fungsi_nama: undefined,
    kegiatan_nama: 'Kegiatan A',
    komponen_nama: undefined,
    jenis_permintaan_nama: undefined,
    kategori_permintaan_nama: undefined,
    detail_permintaan_nama: undefined,
    ...overrides,
  }
}

/** Chainable query double: every method returns itself except the terminal one. */
function chainable(terminalMethod: string, result: unknown) {
  const node: Record<string, unknown> = {}
  const passthrough = ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy']
  for (const method of passthrough) {
    if (method === terminalMethod) continue
    node[method] = vi.fn(() => node)
  }
  node[terminalMethod] = vi.fn(async () => result)
  return node
}

function queueSelectResults(results: Array<{ terminalMethod: string; result: unknown }>) {
  const queue = [...results]
  mocks.dbSelect.mockImplementation(() => {
    const next = queue.shift()
    if (!next) throw new Error('unexpected extra db.select() call')
    return chainable(next.terminalMethod, next.result)
  })
}

describe('GET /api/dokumen/$id -- ketua tim read access to non-material documents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('allows the document owner (existing behavior, no assignment lookup needed)', async () => {
    mocks.getLocalServerSession.mockResolvedValue({ user: { id: OWNER_ID }, roles: ['PEGAWAI'] })
    queueSelectResults([
      { terminalMethod: 'limit', result: [baseDokumenRow()] }, // dokumen lookup only
    ])

    const response = await getHandler({ request: makeGetRequest(), params: { id: DOKUMEN_ID } })

    expect(response.status).toBe(200)
    expect(mocks.dbSelect).toHaveBeenCalledTimes(1) // no ketua-tim fallback query for the owner
  })

  it('rejects a PEGAWAI who neither owns the document nor leads its kegiatan', async () => {
    mocks.getLocalServerSession.mockResolvedValue({ user: { id: OTHER_PEGAWAI_ID }, roles: ['PEGAWAI'] })
    queueSelectResults([
      { terminalMethod: 'limit', result: [baseDokumenRow()] }, // dokumen lookup
      { terminalMethod: 'limit', result: [] }, // ketua-tim assignment lookup: none
    ])

    const response = await getHandler({ request: makeGetRequest(), params: { id: DOKUMEN_ID } })

    expect(response.status).toBe(403)
  })

  it('allows a ketua tim of the document\'s own kegiatan to read it, even when cleaned', async () => {
    mocks.getLocalServerSession.mockResolvedValue({ user: { id: KETUA_TIM_ID }, roles: ['PEGAWAI'] })
    queueSelectResults([
      { terminalMethod: 'limit', result: [baseDokumenRow()] }, // dokumen lookup (already cleaned)
      { terminalMethod: 'limit', result: [{ id: 'assignment-1' }] }, // ketua-tim assignment lookup: found
    ])

    const response = await getHandler({ request: makeGetRequest(), params: { id: DOKUMEN_ID } })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.dokumen.id).toBe(DOKUMEN_ID)
    expect(body.dokumen.lampiran_dibersihkan_at).toBeTruthy()
  })

  it('allows a ketua tim who ALSO holds another role (PPK) -- role branches must grant, not deny', async () => {
    // Regression: the role branches used to `return` a verdict, so a ketua tim
    // who also held PPK got denied on a TERSIMPAN document (not in PPK's list)
    // and never reached the ketua-tim check below them.
    mocks.getLocalServerSession.mockResolvedValue({ user: { id: KETUA_TIM_ID }, roles: ['PEGAWAI', 'PPK'] })
    queueSelectResults([
      { terminalMethod: 'limit', result: [baseDokumenRow()] }, // TERSIMPAN, not readable by PPK
      { terminalMethod: 'limit', result: [{ id: 'assignment-1' }] }, // but they lead this kegiatan
    ])

    const response = await getHandler({ request: makeGetRequest(), params: { id: DOKUMEN_ID } })

    expect(response.status).toBe(200)
  })

  it('still lets PPK read a document in PPK-visible status without a ketua-tim assignment', async () => {
    mocks.getLocalServerSession.mockResolvedValue({ user: { id: OTHER_PEGAWAI_ID }, roles: ['PPK'] })
    queueSelectResults([
      { terminalMethod: 'limit', result: [baseDokumenRow({ status: 'COMPLETED' })] },
      // no assignment lookup expected -- the PPK branch grants first
    ])

    const response = await getHandler({ request: makeGetRequest(), params: { id: DOKUMEN_ID } })

    expect(response.status).toBe(200)
    expect(mocks.dbSelect).toHaveBeenCalledTimes(1)
  })

  it('rejects a ketua tim who leads a different kegiatan than the document\'s', async () => {
    mocks.getLocalServerSession.mockResolvedValue({ user: { id: KETUA_TIM_ID }, roles: ['PEGAWAI'] })
    queueSelectResults([
      { terminalMethod: 'limit', result: [baseDokumenRow({ kegiatan_jenis_id: OTHER_KEGIATAN_ID })] },
      { terminalMethod: 'limit', result: [] }, // no assignment for OTHER_KEGIATAN_ID
    ])

    const response = await getHandler({ request: makeGetRequest(), params: { id: DOKUMEN_ID } })

    expect(response.status).toBe(403)
  })
})
