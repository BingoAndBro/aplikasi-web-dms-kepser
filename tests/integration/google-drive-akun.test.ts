// Integration test (section 05 tautan Google Drive): repository akun Google Drive.
// Menyambung ke PostgreSQL ASLI karena yang diuji adalah transaksi ganti akun
// terhadap partial unique `google_drive_akun_satu_aktif`, audit, dan efek ke
// antrean/tautan saat akun diputus.
//
// Prasyarat dan cara jalan: lihat sections/index.md (`pnpm test:integration`,
// DB tes `dms_kepser_test` + migrasi + seed). Hampir semua data uji dibuat di
// transaksi yang di-ROLLBACK (executor = tx; fungsi repository membuka
// savepoint di dalamnya). Tes dua ADMIN bersamaan butuh dua koneksi dan data
// ter-commit; datanya dikembalikan di `finally`.

import { randomBytes, randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

if (!process.env.DATABASE_URL) {
  process.loadEnvFile('.env')
}

type ClientModule = typeof import('#/db/client')
type AppSchema = typeof import('#/db/schema/app')
type AuditSchema = typeof import('#/db/schema/audit')
type RepoModule = typeof import('#/lib/google-drive/akun-repository')
type JobsModule = typeof import('#/lib/google-drive/jobs')
type Tx = Parameters<Parameters<ClientModule['db']['transaction']>[0]>[0]

let client: ClientModule
let app: AppSchema
let audit: AuditSchema
let repo: RepoModule
let jobs: JobsModule
let userId: string

const NOW = new Date('2026-10-22T03:00:00.000Z')
const MENIT = 60_000
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs)
const TOKEN_LAMA = 'v1:token-lama:enc:uji'
const TOKEN_BARU = 'v1:token-baru:enc:uji'

class Rollback extends Error {}

beforeAll(async () => {
  client = await import('#/db/client')
  app = await import('#/db/schema/app')
  audit = await import('#/db/schema/audit')
  repo = await import('#/lib/google-drive/akun-repository')
  jobs = await import('#/lib/google-drive/jobs')
  const user = await client.pool.query<{ id: string }>('select id from auth.users limit 1')
  if (!user.rows[0]) {
    throw new Error('DB tes perlu minimal 1 user (jalankan seed, lihat sections/index.md).')
  }
  userId = user.rows[0].id
})

afterAll(async () => {
  await client?.pool.end()
})

/** Transaksi rollback; akun AKTIF yang mungkin sudah ada dinonaktifkan hanya di dalam transaksi ini. */
async function inRollback(run: (tx: Tx) => Promise<void>) {
  await expect(client.db.transaction(async (tx) => {
    await tx.update(app.googleDriveAkun).set({ status: 'NONAKTIF' }).where(eq(app.googleDriveAkun.status, 'AKTIF'))
    await run(tx)
    throw new Rollback()
  })).rejects.toBeInstanceOf(Rollback)
}

const email = (label: string) => `${label}-${randomUUID()}@example.test`

async function insertAkun(tx: Tx, values: {
  email?: string
  status?: 'AKTIF' | 'NONAKTIF' | 'DIPUTUS'
  rootFolderId?: string | null
  perluHubungUlang?: boolean
} = {}) {
  const [row] = await tx.insert(app.googleDriveAkun).values({
    email: values.email ?? email('akun'),
    refreshTokenEnc: values.status === 'DIPUTUS' ? null : TOKEN_LAMA,
    rootFolderId: values.rootFolderId === undefined ? 'root-lama' : values.rootFolderId,
    status: values.status ?? 'AKTIF',
    perluHubungUlangSejak: values.perluHubungUlang ? at(-MENIT) : null,
    dihubungkanOleh: userId,
    dihubungkanPada: at(-60 * MENIT),
  }).returning()
  return row
}

