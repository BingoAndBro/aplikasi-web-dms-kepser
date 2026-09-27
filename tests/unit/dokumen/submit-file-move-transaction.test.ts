import { mkdtemp, mkdir, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Real-filesystem check of the submit contract: pending -> formal moves run
// inside the submit transaction. A failed move leaves no committed dokumen/log
// row and every file back in pending; the happy path commits and formalizes.

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const FUNGSI_ID = '22222222-2222-4222-8222-222222222222'
const KEGIATAN_ID = '33333333-3333-4333-8333-333333333333'
const DOKUMEN_ID = '55555555-5555-4555-8555-555555555555'
const KELENGKAPAN_ID = '66666666-6666-4666-8666-666666666666'
const KELENGKAPAN_ID_2 = '77777777-7777-4777-8777-777777777777'
const KOMPONEN_ID = '88888888-8888-4888-8888-888888888888'
const PENDING_1 = `${OWNER_ID}/${KELENGKAPAN_ID}_1778064971564_Laporan.pdf`
const PENDING_2 = `${OWNER_ID}/${KELENGKAPAN_ID_2}_1778064971565_Foto.pdf`

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  createLiveLocalSubmitDrizzleAdapter: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
}))

vi.mock('#/lib/dokumen/local-submit-drizzle-adapter', () => ({
  createLiveLocalSubmitDrizzleAdapter: mocks.createLiveLocalSubmitDrizzleAdapter,
}))

import { Route } from '#/routes/api/dokumen/submit'

type SubmitHandler = (args: { request: Request }) => Promise<Response>
const submitHandler = (Route as unknown as {
  options: { server: { handlers: { POST: SubmitHandler } } }
}).options.server.handlers.POST

type CommittedRow = { table: 'dokumen' | 'log'; values: Record<string, unknown> }

let storageRoot: string
let committed: CommittedRow[]
let previousStorageRoot: string | undefined

beforeEach(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), 'dms-submit-move-'))
  previousStorageRoot = process.env.DMS_LOCAL_STORAGE_ROOT
  process.env.DMS_LOCAL_STORAGE_ROOT = storageRoot
  committed = []

  mocks.getLocalServerSession.mockResolvedValue({
    user: { id: OWNER_ID, username: 'pegawai.test', displayName: 'Pegawai Test' },
    userId: OWNER_ID,
    roles: ['PEGAWAI'],
    activeRole: 'PEGAWAI',
    sessionId: 'local-session-id',
  })

  await writePending(PENDING_1)
  await writePending(PENDING_2)
})

