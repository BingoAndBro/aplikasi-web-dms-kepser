// Integration test (section 07 tautan Google Drive): repository sinkron +
// runner dengan antrean ASLI. Yang dibuktikan di PostgreSQL: update bersyarat
// tabel file/tautan, transaksi `tandaiSiap` (status + audit + job SELESAI) dan
// `pindahkanUnggahanTerbangKeMenghapus` (status + enqueue HAPUS_FILE), serta
// nasib job saat runner gagal -- termasuk job yang DIBATALKAN karena sudah ada
// job MENUNGGU kembar (failDriveJob tetap melaporkan 'MENUNGGU' = masih akan
// dicoba, jadi tautan tidak boleh ditandai GAGAL). Google Drive diganti FakeDrive.
//
// Prasyarat dan cara jalan: lihat sections/index.md. Semua data uji dibuat di
// transaksi yang di-ROLLBACK (executor = tx; transaksi repository menjadi savepoint).

import { randomBytes, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { DriveApiError } from '#/lib/google-drive/drive-errors'
import type { DriveRunnerDeps } from '#/lib/google-drive/runner'

import { FakeDrive } from '../unit/google-drive/helpers/fake-drive'

if (!process.env.DATABASE_URL) {
  process.loadEnvFile('.env')
}

type ClientModule = typeof import('#/db/client')
type AppSchema = typeof import('#/db/schema/app')
type AuditSchema = typeof import('#/db/schema/audit')
type JobsModule = typeof import('#/lib/google-drive/jobs')
type RepoModule = typeof import('#/lib/google-drive/tautan-drive-repository')
type AkunModule = typeof import('#/lib/google-drive/akun-repository')
type RunnerModule = typeof import('#/lib/google-drive/runner')
type SinkronModule = typeof import('#/lib/google-drive/sinkron-tautan')
type Tx = Parameters<Parameters<ClientModule['db']['transaction']>[0]>[0]

let client: ClientModule
let app: AppSchema
let audit: AuditSchema
let jobs: JobsModule
let repoMod: RepoModule
let akunMod: AkunModule
let runner: RunnerModule
let sinkron: SinkronModule
let userId: string
let userLabel: string

const NOW = new Date('2026-10-22T03:00:00.000Z')
const JAM = 60 * 60_000

class Rollback extends Error {}

beforeAll(async () => {
  client = await import('#/db/client')
  app = await import('#/db/schema/app')
  audit = await import('#/db/schema/audit')
  jobs = await import('#/lib/google-drive/jobs')
  repoMod = await import('#/lib/google-drive/tautan-drive-repository')
  akunMod = await import('#/lib/google-drive/akun-repository')
  runner = await import('#/lib/google-drive/runner')
  sinkron = await import('#/lib/google-drive/sinkron-tautan')
  const user = await client.pool.query<{ id: string; label: string }>(
    `select id, coalesce(nullif(nama_lengkap, ''), nullif(display_name, ''), username) as label from auth.users limit 1`,
  )
  if (!user.rows[0]) throw new Error('DB tes perlu minimal 1 user (jalankan seed, lihat sections/index.md).')
  userId = user.rows[0].id
  userLabel = user.rows[0].label
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

async function fixture(tx: Tx, { rootFolderId = null as string | null, jumlahFile = 2 } = {}) {
  const [akun] = await tx.insert(app.googleDriveAkun).values({
    email: `sinkron-${randomUUID()}@example.test`, refreshTokenEnc: 'v1:enc', rootFolderId, status: 'AKTIF', dihubungkanOleh: userId,
  }).returning({ id: app.googleDriveAkun.id })
  const [tautan] = await tx.insert(app.laporanTautan).values({
    token: randomBytes(24).toString('base64url'), sumber: 'LAPORAN_KEGIATAN', akses: 'DRIVE', judul: 'Uji sinkron Drive',
    createdBy: userId, createdAt: new Date('2026-10-20T20:00:00.000Z'), driveAkunId: akun.id, driveStatus: 'MENUNGGU',
    driveDokumenDilewati: [{ label: 'Dok kosong', alasan: 'tanpa lampiran tersedia' }],
  }).returning({ id: app.laporanTautan.id })
  const fileIds: string[] = []
  for (let i = jumlahFile; i >= 1; i -= 1) {
    const [row] = await tx.insert(app.laporanTautanDriveFile).values({
      tautanId: tautan.id, sumber: 'DOKUMEN', dokumenId: randomUUID(), lampiranIndex: 0,
      kunciLampiran: `DOKUMEN:0000000${i}-0000-4000-8000-000000000000:0`, namaFile: `Lampiran ${i}.pdf`,
      labelDokumen: `Dokumen ${i}`, urutan: i, contentType: 'application/pdf',
    }).returning({ id: app.laporanTautanDriveFile.id })
    fileIds.unshift(row.id)
  }
  return { akunId: akun.id, tautanId: tautan.id, fileIds }
}

function runnerDeps(tx: Tx, drive: FakeDrive, handlers?: DriveRunnerDeps['handlers']) {
  const repo = repoMod.createTautanDriveRepository(tx)
  const akun = {
    muatAkunUntukJob: (id: string) => akunMod.muatAkunUntukJob(id, { executor: tx }),
    perbaruiRootFolder: (id: string, folderId: string) => akunMod.perbaruiRootFolder(id, folderId, { executor: tx }),
  }
  const deps: DriveRunnerDeps = {
    isConfigured: () => true,
    jobs: {
      claim: ({ now }) => jobs.claimNextDriveJob({ now, executor: tx }),
      complete: (id, input) => jobs.completeDriveJob(id, { ...input, executor: tx }),
      fail: (id, input) => jobs.failDriveJob(id, { ...input, executor: tx }),
      nextScheduledAt: () => jobs.nextScheduledAt({ executor: tx }),
    },
    handlers: handlers ?? {
      SINKRON_TAUTAN: sinkron.createSinkronTautanHandler({
        repo, akun, driveClientFor: async () => drive,
        bukaFile: async (baris) => ({ ok: true, size: 5, buka: () => Readable.from([`isi ${baris.namaFile}`]) }),
      }),
    },
    tandaiPerluHubungUlang: (akunId, now) => akunMod.tandaiPerluHubungUlang(akunId, now, { executor: tx }),
    tandaiTautanGagal: (tautanId) => repo.tandaiGagal(tautanId),
  }
  return { deps, repo }
}

async function loadTautan(tx: Tx, id: string) {
  const [row] = await tx.select().from(app.laporanTautan).where(eq(app.laporanTautan.id, id))
  return row
}

async function jobsOf(tx: Tx, tautanId: string) {
  return tx.select().from(app.driveJob).where(eq(app.driveJob.tautanId, tautanId))
}

describe('runner + handler SINKRON_TAUTAN dengan repository DB', () => {
  it('jalur bahagia: SIAP + URL + folder/daftar isi tersimpan, file TERUNGGAH, audit actor null, job SELESAI', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await inRollback(async (tx) => {
      const drive = new FakeDrive()
      const root = (await drive.createFolder({ name: 'DMS Kepser', appProperties: { dmsJenis: 'AKAR' } })).id
      const { akunId, tautanId, fileIds } = await fixture(tx, { rootFolderId: root })
      const jobId = await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId, tautanId, now: NOW })
      const { deps } = runnerDeps(tx, drive)

      const ringkasan = await runner.runDriveRunnerOnce({ now: () => NOW, deps })
      expect(ringkasan).toMatchObject({ diproses: 1, selesai: 1, gagal: 0 })

      const tautan = await loadTautan(tx, tautanId)
      const folder = [...drive.objects.values()].find((o) => o.appProperties.dmsJenis === 'TAUTAN')!
      const daftarIsi = [...drive.objects.values()].find((o) => o.appProperties.dmsJenis === 'DAFTAR_ISI')!
      expect(tautan).toMatchObject({
        driveStatus: 'SIAP', driveFolderId: folder.id, driveFolderUrl: `https://drive.google.com/drive/folders/${folder.id}`,
        driveDaftarIsiFileId: daftarIsi.id, driveFolderDicobaPada: NOW,
      })
      expect(daftarIsi.content).toContain(`Dibagikan oleh: ${userLabel}\n`)
      expect(daftarIsi.content).toContain('- Dok kosong - tanpa lampiran tersedia\n')

      const files = await tx.select().from(app.laporanTautanDriveFile).where(eq(app.laporanTautanDriveFile.tautanId, tautanId))
      expect(files.map((f) => f.status)).toEqual(['TERUNGGAH', 'TERUNGGAH'])
      expect(files.every((f) => f.driveFileId && f.diunggahPada?.getTime() === NOW.getTime() && f.dicobaPada)).toBe(true)
      expect(fileIds).toHaveLength(2)

      const [job] = await tx.select().from(app.driveJob).where(eq(app.driveJob.id, jobId))
      expect(job).toMatchObject({ status: 'SELESAI', selesaiPada: NOW, dikunciPada: null })

      const auditRows = await tx.select().from(audit.auditLog)
        .where(and(eq(audit.auditLog.entityType, 'LAPORAN_TAUTAN'), eq(audit.auditLog.entityId, tautanId)))
      expect(auditRows).toHaveLength(1)
      expect(auditRows[0]).toMatchObject({
        aksi: 'DRIVE_TAUTAN_SIAP', actorUserId: null, metadataSnapshot: { jumlah_file: 2, jumlah_dilewati: 1 },
      })
    })
  })

  it('KUOTA_PENUH -> job GAGAL dengan kategori + pesan, drive_status GAGAL', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await inRollback(async (tx) => {
      const drive = new FakeDrive()
      const root = (await drive.createFolder({ name: 'DMS Kepser', appProperties: { dmsJenis: 'AKAR' } })).id
      const { akunId, tautanId } = await fixture(tx, { rootFolderId: root })
      await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId, tautanId, now: NOW })
      drive.failNext('uploadFile', 'KUOTA_PENUH')

      await runner.runDriveRunnerOnce({ now: () => NOW, deps: runnerDeps(tx, drive).deps })

      const [job] = await jobsOf(tx, tautanId)
      expect(job).toMatchObject({ status: 'GAGAL', galatKategori: 'KUOTA_PENUH', galatPesan: 'Kuota Google Drive penuh' })
      expect((await loadTautan(tx, tautanId)).driveStatus).toBe('GAGAL')
    })
  })

  it("job kembar: failDriveJob membatalkan job ini tetapi melaporkan 'MENUNGGU' -> tautan tidak GAGAL, job kembar tetap MENUNGGU", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await inRollback(async (tx) => {
      const { akunId, tautanId } = await fixture(tx)
      const jobId = await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId, tautanId, now: NOW })
      await tx.update(app.laporanTautan).set({ driveStatus: 'MENGUNGGAH' }).where(eq(app.laporanTautan.id, tautanId))
      let kembarId = ''
      const { deps } = runnerDeps(tx, new FakeDrive(), {
        SINKRON_TAUTAN: async () => {
          // Saat job ini PROSES, tautan yang sama di-enqueue lagi (mis. coba lagi) untuk nanti.
          kembarId = await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId, tautanId, now: new Date(NOW.getTime() + JAM) })
          throw new DriveApiError('SEMENTARA')
        },
      })

      const ringkasan = await runner.runDriveRunnerOnce({ now: () => NOW, deps })
      expect(ringkasan).toMatchObject({ diproses: 1, dijeda: 1, gagal: 0 })

      const byId = new Map((await jobsOf(tx, tautanId)).map((j) => [j.id, j]))
      expect(byId.get(jobId)).toMatchObject({ status: 'DIBATALKAN', galatKategori: 'SEMENTARA', selesaiPada: NOW })
      expect(byId.get(kembarId)).toMatchObject({ status: 'MENUNGGU', jadwalBerikut: new Date(NOW.getTime() + JAM) })
      expect((await loadTautan(tx, tautanId)).driveStatus).toBe('MENGUNGGAH')
    })
  })

  it("job kembar saat TOKEN_TIDAK_VALID: tetap 'MENUNGGU', akun ditandai perlu hubung ulang, tautan tidak GAGAL", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await inRollback(async (tx) => {
      const { akunId, tautanId } = await fixture(tx)
      const jobId = await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId, tautanId, now: NOW })
      const { deps } = runnerDeps(tx, new FakeDrive(), {
        SINKRON_TAUTAN: async () => {
          await jobs.enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId, tautanId, now: NOW })
          throw new DriveApiError('TOKEN_TIDAK_VALID')
        },
      })

      const ringkasan = await runner.runDriveRunnerOnce({ now: () => NOW, deps })
      // Job kembar milik akun yang kini dijeda tidak diklaim lagi di putaran yang sama.
      expect(ringkasan).toMatchObject({ diproses: 1, dijeda: 1, gagal: 0 })
      const [akun] = await tx.select().from(app.googleDriveAkun).where(eq(app.googleDriveAkun.id, akunId))
      expect(akun.perluHubungUlangSejak).toEqual(NOW)
      const statuses = (await jobsOf(tx, tautanId)).map((j) => [j.id === jobId ? 'lama' : 'kembar', j.status]).sort()
      expect(statuses).toEqual([['kembar', 'MENUNGGU'], ['lama', 'DIBATALKAN']])
      expect((await loadTautan(tx, tautanId)).driveStatus).toBe('MENUNGGU')
    })
  })
})