async function insertTautan(tx: Tx, akunId: string, values: {
  driveStatus?: 'MENUNGGU' | 'MENGUNGGAH' | 'SIAP' | 'GAGAL' | 'MENGHAPUS' | 'DIHAPUS'
  revoked?: boolean
  judul?: string
} = {}) {
  const [row] = await tx.insert(app.laporanTautan).values({
    token: randomBytes(24).toString('base64url'),
    sumber: 'LAPORAN_KEGIATAN',
    akses: 'DRIVE',
    judul: values.judul ?? 'Uji akun Drive',
    createdBy: userId,
    createdAt: new Date('2026-10-20T20:00:00.000Z'),
    driveAkunId: akunId,
    driveStatus: values.driveStatus ?? 'MENUNGGU',
    revokedAt: values.revoked ? at(-MENIT) : null,
    revokedBy: values.revoked ? userId : null,
  }).returning({ id: app.laporanTautan.id })
  return row.id
}

async function loadAkun(tx: Tx, id: string) {
  const [row] = await tx.select().from(app.googleDriveAkun).where(eq(app.googleDriveAkun.id, id))
  return row
}

async function auditFor(tx: Tx, entityIds: string[]) {
  return tx.select().from(audit.auditLog)
    .where(and(eq(audit.auditLog.entityType, 'GOOGLE_DRIVE_AKUN'), inArray(audit.auditLog.entityId, entityIds)))
}

