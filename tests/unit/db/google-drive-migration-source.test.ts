import { existsSync, readFileSync } from 'node:fs'
import { getTableConfig, PgDialect, type PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import { DRIVE_GALAT_KATEGORI_VALUES, DRIVE_JOB_JENIS_VALUES, DRIVE_JOB_STATUS_VALUES, driveJob } from '#/db/schema/app/drive-job'
import { GOOGLE_DRIVE_AKUN_STATUS_VALUES, googleDriveAkun } from '#/db/schema/app/google-drive-akun'
import {
  LAPORAN_TAUTAN_AKSES_VALUES,
  LAPORAN_TAUTAN_DRIVE_STATUS_VALUES,
  laporanTautan,
} from '#/db/schema/app/laporan-tautan'
import {
  LAPORAN_TAUTAN_DRIVE_FILE_KETERANGAN_HAPUS_VALUES,
  LAPORAN_TAUTAN_DRIVE_FILE_SUMBER_VALUES,
  LAPORAN_TAUTAN_DRIVE_FILE_STATUS_VALUES,
  laporanTautanDriveFile,
} from '#/db/schema/app/laporan-tautan-drive-file'
import { AUDIT_ENTITY_TYPE_VALUES, AUDIT_LOG_AKSI_VALUES, auditLog } from '#/db/schema/audit/audit-log'
import { TAUTAN_AKSES, TAUTAN_AKSES_LABEL } from '#/lib/laporan/tautan-shared'
import { createTautanRequestSchema } from '#/lib/schemas/tautan'

const MIGRATION_TAG = '0024_google_drive_tautan'
const MIGRATION_PATH = `drizzle/${MIGRATION_TAG}.sql`
const dialect = new PgDialect()

function readMigration() {
  return readFileSync(MIGRATION_PATH, 'utf8')
}

/** Isi kurung CHECK (...) milik constraint bernama `name` di SQL migrasi. */
function sqlCheckBody(sql: string, name: string): string {
  const marker = `CONSTRAINT "${name}"`
  const at = sql.indexOf(marker)
  expect(at, `constraint ${name} tidak ada di ${MIGRATION_PATH}`).toBeGreaterThanOrEqual(0)
  const checkAt = sql.indexOf('CHECK', at + marker.length)
  const open = sql.indexOf('(', checkAt)
  let depth = 0
  for (let i = open; i < sql.length; i += 1) {
    if (sql[i] === '(') depth += 1
    if (sql[i] === ')') depth -= 1
    if (depth === 0) return sql.slice(open + 1, i)
  }
  throw new Error(`kurung CHECK ${name} tidak seimbang`)
}

function drizzleCheckBody(table: PgTable, name: string): string {
  const found = getTableConfig(table).checks.find((c) => c.name === name)
  expect(found, `check ${name} tidak ada di skema Drizzle`).toBeDefined()
  return dialect.sqlToQuery(found!.value).sql
}

function quotedValues(body: string): string[] {
  return [...body.matchAll(/'([^']*)'/g)].map((m) => m[1])
}

const VALUE_CHECKS: Array<[PgTable, string, readonly string[]]> = [
  [laporanTautan, 'laporan_tautan_akses_check', LAPORAN_TAUTAN_AKSES_VALUES],
  [laporanTautan, 'laporan_tautan_drive_status_check', LAPORAN_TAUTAN_DRIVE_STATUS_VALUES],
  [googleDriveAkun, 'google_drive_akun_status_check', GOOGLE_DRIVE_AKUN_STATUS_VALUES],
  [laporanTautanDriveFile, 'laporan_tautan_drive_file_sumber_check', LAPORAN_TAUTAN_DRIVE_FILE_SUMBER_VALUES],
  [laporanTautanDriveFile, 'laporan_tautan_drive_file_status_check', LAPORAN_TAUTAN_DRIVE_FILE_STATUS_VALUES],
  [
    laporanTautanDriveFile,
    'laporan_tautan_drive_file_keterangan_hapus_check',
    LAPORAN_TAUTAN_DRIVE_FILE_KETERANGAN_HAPUS_VALUES,
  ],
  [driveJob, 'drive_job_jenis_check', DRIVE_JOB_JENIS_VALUES],
  [driveJob, 'drive_job_status_check', DRIVE_JOB_STATUS_VALUES],
  [driveJob, 'drive_job_galat_kategori_check', DRIVE_GALAT_KATEGORI_VALUES],
  [auditLog, 'audit_log_entity_type_check', AUDIT_ENTITY_TYPE_VALUES],
  [auditLog, 'audit_log_aksi_check', AUDIT_LOG_AKSI_VALUES],
]

describe(`${MIGRATION_TAG} migration`, () => {
  it('terdaftar di journal manual sebagai idx 24, satu hari setelah 0023', () => {
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
      entries: { idx: number; tag: string; when: number; version: string; breakpoints: boolean }[]
    }
    const entry = journal.entries.find((e) => e.idx === 24)
    const previous = journal.entries.find((e) => e.idx === 23)

    expect(entry).toMatchObject({ tag: MIGRATION_TAG, version: '7', breakpoints: true })
    expect(entry!.when).toBe(previous!.when + 86_400_000)
    expect(journal.entries.at(-1)?.idx).toBe(24)
    expect(existsSync(MIGRATION_PATH)).toBe(true)
  })

  it.each(VALUE_CHECKS.map(([table, name, values]) => [name, table, values] as const))(
    'CHECK %s di SQL dan di Drizzle memuat persis nilai konstanta',
    (name, table, values) => {
      expect(quotedValues(sqlCheckBody(readMigration(), name))).toEqual([...values])
      expect(quotedValues(drizzleCheckBody(table, name))).toEqual([...values])
    },
  )

  it('memuat constraint konsistensi DRIVE dan sumber file yang sama dengan Drizzle', () => {
    const sql = readMigration()
    const normalize = (body: string) => body
      .replace(/"app"\."[a-z_]+"\./g, '')
      .replace(/"/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    for (const [table, name] of [
      [laporanTautan, 'laporan_tautan_drive_check'],
      [laporanTautanDriveFile, 'laporan_tautan_drive_file_sumber_kolom_check'],
    ] as const) {
      expect(normalize(sqlCheckBody(sql, name))).toBe(normalize(drizzleCheckBody(table, name)))
    }
  })

  it('membuat setiap index, unique, dan foreign key baru dengan nama yang sama persis dengan Drizzle', () => {
    const sql = readMigration()
    const names: string[] = []
    for (const table of [googleDriveAkun, laporanTautanDriveFile, driveJob]) {
      const config = getTableConfig(table)
      names.push(...config.indexes.map((i) => i.config.name!))
      names.push(...config.uniqueConstraints.map((u) => u.getName()!))
      names.push(...config.foreignKeys.map((f) => f.getName()))
      names.push(...config.checks.map((c) => c.name))
    }
    names.push(
      'idx_laporan_tautan_drive_akun',
      'laporan_tautan_drive_akun_id_google_drive_akun_id_fk',
      'laporan_tautan_drive_check',
    )
    expect(getTableConfig(laporanTautan).foreignKeys.map((f) => f.getName()))
      .toContain('laporan_tautan_drive_akun_id_google_drive_akun_id_fk')

    for (const name of names) {
      expect(name.length, `${name} melebihi batas identifier PostgreSQL`).toBeLessThanOrEqual(63)
      expect(sql, `nama ${name} tidak ada di migrasi`).toContain(`"${name}"`)
    }
  })

  it('menambah setiap kolom drive_* laporan_tautan secara idempoten', () => {
    const sql = readMigration()
    const driveColumns = getTableConfig(laporanTautan).columns
      .map((c) => c.name)
      .filter((n) => n.startsWith('drive_'))
    expect(driveColumns).toHaveLength(7)
    for (const column of driveColumns) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS "${column}"`)
    }
  })

  it('idempoten: tidak ada CREATE/ADD tanpa penjaga IF NOT EXISTS', () => {
    const sql = readMigration()
    expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/)
    expect(sql).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/)
    expect(sql).not.toMatch(/ADD COLUMN (?!IF NOT EXISTS)/)
    // Check yang nilainya berubah dibuang lalu ditambah ulang.
    for (const name of ['laporan_tautan_akses_check', 'audit_log_entity_type_check', 'audit_log_aksi_check']) {
      expect(sql).toContain(`DROP CONSTRAINT IF EXISTS "${name}"`)
    }
  })
})

describe('konstanta akses DRIVE (section 01)', () => {
  it('TAUTAN_AKSES dan labelnya mencakup DRIVE', () => {
    expect(TAUTAN_AKSES.DRIVE).toBe('DRIVE')
    expect(TAUTAN_AKSES_LABEL.DRIVE).toBe('Google Drive')
  })

  it('createTautanRequestSchema masih menolak akses DRIVE (dibuka di section 08)', () => {
    const base = {
      sumber: 'LAPORAN_KEGIATAN',
      judul: 'Laporan',
      dokumen_ids: ['11111111-1111-4111-8111-111111111111'],
    }
    expect(createTautanRequestSchema.safeParse({ ...base, akses: 'PUBLIK' }).success).toBe(true)
    expect(createTautanRequestSchema.safeParse({ ...base, akses: 'DRIVE' }).success).toBe(false)
  })
})
