// In-memory stand-in for the drizzle `db` used by the laporan endpoints, so a
// test can run the REAL handler code — joins, WHERE filters and all — against
// a small fixture instead of hand-mocking each query's result. Only the query
// shapes the laporan endpoints use are supported:
//   select/selectDistinct → from → (inner|left)Join* → where? → orderBy? → limit?
// The drizzle operators the endpoints use are replaced by `fakeOperators`
// (plain objects evaluated here), so a test file must mock 'drizzle-orm':
//   vi.mock('drizzle-orm', async (importActual) => ({
//     ...(await importActual<typeof import('drizzle-orm')>()),
//     ...(await import('./helpers/fake-laporan-db')).fakeOperators,
//   }))
// This module must NOT import 'drizzle-orm' itself (it is being mocked).

type Table = object
type FixtureRow = Record<string, unknown>
type JoinedRow = Map<Table, FixtureRow | null>

type Condition =
  | { op: 'eq' | 'ne' | 'gte' | 'lte'; left: unknown; right: unknown }
  | { op: 'inArray' | 'notInArray'; left: unknown; values: readonly unknown[] }
  | { op: 'isNull' | 'isNotNull'; left: unknown }
  | { op: 'and' | 'or'; clauses: Condition[] }

const defined = (clauses: Array<Condition | undefined>) =>
  clauses.filter((clause): clause is Condition => clause !== undefined)

export const fakeOperators = {
  eq: (left: unknown, right: unknown): Condition => ({ op: 'eq', left, right }),
  ne: (left: unknown, right: unknown): Condition => ({ op: 'ne', left, right }),
  gte: (left: unknown, right: unknown): Condition => ({ op: 'gte', left, right }),
  lte: (left: unknown, right: unknown): Condition => ({ op: 'lte', left, right }),
  inArray: (left: unknown, values: readonly unknown[]): Condition => ({ op: 'inArray', left, values }),
  notInArray: (left: unknown, values: readonly unknown[]): Condition => ({ op: 'notInArray', left, values }),
  isNull: (left: unknown): Condition => ({ op: 'isNull', left }),
  isNotNull: (left: unknown): Condition => ({ op: 'isNotNull', left }),
  and: (...clauses: Array<Condition | undefined>): Condition => ({ op: 'and', clauses: defined(clauses) }),
  or: (...clauses: Array<Condition | undefined>): Condition => ({ op: 'or', clauses: defined(clauses) }),
  desc: (column: unknown) => column,
}

type Column = { table: Table; name: string }

function isColumn(value: unknown): value is Column {
  return typeof value === 'object'
    && value !== null
    && 'table' in value
    && 'name' in value
    && 'columnType' in value
}

const jsNameCache = new Map<Column, string>()

// Fixture rows are keyed by the schema's JS property names (e.g. kegiatanJenisId).
function jsName(column: Column): string {
  const cached = jsNameCache.get(column)
  if (cached) return cached
  const name = Object.keys(column.table).find((key) => (column.table as Record<string, unknown>)[key] === column)
  if (!name) throw new Error(`fake db: unknown column ${column.name}`)
  jsNameCache.set(column, name)
  return name
}

function valueOf(operand: unknown, row: JoinedRow): unknown {
  if (!isColumn(operand)) return operand
  const record = row.get(operand.table)
  if (!record) return null
  return record[jsName(operand)] ?? null
}

function evaluate(condition: Condition, row: JoinedRow): boolean {
  switch (condition.op) {
    case 'and': return condition.clauses.every((clause) => evaluate(clause, row))
    case 'or': return condition.clauses.some((clause) => evaluate(clause, row))
    case 'isNull': return valueOf(condition.left, row) === null
    case 'isNotNull': return valueOf(condition.left, row) !== null
    case 'inArray': return condition.values.includes(valueOf(condition.left, row))
    case 'notInArray': return !condition.values.includes(valueOf(condition.left, row))
    default: {
      const left = valueOf(condition.left, row)
      const right = valueOf(condition.right, row)
      // SQL semantics: any comparison with NULL is not true.
      if (left === null || right === null) return false
      if (condition.op === 'eq') return left === right
      if (condition.op === 'ne') return left !== right
      if (condition.op === 'gte') return String(left) >= String(right)
      return String(left) <= String(right)
    }
  }
}

let tables = new Map<Table, FixtureRow[]>()

export function setFakeTables(next: Map<Table, FixtureRow[]>) {
  tables = next
}

function createQuery(selection: Record<string, unknown>, distinct: boolean) {
  let rows: JoinedRow[] = []

  const project = () => {
    const projected = rows.map((row) => Object.fromEntries(
      Object.entries(selection).map(([alias, column]) => [alias, valueOf(column, row)]),
    ))
    if (!distinct) return projected
    const seen = new Set<string>()
    return projected.filter((row) => {
      const key = JSON.stringify(row)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const join = (table: Table, condition: Condition, keepUnmatched: boolean) => {
    rows = rows.flatMap((row) => {
      const matches = (tables.get(table) ?? [])
        .map((record) => new Map([...row, [table, record]]))
        .filter((joined) => evaluate(condition, joined))
      if (matches.length > 0 || !keepUnmatched) return matches
      return [new Map([...row, [table, null]])]
    })
  }

  const query = {
    from(table: Table) {
      rows = (tables.get(table) ?? []).map((record) => new Map([[table, record]]))
      return query
    },
    innerJoin(table: Table, condition: Condition) {
      join(table, condition, false)
      return query
    },
    leftJoin(table: Table, condition: Condition) {
      join(table, condition, true)
      return query
    },
    where(condition: Condition | undefined) {
      if (condition) rows = rows.filter((row) => evaluate(condition, row))
      return query
    },
    orderBy() {
      return query
    },
    limit(count: number) {
      rows = rows.slice(0, count)
      return query
    },
    then<T>(resolve: (value: FixtureRow[]) => T, reject?: (reason: unknown) => T) {
      return Promise.resolve().then(project).then(resolve, reject)
    },
  }

  return query
}

export const fakeDb = {
  select: (selection: Record<string, unknown>) => createQuery(selection, false),
  selectDistinct: (selection: Record<string, unknown>) => createQuery(selection, true),
}