describe('simpanAkunTerhubung', () => {
  it('hubungkan pertama -> satu akun AKTIF + audit DRIVE_AKUN_DIHUBUNGKAN tanpa token', async () => {
    await inRollback(async (tx) => {
      const alamat = email('baru')
      const result = await repo.simpanAkunTerhubung({
        email: alamat, refreshTokenEnc: TOKEN_BARU, rootFolderId: 'root-baru', mode: 'HUBUNGKAN',
        akunIdTarget: null, actorUserId: userId, now: NOW, executor: tx,
      })

      expect(result).toEqual({ id: expect.any(String), email: alamat, status: 'AKTIF' })
      const aktif = await tx.select().from(app.googleDriveAkun).where(eq(app.googleDriveAkun.status, 'AKTIF'))
      expect(aktif).toHaveLength(1)
      expect(aktif[0]).toMatchObject({
        id: result.id, email: alamat, refreshTokenEnc: TOKEN_BARU, rootFolderId: 'root-baru',
        perluHubungUlangSejak: null, dihubungkanOleh: userId, dihubungkanPada: NOW,
      })

      const rows = await auditFor(tx, [result.id])
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        aksi: 'DRIVE_AKUN_DIHUBUNGKAN', actorUserId: userId, metadataSnapshot: { email: alamat, mode: 'HUBUNGKAN' },
      })
      expect(JSON.stringify(rows)).not.toContain(TOKEN_BARU)
    })
  })

  it('email disimpan huruf kecil', async () => {
    await inRollback(async (tx) => {
      const result = await repo.simpanAkunTerhubung({
        email: '  Admin.Besar@Example.Test ', refreshTokenEnc: TOKEN_BARU, rootFolderId: 'r', mode: 'HUBUNGKAN',
        akunIdTarget: null, actorUserId: userId, now: NOW, executor: tx,
      })
      expect(result.email).toBe('admin.besar@example.test')
    })
  })

  it('ganti akun atomik: lama NONAKTIF + dinonaktifkan_pada, baru AKTIF, dua audit', async () => {
    await inRollback(async (tx) => {
      const lama = await insertAkun(tx, { status: 'AKTIF' })
      const alamat = email('pengganti')
      const result = await repo.simpanAkunTerhubung({
        email: alamat, refreshTokenEnc: TOKEN_BARU, rootFolderId: 'root-baru', mode: 'GANTI',
        akunIdTarget: null, actorUserId: userId, now: NOW, executor: tx,
      })

      expect(await loadAkun(tx, lama.id)).toMatchObject({
        status: 'NONAKTIF', dinonaktifkanPada: NOW, refreshTokenEnc: TOKEN_LAMA, rootFolderId: 'root-lama',
      })
      expect(await loadAkun(tx, result.id)).toMatchObject({ status: 'AKTIF', email: alamat })

      const rows = await auditFor(tx, [lama.id, result.id])
      expect(rows.map((r) => [r.entityId, r.aksi]).sort()).toEqual([
        [lama.id, 'DRIVE_AKUN_DINONAKTIFKAN'],
        [result.id, 'DRIVE_AKUN_DIHUBUNGKAN'],
      ].sort())
      expect(rows.find((r) => r.entityId === lama.id)?.metadataSnapshot).toEqual({ email: lama.email, mode: 'GANTI' })
    })
  })

  it('GANTI ke email akun NONAKTIF -> baris itu AKTIF tanpa baris baru, akun aktif sebelumnya NONAKTIF', async () => {
    await inRollback(async (tx) => {
      const aktif = await insertAkun(tx, { status: 'AKTIF' })
      const nonaktif = await insertAkun(tx, { status: 'NONAKTIF', perluHubungUlang: true })
      await tx.update(app.googleDriveAkun).set({ dinonaktifkanPada: at(-30 * MENIT) }).where(eq(app.googleDriveAkun.id, nonaktif.id))

      const result = await repo.simpanAkunTerhubung({
        email: nonaktif.email.toUpperCase(), refreshTokenEnc: TOKEN_BARU, rootFolderId: 'root-lama', mode: 'GANTI',
        akunIdTarget: null, actorUserId: userId, now: NOW, executor: tx,
      })

      expect(result).toEqual({ id: nonaktif.id, email: nonaktif.email, status: 'AKTIF' })
      expect(await loadAkun(tx, nonaktif.id)).toMatchObject({
        status: 'AKTIF', refreshTokenEnc: TOKEN_BARU, perluHubungUlangSejak: null, dinonaktifkanPada: null,
      })
      expect(await loadAkun(tx, aktif.id)).toMatchObject({ status: 'NONAKTIF', dinonaktifkanPada: NOW })
      const sameEmail = await tx.select().from(app.googleDriveAkun).where(eq(app.googleDriveAkun.email, nonaktif.email))
      expect(sameEmail).toHaveLength(1)
    })
  })

  it('HUBUNGKAN dengan email yang sudah AKTIF -> hanya token diperbarui, tanpa akun dinonaktifkan', async () => {
    await inRollback(async (tx) => {
      const aktif = await insertAkun(tx, { status: 'AKTIF', perluHubungUlang: true })
      const result = await repo.simpanAkunTerhubung({
        email: aktif.email, refreshTokenEnc: TOKEN_BARU, rootFolderId: 'root-lama', mode: 'HUBUNGKAN',
        akunIdTarget: null, actorUserId: userId, now: NOW, executor: tx,
      })
      expect(result).toEqual({ id: aktif.id, email: aktif.email, status: 'AKTIF' })
      expect(await loadAkun(tx, aktif.id)).toMatchObject({ refreshTokenEnc: TOKEN_BARU, perluHubungUlangSejak: null })
      expect((await auditFor(tx, [aktif.id])).map((r) => r.aksi)).toEqual(['DRIVE_AKUN_DIHUBUNGKAN'])
    })
  })

  it('HUBUNGKAN_ULANG email sama -> token baru, status tetap, perlu hubung ulang kosong, job dijadwalkan now', async () => {
    await inRollback(async (tx) => {
      await tx.delete(app.driveJob)
      const aktif = await insertAkun(tx, { status: 'AKTIF' })
      const nonaktif = await insertAkun(tx, { status: 'NONAKTIF', perluHubungUlang: true })
      const tautanId = await insertTautan(tx, nonaktif.id)
      const jobId = await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId: nonaktif.id, tautanId, now: at(30 * MENIT) })
      const jobAkunLain = await jobs.enqueueDriveJob(tx, {
        jenis: 'SINKRON_TAUTAN', akunId: aktif.id, tautanId: await insertTautan(tx, aktif.id), now: at(30 * MENIT),
      })

      const result = await repo.simpanAkunTerhubung({
        email: nonaktif.email, refreshTokenEnc: TOKEN_BARU, rootFolderId: 'root-lama', mode: 'HUBUNGKAN_ULANG',
        akunIdTarget: nonaktif.id, actorUserId: userId, now: NOW, executor: tx,
      })

      expect(result).toEqual({ id: nonaktif.id, email: nonaktif.email, status: 'NONAKTIF' })
      expect(await loadAkun(tx, nonaktif.id)).toMatchObject({
        status: 'NONAKTIF', refreshTokenEnc: TOKEN_BARU, perluHubungUlangSejak: null, rootFolderId: 'root-lama',
      })
      expect(await loadAkun(tx, aktif.id)).toMatchObject({ status: 'AKTIF' })
      const [job] = await tx.select().from(app.driveJob).where(eq(app.driveJob.id, jobId))
      expect(job.jadwalBerikut).toEqual(NOW)
      const [lain] = await tx.select().from(app.driveJob).where(eq(app.driveJob.id, jobAkunLain))
      expect(lain.jadwalBerikut).toEqual(at(30 * MENIT))
      expect((await auditFor(tx, [nonaktif.id]))[0].metadataSnapshot).toEqual({ email: nonaktif.email, mode: 'HUBUNGKAN_ULANG' })
    })
  })

  it('HUBUNGKAN_ULANG dengan email berbeda -> EMAIL_BERBEDA tanpa perubahan', async () => {
    await inRollback(async (tx) => {
      const aktif = await insertAkun(tx, { status: 'AKTIF' })
      await expect(repo.simpanAkunTerhubung({
        email: email('lain'), refreshTokenEnc: TOKEN_BARU, rootFolderId: 'r', mode: 'HUBUNGKAN_ULANG',
        akunIdTarget: aktif.id, actorUserId: userId, now: NOW, executor: tx,
      })).rejects.toMatchObject({ name: 'AkunDriveError', kode: 'EMAIL_BERBEDA' })
      expect(await loadAkun(tx, aktif.id)).toMatchObject({ refreshTokenEnc: TOKEN_LAMA })
      expect(await auditFor(tx, [aktif.id])).toHaveLength(0)
    })
  })

  it('HUBUNGKAN_ULANG akun yang sudah DIPUTUS -> AKUN_BERUBAH', async () => {
    await inRollback(async (tx) => {
      const putus = await insertAkun(tx, { status: 'DIPUTUS' })
      await expect(repo.simpanAkunTerhubung({
        email: putus.email, refreshTokenEnc: TOKEN_BARU, rootFolderId: 'r', mode: 'HUBUNGKAN_ULANG',
        akunIdTarget: putus.id, actorUserId: userId, now: NOW, executor: tx,
      })).rejects.toMatchObject({ kode: 'AKUN_BERUBAH' })
    })
  })

  it('email yang pernah DIPUTUS dihubungkan lagi -> baris baru, baris lama tetap DIPUTUS', async () => {
    await inRollback(async (tx) => {
      const putus = await insertAkun(tx, { status: 'DIPUTUS', rootFolderId: 'root-diputus' })
      const result = await repo.simpanAkunTerhubung({
        email: putus.email, refreshTokenEnc: TOKEN_BARU, rootFolderId: 'root-baru', mode: 'HUBUNGKAN',
        akunIdTarget: null, actorUserId: userId, now: NOW, executor: tx,
      })
      expect(result.id).not.toBe(putus.id)
      expect(await loadAkun(tx, putus.id)).toMatchObject({ status: 'DIPUTUS', rootFolderId: 'root-diputus' })
      expect(await loadAkun(tx, result.id)).toMatchObject({ status: 'AKTIF', rootFolderId: 'root-baru' })
    })
  })

  it('cariAkunBelumDiputus menemukan baris email (huruf kecil) yang belum DIPUTUS', async () => {
    await inRollback(async (tx) => {
      const putus = await insertAkun(tx, { status: 'DIPUTUS' })
      const nonaktif = await insertAkun(tx, { status: 'NONAKTIF' })
      expect(await repo.cariAkunBelumDiputus(putus.email, { executor: tx })).toBeNull()
      expect(await repo.cariAkunBelumDiputus(nonaktif.email.toUpperCase(), { executor: tx }))
        .toEqual({ id: nonaktif.id, email: nonaktif.email, status: 'NONAKTIF', rootFolderId: 'root-lama' })
    })
  })
})

