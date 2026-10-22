// Integration test (section 04 tautan Google Drive): antrean app.drive_job.
// Menyambung ke PostgreSQL ASLI karena yang diuji adalah SQL klaim
// (`FOR UPDATE OF j SKIP LOCKED`), ON CONFLICT pada partial unique index, dan
// update bersyarat status -- hal yang tidak bisa dibuktikan dengan `db` tiruan.
//
// Prasyarat dan cara jalan: lihat dokumen-transaksi-permintaan-fk.test.ts
// (`pnpm test:integration`, Postgres lokal + migrasi + seed). Hampir semua data
// uji dibuat di transaksi yang di-ROLLBACK (dengan executor = tx). Tes dua
// klaim bersamaan butuh data yang ter-commit; datanya dihapus di `finally`.

import { randomBytes, randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

if (!process.env.DATABASE_URL) {
  process.loadEnvFile('.env')
}

type ClientModule = typeof import('#/db/client')
type AppSchema = typeof import('#/db/schema/app')
type JobsModule = typeof import('#/lib/google-drive/jobs')
type Tx = Parameters<Parameters<ClientModule['db']['transaction']>[0]>[0]

let client: ClientModule
let app: AppSchema
let jobs: JobsModule
let userId: string

const NOW = new Date('2026-10-22T03:00:00.000Z')
const MENIT = 60_000
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs)

class Rollback extends Error {}

beforeAll(async () => {
  client = await import('#/db/client')
  app = await import('#/db/schema/app')
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

/** Transaksi rollback dengan antrean yang dikosongkan (hanya di dalam transaksi ini). */
async function inRollback(run: (tx: Tx) => Promise<void>) {
  await expect(client.db.transaction(async (tx) => {
    await tx.delete(app.driveJob)
    await run(tx)
    throw new Rollback()
  })).rejects.toBeInstanceOf(Rollback)
}

type Executor = Pick<ClientModule['db'], 'insert'>

async function insertAkun(tx: Executor, values: { status?: 'AKTIF' | 'NONAKTIF' | 'DIPUTUS'; perluHubungUlang?: boolean } = {}) {
  const [row] = await tx.insert(app.googleDriveAkun).values({
    email: `jobs-${randomUUID()}@example.test`,
    status: values.status ?? 'NONAKTIF',
    perluHubungUlangSejak: values.perluHubungUlang ? at(-MENIT) : null,
    dihubungkanOleh: userId,
  }).returning({ id: app.googleDriveAkun.id })
  return row.id
}

async function insertTautan(tx: Executor, akunId: string) {
  const [row] = await tx.insert(app.laporanTautan).values({
    token: randomBytes(24).toString('base64url'),
    sumber: 'LAPORAN_KEGIATAN',
    akses: 'DRIVE',
    judul: 'Uji antrean Drive',
    createdBy: userId,
    driveAkunId: akunId,
    driveStatus: 'MENUNGGU',
  }).returning({ id: app.laporanTautan.id })
  return row.id
}

async function fixture(tx: Executor, akun: Parameters<typeof insertAkun>[1] = {}) {
  const akunId = await insertAkun(tx, akun)
  const tautanId = await insertTautan(tx, akunId)
  return { akunId, tautanId }
}

async function loadJob(tx: Tx, id: string) {
  const [row] = await tx.select().from(app.driveJob).where(eq(app.driveJob.id, id))
  return row
}

async function claimProses(tx: Tx, jenis: 'SINKRON_TAUTAN' | 'HAPUS_TAUTAN' = 'SINKRON_TAUTAN', akun = {}) {
  const { akunId, tautanId } = await fixture(tx, akun)
  const id = await jobs.enqueueDriveJob(tx, { jenis, akunId, tautanId, now: NOW })
  const claimed = await jobs.claimNextDriveJob({ now: NOW, executor: tx })
  expect(claimed?.id).toBe(id)
  return { id, akunId, tautanId }
}

describe('enqueueDriveJob', () => {
  it('membuat job MENUNGGU dengan prioritas sesuai jenis di dalam transaksi pemanggil', async () => {
    await inRollback(async (tx) => {
      const { akunId, tautanId } = await fixture(tx)
      const sinkron = await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId, tautanId, now: NOW })
      const hapus = await jobs.enqueueDriveJob(tx, { jenis: 'HAPUS_FILE', akunId, tautanId, now: NOW })

      expect(await loadJob(tx, sinkron)).toMatchObject({
        jenis: 'SINKRON_TAUTAN', status: 'MENUNGGU', prioritas: 10, percobaan: 0, jadwalBerikut: NOW, akunId, tautanId,
      })
      expect(await loadJob(tx, hapus)).toMatchObject({ jenis: 'HAPUS_FILE', status: 'MENUNGGU', prioritas: 0 })
    })
  })

  it('enqueue kedua (tautan, jenis) yang masih MENUNGGU tidak membuat baris baru dan memajukan jadwal', async () => {
    await inRollback(async (tx) => {
      const { akunId, tautanId } = await fixture(tx)
      const first = await jobs.enqueueDriveJob(tx, { jenis: 'HAPUS_FILE', akunId, tautanId, now: at(10 * MENIT) })
      const second = await jobs.enqueueDriveJob(tx, { jenis: 'HAPUS_FILE', akunId, tautanId, now: NOW })
      const third = await jobs.enqueueDriveJob(tx, { jenis: 'HAPUS_FILE', akunId, tautanId, now: at(20 * MENIT) })

      expect(second).toBe(first)
      expect(third).toBe(first)
      const rows = await tx.select().from(app.driveJob).where(eq(app.driveJob.tautanId, tautanId))
      expect(rows).toHaveLength(1)
      expect(rows[0].jadwalBerikut).toEqual(NOW)
    })
  })
})

