// Integration test (section 08 tautan Google Drive): pembuatan tautan DRIVE
// (tautan + baris file + job dalam satu transaksi), ringkasan Riwayat Tautan,
// penanda drive_tertunda_akun untuk job yang dijeda TOKEN_TIDAK_VALID, dan
// "Coba lagi" pembuat -- semuanya di PostgreSQL asli. Google Drive diganti
// FakeDrive. Prasyarat: lihat sections/index.md. Semua data uji dibuat di
// transaksi yang di-ROLLBACK (executor = tx; transaksi repository = savepoint).

import { randomBytes, randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { DriveApiError } from '#/lib/google-drive/drive-errors'
import type { RencanaFileDrive } from '#/lib/google-drive/rencana-file'
import type { DriveRunnerDeps } from '#/lib/google-drive/runner'

import { FakeDrive } from '../unit/google-drive/helpers/fake-drive'

if (!process.env.DATABASE_URL) {
  process.loadEnvFile('.env')
}

type ClientModule = typeof import('#/db/client')
type AppSchema = typeof import('#/db/schema/app')
type JobsModule = typeof import('#/lib/google-drive/jobs')
type DriveRepoModule = typeof import('#/lib/google-drive/tautan-drive-repository')
type TautanRepoModule = typeof import('#/lib/laporan/tautan-repository')
type TautanModule = typeof import('#/lib/laporan/tautan')
type AkunModule = typeof import('#/lib/google-drive/akun-repository')
type RunnerModule = typeof import('#/lib/google-drive/runner')
type SinkronModule = typeof import('#/lib/google-drive/sinkron-tautan')
type Tx = Parameters<Parameters<ClientModule['db']['transaction']>[0]>[0]

let client: ClientModule
let app: AppSchema
let jobs: JobsModule
let driveRepo: DriveRepoModule
let tautanRepo: TautanRepoModule
let tautanMod: TautanModule
let akunMod: AkunModule
let runner: RunnerModule
let sinkron: SinkronModule
let userId: string
let userLainId: string

const NOW = new Date('2026-10-22T03:00:00.000Z')
const DOKUMEN_A = '0000000a-0000-4000-8000-000000000000'
const DOKUMEN_B = '0000000b-0000-4000-8000-000000000000'

class Rollback extends Error {}

beforeAll(async () => {
  client = await import('#/db/client')
  app = await import('#/db/schema/app')
  jobs = await import('#/lib/google-drive/jobs')
  driveRepo = await import('#/lib/google-drive/tautan-drive-repository')
  tautanRepo = await import('#/lib/laporan/tautan-repository')
  tautanMod = await import('#/lib/laporan/tautan')
  akunMod = await import('#/lib/google-drive/akun-repository')
  runner = await import('#/lib/google-drive/runner')
  sinkron = await import('#/lib/google-drive/sinkron-tautan')
  const users = await client.pool.query<{ id: string }>('select id from auth.users order by created_at limit 2')
  if (!users.rows[0]) throw new Error('DB tes perlu minimal 1 user (jalankan seed, lihat sections/index.md).')
  userId = users.rows[0].id
  userLainId = users.rows[1]?.id ?? users.rows[0].id
})

afterAll(async () => {
  await client?.pool.end()
})

async function inRollback(run: (tx: Tx) => Promise<void>) {
  await expect(client.db.transaction(async (tx) => {
    await tx.delete(app.driveJob)
    await tx.update(app.googleDriveAkun).set({ status: 'NONAKTIF' }).where(eq(app.googleDriveAkun.status, 'AKTIF'))
    await run(tx)
    throw new Rollback()
  })).rejects.toBeInstanceOf(Rollback)
}

async function akunFixture(tx: Tx, rootFolderId: string | null = null) {
  const [akun] = await tx.insert(app.googleDriveAkun).values({
    email: `tautan-${randomUUID()}@example.test`, refreshTokenEnc: 'v1:enc', rootFolderId, status: 'AKTIF', dihubungkanOleh: userId,
  }).returning({ id: app.googleDriveAkun.id })
  return akun.id
}

function rencana(dokumenId: string, index: number, urutan: number): RencanaFileDrive {
  return {
    sumber: 'DOKUMEN', dokumenId, lampiranIndex: index, manualArsipId: null, attachmentId: null,
    kunci: `DOKUMEN:${dokumenId}:${index}`, namaFile: `Lampiran ${urutan}.pdf`, labelDokumen: `Dokumen ${urutan}`,
    urutan, contentType: 'application/pdf',
  }
}

function values(overrides: Partial<{ createdBy: string; judul: string }> = {}) {
  return {
    token: randomBytes(24).toString('base64url'),
    sumber: 'LAPORAN_SAYA' as const,
    judul: 'Uji tautan Drive',
    keterangan: null,
    dokumenIds: [DOKUMEN_A, DOKUMEN_B],
    manualArsipIds: [],
    createdBy: userId,
    ...overrides,
  }
}

async function jobsOf(tx: Tx, tautanId: string) {
  return tx.select().from(app.driveJob).where(eq(app.driveJob.tautanId, tautanId))
}

async function filesOf(tx: Tx, tautanId: string) {
  return tx.select().from(app.laporanTautanDriveFile).where(eq(app.laporanTautanDriveFile.tautanId, tautanId))
}

describe('insertTautanDrive', () => {
  it('tautan DRIVE + baris file + job SINKRON_TAUTAN lahir bersama', async () => {
    await inRollback(async (tx) => {
      const akunId = await akunFixture(tx)
      const dilewati = [{ label: 'Dokumen kosong', alasan: 'tanpa lampiran tersedia' }]

      const tautan = await tautanRepo.insertTautanDrive({
        values: values(),
        files: [rencana(DOKUMEN_A, 0, 0), rencana(DOKUMEN_B, 0, 1)],
        dilewati,
        akunId,
        now: NOW,
      }, tx)

      expect(tautan).toMatchObject({ akses: 'DRIVE', driveAkunId: akunId, driveStatus: 'MENUNGGU', driveDokumenDilewati: dilewati })
      const files = await filesOf(tx, tautan.id)
      expect(files.map((f) => [f.kunciLampiran, f.namaFile, f.labelDokumen, f.urutan, f.status, f.driveFileId]).sort()).toEqual([
        [`DOKUMEN:${DOKUMEN_A}:0`, 'Lampiran 0.pdf', 'Dokumen 0', 0, 'MENUNGGU', null],
        [`DOKUMEN:${DOKUMEN_B}:0`, 'Lampiran 1.pdf', 'Dokumen 1', 1, 'MENUNGGU', null],
      ])
      const [job] = await jobsOf(tx, tautan.id)
      expect(job).toMatchObject({ jenis: 'SINKRON_TAUTAN', akunId, status: 'MENUNGGU', jadwalBerikut: NOW, percobaan: 0 })
    })
  })

  it('tanpa lampiran tersedia: tetap tautan + job (folder berisi DAFTAR_ISI.txt saja)', async () => {
    await inRollback(async (tx) => {
      const akunId = await akunFixture(tx)
      const tautan = await tautanRepo.insertTautanDrive({ values: values(), files: [], dilewati: [], akunId, now: NOW }, tx)
      expect(await filesOf(tx, tautan.id)).toHaveLength(0)
      expect(await jobsOf(tx, tautan.id)).toHaveLength(1)
    })
  })

  it('satu transaksi: galat insert baris file -> tidak ada tautan maupun job yang tersisa', async () => {
    await inRollback(async (tx) => {
      const akunId = await akunFixture(tx)
      const input = values()
      // Kunci ganda melanggar laporan_tautan_drive_file_kunci_unique.
      await expect(tautanRepo.insertTautanDrive({
        values: input, files: [rencana(DOKUMEN_A, 0, 0), rencana(DOKUMEN_A, 0, 1)], dilewati: [], akunId, now: NOW,
      }, tx)).rejects.toThrow()

      const tersisa = await tx.select().from(app.laporanTautan).where(eq(app.laporanTautan.token, input.token))
      expect(tersisa).toHaveLength(0)
      expect(await tx.select().from(app.driveJob)).toHaveLength(0)
    })
  })
})

describe('loadDriveRingkasanByTautanIds + toTautanListItem', () => {
  it('progres = baris yang sudah tidak MENUNGGU; galat job sinkron GAGAL terbaru; non-DRIVE diabaikan', async () => {
    await inRollback(async (tx) => {
      const akunId = await akunFixture(tx)
      const tautan = await tautanRepo.insertTautanDrive({
        values: values(), files: [rencana(DOKUMEN_A, 0, 0), rencana(DOKUMEN_A, 1, 1), rencana(DOKUMEN_B, 0, 2)], dilewati: [], akunId, now: NOW,
      }, tx)
      const files = await filesOf(tx, tautan.id)
      await tx.update(app.laporanTautanDriveFile).set({ status: 'TERUNGGAH', driveFileId: 'file-rahasia' })
        .where(eq(app.laporanTautanDriveFile.id, files[0].id))
      await tx.update(app.laporanTautanDriveFile).set({ status: 'DILEWATI' }).where(eq(app.laporanTautanDriveFile.id, files[1].id))
      await tx.update(app.driveJob).set({ status: 'GAGAL', galatKategori: 'KUOTA_PENUH', galatPesan: 'Kuota Google Drive penuh', selesaiPada: NOW })
        .where(eq(app.driveJob.tautanId, tautan.id))
      await tx.update(app.laporanTautan).set({ driveStatus: 'GAGAL', driveFolderId: 'folder-rahasia' })
        .where(eq(app.laporanTautan.id, tautan.id))
      const [login] = await tx.insert(app.laporanTautan).values({ ...values(), akses: 'LOGIN' }).returning()

      const ringkasan = await tautanRepo.loadDriveRingkasanByTautanIds([tautan.id, login.id], tx)
      expect([...ringkasan.keys()]).toEqual([tautan.id])
      expect(ringkasan.get(tautan.id)).toEqual({ selesai: 2, total: 3, galat: 'Kuota Google Drive penuh', akunPerluHubungUlang: false })

      const [row] = await tx.select().from(app.laporanTautan).where(eq(app.laporanTautan.id, tautan.id))
      const item = tautanMod.toTautanListItem(row, ringkasan.get(tautan.id))
      expect(item).toMatchObject({
        path: null, drive_status: 'GAGAL', drive_progres: { selesai: 2, total: 3 }, drive_url: null,
        drive_galat: 'Kuota Google Drive penuh', drive_tertunda_akun: false,
      })
      const json = JSON.stringify(item)
      for (const rahasia of ['folder-rahasia', 'file-rahasia', row.token, akunId]) expect(json).not.toContain(rahasia)
    })
  })

  it('runner dijeda TOKEN_TIDAK_VALID: drive_status tetap MENGUNGGAH, job MENUNGGU, riwayat menandai drive_tertunda_akun', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await inRollback(async (tx) => {
      const akunId = await akunFixture(tx, 'root-1')
      const tautan = await tautanRepo.insertTautanDrive({
        values: values(), files: [rencana(DOKUMEN_A, 0, 0)], dilewati: [], akunId, now: NOW,
      }, tx)
      const repo = driveRepo.createTautanDriveRepository(tx)
      const deps: DriveRunnerDeps = {
        isConfigured: () => true,
        jobs: {
          claim: ({ now }) => jobs.claimNextDriveJob({ now, executor: tx }),
          complete: (id, input) => jobs.completeDriveJob(id, { ...input, executor: tx }),
          fail: (id, input) => jobs.failDriveJob(id, { ...input, executor: tx }),
          nextScheduledAt: () => jobs.nextScheduledAt({ executor: tx }),
        },
        handlers: {
          SINKRON_TAUTAN: sinkron.createSinkronTautanHandler({
            repo,
            akun: {
              muatAkunUntukJob: (id) => akunMod.muatAkunUntukJob(id, { executor: tx }),
              perbaruiRootFolder: (id, folderId) => akunMod.perbaruiRootFolder(id, folderId, { executor: tx }),
            },
            driveClientFor: async () => { throw new DriveApiError('TOKEN_TIDAK_VALID') },
            bukaFile: async () => ({ ok: false }),
          }),
        },
        tandaiPerluHubungUlang: (id, now) => akunMod.tandaiPerluHubungUlang(id, now, { executor: tx }),
        tandaiTautanGagal: (id) => repo.tandaiGagal(id),
      }

      const hasil = await runner.runDriveRunnerOnce({ now: () => NOW, deps })
      expect(hasil).toMatchObject({ diproses: 1, dijeda: 1, gagal: 0 })

      const [row] = await tx.select().from(app.laporanTautan).where(eq(app.laporanTautan.id, tautan.id))
      expect(row.driveStatus).toBe('MENGUNGGAH')
      expect((await jobsOf(tx, tautan.id)).map((j) => j.status)).toEqual(['MENUNGGU'])

      const ringkasan = await tautanRepo.loadDriveRingkasanByTautanIds([tautan.id], tx)
      expect(ringkasan.get(tautan.id)).toMatchObject({ selesai: 0, total: 1, akunPerluHubungUlang: true })
      expect(tautanMod.toTautanListItem(row, ringkasan.get(tautan.id))).toMatchObject({
        drive_status: 'MENGUNGGAH', drive_tertunda_akun: true, drive_galat: null, drive_url: null,
      })
    })
  })
})