describe('dua ADMIN menghubungkan bersamaan', () => {
  it('pelanggaran partial unique akun AKTIF (23505) dipetakan ke AKUN_BERUBAH', async () => {
    const connA = await client.pool.connect()
    const connB = await client.pool.connect()
    const dinonaktifkan: string[] = []
    let akunA: string | null = null
    try {
      // A: menonaktifkan akun AKTIF (bila ada) lalu menyisipkan akun AKTIF baru, belum commit.
      await connA.query('BEGIN')
      const off = await connA.query<{ id: string }>(
        `UPDATE app.google_drive_akun SET status = 'NONAKTIF' WHERE status = 'AKTIF' RETURNING id`,
      )
      dinonaktifkan.push(...off.rows.map((r) => r.id))
      const ins = await connA.query<{ id: string }>(
        `INSERT INTO app.google_drive_akun (email, refresh_token_enc, status, dihubungkan_oleh)
         VALUES ($1, $2, 'AKTIF', $3) RETURNING id`,
        [email('admin-a'), TOKEN_LAMA, userId],
      )
      akunA = ins.rows[0].id

      // B: transaksi repository berjalan dan tertahan di index unik sampai A commit.
      await connB.query(`SET lock_timeout = '5s'`)
      const pidB = (await connB.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0].pid
      const hasilB = repo.simpanAkunTerhubung({
        email: email('admin-b'), refreshTokenEnc: TOKEN_BARU, rootFolderId: 'r', mode: 'HUBUNGKAN',
        akunIdTarget: null, actorUserId: userId, now: NOW, executor: drizzle(connB),
      }).then(() => null, (error: unknown) => error)

      await vi.waitFor(async () => {
        const waiting = await client.pool.query(
          `select 1 from pg_stat_activity where pid = $1 and wait_event_type = 'Lock'`, [pidB],
        )
        expect(waiting.rowCount).toBe(1)
      }, { timeout: 4000, interval: 25 })
      await connA.query('COMMIT')

      const error = await hasilB
      expect(error).toMatchObject({ name: 'AkunDriveError', kode: 'AKUN_BERUBAH' })
      const aktif = await client.pool.query(`select id from app.google_drive_akun where status = 'AKTIF'`)
      expect(aktif.rows).toEqual([{ id: akunA }])
    } finally {
      await connA.query('ROLLBACK').catch(() => undefined)
      if (akunA) await client.pool.query('delete from app.google_drive_akun where id = $1', [akunA])
      if (dinonaktifkan.length > 0) {
        await client.pool.query(
          `update app.google_drive_akun set status = 'AKTIF' where id = any($1::uuid[])`, [dinonaktifkan],
        )
      }
      connA.release()
      connB.release()
    }
  })
})