afterEach(async () => {
  if (previousStorageRoot === undefined) delete process.env.DMS_LOCAL_STORAGE_ROOT
  else process.env.DMS_LOCAL_STORAGE_ROOT = previousStorageRoot
  await rm(storageRoot, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('submit moves pending files inside the transaction (real filesystem)', () => {
  it('commits the dokumen and log and formalizes every file on success', async () => {
    mocks.createLiveLocalSubmitDrizzleAdapter.mockResolvedValue(createInMemoryAdapter())

    const response = await submitHandler({ request: submitRequest() })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(committed.map(row => row.table)).toEqual(['dokumen', 'log'])
    expect(await exists(PENDING_1)).toBe(false)
    expect(await exists(PENDING_2)).toBe(false)

    const formalPaths = (body.dokumen.lampiran_urls as Array<{ url: string }>).map(lampiran => lampiran.url)
    expect(formalPaths).toHaveLength(2)
    for (const formalPath of formalPaths) {
      expect(formalPath).toMatch(new RegExp(`^${OWNER_ID}/temp-id/[0-9a-f-]{36}\\.pdf$`))
      expect(await exists(formalPath)).toBe(true)
    }
  })

  it('commits nothing and leaves every file in pending when a move fails mid-way', async () => {
    // The second pending file disappears after preflight but before its move
    // (inside the transaction), so move #1 succeeds and move #2 fails.
    mocks.createLiveLocalSubmitDrizzleAdapter.mockResolvedValue(createInMemoryAdapter({
      beforeOperation: () => unlink(physical(PENDING_2)),
    }))

    const response = await submitHandler({ request: submitRequest() })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Gagal mengajukan dokumen, silakan coba lagi' })
    expect(committed).toEqual([])
    // File #1 was moved, then put back in pending by the rollback.
    expect(await exists(PENDING_1)).toBe(true)
    expect(await listFormalFiles()).toEqual([])
  })

  it('puts moved files back in pending when the commit itself fails', async () => {
    mocks.createLiveLocalSubmitDrizzleAdapter.mockResolvedValue(createInMemoryAdapter({ failCommit: true }))

    const response = await submitHandler({ request: submitRequest() })

    expect(response.status).toBe(500)
    expect(committed).toEqual([])
    expect(await exists(PENDING_1)).toBe(true)
    expect(await exists(PENDING_2)).toBe(true)
    expect(await listFormalFiles()).toEqual([])
  })
})

function physical(logicalPath: string) {
  return path.join(storageRoot, ...logicalPath.split('/'))
}

async function writePending(logicalPath: string) {
  await mkdir(path.dirname(physical(logicalPath)), { recursive: true })
  await writeFile(physical(logicalPath), '%PDF-1.4 test')
}

async function exists(logicalPath: string) {
  try {
    return (await stat(physical(logicalPath))).isFile()
  } catch {
    return false
  }
}

async function listFormalFiles() {
  try {
    return await readdir(path.join(storageRoot, OWNER_ID, 'temp-id'))
  } catch {
    return []
  }
}

function submitRequest() {
  return new Request('http://localhost/api/dokumen/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
    body: JSON.stringify({
      fungsiId: FUNGSI_ID,
      kegiatanJenisId: KEGIATAN_ID,
      isKetuaTim: false,
      tahun: 2024,
      tanggal: '2024-01-15',
      nominal_realisasi: 100000,
      is_non_material: false,
      komponenId: KOMPONEN_ID,
      lampiranUrls: [
        { kelengkapan_id: KELENGKAPAN_ID, nama: 'Laporan', url: PENDING_1, uploaded_at: '2024-01-15T00:00:00.000Z' },
        { kelengkapan_id: KELENGKAPAN_ID_2, nama: 'Foto', url: PENDING_2, uploaded_at: '2024-01-15T00:00:00.000Z' },
      ],
    }),
  })
}

// Rows written inside the transaction become visible (`committed`) only when
// the operation resolves and the commit succeeds — like a real rollback.
function createInMemoryAdapter(options: {
  beforeOperation?: () => Promise<void>
  failCommit?: boolean
} = {}) {
  return {
    selectKegiatanById: async (id: string) => ({ id, nama: 'Kegiatan Pengujian', fungsiId: FUNGSI_ID }),
    selectRequiredKelengkapan: async () => [{ id: KELENGKAPAN_ID, namaDokumen: 'Laporan', required: true }],
    selectKomponenById: async (id: string) => ({ id, nama: 'Komponen Pengujian' }),
    selectJenisPermintaanById: async (id: string) => ({ id, nama: 'Jenis' }),
    selectKategoriPermintaanById: async (id: string) => ({ id, nama: 'Kategori' }),
    selectDetailPermintaanById: async (id: string) => ({ id, nama: 'Detail' }),
    selectKetuaTimAssignmentExists: async () => true,
    async withSubmitTransaction(operation: (tx: unknown) => Promise<unknown>) {
      const pending: CommittedRow[] = []
      await options.beforeOperation?.()
      const result = await operation({
        async insertDokumen(values: Record<string, unknown>) {
          pending.push({ table: 'dokumen', values })
          return {
            ...values,
            id: DOKUMEN_ID,
            createdAt: '2024-01-15T00:00:00.000Z',
            updatedAt: '2024-01-15T00:00:00.000Z',
          }
        },
        async updateDokumenStatus() {},
        async insertLog(values: Record<string, unknown>) {
          pending.push({ table: 'log', values })
        },
      })
      if (options.failCommit) throw new Error('commit failed')
      committed.push(...pending)
      return result
    },
  }
}
