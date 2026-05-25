import { beforeEach, describe, expect, it, vi } from 'vitest'

import { arsip } from '#/db/schema/arsip'
import {
  getUnifiedArchiveAggregateForDatabase,
  type UnifiedArchiveAggregateExportDatabase,
} from '#/lib/archive/unified-archive-aggregate-export'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const authMocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: authMocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
}))

import { Route as AggregateRoute } from '#/routes/api/arsiparis/arsip/aggregate'

type RouteGetHandler = (args: { request: Request }) => Promise<Response>

const aggregateGetHandler = (AggregateRoute as unknown as {
  options: { server: { handlers: { GET: RouteGetHandler } } }
}).options.server.handlers.GET

describe('unified archive aggregate helper', () => {
  it('returns safe counts by status, source type, and status/source pair', async () => {
    const database = createFakeAggregateDatabase([
      aggregateRow('AKTIF', 'WORKFLOW', '2'),
      aggregateRow('AKTIF', 'MANUAL', 3),
      aggregateRow('INAKTIF', 'WORKFLOW', 1),
      aggregateRow('USUL_MUSNAH', 'MANUAL', 4),
      aggregateRow('DIMUSNAHKAN', 'LEGACY', 5),
    ])

    const aggregate = await getUnifiedArchiveAggregateForDatabase(database)

    expect(aggregate).toEqual({
      totalArchives: 15,
      countByStatus: {
        AKTIF: 5,
        INAKTIF: 1,
        USUL_MUSNAH: 4,
        DIMUSNAHKAN: 5,
      },
      countBySourceType: {
        WORKFLOW: 3,
        MANUAL: 7,
      },
      countByStatusAndSourceType: {
        AKTIF: { WORKFLOW: 2, MANUAL: 3 },
        INAKTIF: { WORKFLOW: 1, MANUAL: 0 },
        USUL_MUSNAH: { WORKFLOW: 0, MANUAL: 4 },
        DIMUSNAHKAN: { WORKFLOW: 0, MANUAL: 0 },
      },
      unknownSourceTypeCount: 5,
    })
    expect(database.calls).toContainEqual(['from', 'arsip'])
    expect(database.calls).toContainEqual(['groupBy', 'arsip'])
    expectNoMutationCalls(database)
    expectNoSensitiveOutput(aggregate)
  })
})

describe('unified archive aggregate route auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 for unauthenticated requests', async () => {
    authMocks.getLocalServerSession.mockResolvedValueOnce(null)

    const response = await aggregateGetHandler({
      request: new Request('http://localhost/api/arsiparis/arsip/aggregate'),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 403 for ADMIN-only and non-Kasubag users', async () => {
    for (const roles of [['ADMIN'], ['PEGAWAI']]) {
      authMocks.getLocalServerSession.mockResolvedValueOnce(createSession(roles))

      const response = await aggregateGetHandler({
        request: new Request('http://localhost/api/arsiparis/arsip/aggregate'),
      })

      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'Akses ditolak' })
    }
  })
})

type FakeAggregateDatabase = UnifiedArchiveAggregateExportDatabase & {
  calls: unknown[]
  insert: (...args: unknown[]) => never
  update: (...args: unknown[]) => never
  delete: (...args: unknown[]) => never
  transaction: (...args: unknown[]) => never
}

type FakeQuery = {
  from: (table: unknown) => FakeQuery
  groupBy: (...args: unknown[]) => Promise<unknown[]>
}

function createFakeAggregateDatabase(aggregateRows: unknown[]): FakeAggregateDatabase {
  const calls: unknown[] = []
  const mutation = (operation: string): never => {
    calls.push([operation])
    throw new Error(`${operation} must not be called by unified archive aggregate`)
  }

  return {
    calls,
    select(projection) {
      calls.push(['select', Object.keys(projection).sort()])

      let selectedTable: unknown
      const query: FakeQuery = {
        from(table) {
          selectedTable = table
          calls.push(['from', tableName(table)])
          return query
        },
        groupBy() {
          calls.push(['groupBy', tableName(selectedTable)])
          return Promise.resolve(aggregateRows)
        },
      }

      return query
    },
    insert: () => mutation('insert'),
    update: () => mutation('update'),
    delete: () => mutation('delete'),
    transaction: () => mutation('transaction'),
  } as FakeAggregateDatabase
}

function aggregateRow(statusArsip: string, sourceType: string, count: string | number) {
  return {
    status_arsip: statusArsip,
    source_type: sourceType,
    count,
  }
}

function createSession(roles: string[]) {
  return {
    user: {
      id: USER_ID,
      email: 'user@example.test',
    },
    userId: USER_ID,
    email: 'user@example.test',
    roles,
    activeRole: roles[0],
    sessionId: 'test-session-id',
  }
}

function tableName(table: unknown): string {
  if (table === arsip) return 'arsip'
  return 'unknown'
}

function expectNoMutationCalls(database: FakeAggregateDatabase): void {
  expect(database.calls).not.toContainEqual(['insert'])
  expect(database.calls).not.toContainEqual(['update'])
  expect(database.calls).not.toContainEqual(['delete'])
  expect(database.calls).not.toContainEqual(['transaction'])
}

function expectNoSensitiveOutput(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain('logical_path')
  expect(serialized).not.toContain('physical_path')
  expect(serialized).not.toContain('signedUrl')
  expect(serialized).not.toContain('signed_url')
  expect(serialized).not.toContain('token')
  expect(serialized).not.toContain('secret')
  expect(serialized).not.toContain('D:\\')
  expect(serialized).not.toContain('/storage/')
  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('select ')
  expect(serialized).not.toContain('from ')
  expect(serialized).not.toContain('session')
  expect(serialized).not.toContain('cookie')
}
