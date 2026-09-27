import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

// Route-level guards added after the activity-diagram validation:
// - atomic conditional status updates (409 on a lost race, no log row)
// - KEMBALIKAN keeps the PPSPM rejection reason
// - RESUBMIT / RESUBMIT_PPK re-run SUBMIT's nominal and kelengkapan rules
// - RESUBMIT / RESUBMIT_PPK clear revision_notes
// - PPK resubmit bodies always go through Zod

const USER_ID = '11111111-1111-4111-8111-111111111111'
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333'
const KEGIATAN_ID = '44444444-4444-4444-8444-444444444444'
const KOMPONEN_ID = '55555555-5555-4555-8555-555555555555'
const JENIS_ID = '66666666-6666-4666-8666-666666666666'
const KATEGORI_ID = '77777777-7777-4777-8777-777777777777'
const REQUIRED_KELENGKAPAN_ID = '88888888-8888-4888-8888-888888888888'
const OPTIONAL_KELENGKAPAN_ID = '99999999-9999-4999-8999-999999999999'

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  dbSelect: vi.fn(),
  dbTransaction: vi.fn(),
  txUpdateSet: vi.fn(),
  txUpdateWhere: vi.fn(),
  txInsertValues: vi.fn(),
  updatedRowCount: { value: 1 },
  prepareLocalAttachmentReplacement: vi.fn(),
  executeLocalAttachmentMovements: vi.fn(),
  rollbackLocalAttachmentMovements: vi.fn(),
}))

vi.mock('#/lib/storage/local-attachment-replacement', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/storage/local-attachment-replacement')>()),
  prepareLocalAttachmentReplacement: mocks.prepareLocalAttachmentReplacement,
  executeLocalAttachmentMovements: mocks.executeLocalAttachmentMovements,
  rollbackLocalAttachmentMovements: mocks.rollbackLocalAttachmentMovements,
}))

