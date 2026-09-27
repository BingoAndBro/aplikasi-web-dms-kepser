import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// D-23: the 11 master-data GET endpoints (dropdown data used across roles)
// used to be readable without a session. They now require any authenticated
// session (no role restriction — every caller page is already role-guarded).

const mocks = vi.hoisted(() => ({
  requireAnyLocalSession: vi.fn(),
  dbSelect: vi.fn(),
}))

// The routes call requireAnyLocalSession directly (not getLocalServerSession),
// and it must be mocked here rather than via getLocalServerSession: it's
// defined in the same original module, so an ESM `importOriginal` override of
// getLocalServerSession would not reach requireAnyLocalSession's internal call.
vi.mock('#/lib/auth/local-server-auth', () => ({
  requireAnyLocalSession: mocks.requireAnyLocalSession,
}))

vi.mock('#/db/client', () => ({
  db: { select: mocks.dbSelect },
}))

function selectableChain() {
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.leftJoin = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.orderBy = vi.fn(async () => [])
  chain.limit = vi.fn(async () => [])
  return chain
}

type Handler = (args: { request: Request; params?: Record<string, string> }) => Promise<Response>

function getHandler(route: unknown): Handler {
  return (route as { options: { server: { handlers: { GET: Handler } } } })
    .options.server.handlers.GET
}

const ROUTE_IMPORTS = [
  () => import('#/routes/api/master-fungsi').then((m) => m.Route),
  () => import('#/routes/api/master-kegiatan').then((m) => m.Route),
  () => import('#/routes/api/master-komponen').then((m) => m.Route),
  () => import('#/routes/api/master-komponen.$id').then((m) => m.Route),
  () => import('#/routes/api/master-jenis').then((m) => m.Route),
  () => import('#/routes/api/master-jenis.$id').then((m) => m.Route),
  () => import('#/routes/api/master-kategori').then((m) => m.Route),
  () => import('#/routes/api/master-kategori.$id').then((m) => m.Route),
  () => import('#/routes/api/master-detail').then((m) => m.Route),
  () => import('#/routes/api/master-detail.$id').then((m) => m.Route),
  () => import('#/routes/api/master-kelengkapan').then((m) => m.Route),
] as const

const ROUTE_NAMES = [
  'master-fungsi',
  'master-kegiatan',
  'master-komponen',
  'master-komponen/$id',
  'master-jenis',
  'master-jenis/$id',
  'master-kategori',
  'master-kategori/$id',
  'master-detail',
  'master-detail/$id',
  'master-kelengkapan',
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mocks.dbSelect.mockImplementation(() => selectableChain())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('master-data GET endpoints require a session (D-23)', () => {
  it.each(ROUTE_IMPORTS.map((load, i) => [ROUTE_NAMES[i], load] as const))(
    '%s returns 401 and reads nothing without a session',
    async (_name, load) => {
      mocks.requireAnyLocalSession.mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))
      const route = await load()

      const response = await getHandler(route)({
        request: new Request('http://localhost/api/x'),
        params: { id: 'irrelevant' },
      })

      expect(response.status).toBe(401)
      expect(mocks.dbSelect).not.toHaveBeenCalled()
    },
  )

  it.each(ROUTE_IMPORTS.map((load, i) => [ROUTE_NAMES[i], load] as const))(
    '%s reads normally for any authenticated role',
    async (_name, load) => {
      mocks.requireAnyLocalSession.mockResolvedValue({
        user: { id: 'u1', username: 'pegawai' },
        userId: 'u1',
        roles: ['PEGAWAI'],
        activeRole: 'PEGAWAI',
        sessionId: 's1',
      })
      const route = await load()

      const response = await getHandler(route)({
        request: new Request('http://localhost/api/x'),
        params: { id: 'irrelevant' },
      })

      // Single-item ($id) endpoints 404 on an unknown id with this empty-row
      // stub; the point here is only that the session guard let the query run.
      expect(response.status).not.toBe(401)
      expect(mocks.dbSelect).toHaveBeenCalled()
    },
  )
})