describe('claimNextDriveJob', () => {
  it('memilih HAPUS_* lebih dulu, lalu jadwal_berikut terlama; menandai PROSES + dikunci_pada', async () => {
    await inRollback(async (tx) => {
      const a = await fixture(tx)
      const b = await fixture(tx)
      const sinkronLama = await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', ...a, now: at(-30 * MENIT) })
      const sinkronBaru = await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', ...b, now: at(-20 * MENIT) })
      const hapus = await jobs.enqueueDriveJob(tx, { jenis: 'HAPUS_TAUTAN', ...b, now: at(-MENIT) })

      const first = await jobs.claimNextDriveJob({ now: NOW, executor: tx })
      expect(first).toMatchObject({ id: hapus, jenis: 'HAPUS_TAUTAN', status: 'PROSES', dikunciPada: NOW, tautanId: b.tautanId })
      expect((await jobs.claimNextDriveJob({ now: NOW, executor: tx }))?.id).toBe(sinkronLama)
      expect((await jobs.claimNextDriveJob({ now: NOW, executor: tx }))?.id).toBe(sinkronBaru)
      expect(await jobs.claimNextDriveJob({ now: NOW, executor: tx })).toBeNull()
      expect(await loadJob(tx, sinkronLama)).toMatchObject({ status: 'PROSES', dikunciPada: NOW })
    })
  })

  it('tidak mengklaim job berjadwal di masa depan; nextScheduledAt mengembalikan waktu itu', async () => {
    await inRollback(async (tx) => {
      const { akunId, tautanId } = await fixture(tx)
      await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId, tautanId, now: at(5 * MENIT) })

      expect(await jobs.claimNextDriveJob({ now: NOW, executor: tx })).toBeNull()
      expect(await jobs.nextScheduledAt({ executor: tx })).toEqual(at(5 * MENIT))
      expect((await jobs.claimNextDriveJob({ now: at(5 * MENIT), executor: tx }))?.tautanId).toBe(tautanId)
    })
  })

  it('nextScheduledAt null bila antrean kosong', async () => {
    await inRollback(async (tx) => {
      expect(await jobs.nextScheduledAt({ executor: tx })).toBeNull()
    })
  })

  it('PROSES yang dikunci 16 menit lalu diklaim ulang; 14 menit lalu tidak', async () => {
    await inRollback(async (tx) => {
      const { id } = await claimProses(tx)
      expect(await jobs.claimNextDriveJob({ now: at(14 * MENIT), executor: tx })).toBeNull()
      const reclaimed = await jobs.claimNextDriveJob({ now: at(16 * MENIT), executor: tx })
      expect(reclaimed).toMatchObject({ id, status: 'PROSES', dikunciPada: at(16 * MENIT) })
    })
  })

  it('nextScheduledAt juga membangunkan runner untuk PROSES yang akan macet', async () => {
    await inRollback(async (tx) => {
      await claimProses(tx)
      expect(await jobs.nextScheduledAt({ executor: tx })).toEqual(at(15 * MENIT))
    })
  })

  it('job akun yang perlu dihubungkan ulang tidak diklaim dan tidak menjadwalkan runner', async () => {
    await inRollback(async (tx) => {
      const { akunId, tautanId } = await fixture(tx, { perluHubungUlang: true })
      await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId, tautanId, now: at(-MENIT) })
      expect(await jobs.claimNextDriveJob({ now: NOW, executor: tx })).toBeNull()
      expect(await jobs.nextScheduledAt({ executor: tx })).toBeNull()
    })
  })

  it('job akun DIPUTUS tetap diklaim agar handler bisa menandainya GAGAL', async () => {
    await inRollback(async (tx) => {
      const { akunId, tautanId } = await fixture(tx, { status: 'DIPUTUS' })
      await jobs.enqueueDriveJob(tx, { jenis: 'HAPUS_TAUTAN', akunId, tautanId, now: at(-MENIT) })
      expect((await jobs.claimNextDriveJob({ now: NOW, executor: tx }))?.akunId).toBe(akunId)
    })
  })
})