describe('putuskanAkun', () => {
  it('token null, DIPUTUS, job MENUNGGU GAGAL AKUN_DIPUTUS, tautan MENUNGGU/MENGUNGGAH GAGAL, audit; galat revoke diabaikan', async () => {
    await inRollback(async (tx) => {
      await tx.delete(app.driveJob)
      const akun = await insertAkun(tx, { status: 'NONAKTIF' })
      const lain = await insertAkun(tx, { status: 'AKTIF' })
      const menunggu = await insertTautan(tx, akun.id, { driveStatus: 'MENUNGGU' })
      const mengunggah = await insertTautan(tx, akun.id, { driveStatus: 'MENGUNGGAH' })
      const siap = await insertTautan(tx, akun.id, { driveStatus: 'SIAP' })
      const gagal = await insertTautan(tx, akun.id, { driveStatus: 'GAGAL' })
      const dicabut = await insertTautan(tx, akun.id, { driveStatus: 'MENGHAPUS', revoked: true })
      const tautanLain = await insertTautan(tx, lain.id, { driveStatus: 'MENUNGGU' })
      const jobMenunggu = await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId: akun.id, tautanId: menunggu, now: NOW })
      const jobHapus = await jobs.enqueueDriveJob(tx, { jenis: 'HAPUS_TAUTAN', akunId: akun.id, tautanId: dicabut, now: NOW })
      const jobLain = await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId: lain.id, tautanId: tautanLain, now: NOW })

      const revoke = vi.fn(async () => { throw Object.assign(new Error('revoke gagal'), { response: { status: 503 } }) })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const result = await repo.putuskanAkun({ akunId: akun.id, actorUserId: userId, now: NOW, revoke, executor: tx })
      expect(revoke).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith('[google-drive/akun] cabut token gagal', { kategori: 'SEMENTARA' })
      warn.mockRestore()

      // Tautan aktif = belum dicabut dan drive_status MENUNGGU/MENGUNGGAH/SIAP/GAGAL.
      expect(result).toEqual({ id: akun.id, email: akun.email, jumlah_tautan_aktif: 4 })
      expect(await loadAkun(tx, akun.id)).toMatchObject({
        status: 'DIPUTUS', refreshTokenEnc: null, diputusOleh: userId, diputusPada: NOW,
      })
      const jobRows = await tx.select().from(app.driveJob).where(inArray(app.driveJob.id, [jobMenunggu, jobHapus, jobLain]))
      const byId = new Map(jobRows.map((j) => [j.id, j]))
      for (const id of [jobMenunggu, jobHapus]) {
        expect(byId.get(id)).toMatchObject({
          status: 'GAGAL', galatKategori: 'AKUN_DIPUTUS', galatPesan: 'Akun Google Drive diputus — hapus manual di Drive',
          selesaiPada: NOW,
        })
      }
      expect(byId.get(jobLain)?.status).toBe('MENUNGGU')

      const tautanRows = await tx.select({ id: app.laporanTautan.id, s: app.laporanTautan.driveStatus }).from(app.laporanTautan)
        .where(inArray(app.laporanTautan.id, [menunggu, mengunggah, siap, gagal, dicabut, tautanLain]))
      expect(Object.fromEntries(tautanRows.map((t) => [t.id, t.s]))).toEqual({
        [menunggu]: 'GAGAL', [mengunggah]: 'GAGAL', [siap]: 'SIAP', [gagal]: 'GAGAL', [dicabut]: 'MENGHAPUS', [tautanLain]: 'MENUNGGU',
      })

      const rows = await auditFor(tx, [akun.id])
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        aksi: 'DRIVE_AKUN_DIPUTUS', actorUserId: userId, metadataSnapshot: { email: akun.email, jumlah_tautan_aktif: 4 },
      })
    })
  })

  it('akun tidak ada -> AKUN_TIDAK_DITEMUKAN; sudah DIPUTUS -> AKUN_SUDAH_DIPUTUS; revoke tidak dipanggil', async () => {
    await inRollback(async (tx) => {
      const putus = await insertAkun(tx, { status: 'DIPUTUS' })
      const revoke = vi.fn(async () => undefined)
      await expect(repo.putuskanAkun({ akunId: randomUUID(), actorUserId: userId, now: NOW, revoke, executor: tx }))
        .rejects.toMatchObject({ kode: 'AKUN_TIDAK_DITEMUKAN' })
      await expect(repo.putuskanAkun({ akunId: putus.id, actorUserId: userId, now: NOW, revoke, executor: tx }))
        .rejects.toMatchObject({ kode: 'AKUN_SUDAH_DIPUTUS' })
      expect(revoke).not.toHaveBeenCalled()
    })
  })
})

