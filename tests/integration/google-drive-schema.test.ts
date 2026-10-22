// Integration test (section 01 tautan Google Drive): migrasi 0024 membentuk
// tabel google_drive_akun, laporan_tautan_drive_file, drive_job, dan kolom
// drive_* pada laporan_tautan, dengan constraint yang menjadi jaring pengaman
// balapan. Menyambung ke PostgreSQL ASLI karena yang diuji adalah partial
// unique index dan CHECK di database, hal yang tidak bisa dibuktikan oleh tes
// unit dengan `db` tiruan.
//
// Prasyarat dan cara jalan: lihat dokumen-transaksi-permintaan-fk.test.ts
// (`pnpm test:integration`, Postgres lokal + migrasi + seed). Semua data uji
// dibuat di dalam transaksi yang selalu di-ROLLBACK.

import { randomBytes, randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

if (!process.env.DATABASE_URL) {
  process.loadEnvFile('.env')
}

type ClientModule = typeof import('#/db/client')
type AppSchema = typeof import('#/db/schema/app')
type Tx = Parameters<Parameters<ClientModule['db']['transaction']>[0]>[0]

let client: ClientModule
let app: AppSchema
let userId: string

class Rollback extends Error {}

beforeAll(async () => {
  client = await import('#/db/client')
  app = await import('#/db/schema/app')
  const user = await client.pool.query<{ id: string }>('select id from auth.users limit 1')
  if (!user.rows[0]) {
    throw new Error('DB tes perlu minimal 1 user (jalankan seed, lihat sections/index.md).')
  }
  userId = user.rows[0].id
})

afterAll(async () => {
  await client?.pool.end()
})

async function inRollback(run: (tx: Tx) => Promise<void>) {
  await expect(client.db.transaction(async (tx) => {
    await run(tx)
    throw new Rollback()
  })).rejects.toBeInstanceOf(Rollback)
}

function pgErrorOf(error: unknown): { code?: string; constraint?: string } {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } }
  return e.cause?.code ? e.cause : e
}

/** Jalankan `run` di savepoint dan pastikan PostgreSQL menolaknya dengan kode tertentu. */
async function expectPgError(tx: Tx, code: string, constraint: string, run: (sp: Tx) => Promise<unknown>) {
  let caught: unknown
  try {
    await tx.transaction(async (sp) => {
      await run(sp)
    })
  } catch (error) {
    caught = error
  }
  expect(caught, `diharapkan galat ${code} (${constraint})`).toBeDefined()
  expect(pgErrorOf(caught)).toMatchObject({ code, constraint })
}

async function insertAkun(tx: Tx, values: { email?: string; status: 'AKTIF' | 'NONAKTIF' | 'DIPUTUS' }) {
  const [row] = await tx.insert(app.googleDriveAkun).values({
    email: values.email ?? `uji-${randomUUID()}@example.test`,
    status: values.status,
    dihubungkanOleh: userId,
  }).returning({ id: app.googleDriveAkun.id })
  return row.id
}

function tautanValues(overrides: Partial<typeof import('#/db/schema/app').laporanTautan.$inferInsert> = {}) {
  return {
    token: randomBytes(24).toString('base64url'),
    sumber: 'LAPORAN_KEGIATAN' as const,
    judul: 'Uji skema Drive',
    createdBy: userId,
    ...overrides,
  }
}

async function insertDriveTautan(tx: Tx, akunId: string) {
  const [row] = await tx.insert(app.laporanTautan).values(tautanValues({
    akses: 'DRIVE',
    driveAkunId: akunId,
    driveStatus: 'MENUNGGU',
  })).returning({ id: app.laporanTautan.id })
  return row.id
}

function fileValues(tautanId: string, kunci = `DOKUMEN:${randomUUID()}:0`) {
  return {
    tautanId,
    sumber: 'DOKUMEN' as const,
    dokumenId: randomUUID(),
    lampiranIndex: 0,
    kunciLampiran: kunci,
    namaFile: 'Lampiran.pdf',
    labelDokumen: 'Dokumen Uji',
    urutan: 1,
    contentType: 'application/pdf',
  }
}