vi.mock('#/lib/storage/local-attachment-reference-cleanup', () => ({
  cleanupUnreferencedReplacedLocalAttachments: vi.fn(async () => undefined),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

vi.mock('#/db/client', () => ({
  db: {
    select: mocks.dbSelect,
    transaction: mocks.dbTransaction,
  },
}))

import { Route as PpspmApproveRoute } from '#/routes/api/ppspm/dokumen/$id/approve'
import { Route as PpspmRejectRoute } from '#/routes/api/ppspm/dokumen/$id/reject'
import { Route as PpkApproveRoute } from '#/routes/api/ppk/dokumen/$id/approve'
import { Route as PpkRejectRoute } from '#/routes/api/ppk/dokumen/$id/reject'
import { Route as KembalikanRoute } from '#/routes/api/ppk/kembalikan/$id'
import { Route as PegawaiResubmitRoute } from '#/routes/api/dokumen.$id.submit'
import { Route as PpkResubmitRoute } from '#/routes/api/ppk/resubmit/$id'
import { DOKUMEN_TRANSITION_CONFLICT_MESSAGE } from '#/lib/dokumen/transition-conflict'

type Handler = (args: { request: Request; params: Record<string, string> }) => Promise<Response>

function handler(route: unknown, method: 'POST' | 'PATCH' = 'POST'): Handler {
  return (route as { options: { server: { handlers: Record<string, Handler> } } })
    .options.server.handlers[method]
}

const dialect = new PgDialect()

function whereSql(callIndex = 0) {
  const condition = mocks.txUpdateWhere.mock.calls[callIndex]?.[0] as SQL
  return dialect.sqlToQuery(condition)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mocks.updatedRowCount.value = 1
  mocks.dbTransaction.mockImplementation(async (operation: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      update: () => ({
        set: (values: Record<string, unknown>) => {
          mocks.txUpdateSet(values)
          return {
            where: (condition: unknown) => {
              mocks.txUpdateWhere(condition)
              return {
                returning: async () => Array.from({ length: mocks.updatedRowCount.value }, () => ({ id: DOCUMENT_ID })),
              }
            },
          }
        },
      }),
      insert: () => ({
        values: async (values: Record<string, unknown>) => {
          mocks.txInsertValues(values)
        },
      }),
    }
    return operation(tx)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PPSPM approve — atomic double-approval guard', () => {
  it('updates only while the row is still IN_PPSPM_APPROVAL and logs after the update', async () => {
    useSession(['PPSPM'])
    queueSelects([{ id: DOCUMENT_ID, status: 'IN_PPSPM_APPROVAL' }], [])

    const response = await handler(PpspmApproveRoute)(postRequest('/api/ppspm/dokumen/x/approve', {}))

    expect(response.status).toBe(200)
    const query = whereSql()
    expect(query.sql).toContain('"status" = $')
    expect(query.params).toEqual([DOCUMENT_ID, 'IN_PPSPM_APPROVAL'])
    expect(mocks.txInsertValues).toHaveBeenCalledWith(expect.objectContaining({ aksi: 'PPSPM_APPROVE' }))
  })

  it('returns 409 and writes no log when a concurrent approval already moved the row', async () => {
    useSession(['PPSPM'])
    queueSelects([{ id: DOCUMENT_ID, status: 'IN_PPSPM_APPROVAL' }], [])
    mocks.updatedRowCount.value = 0

    const response = await handler(PpspmApproveRoute)(postRequest('/api/ppspm/dokumen/x/approve', {}))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: DOKUMEN_TRANSITION_CONFLICT_MESSAGE })
    expect(mocks.txInsertValues).not.toHaveBeenCalled()
  })
})

describe('other transitions reuse the conditional-update pattern', () => {
  const rejectBody = { catatan: 'Lampiran kuitansi belum ditandatangani.' }

  it.each([
    ['PPK approve', PpkApproveRoute, ['PPK'], 'IN_PPK_VALIDATION', {}],
    ['PPK reject', PpkRejectRoute, ['PPK'], 'IN_PPK_VALIDATION', rejectBody],
    ['PPSPM reject', PpspmRejectRoute, ['PPSPM'], 'IN_PPSPM_APPROVAL', rejectBody],
  ] as const)('%s: guards on the source status and answers 409 on a lost race', async (_label, route, roles, status, body) => {
    useSession([...roles])
    queueSelects([{ id: DOCUMENT_ID, status }])
    mocks.updatedRowCount.value = 0

    const response = await handler(route)(postRequest('/api/x', body))

    expect(response.status).toBe(409)
    expect(whereSql().params).toEqual([DOCUMENT_ID, status])
    expect(mocks.txInsertValues).not.toHaveBeenCalled()
  })
})

describe('PPK kembalikan — keeps the PPSPM rejection reason', () => {
  it('appends the PPSPM reason to the automatic note the Pegawai reads', async () => {
    useSession(['PPK'])
    queueSelects([{
      id: DOCUMENT_ID,
      status: 'NEED_REVISION',
      revision_target: 'PPK',
      revision_notes: 'Nominal tidak sesuai kuitansi.',
    }])

    const response = await handler(KembalikanRoute)(postRequest('/api/ppk/kembalikan/x', {}))

    expect(response.status).toBe(200)
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      status: 'NEED_REVISION',
      revisionTarget: 'USER',
      revisionNotes: 'Dikembalikan ke pegawai oleh PPK. Alasan penolakan PPSPM: Nominal tidak sesuai kuitansi.',
    }))
    // The log keeps the short automatic note; the PPSPM reason is already in PPSPM_REJECT.
    expect(mocks.txInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      aksi: 'PPK_KEMBALIKAN',
      catatan: 'Dikembalikan ke pegawai oleh PPK',
    }))
    expect(whereSql().params).toEqual([DOCUMENT_ID, 'NEED_REVISION', 'PPK'])
  })

  it('falls back to the plain automatic note when no PPSPM reason is stored', async () => {
    useSession(['PPK'])
    queueSelects([{ id: DOCUMENT_ID, status: 'NEED_REVISION', revision_target: 'PPK', revision_notes: '   ' }])

    await handler(KembalikanRoute)(postRequest('/api/ppk/kembalikan/x', {}))

    expect(mocks.txUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      revisionNotes: 'Dikembalikan ke pegawai oleh PPK',
    }))
  })

  it.each([
    ['revision_target USER', { status: 'NEED_REVISION', revision_target: 'USER' }],
    ['revision_target null', { status: 'NEED_REVISION', revision_target: null }],
    ['status IN_PPK_VALIDATION', { status: 'IN_PPK_VALIDATION', revision_target: null }],
  ])('rejects with 400 and no write when %s', async (_label, row) => {
    useSession(['PPK'])
    queueSelects([{ id: DOCUMENT_ID, revision_notes: 'x', ...row }])

    const response = await handler(KembalikanRoute)(postRequest('/api/ppk/kembalikan/x', {}))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Dokumen ini tidak dalam status revisi PPK' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it.each([['PEGAWAI'], ['PPSPM'], ['KEPALA_SUB_BAGIAN_UMUM']])('rejects %s with 403', async (role) => {
    useSession([role])

    const response = await handler(KembalikanRoute)(postRequest('/api/ppk/kembalikan/x', {}))

    expect(response.status).toBe(403)
    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('returns 409 when the document left NEED_REVISION/PPK concurrently', async () => {
    useSession(['PPK'])
    queueSelects([{ id: DOCUMENT_ID, status: 'NEED_REVISION', revision_target: 'PPK', revision_notes: 'x' }])
    mocks.updatedRowCount.value = 0

    const response = await handler(KembalikanRoute)(postRequest('/api/ppk/kembalikan/x', {}))

    expect(response.status).toBe(409)
    expect(mocks.txInsertValues).not.toHaveBeenCalled()
  })
})