describe('tandaiPerluHubungUlang, muatAkunUntukJob, perbaruiRootFolder, muatAkunAktif', () => {
  it('menandai sekali (idempoten) dan memuat data akun untuk job', async () => {
    await inRollback(async (tx) => {
      const akun = await insertAkun(tx, { status: 'AKTIF' })
      expect(await repo.tandaiPerluHubungUlang(akun.id, NOW, { executor: tx })).toBe(true)
      expect(await repo.tandaiPerluHubungUlang(akun.id, at(MENIT), { executor: tx })).toBe(false)
      expect((await loadAkun(tx, akun.id)).perluHubungUlangSejak).toEqual(NOW)

      await repo.perbaruiRootFolder(akun.id, 'root-pengganti', { executor: tx })
      expect(await repo.muatAkunUntukJob(akun.id, { executor: tx })).toEqual({
        id: akun.id, email: akun.email, status: 'AKTIF', refreshTokenEnc: TOKEN_LAMA, rootFolderId: 'root-pengganti',
        perluHubungUlang: true,
      })
      expect(await repo.muatAkunUntukJob(randomUUID(), { executor: tx })).toBeNull()
      expect(await repo.muatAkunAktif({ executor: tx })).toEqual({
        id: akun.id, email: akun.email, refreshTokenEnc: TOKEN_LAMA, perluHubungUlangSejak: NOW,
      })
    })
  })

  it('muatAkunAktif -> null bila tidak ada akun AKTIF', async () => {
    await inRollback(async (tx) => {
      expect(await repo.muatAkunAktif({ executor: tx })).toBeNull()
    })
  })
})