describe('cobaLagiTautanDrive', () => {
  async function gagalFixture(tx: Tx) {
    const akunId = await akunFixture(tx)
    const tautan = await tautanRepo.insertTautanDrive({ values: values(), files: [rencana(DOKUMEN_A, 0, 0)], dilewati: [], akunId, now: NOW }, tx)
    const [job] = await jobsOf(tx, tautan.id)
    await tx.update(app.driveJob).set({
      status: 'GAGAL', percobaan: 9, galatKategori: 'SEMENTARA', galatPesan: 'Gangguan', selesaiPada: NOW,
    }).where(eq(app.driveJob.id, job.id))
    await tx.update(app.laporanTautan).set({ driveStatus: 'GAGAL' }).where(eq(app.laporanTautan.id, tautan.id))
    return { akunId, tautanId: tautan.id, jobId: job.id }
  }
  const LATER = new Date(NOW.getTime() + 60 * 60_000)

  it('pembuat + GAGAL -> MENUNGGU; job GAGAL yang sama -> MENUNGGU percobaan 0, jadwal now, galat kosong', async () => {
    await inRollback(async (tx) => {
      const { tautanId, jobId } = await gagalFixture(tx)

      expect(await driveRepo.cobaLagiTautanDrive({ tautanId, userId, now: LATER }, tx)).toBe('DIJADWALKAN')

      const [row] = await tx.select().from(app.laporanTautan).where(eq(app.laporanTautan.id, tautanId))
      expect(row.driveStatus).toBe('MENUNGGU')
      const all = await jobsOf(tx, tautanId)
      expect(all).toHaveLength(1)
      expect(all[0]).toMatchObject({
        id: jobId, status: 'MENUNGGU', percobaan: 0, jadwalBerikut: LATER, galatKategori: null, galatPesan: null,
        selesaiPada: null, dikunciPada: null,
      })
    })
  })

  it('bukan GAGAL -> BUKAN_GAGAL tanpa perubahan; bukan pembuat / dicabut / tidak ada / bukan DRIVE -> TIDAK_DITEMUKAN', async () => {
    await inRollback(async (tx) => {
      const { tautanId } = await gagalFixture(tx)
      await tx.update(app.laporanTautan).set({ driveStatus: 'SIAP' }).where(eq(app.laporanTautan.id, tautanId))
      expect(await driveRepo.cobaLagiTautanDrive({ tautanId, userId, now: LATER }, tx)).toBe('BUKAN_GAGAL')
      expect((await jobsOf(tx, tautanId))[0].status).toBe('GAGAL')

      await tx.update(app.laporanTautan).set({ driveStatus: 'GAGAL' }).where(eq(app.laporanTautan.id, tautanId))
      if (userLainId !== userId) {
        expect(await driveRepo.cobaLagiTautanDrive({ tautanId, userId: userLainId, now: LATER }, tx)).toBe('TIDAK_DITEMUKAN')
      }
      expect(await driveRepo.cobaLagiTautanDrive({ tautanId, userId: randomUUID(), now: LATER }, tx)).toBe('TIDAK_DITEMUKAN')
      expect(await driveRepo.cobaLagiTautanDrive({ tautanId: randomUUID(), userId, now: LATER }, tx)).toBe('TIDAK_DITEMUKAN')

      const [login] = await tx.insert(app.laporanTautan).values({ ...values(), akses: 'LOGIN' }).returning()
      expect(await driveRepo.cobaLagiTautanDrive({ tautanId: login.id, userId, now: LATER }, tx)).toBe('TIDAK_DITEMUKAN')

      await tx.update(app.laporanTautan).set({ revokedAt: NOW, revokedBy: userId }).where(eq(app.laporanTautan.id, tautanId))
      expect(await driveRepo.cobaLagiTautanDrive({ tautanId, userId, now: LATER }, tx)).toBe('TIDAK_DITEMUKAN')
      const [row] = await tx.select().from(app.laporanTautan).where(eq(app.laporanTautan.id, tautanId))
      expect(row.driveStatus).toBe('GAGAL')
      expect((await jobsOf(tx, tautanId))[0].status).toBe('GAGAL')
    })
  })

  it('sudah ada job sinkron MENUNGGU -> job GAGAL tidak diubah (partial unique aman); tanpa job GAGAL -> enqueue baru', async () => {
    await inRollback(async (tx) => {
      const { akunId, tautanId, jobId } = await gagalFixture(tx)
      const kembar = await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId, tautanId, now: NOW })

      expect(await driveRepo.cobaLagiTautanDrive({ tautanId, userId, now: LATER }, tx)).toBe('DIJADWALKAN')
      const byId = new Map((await jobsOf(tx, tautanId)).map((j) => [j.id, j.status]))
      expect(byId.get(jobId)).toBe('GAGAL')
      expect(byId.get(kembar)).toBe('MENUNGGU')

      // Tanpa job sama sekali (mis. dibersihkan manual): job baru dibuat.
      await tx.delete(app.driveJob).where(eq(app.driveJob.tautanId, tautanId))
      await tx.update(app.laporanTautan).set({ driveStatus: 'GAGAL' }).where(eq(app.laporanTautan.id, tautanId))
      expect(await driveRepo.cobaLagiTautanDrive({ tautanId, userId, now: LATER }, tx)).toBe('DIJADWALKAN')
      const baru = await tx.select().from(app.driveJob)
        .where(and(eq(app.driveJob.tautanId, tautanId), eq(app.driveJob.jenis, 'SINKRON_TAUTAN')))
      expect(baru.map((j) => [j.status, j.akunId, j.jadwalBerikut])).toEqual([['MENUNGGU', akunId, LATER]])
    })
  })
})