describe('completeDriveJob', () => {
  it('PROSES -> SELESAI/DIBATALKAN dengan selesai_pada dan dikunci_pada dikosongkan', async () => {
    await inRollback(async (tx) => {
      const { id } = await claimProses(tx)
      expect(await jobs.completeDriveJob(id, { status: 'SELESAI', now: at(MENIT), executor: tx })).toBe(true)
      expect(await loadJob(tx, id)).toMatchObject({ status: 'SELESAI', selesaiPada: at(MENIT), dikunciPada: null })

      const other = await claimProses(tx, 'HAPUS_TAUTAN')
      expect(await jobs.completeDriveJob(other.id, { status: 'DIBATALKAN', now: at(MENIT), executor: tx })).toBe(true)
      expect(await loadJob(tx, other.id)).toMatchObject({ status: 'DIBATALKAN', selesaiPada: at(MENIT) })
    })
  })

  it('job yang bukan PROSES tidak berubah', async () => {
    await inRollback(async (tx) => {
      const { akunId, tautanId } = await fixture(tx)
      const id = await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId, tautanId, now: NOW })
      expect(await jobs.completeDriveJob(id, { status: 'SELESAI', now: NOW, executor: tx })).toBe(false)
      expect(await loadJob(tx, id)).toMatchObject({ status: 'MENUNGGU', selesaiPada: null })
    })
  })
})