describe('muatRingkasanAdmin', () => {
  it('ringkasan akun non-DIPUTUS dengan jumlah tautan aktif + job gagal, dan daftar perlu dihapus manual', async () => {
    await inRollback(async (tx) => {
      await tx.delete(app.driveJob)
      const aktif = await insertAkun(tx, { status: 'AKTIF', perluHubungUlang: true })
      const nonaktif = await insertAkun(tx, { status: 'NONAKTIF' })
      const putus = await insertAkun(tx, { status: 'DIPUTUS' })

      await insertTautan(tx, aktif.id, { driveStatus: 'SIAP' })
      await insertTautan(tx, aktif.id, { driveStatus: 'GAGAL' })
      await insertTautan(tx, aktif.id, { driveStatus: 'DIHAPUS', revoked: true })
      const cabutGagal = await insertTautan(tx, aktif.id, { driveStatus: 'MENGHAPUS', revoked: true, judul: 'Laporan: Q3/2026' })
      const fileGagal = await insertTautan(tx, nonaktif.id, { driveStatus: 'SIAP', judul: 'Bukti dukung' })
      const tautanPutus = await insertTautan(tx, putus.id, { driveStatus: 'MENGHAPUS', revoked: true, judul: 'Akun putus' })

      // Baris file MENGHAPUS untuk HAPUS_FILE (nama file tidak boleh bocor ke ringkasan).
      for (const [i, status] of (['MENGHAPUS', 'MENGHAPUS', 'TERUNGGAH'] as const).entries()) {
        await tx.insert(app.laporanTautanDriveFile).values({
          tautanId: fileGagal, sumber: 'DOKUMEN', dokumenId: randomUUID(), lampiranIndex: 0,
          kunciLampiran: `DOKUMEN:${randomUUID()}:${i}`, namaFile: `rahasia-nama-file-${i}.pdf`, labelDokumen: 'Dok',
          urutan: i, contentType: 'application/pdf', status, keteranganHapus: status === 'MENGHAPUS' ? 'DIMUSNAHKAN' : null,
        })
      }

      async function jobGagal(jenis: 'HAPUS_TAUTAN' | 'HAPUS_FILE' | 'SINKRON_TAUTAN', akunId: string, tautanId: string, kategori: 'PERMANEN' | 'AKUN_DIPUTUS') {
        const [row] = await tx.insert(app.driveJob).values({
          jenis, akunId, tautanId, prioritas: 0, status: 'GAGAL', galatKategori: kategori, galatPesan: 'x',
          selesaiPada: NOW, dibuatPada: at(-MENIT),
        }).returning({ id: app.driveJob.id })
        return row.id
      }
      const j1 = await jobGagal('HAPUS_TAUTAN', aktif.id, cabutGagal, 'PERMANEN')
      const j2 = await jobGagal('HAPUS_FILE', nonaktif.id, fileGagal, 'PERMANEN')
      const j3 = await jobGagal('HAPUS_TAUTAN', putus.id, tautanPutus, 'AKUN_DIPUTUS')
      await jobGagal('SINKRON_TAUTAN', aktif.id, cabutGagal, 'PERMANEN')

      const ringkasan = await repo.muatRingkasanAdmin({ executor: tx })
      expect(ringkasan.akun_aktif).toEqual({
        id: aktif.id, email: aktif.email, status: 'AKTIF', perlu_hubung_ulang: true, jumlah_tautan_aktif: 2, jumlah_job_gagal: 2,
      })
      expect(ringkasan.akun_lain).toEqual([{
        id: nonaktif.id, email: nonaktif.email, status: 'NONAKTIF', perlu_hubung_ulang: false, jumlah_tautan_aktif: 1, jumlah_job_gagal: 1,
      }])

      const byJob = new Map(ringkasan.perlu_hapus_manual.map((item) => [item.job_id, item]))
      expect(ringkasan.perlu_hapus_manual).toHaveLength(3)
      expect(byJob.get(j1)).toEqual({
        job_id: j1, judul_tautan: 'Laporan: Q3/2026', nama_folder: 'Laporan- Q3-2026 (2026-10-21)',
        email_akun: aktif.email, kategori: 'PERMANEN', jumlah_file: null,
      })
      expect(byJob.get(j2)).toMatchObject({ jumlah_file: 2, email_akun: nonaktif.email, nama_folder: 'Bukti dukung (2026-10-21)' })
      expect(byJob.get(j3)).toMatchObject({ kategori: 'AKUN_DIPUTUS', email_akun: putus.email })
      expect(JSON.stringify(ringkasan)).not.toMatch(/rahasia-nama-file|refresh|v1:/)
    })
  })

  it('job hapus GAGAL yang sudah tidak relevan tidak tampil di daftar perlu dihapus manual', async () => {
    await inRollback(async (tx) => {
      await tx.delete(app.driveJob)
      const akun = await insertAkun(tx, { status: 'AKTIF' })
      // Folder sudah terhapus lewat job berikutnya, dan tautan tanpa file MENGHAPUS lagi.
      const sudahDihapus = await insertTautan(tx, akun.id, { driveStatus: 'DIHAPUS', revoked: true })
      const tanpaFile = await insertTautan(tx, akun.id, { driveStatus: 'SIAP' })
      for (const [jenis, tautanId] of [['HAPUS_TAUTAN', sudahDihapus], ['HAPUS_FILE', tanpaFile]] as const) {
        await tx.insert(app.driveJob).values({
          jenis, akunId: akun.id, tautanId, prioritas: 0, status: 'GAGAL', galatKategori: 'PERMANEN', selesaiPada: NOW,
        })
      }
      // Dua job GAGAL kembar untuk tautan yang sama -> satu entri.
      const kembar = await insertTautan(tx, akun.id, { driveStatus: 'MENGHAPUS', revoked: true })
      for (const offset of [-2 * MENIT, -MENIT]) {
        await tx.insert(app.driveJob).values({
          jenis: 'HAPUS_TAUTAN', akunId: akun.id, tautanId: kembar, prioritas: 0, status: 'GAGAL',
          galatKategori: 'SEMENTARA', selesaiPada: at(offset),
        })
      }

      const { perlu_hapus_manual } = await repo.muatRingkasanAdmin({ executor: tx })
      expect(perlu_hapus_manual).toHaveLength(1)
      expect(perlu_hapus_manual[0]).toMatchObject({ kategori: 'SEMENTARA' })
      const [{ count }] = (await tx.execute<{ count: string }>(sql`select count(*) from app.drive_job where status = 'GAGAL'`)).rows
      expect(Number(count)).toBe(4)
    })
  })
})