describe('struktur migrasi 0024', () => {
  it.each([
    ['google_drive_akun', () => app.googleDriveAkun],
    ['laporan_tautan_drive_file', () => app.laporanTautanDriveFile],
    ['drive_job', () => app.driveJob],
    ['laporan_tautan', () => app.laporanTautan],
  ] as const)('kolom app.%s sama persis dengan skema Drizzle', async (tableName, table) => {
    const result = await client.pool.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'app' and table_name = $1`,
      [tableName],
    )
    const actual = result.rows.map((r) => r.column_name).sort()
    const expected = getTableConfig(table() as PgTable).columns.map((c) => c.name).sort()
    expect(actual).toEqual(expected)
  })

  it('semua index, unique, FK, dan CHECK Drizzle ada di database', async () => {
    const expectedConstraints: string[] = []
    const expectedIndexes: string[] = []
    for (const table of [app.googleDriveAkun, app.laporanTautanDriveFile, app.driveJob, app.laporanTautan]) {
      const config = getTableConfig(table as PgTable)
      expectedIndexes.push(...config.indexes.map((i) => i.config.name!))
      expectedConstraints.push(
        ...config.uniqueConstraints.map((u) => u.getName()!),
        ...config.foreignKeys.map((f) => f.getName()),
        ...config.checks.map((c) => c.name),
      )
    }

    const constraints = await client.pool.query<{ conname: string }>(
      `select conname from pg_constraint c
         join pg_namespace n on n.oid = c.connamespace
        where n.nspname = 'app'`,
    )
    const indexes = await client.pool.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes where schemaname = 'app'`,
    )
    expect(constraints.rows.map((r) => r.conname)).toEqual(expect.arrayContaining(expectedConstraints))
    expect(indexes.rows.map((r) => r.indexname)).toEqual(expect.arrayContaining(expectedIndexes))

    const def = (name: string) => indexes.rows.find((r) => r.indexname === name)?.indexdef ?? ''
    expect(def('google_drive_akun_satu_aktif')).toMatch(/UNIQUE INDEX .*WHERE \(status = 'AKTIF'::text\)/)
    expect(def('google_drive_akun_email_belum_diputus')).toMatch(/UNIQUE INDEX .*WHERE \(status <> 'DIPUTUS'::text\)/)
    expect(def('drive_job_satu_menunggu')).toMatch(/UNIQUE INDEX .*\(tautan_id, jenis\) WHERE \(status = 'MENUNGGU'::text\)/)
  })
})

describe('app.google_drive_akun', () => {
  it('boleh dua akun NONAKTIF; email sama boleh sekali DIPUTUS dan sekali AKTIF', async () => {
    await inRollback(async (tx) => {
      await insertAkun(tx, { status: 'NONAKTIF' })
      await insertAkun(tx, { status: 'NONAKTIF' })
      const email = `ulang-${randomUUID()}@example.test`
      await insertAkun(tx, { email, status: 'DIPUTUS' })
      await insertAkun(tx, { email, status: 'AKTIF' })
    })
  })

  it('menolak akun AKTIF kedua (23505)', async () => {
    await inRollback(async (tx) => {
      // DB tes mungkin sudah punya akun AKTIF dari tes lain; nonaktifkan dulu di dalam transaksi ini.
      await tx.update(app.googleDriveAkun)
        .set({ status: 'NONAKTIF' })
        .where(eq(app.googleDriveAkun.status, 'AKTIF'))
      await insertAkun(tx, { status: 'AKTIF' })
      await expectPgError(tx, '23505', 'google_drive_akun_satu_aktif', (sp) => insertAkun(sp, { status: 'AKTIF' }))
    })
  })

  it('menolak dua akun belum DIPUTUS dengan email sama (23505)', async () => {
    await inRollback(async (tx) => {
      const email = `kembar-${randomUUID()}@example.test`
      await insertAkun(tx, { email, status: 'NONAKTIF' })
      await expectPgError(
        tx,
        '23505',
        'google_drive_akun_email_belum_diputus',
        (sp) => insertAkun(sp, { email, status: 'NONAKTIF' }),
      )
    })
  })

  it('menolak status di luar daftar (23514)', async () => {
    await inRollback(async (tx) => {
      await expectPgError(
        tx,
        '23514',
        'google_drive_akun_status_check',
        (sp) => insertAkun(sp, { status: 'LAINNYA' as never }),
      )
    })
  })
})