describe('failDriveJob', () => {
  it('SEMENTARA -> MENUNGGU dengan jeda 1 menit, percobaan + 1, galat tersimpan', async () => {
    await inRollback(async (tx) => {
      const { id } = await claimProses(tx)
      const status = await jobs.failDriveJob(id, {
        kategori: 'SEMENTARA', pesan: 'Gangguan sementara saat menghubungi Google Drive', now: NOW, executor: tx,
      })
      expect(status).toBe('MENUNGGU')
      expect(await loadJob(tx, id)).toMatchObject({
        status: 'MENUNGGU',
        percobaan: 1,
        jadwalBerikut: at(MENIT),
        dikunciPada: null,
        selesaiPada: null,
        galatKategori: 'SEMENTARA',
        galatPesan: 'Gangguan sementara saat menghubungi Google Drive',
      })
    })
  })

  it('SEMENTARA setelah 8 percobaan ulang -> GAGAL', async () => {
    await inRollback(async (tx) => {
      const { id } = await claimProses(tx)
      await tx.update(app.driveJob).set({ percobaan: 8 }).where(eq(app.driveJob.id, id))
      expect(await jobs.failDriveJob(id, { kategori: 'SEMENTARA', pesan: 'x', now: NOW, executor: tx })).toBe('GAGAL')
      expect(await loadJob(tx, id)).toMatchObject({ status: 'GAGAL', percobaan: 9, selesaiPada: NOW })
    })
  })

  it('TOKEN_TIDAK_VALID -> MENUNGGU segera, percobaan tetap', async () => {
    await inRollback(async (tx) => {
      const { id } = await claimProses(tx)
      await tx.update(app.driveJob).set({ percobaan: 3 }).where(eq(app.driveJob.id, id))
      expect(await jobs.failDriveJob(id, { kategori: 'TOKEN_TIDAK_VALID', pesan: 'x', now: at(MENIT), executor: tx }))
        .toBe('MENUNGGU')
      expect(await loadJob(tx, id)).toMatchObject({
        status: 'MENUNGGU', percobaan: 3, jadwalBerikut: at(MENIT), galatKategori: 'TOKEN_TIDAK_VALID',
      })
    })
  })

  it('KUOTA_PENUH -> GAGAL langsung; galat_pesan dipotong 200 karakter', async () => {
    await inRollback(async (tx) => {
      const { id } = await claimProses(tx)
      expect(await jobs.failDriveJob(id, { kategori: 'KUOTA_PENUH', pesan: 'k'.repeat(500), now: NOW, executor: tx }))
        .toBe('GAGAL')
      const row = await loadJob(tx, id)
      expect(row).toMatchObject({ status: 'GAGAL', percobaan: 0, selesaiPada: NOW, galatKategori: 'KUOTA_PENUH' })
      expect(row.galatPesan).toHaveLength(200)
    })
  })

  it('job yang bukan PROSES tidak berubah (null)', async () => {
    await inRollback(async (tx) => {
      const { akunId, tautanId } = await fixture(tx)
      const id = await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId, tautanId, now: NOW })
      expect(await jobs.failDriveJob(id, { kategori: 'KUOTA_PENUH', pesan: 'x', now: NOW, executor: tx })).toBeNull()
      expect(await loadJob(tx, id)).toMatchObject({ status: 'MENUNGGU', galatKategori: null })
    })
  })

  it('bila sudah ada job MENUNGGU kembar (enqueue saat PROSES), job ini DIBATALKAN dan kerja tetap menunggu', async () => {
    await inRollback(async (tx) => {
      const { id, akunId, tautanId } = await claimProses(tx, 'HAPUS_TAUTAN')
      const sibling = await jobs.enqueueDriveJob(tx, { jenis: 'HAPUS_TAUTAN', akunId, tautanId, now: NOW })
      expect(sibling).not.toBe(id)

      expect(await jobs.failDriveJob(id, { kategori: 'SEMENTARA', pesan: 'x', now: NOW, executor: tx })).toBe('MENUNGGU')
      expect(await loadJob(tx, id)).toMatchObject({ status: 'DIBATALKAN', selesaiPada: NOW, galatKategori: 'SEMENTARA' })
      expect(await loadJob(tx, sibling)).toMatchObject({ status: 'MENUNGGU' })
    })
  })
})

describe('deferDriveJob', () => {
  it('PROSES -> MENUNGGU dengan jadwal now + ms, percobaan tetap', async () => {
    await inRollback(async (tx) => {
      const { id } = await claimProses(tx)
      await tx.update(app.driveJob).set({ percobaan: 2 }).where(eq(app.driveJob.id, id))
      expect(await jobs.deferDriveJob(id, { now: NOW, ms: jobs.DRIVE_JOB_TUNDA_SINKRON_MS, executor: tx })).toBe(true)
      expect(await loadJob(tx, id)).toMatchObject({
        status: 'MENUNGGU', percobaan: 2, jadwalBerikut: at(30_000), dikunciPada: null,
      })
      expect(await jobs.deferDriveJob(id, { now: NOW, ms: 1, executor: tx })).toBe(false)
    })
  })
})

describe('findActiveSinkronJob', () => {
  it('menemukan SINKRON_TAUTAN PROSES yang belum macet untuk tautan itu', async () => {
    await inRollback(async (tx) => {
      const { id, tautanId } = await claimProses(tx)
      expect((await jobs.findActiveSinkronJob(tautanId, { now: at(14 * MENIT), executor: tx }))?.id).toBe(id)
      expect(await jobs.findActiveSinkronJob(tautanId, { now: at(16 * MENIT), executor: tx })).toBeNull()
      expect(await jobs.findActiveSinkronJob(randomUUID(), { now: NOW, executor: tx })).toBeNull()
    })
  })
})