describe('runner kembali memproses tautan setelah coba lagi', () => {
  it('GAGAL -> coba lagi -> runner mengunggah sampai SIAP dengan FakeDrive', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await inRollback(async (tx) => {
      const drive = new FakeDrive()
      const root = (await drive.createFolder({ name: 'DMS Kepser', appProperties: { dmsJenis: 'AKAR' } })).id
      const akunId = await akunFixture(tx, root)
      const tautan = await tautanRepo.insertTautanDrive({ values: values(), files: [rencana(DOKUMEN_A, 0, 0)], dilewati: [], akunId, now: NOW }, tx)
      const repo = driveRepo.createTautanDriveRepository(tx)
      const { Readable } = await import('node:stream')
      const deps: DriveRunnerDeps = {
        isConfigured: () => true,
        jobs: {
          claim: ({ now }) => jobs.claimNextDriveJob({ now, executor: tx }),
          complete: (id, input) => jobs.completeDriveJob(id, { ...input, executor: tx }),
          fail: (id, input) => jobs.failDriveJob(id, { ...input, executor: tx }),
          nextScheduledAt: () => jobs.nextScheduledAt({ executor: tx }),
        },
        handlers: {
          SINKRON_TAUTAN: sinkron.createSinkronTautanHandler({
            repo,
            akun: {
              muatAkunUntukJob: (id) => akunMod.muatAkunUntukJob(id, { executor: tx }),
              perbaruiRootFolder: (id, folderId) => akunMod.perbaruiRootFolder(id, folderId, { executor: tx }),
            },
            driveClientFor: async () => drive,
            bukaFile: async () => ({ ok: true, size: 3, buka: () => Readable.from(['isi']) }),
          }),
        },
        tandaiPerluHubungUlang: (id, now) => akunMod.tandaiPerluHubungUlang(id, now, { executor: tx }),
        tandaiTautanGagal: (id) => repo.tandaiGagal(id),
      }

      drive.failNext('uploadFile', 'KUOTA_PENUH')
      await runner.runDriveRunnerOnce({ now: () => NOW, deps })
      const [gagal] = await tx.select().from(app.laporanTautan).where(eq(app.laporanTautan.id, tautan.id))
      expect(gagal.driveStatus).toBe('GAGAL')

      expect(await driveRepo.cobaLagiTautanDrive({ tautanId: tautan.id, userId, now: NOW }, tx)).toBe('DIJADWALKAN')
      await runner.runDriveRunnerOnce({ now: () => NOW, deps })

      const [siap] = await tx.select().from(app.laporanTautan).where(eq(app.laporanTautan.id, tautan.id))
      expect(siap.driveStatus).toBe('SIAP')
      expect(siap.driveFolderUrl).toMatch(/^https:\/\/drive\.google\.com\/drive\/folders\//)
      expect((await jobsOf(tx, tautan.id)).map((j) => j.status)).toEqual(['SELESAI'])
    })
  })
})