describe('app.laporan_tautan akses DRIVE', () => {
  it('tautan LOGIN lama tanpa kolom drive tetap bisa dibuat, drive_dokumen_dilewati bawaan []', async () => {
    await inRollback(async (tx) => {
      const [row] = await tx.insert(app.laporanTautan).values(tautanValues()).returning()
      expect(row).toMatchObject({ akses: 'LOGIN', driveAkunId: null, driveStatus: null, driveDokumenDilewati: [] })
    })
  })

  it('tautan DRIVE dengan drive_akun_id dan drive_status bisa dibuat', async () => {
    await inRollback(async (tx) => {
      const akunId = await insertAkun(tx, { status: 'NONAKTIF' })
      const tautanId = await insertDriveTautan(tx, akunId)
      expect(tautanId).toBeTruthy()
    })
  })

  it('menolak DRIVE tanpa drive_akun_id dan LOGIN dengan drive_status (23514)', async () => {
    await inRollback(async (tx) => {
      const akunId = await insertAkun(tx, { status: 'NONAKTIF' })
      await expectPgError(tx, '23514', 'laporan_tautan_drive_check', (sp) => sp.insert(app.laporanTautan)
        .values(tautanValues({ akses: 'DRIVE', driveStatus: 'MENUNGGU' })))
      await expectPgError(tx, '23514', 'laporan_tautan_drive_check', (sp) => sp.insert(app.laporanTautan)
        .values(tautanValues({ akses: 'DRIVE', driveAkunId: akunId })))
      await expectPgError(tx, '23514', 'laporan_tautan_drive_check', (sp) => sp.insert(app.laporanTautan)
        .values(tautanValues({ akses: 'LOGIN', driveStatus: 'MENUNGGU', driveAkunId: akunId })))
    })
  })

  it('menolak akses dan drive_status di luar daftar (23514)', async () => {
    await inRollback(async (tx) => {
      const akunId = await insertAkun(tx, { status: 'NONAKTIF' })
      await expectPgError(tx, '23514', 'laporan_tautan_akses_check', (sp) => sp.insert(app.laporanTautan)
        .values(tautanValues({ akses: 'LAINNYA' as never })))
      await expectPgError(tx, '23514', 'laporan_tautan_drive_status_check', (sp) => sp.insert(app.laporanTautan)
        .values(tautanValues({ akses: 'DRIVE', driveAkunId: akunId, driveStatus: 'LAINNYA' as never })))
    })
  })

  it('akun yang masih dipakai tautan tidak bisa dihapus (FK restrict, 23503)', async () => {
    await inRollback(async (tx) => {
      const akunId = await insertAkun(tx, { status: 'NONAKTIF' })
      await insertDriveTautan(tx, akunId)
      await expectPgError(
        tx,
        '23503',
        'laporan_tautan_drive_akun_id_google_drive_akun_id_fk',
        (sp) => sp.execute(sql`delete from app.google_drive_akun where id = ${akunId}`),
      )
    })
  })
})

describe('app.laporan_tautan_drive_file', () => {
  it('menerima dokumen_id yang tidak ada di dokumen_transaksi (tanpa FK) dan status bawaan MENUNGGU', async () => {
    await inRollback(async (tx) => {
      const tautanId = await insertDriveTautan(tx, await insertAkun(tx, { status: 'NONAKTIF' }))
      const [row] = await tx.insert(app.laporanTautanDriveFile).values(fileValues(tautanId)).returning()
      expect(row.status).toBe('MENUNGGU')
      await tx.insert(app.laporanTautanDriveFile).values({
        tautanId,
        sumber: 'MANUAL_ARSIP',
        manualArsipId: randomUUID(),
        attachmentId: randomUUID(),
        kunciLampiran: `MANUAL:${randomUUID()}:${randomUUID()}`,
        namaFile: 'Manual.pdf',
        labelDokumen: 'Dokumen Tambahan',
        urutan: 2,
        contentType: 'application/pdf',
      })
    })
  })

  it('menolak baris kembar (tautan_id, kunci_lampiran) (23505)', async () => {
    await inRollback(async (tx) => {
      const tautanId = await insertDriveTautan(tx, await insertAkun(tx, { status: 'NONAKTIF' }))
      const kunci = `DOKUMEN:${randomUUID()}:0`
      await tx.insert(app.laporanTautanDriveFile).values(fileValues(tautanId, kunci))
      await expectPgError(
        tx,
        '23505',
        'laporan_tautan_drive_file_kunci_unique',
        (sp) => sp.insert(app.laporanTautanDriveFile).values(fileValues(tautanId, kunci)),
      )
    })
  })

  it('menolak sumber DOKUMEN tanpa lampiran_index dan MANUAL_ARSIP tanpa attachment_id (23514)', async () => {
    await inRollback(async (tx) => {
      const tautanId = await insertDriveTautan(tx, await insertAkun(tx, { status: 'NONAKTIF' }))
      await expectPgError(tx, '23514', 'laporan_tautan_drive_file_sumber_kolom_check', (sp) => sp
        .insert(app.laporanTautanDriveFile)
        .values({ ...fileValues(tautanId), lampiranIndex: null }))
      await expectPgError(tx, '23514', 'laporan_tautan_drive_file_sumber_kolom_check', (sp) => sp
        .insert(app.laporanTautanDriveFile)
        .values({ ...fileValues(tautanId), sumber: 'MANUAL_ARSIP', manualArsipId: randomUUID() }))
    })
  })

  it('menolak status dan keterangan_hapus di luar daftar (23514)', async () => {
    await inRollback(async (tx) => {
      const tautanId = await insertDriveTautan(tx, await insertAkun(tx, { status: 'NONAKTIF' }))
      await expectPgError(tx, '23514', 'laporan_tautan_drive_file_status_check', (sp) => sp
        .insert(app.laporanTautanDriveFile)
        .values({ ...fileValues(tautanId), status: 'LAINNYA' as never }))
      await expectPgError(tx, '23514', 'laporan_tautan_drive_file_keterangan_hapus_check', (sp) => sp
        .insert(app.laporanTautanDriveFile)
        .values({ ...fileValues(tautanId), keteranganHapus: 'LAINNYA' as never }))
    })
  })
})