describe('resetFailedDeletionJobs', () => {
  type Jenis = 'SINKRON_TAUTAN' | 'HAPUS_TAUTAN' | 'HAPUS_FILE'
  async function gagal(tx: Tx, f: { akunId: string; tautanId: string }, jenis: Jenis, kategori: 'PERMANEN' | 'SEMENTARA' | 'AKUN_DIPUTUS', selesai = NOW) {
    const [row] = await tx.insert(app.driveJob).values({
      jenis, akunId: f.akunId, tautanId: f.tautanId, prioritas: jobs.DRIVE_JOB_PRIORITAS[jenis], status: 'GAGAL',
      percobaan: 9, galatKategori: kategori, galatPesan: 'gagal', selesaiPada: selesai, dibuatPada: at(-60 * MENIT),
    }).returning({ id: app.driveJob.id })
    return row.id
  }
  async function cabut(tx: Tx, tautanId: string) {
    await tx.update(app.laporanTautan).set({ revokedAt: NOW, revokedBy: userId, driveStatus: 'MENGHAPUS' })
      .where(eq(app.laporanTautan.id, tautanId))
  }
  async function fileMenghapus(tx: Tx, tautanId: string) {
    await tx.insert(app.laporanTautanDriveFile).values({
      tautanId, sumber: 'DOKUMEN', dokumenId: randomUUID(), lampiranIndex: 0, kunciLampiran: `DOKUMEN:${randomUUID()}:0`,
      namaFile: 'a.pdf', labelDokumen: 'Dok', urutan: 0, contentType: 'application/pdf', status: 'MENGHAPUS',
      keteranganHapus: 'DIMUSNAHKAN', driveFileId: 'f1',
    })
  }

  it('HAPUS_* GAGAL (bukan AKUN_DIPUTUS) -> MENUNGGU, percobaan 0, jadwal now, galat dikosongkan', async () => {
    await inRollback(async (tx) => {
      const a = await fixture(tx)
      await cabut(tx, a.tautanId)
      const b = await fixture(tx)
      await fileMenghapus(tx, b.tautanId)
      const hapusTautan = await gagal(tx, a, 'HAPUS_TAUTAN', 'PERMANEN')
      const hapusFile = await gagal(tx, b, 'HAPUS_FILE', 'SEMENTARA')
      const sinkron = await gagal(tx, b, 'SINKRON_TAUTAN', 'PERMANEN')
      const diputus = await gagal(tx, await fixture(tx), 'HAPUS_TAUTAN', 'AKUN_DIPUTUS')

      const later = at(5 * MENIT)
      expect(await jobs.resetFailedDeletionJobs({ now: later, executor: tx })).toBe(2)
      for (const id of [hapusTautan, hapusFile]) {
        expect(await loadJob(tx, id)).toMatchObject({
          status: 'MENUNGGU', percobaan: 0, jadwalBerikut: later, galatKategori: null, galatPesan: null,
          selesaiPada: null, dikunciPada: null,
        })
      }
      expect((await loadJob(tx, sinkron)).status).toBe('GAGAL')
      expect(await loadJob(tx, diputus)).toMatchObject({ status: 'GAGAL', galatKategori: 'AKUN_DIPUTUS' })
      expect(await jobs.resetFailedDeletionJobs({ now: later, executor: tx })).toBe(0)
    })
  })

  it('akun DIPUTUS, job kembar, dan job yang sudah tidak relevan tidak direset; tidak melanggar unique MENUNGGU', async () => {
    await inRollback(async (tx) => {
      // Akun sudah diputus setelah job gagal PERMANEN: tidak bisa diproses lagi.
      const putus = await fixture(tx, { status: 'DIPUTUS' })
      await cabut(tx, putus.tautanId)
      const jobAkunPutus = await gagal(tx, putus, 'HAPUS_TAUTAN', 'PERMANEN')

      // Dua GAGAL kembar untuk (tautan, jenis) yang sama: hanya yang terbaru direset.
      const kembar = await fixture(tx)
      await cabut(tx, kembar.tautanId)
      const lama = await gagal(tx, kembar, 'HAPUS_TAUTAN', 'SEMENTARA', at(-10 * MENIT))
      const baru = await gagal(tx, kembar, 'HAPUS_TAUTAN', 'SEMENTARA', at(-MENIT))

      // Sudah ada job MENUNGGU untuk pasangan itu.
      const menunggu = await fixture(tx)
      await cabut(tx, menunggu.tautanId)
      const jobGagal = await gagal(tx, menunggu, 'HAPUS_TAUTAN', 'PERMANEN')
      await jobs.enqueueDriveJob(tx, { jenis: 'HAPUS_TAUTAN', ...menunggu, now: NOW })

      // Folder sudah DIHAPUS / tidak ada file MENGHAPUS lagi.
      const selesai = await fixture(tx)
      await tx.update(app.laporanTautan).set({ revokedAt: NOW, revokedBy: userId, driveStatus: 'DIHAPUS' })
        .where(eq(app.laporanTautan.id, selesai.tautanId))
      const jobSelesai = await gagal(tx, selesai, 'HAPUS_TAUTAN', 'PERMANEN')
      const tanpaFile = await fixture(tx)
      const jobTanpaFile = await gagal(tx, tanpaFile, 'HAPUS_FILE', 'PERMANEN')

      expect(await jobs.resetFailedDeletionJobs({ now: NOW, executor: tx })).toBe(1)
      expect((await loadJob(tx, baru)).status).toBe('MENUNGGU')
      for (const id of [jobAkunPutus, lama, jobGagal, jobSelesai, jobTanpaFile]) {
        expect((await loadJob(tx, id)).status).toBe('GAGAL')
      }
    })
  })
})