describe('Pegawai RESUBMIT — same rules as SUBMIT', () => {
  it('rejects a Material resubmit with nominal 0', async () => {
    useSession(['PEGAWAI'])
    queueSelects([pegawaiDokumenRow({ nominal_realisasi: '0.00' })])

    const response = await handler(PegawaiResubmitRoute)(postRequest('/api/dokumen/x/submit'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Nominal_realisasi wajib untuk dokumen Material' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('rejects a resubmit whose required kelengkapan (exact six-column match) is missing', async () => {
    useSession(['PEGAWAI'])
    queueSelects(
      [pegawaiDokumenRow({ lampiran_urls: [lampiran(OPTIONAL_KELENGKAPAN_ID)] })],
      requiredKelengkapanRows(),
    )

    const response = await handler(PegawaiResubmitRoute)(postRequest('/api/dokumen/x/submit'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Lampiran wajib belum lengkap: Kuitansi' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('rejects a resubmit with zero lampiran, same rule as SUBMIT', async () => {
    useSession(['PEGAWAI'])
    queueSelects([pegawaiDokumenRow({ lampiran_urls: [] })])

    const response = await handler(PegawaiResubmitRoute)(postRequest('/api/dokumen/x/submit'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Minimal upload satu lampiran sebelum mengajukan dokumen' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('resubmits when the rules pass, clears revision_notes and guards on NEED_REVISION/USER', async () => {
    useSession(['PEGAWAI'])
    queueSelects([pegawaiDokumenRow()], requiredKelengkapanRows())

    const response = await handler(PegawaiResubmitRoute)(postRequest('/api/dokumen/x/submit'))

    expect(response.status).toBe(200)
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      status: 'IN_PPK_VALIDATION',
      revisionNotes: null,
    }))
    expect(whereSql().params).toEqual([DOCUMENT_ID, 'NEED_REVISION', 'USER'])
    expect(mocks.txInsertValues).toHaveBeenCalledWith(expect.objectContaining({ aksi: 'RESUBMIT' }))
  })

  it('returns 409 and writes no log when the document changed concurrently', async () => {
    useSession(['PEGAWAI'])
    queueSelects([pegawaiDokumenRow()], requiredKelengkapanRows())
    mocks.updatedRowCount.value = 0

    const response = await handler(PegawaiResubmitRoute)(postRequest('/api/dokumen/x/submit'))

    expect(response.status).toBe(409)
    expect(mocks.txInsertValues).not.toHaveBeenCalled()
  })
})

describe('PPK RESUBMIT_PPK — Zod always, same rules as SUBMIT', () => {
  it.each(['POST', 'PATCH'] as const)('%s validates the body even without lampiranUrls', async (method) => {
    useSession(['PPK'])

    const negative = await handler(PpkResubmitRoute, method)(request(method, { nominalRealisasi: -5 }))
    expect(negative.status).toBe(400)

    const unknownKey = await handler(PpkResubmitRoute, method)(request(method, { status: 'COMPLETED' }))
    expect(unknownKey.status).toBe(400)

    expect(mocks.dbSelect).not.toHaveBeenCalled()
  })

  it('still accepts an empty body as "no changes"', async () => {
    useSession(['PPK'])
    queueSelects([ppkDokumenRow()], requiredKelengkapanRows())

    const response = await handler(PpkResubmitRoute)({
      request: new Request('http://localhost/api/ppk/resubmit/x', {
        method: 'POST',
        headers: { Origin: 'http://localhost' },
      }),
      params: { id: DOCUMENT_ID },
    })

    expect(response.status).toBe(200)
  })

  it('rejects nominal 0 sent with the resubmit', async () => {
    useSession(['PPK'])
    queueSelects([ppkDokumenRow()])

    const response = await handler(PpkResubmitRoute)(request('POST', { nominalRealisasi: 0 }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Nominal_realisasi wajib untuk dokumen Material' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('rejects a resubmit whose lampiran would miss a required kelengkapan', async () => {
    useSession(['PPK'])
    queueSelects([ppkDokumenRow({ lampiran_urls: [lampiran(OPTIONAL_KELENGKAPAN_ID)] })], requiredKelengkapanRows())

    const response = await handler(PpkResubmitRoute)(request('POST', {}))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Lampiran wajib belum lengkap: Kuitansi' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('rejects a resubmit with zero lampiran, same rule as SUBMIT', async () => {
    useSession(['PPK'])
    queueSelects([ppkDokumenRow({ lampiran_urls: [] })])

    const response = await handler(PpkResubmitRoute)(request('POST', {}))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Minimal upload satu lampiran sebelum mengajukan dokumen' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('rejects a resubmit whose new lampiranUrls is sent explicitly empty', async () => {
    useSession(['PPK'])
    queueSelects([ppkDokumenRow()])

    const response = await handler(PpkResubmitRoute)(request('POST', { lampiranUrls: [] }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Minimal upload satu lampiran sebelum mengajukan dokumen' })
    expect(mocks.dbTransaction).not.toHaveBeenCalled()
  })

  it('goes straight to IN_PPSPM_APPROVAL, clears revision_notes and guards on NEED_REVISION/PPK', async () => {
    useSession(['PPK'])
    queueSelects([ppkDokumenRow()], requiredKelengkapanRows())

    const response = await handler(PpkResubmitRoute)(request('POST', { nominalRealisasi: 2500000 }))

    expect(response.status).toBe(200)
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      status: 'IN_PPSPM_APPROVAL',
      revisionNotes: null,
      nominalRealisasi: '2500000',
    }))
    expect(whereSql().params).toEqual([DOCUMENT_ID, 'NEED_REVISION', 'PPK'])
    expect(mocks.txInsertValues).toHaveBeenCalledWith(expect.objectContaining({ aksi: 'RESUBMIT_PPK' }))
  })

  it('returns 409 when the document left NEED_REVISION/PPK concurrently', async () => {
    useSession(['PPK'])
    queueSelects([ppkDokumenRow()], requiredKelengkapanRows())
    mocks.updatedRowCount.value = 0

    const response = await handler(PpkResubmitRoute)(request('POST', {}))

    expect(response.status).toBe(409)
    expect(mocks.txInsertValues).not.toHaveBeenCalled()
  })

  describe('with replacement lampiran moved from pending', () => {
    const pendingPath = `${USER_ID}/${REQUIRED_KELENGKAPAN_ID}_1778064971564_Kuitansi.pdf`
    const formalPath = `${USER_ID}/${DOCUMENT_ID}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf`
    const moved = [{ index: 0, sourceLogicalPath: pendingPath, targetLogicalPath: formalPath }]
    const body = { lampiranUrls: [{ ...lampiran(REQUIRED_KELENGKAPAN_ID), url: pendingPath }] }

    beforeEach(() => {
      mocks.prepareLocalAttachmentReplacement.mockResolvedValue({
        ok: true,
        plannedAttachments: [{ ...lampiran(REQUIRED_KELENGKAPAN_ID), url: formalPath }],
        operations: [{ index: 0, sourceLogicalPath: pendingPath, targetLogicalPath: formalPath, targetUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
      })
      mocks.executeLocalAttachmentMovements.mockResolvedValue({ ok: true, moved })
      mocks.rollbackLocalAttachmentMovements.mockResolvedValue({ ok: true })
    })

    it('commits with the formal paths and keeps the files when the transaction succeeds', async () => {
      useSession(['PPK'])
      queueSelects([ppkDokumenRow()], requiredKelengkapanRows())

      const response = await handler(PpkResubmitRoute)(request('POST', body))

      expect(response.status).toBe(200)
      expect(mocks.txUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
        lampiranUrls: [expect.objectContaining({ url: formalPath })],
      }))
      expect(mocks.rollbackLocalAttachmentMovements).not.toHaveBeenCalled()
    })

    it('returns moved files to pending and writes no log when the transaction fails', async () => {
      useSession(['PPK'])
      queueSelects([ppkDokumenRow()], requiredKelengkapanRows())
      mocks.dbTransaction.mockRejectedValueOnce(new Error('database unavailable'))

      const response = await handler(PpkResubmitRoute)(request('POST', body))

      expect(response.status).toBe(500)
      expect(mocks.rollbackLocalAttachmentMovements).toHaveBeenCalledWith(moved)
      expect(mocks.txInsertValues).not.toHaveBeenCalled()
    })

    it('returns moved files to pending on a lost race (409)', async () => {
      useSession(['PPK'])
      queueSelects([ppkDokumenRow()], requiredKelengkapanRows())
      mocks.updatedRowCount.value = 0

      const response = await handler(PpkResubmitRoute)(request('POST', body))

      expect(response.status).toBe(409)
      expect(mocks.rollbackLocalAttachmentMovements).toHaveBeenCalledWith(moved)
      expect(mocks.txInsertValues).not.toHaveBeenCalled()
    })
  })
})

function useSession(roles: string[]) {
  mocks.getLocalServerSession.mockResolvedValue({
    userId: USER_ID,
    user: { id: USER_ID, username: 'tester', displayName: 'Tester' },
    roles,
    activeRole: roles[0],
    sessionId: 'session',
  })
}

function queueSelects(...results: unknown[][]) {
  const queue = [...results]
  mocks.dbSelect.mockImplementation(() => {
    const result = queue.shift() ?? []
    const query: Record<string, unknown> = {}
    query.from = () => query
    query.leftJoin = () => query
    query.where = () => query
    query.limit = async () => result
    query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject)
    return query
  })
}

function postRequest(path: string, body?: Record<string, unknown>) {
  return {
    request: new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: { id: DOCUMENT_ID },
  }
}

function request(method: 'POST' | 'PATCH', body: Record<string, unknown>) {
  return {
    request: new Request('http://localhost/api/ppk/resubmit/x', {
      method,
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify(body),
    }),
    params: { id: DOCUMENT_ID },
  }
}

function lampiran(kelengkapanId: string) {
  return {
    kelengkapan_id: kelengkapanId,
    nama: 'Lampiran',
    url: `formal/${DOCUMENT_ID}/file.pdf`,
    uploaded_at: '2026-09-01T00:00:00.000Z',
  }
}

function requiredKelengkapanRows() {
  return [
    { id: REQUIRED_KELENGKAPAN_ID, namaDokumen: 'Kuitansi', required: true },
    { id: OPTIONAL_KELENGKAPAN_ID, namaDokumen: 'Foto Kegiatan', required: false },
  ]
}

function materialColumns() {
  return {
    is_non_material: false,
    kegiatan_jenis_id: KEGIATAN_ID,
    is_ketua_tim: false,
    komponen_id: KOMPONEN_ID,
    jenis_permintaan_id: JENIS_ID,
    kategori_permintaan_id: KATEGORI_ID,
    detail_permintaan_id: null,
  }
}

function pegawaiDokumenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DOCUMENT_ID,
    created_by: USER_ID,
    status: 'NEED_REVISION',
    revision_target: 'USER',
    lampiran_urls: [lampiran(REQUIRED_KELENGKAPAN_ID)],
    nominal_realisasi: '1500000.00',
    ...materialColumns(),
    ...overrides,
  }
}

function ppkDokumenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DOCUMENT_ID,
    status: 'NEED_REVISION',
    revision_target: 'PPK',
    lampiran_urls: [lampiran(REQUIRED_KELENGKAPAN_ID)],
    nominal_realisasi: '1500000.00',
    ...materialColumns(),
    ...overrides,
  }
}