describe('createTautanDriveRepository (update bersyarat)', () => {
  it('setDriveStatus / tandaiGagal tidak mengubah tautan yang sudah dicabut', async () => {
    await inRollback(async (tx) => {
      const { tautanId } = await fixture(tx)
      const repo = repoMod.createTautanDriveRepository(tx)
      expect(await repo.setDriveStatus(tautanId, { dari: ['MENUNGGU'], ke: 'MENGUNGGAH' })).toBe(true)
      expect(await repo.setDriveStatus(tautanId, { dari: ['MENUNGGU'], ke: 'MENGUNGGAH' })).toBe(false)

      await tx.update(app.laporanTautan).set({ revokedAt: NOW, revokedBy: userId, driveStatus: 'MENGHAPUS' })
        .where(eq(app.laporanTautan.id, tautanId))
      expect(await repo.setDriveStatus(tautanId, { dari: ['MENGHAPUS'], ke: 'MENGUNGGAH' })).toBe(false)
      expect(await repo.tandaiGagal(tautanId)).toBe(false)
      expect((await loadTautan(tx, tautanId)).driveStatus).toBe('MENGHAPUS')
      expect(await repo.tandaiSiap({ id: tautanId, jobId: randomUUID(), url: 'https://x', now: NOW })).toBe(false)
    })
  })

  it('ambilBarisMenungguBerikut urut kunci_lampiran; terunggah/dilewati bersyarat MENUNGGU', async () => {
    await inRollback(async (tx) => {
      const { tautanId, fileIds } = await fixture(tx, { jumlahFile: 3 })
      const repo = repoMod.createTautanDriveRepository(tx)
      const pertama = await repo.ambilBarisMenungguBerikut(tautanId)
      expect(pertama).toMatchObject({ id: fileIds[0], namaFile: 'Lampiran 1.pdf', dicobaPada: null })

      expect(await repo.tandaiBarisTerunggah(fileIds[0], 'drive-1', NOW)).toBe(true)
      expect(await repo.tandaiBarisTerunggah(fileIds[0], 'drive-lain', NOW)).toBe(false)
      expect(await repo.tandaiBarisDilewati(fileIds[0])).toBe(false)
      expect((await repo.ambilBarisMenungguBerikut(tautanId))?.id).toBe(fileIds[1])
    })
  })

  it('unggahan terbang: baris DILEWATI -> MENGHAPUS + drive_file_id + job HAPUS_FILE dalam satu transaksi', async () => {
    await inRollback(async (tx) => {
      const { akunId, tautanId, fileIds } = await fixture(tx)
      const repo = repoMod.createTautanDriveRepository(tx)
      await tx.update(app.laporanTautanDriveFile).set({ status: 'DILEWATI', keteranganHapus: 'DIMUSNAHKAN' })
        .where(eq(app.laporanTautanDriveFile.id, fileIds[0]))

      expect(await repo.pindahkanUnggahanTerbangKeMenghapus({ barisId: fileIds[0], tautanId, akunId, driveFileId: 'drive-9', now: NOW }))
        .toBe(true)
      const [file] = await tx.select().from(app.laporanTautanDriveFile).where(eq(app.laporanTautanDriveFile.id, fileIds[0]))
      expect(file).toMatchObject({ status: 'MENGHAPUS', keteranganHapus: 'DIMUSNAHKAN', driveFileId: 'drive-9' })
      expect((await jobsOf(tx, tautanId)).map((j) => [j.jenis, j.status])).toEqual([['HAPUS_FILE', 'MENUNGGU']])

      // Baris yang bukan DILEWATI tidak diubah dan tidak membuat job.
      expect(await repo.pindahkanUnggahanTerbangKeMenghapus({ barisId: fileIds[1], tautanId, akunId, driveFileId: 'x', now: NOW }))
        .toBe(false)
      expect(await jobsOf(tx, tautanId)).toHaveLength(1)
    })
  })

  it('muatDataDaftarIsi: label sumber, nama pembuat, baris file urut, dokumen dilewati; tanpa id/path', async () => {
    await inRollback(async (tx) => {
      const { tautanId } = await fixture(tx)
      const data = await repoMod.createTautanDriveRepository(tx).muatDataDaftarIsi(tautanId)
      expect(data).toEqual({
        judul: 'Uji sinkron Drive',
        sumberLabel: 'Laporan Kegiatan',
        dibagikanOleh: userLabel,
        files: [
          { labelDokumen: 'Dokumen 1', namaFile: 'Lampiran 1.pdf', urutan: 1, status: 'MENUNGGU', keteranganHapus: null },
          { labelDokumen: 'Dokumen 2', namaFile: 'Lampiran 2.pdf', urutan: 2, status: 'MENUNGGU', keteranganHapus: null },
        ],
        dilewati: [{ label: 'Dok kosong', alasan: 'tanpa lampiran tersedia' }],
      })
      expect(await repoMod.createTautanDriveRepository(tx).muatDataDaftarIsi(randomUUID())).toBeNull()
    })
  })
})