describe('klaim bersamaan dari dua koneksi', () => {
  it('hanya satu koneksi mendapat job (FOR UPDATE SKIP LOCKED)', async () => {
    const setup = drizzle(client.pool)
    const marker = `jobs-concurrent-${randomUUID()}`
    const akunId = await insertAkun(setup)
    const tautanId = await insertTautan(setup, akunId)
    await setup.update(app.laporanTautan).set({ judul: marker }).where(eq(app.laporanTautan.id, tautanId))
    const jobId = await jobs.enqueueDriveJob(setup, { jenis: 'SINKRON_TAUTAN', akunId, tautanId, now: at(-MENIT) })

    const clientA = await client.pool.connect()
    const clientB = await client.pool.connect()
    try {
      await clientA.query('BEGIN')
      await clientB.query('BEGIN')
      // Tanpa SKIP LOCKED klaim B akan menunggu kunci A; gagal cepat supaya finally tetap membersihkan data.
      await clientB.query("SET LOCAL lock_timeout = '2s'")
      const claimA = await jobs.claimNextDriveJob({ now: NOW, executor: drizzle(clientA) })
      const claimB = await jobs.claimNextDriveJob({ now: NOW, executor: drizzle(clientB) })

      expect(claimA?.id).toBe(jobId)
      expect(claimB).toBeNull()
    } finally {
      await clientA.query('ROLLBACK')
      await clientB.query('ROLLBACK')
      clientA.release()
      clientB.release()
      await setup.delete(app.driveJob).where(eq(app.driveJob.tautanId, tautanId))
      await setup.delete(app.laporanTautan).where(eq(app.laporanTautan.id, tautanId))
      await setup.delete(app.googleDriveAkun).where(eq(app.googleDriveAkun.id, akunId))
    }

    const leftover = await client.pool.query(
      `select
         (select count(*) from app.drive_job where tautan_id = $1)::int as jobs,
         (select count(*) from app.laporan_tautan where judul = $2)::int as tautan,
         (select count(*) from app.google_drive_akun where id = $3)::int as akun`,
      [tautanId, marker, akunId],
    )
    expect(leftover.rows[0]).toEqual({ jobs: 0, tautan: 0, akun: 0 })
  })
})

describe('tidak ada data uji tertinggal', () => {
  it('tabel Drive bersih dari fixture tes ini', async () => {
    const result = await client.db.execute(sql`
      select count(*)::int as n from app.google_drive_akun where email like 'jobs-%@example.test'
    `)
    expect(result.rows[0]).toEqual({ n: 0 })
  })
})