describe('app.drive_job', () => {
  async function insertJob(
    tx: Tx,
    values: { akunId: string; tautanId: string; status: 'MENUNGGU' | 'SELESAI'; jenis?: 'SINKRON_TAUTAN' },
  ) {
    await tx.insert(app.driveJob).values({
      jenis: values.jenis ?? 'SINKRON_TAUTAN',
      akunId: values.akunId,
      tautanId: values.tautanId,
      prioritas: 10,
      status: values.status,
    })
  }

  it('satu MENUNGGU + satu SELESAI untuk (tautan, jenis) yang sama diterima', async () => {
    await inRollback(async (tx) => {
      const akunId = await insertAkun(tx, { status: 'NONAKTIF' })
      const tautanId = await insertDriveTautan(tx, akunId)
      await insertJob(tx, { akunId, tautanId, status: 'SELESAI' })
      await insertJob(tx, { akunId, tautanId, status: 'MENUNGGU' })
      await tx.insert(app.driveJob).values({ jenis: 'HAPUS_TAUTAN', akunId, tautanId, prioritas: 0, status: 'MENUNGGU' })
    })
  })

  it('menolak dua job MENUNGGU dengan (tautan, jenis) sama (23505)', async () => {
    await inRollback(async (tx) => {
      const akunId = await insertAkun(tx, { status: 'NONAKTIF' })
      const tautanId = await insertDriveTautan(tx, akunId)
      await insertJob(tx, { akunId, tautanId, status: 'MENUNGGU' })
      await expectPgError(
        tx,
        '23505',
        'drive_job_satu_menunggu',
        (sp) => insertJob(sp, { akunId, tautanId, status: 'MENUNGGU' }),
      )
    })
  })

  it('menolak jenis, status, dan galat_kategori di luar daftar (23514)', async () => {
    await inRollback(async (tx) => {
      const akunId = await insertAkun(tx, { status: 'NONAKTIF' })
      const tautanId = await insertDriveTautan(tx, akunId)
      const base = { akunId, tautanId, prioritas: 10 }
      await expectPgError(tx, '23514', 'drive_job_jenis_check', (sp) => sp.insert(app.driveJob)
        .values({ ...base, jenis: 'LAINNYA' as never, status: 'MENUNGGU' }))
      await expectPgError(tx, '23514', 'drive_job_status_check', (sp) => sp.insert(app.driveJob)
        .values({ ...base, jenis: 'SINKRON_TAUTAN', status: 'LAINNYA' as never }))
      await expectPgError(tx, '23514', 'drive_job_galat_kategori_check', (sp) => sp.insert(app.driveJob)
        .values({ ...base, jenis: 'SINKRON_TAUTAN', status: 'GAGAL', galatKategori: 'LAINNYA' as never }))
    })
  })
})

describe('audit.audit_log menerima entity type dan aksi Drive', () => {
  it('insert DRIVE_AKUN_DIHUBUNGKAN untuk GOOGLE_DRIVE_AKUN dan DRIVE_TAUTAN_SIAP untuk LAPORAN_TAUTAN tanpa aktor', async () => {
    const audit = await import('#/db/schema/audit')
    await inRollback(async (tx) => {
      await tx.insert(audit.auditLog).values([
        { entityType: 'GOOGLE_DRIVE_AKUN', entityId: randomUUID(), aksi: 'DRIVE_AKUN_DIHUBUNGKAN', actorUserId: userId },
        { entityType: 'LAPORAN_TAUTAN', entityId: randomUUID(), aksi: 'DRIVE_TAUTAN_SIAP', actorUserId: null },
      ])
    })
  })
})
