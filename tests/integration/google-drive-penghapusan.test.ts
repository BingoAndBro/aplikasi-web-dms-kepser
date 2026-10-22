// Integration test (section 09 tautan Google Drive): empat pemicu penghapusan
// salinan Drive -- cabut tautan, pemusnahan berkas (approve_destruction),
// Pembersihan Dokumen, hapus permanen dokumen non-material (P4) -- di
// PostgreSQL asli. Dibuktikan: perubahan status baris file + job hapus lahir
// di transaksi pemicu (rollback -> tidak ada apa pun), update lifecycle yang
// gagal bersyarat tidak membuat job, dan runner + handler HAPUS_* dengan
// repository DB benar-benar menghapus folder/file di FakeDrive.
//
// Prasyarat: lihat sections/index.md. Semua data uji dibuat di transaksi yang
// di-ROLLBACK (executor = tx; transaksi repository = savepoint).

import { randomBytes, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { RencanaFileDrive } from '#/lib/google-drive/rencana-file'
import type { DriveRunnerDeps } from '#/lib/google-drive/runner'

import { FakeDrive } from '../unit/google-drive/helpers/fake-drive'

if (!process.env.DATABASE_URL) {
  process.loadEnvFile('.env')
}

type ClientModule = typeof import('#/db/client')
type AppSchema = typeof import('#/db/schema/app')
type ArsipSchema = typeof import('#/db/schema/arsip')
type AuditSchema = typeof import('#/db/schema/audit')
type DokumenSchema = typeof import('#/db/schema/dokumen')
type Tx = Parameters<Parameters<ClientModule['db']['transaction']>[0]>[0]

let client: ClientModule
let app: AppSchema
let arsip: ArsipSchema
let audit: AuditSchema
let dokumen: DokumenSchema
let jobs: typeof import('#/lib/google-drive/jobs')
let driveRepo: typeof import('#/lib/google-drive/tautan-drive-repository')
let tautanRepo: typeof import('#/lib/laporan/tautan-repository')
let akunMod: typeof import('#/lib/google-drive/akun-repository')
let runner: typeof import('#/lib/google-drive/runner')
let sinkron: typeof import('#/lib/google-drive/sinkron-tautan')
let hapus: typeof import('#/lib/google-drive/hapus')
let penghapusan: typeof import('#/lib/google-drive/penghapusan')
let berkasService: typeof import('#/lib/archive/berkas-arsip-service')
let pembersihan: typeof import('#/lib/dokumen/pembersihan-service')
let base: { fungsiId: string; kegiatanId: string; komponenId: string; userId: string; klasifikasiId: string }

const NOW = new Date('2026-10-22T03:00:00.000Z')
/** Pemicu (cabut/lifecycle) memakai waktu nyata; runner sesudahnya harus berjalan setelahnya. */
const setelahPemicu = () => new Date(Date.now() + 60_000)

class Rollback extends Error {}

beforeAll(async () => {
  client = await import('#/db/client')
  app = await import('#/db/schema/app')
  arsip = await import('#/db/schema/arsip')
  audit = await import('#/db/schema/audit')
  dokumen = await import('#/db/schema/dokumen')
  jobs = await import('#/lib/google-drive/jobs')
  driveRepo = await import('#/lib/google-drive/tautan-drive-repository')
  tautanRepo = await import('#/lib/laporan/tautan-repository')
  akunMod = await import('#/lib/google-drive/akun-repository')
  runner = await import('#/lib/google-drive/runner')
  sinkron = await import('#/lib/google-drive/sinkron-tautan')
  hapus = await import('#/lib/google-drive/hapus')
  penghapusan = await import('#/lib/google-drive/penghapusan')
  berkasService = await import('#/lib/archive/berkas-arsip-service')
  pembersihan = await import('#/lib/dokumen/pembersihan-service')

  const komponen = await client.pool.query<{ id: string; kegiatan_id: string; fungsi_id: string }>(
    `select k.id, k.kegiatan_id, g.fungsi_id
       from master.master_komponen k
       join master.master_kegiatan g on g.id = k.kegiatan_id
      limit 1`,
  )
  const user = await client.pool.query<{ id: string }>('select id from auth.users order by created_at limit 1')
  const klasifikasi = await client.pool.query<{ id: string }>('select id from arsip.master_klasifikasi_arsip limit 1')
  if (!komponen.rows[0] || !user.rows[0] || !klasifikasi.rows[0]) {
    throw new Error('DB tes perlu minimal 1 komponen, 1 user, dan 1 klasifikasi arsip (jalankan seed, lihat sections/index.md).')
  }
  base = {
    fungsiId: komponen.rows[0].fungsi_id,
    kegiatanId: komponen.rows[0].kegiatan_id,
    komponenId: komponen.rows[0].id,
    userId: user.rows[0].id,
    klasifikasiId: klasifikasi.rows[0].id,
  }
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

/** Jalankan `run` di savepoint yang lalu dibatalkan (meniru transaksi pemicu yang gagal). */
async function inSavepointRolledBack(tx: Tx, run: (sp: Tx) => Promise<void>) {
  await expect(tx.transaction(async (sp) => {
    await run(sp)
    throw new Rollback()
  })).rejects.toBeInstanceOf(Rollback)
}

async function akunFixture(tx: Tx, rootFolderId: string | null = null) {
  const [akun] = await tx.insert(app.googleDriveAkun).values({
    email: `hapus-${randomUUID()}@example.test`, refreshTokenEnc: 'v1:enc', rootFolderId, status: 'AKTIF', dihubungkanOleh: base.userId,
  }).returning({ id: app.googleDriveAkun.id })
  return akun.id
}

async function dokumenFixture(tx: Tx, judul = 'Uji hapus Drive') {
  const [row] = await tx.insert(dokumen.dokumenTransaksi).values({
    judul, fungsiId: base.fungsiId, kegiatanJenisId: base.kegiatanId, tahun: 2026, tanggal: '2026-10-01',
    createdBy: base.userId, status: 'TERSIMPAN', isNonMaterial: true,
  }).returning({ id: dokumen.dokumenTransaksi.id })
  return row.id
}

function rencanaDokumen(dokumenId: string, urutan: number): RencanaFileDrive {
  return {
    sumber: 'DOKUMEN', dokumenId, lampiranIndex: 0, manualArsipId: null, attachmentId: null,
    kunci: `DOKUMEN:${dokumenId}:0`, namaFile: `Lampiran ${urutan}.pdf`, labelDokumen: `Dokumen ${urutan}`,
    urutan, contentType: 'application/pdf',
  }
}

function rencanaManual(manualArsipId: string, attachmentId: string, urutan: number): RencanaFileDrive {
  return {
    sumber: 'MANUAL_ARSIP', dokumenId: null, lampiranIndex: null, manualArsipId, attachmentId,
    kunci: `MANUAL:${manualArsipId}:${attachmentId}`, namaFile: `Manual ${urutan}.pdf`, labelDokumen: `Manual ${urutan}`,
    urutan, contentType: 'application/pdf',
  }
}

async function tautanDrive(tx: Tx, akunId: string, files: RencanaFileDrive[]) {
  return tautanRepo.insertTautanDrive({
    values: {
      token: randomBytes(24).toString('base64url'), sumber: 'LAPORAN_KEGIATAN', judul: 'Bukti Dukung Uji',
      keterangan: null, dokumenIds: files.flatMap(f => (f.dokumenId ? [f.dokumenId] : [])),
      manualArsipIds: files.flatMap(f => (f.manualArsipId ? [f.manualArsipId] : [])), createdBy: base.userId,
    },
    files,
    dilewati: [],
    akunId,
    now: NOW,
  }, tx)
}

async function filesOf(tx: Tx, tautanId: string) {
  const rows = await tx.select().from(app.laporanTautanDriveFile).where(eq(app.laporanTautanDriveFile.tautanId, tautanId))
  return rows.sort((a, b) => a.urutan - b.urutan)
}

async function jobsOf(tx: Tx, tautanId: string) {
  return tx.select({ jenis: app.driveJob.jenis, status: app.driveJob.status }).from(app.driveJob)
    .where(eq(app.driveJob.tautanId, tautanId))
}

async function tautanOf(tx: Tx, id: string) {
  const [row] = await tx.select().from(app.laporanTautan).where(eq(app.laporanTautan.id, id))
  return row
}

function runnerDeps(tx: Tx, drive: FakeDrive): DriveRunnerDeps {
  const repo = driveRepo.createTautanDriveRepository(tx)
  const akun = {
    muatAkunUntukJob: (id: string) => akunMod.muatAkunUntukJob(id, { executor: tx }),
    perbaruiRootFolder: (id: string, folderId: string) => akunMod.perbaruiRootFolder(id, folderId, { executor: tx }),
  }
  const hapusDeps = {
    repo,
    akun,
    driveClientFor: async () => drive,
    jobs: {
      findActiveSinkron: (tautanId: string, now: Date) => jobs.findActiveSinkronJob(tautanId, { now, executor: tx }),
      defer: (id: string, input: { now: Date; ms: number }) => jobs.deferDriveJob(id, { ...input, executor: tx }),
    },
  }
  return {
    isConfigured: () => true,
    jobs: {
      claim: ({ now }) => jobs.claimNextDriveJob({ now, executor: tx }),
      complete: (id, input) => jobs.completeDriveJob(id, { ...input, executor: tx }),
      fail: (id, input) => jobs.failDriveJob(id, { ...input, executor: tx }),
      nextScheduledAt: () => jobs.nextScheduledAt({ executor: tx }),
    },
    handlers: {
      SINKRON_TAUTAN: sinkron.createSinkronTautanHandler({
        repo, akun, driveClientFor: async () => drive,
        bukaFile: async (baris) => ({ ok: true, size: 3, buka: () => Readable.from([`isi ${baris.namaFile}`]) }),
      }),
      HAPUS_TAUTAN: hapus.createHapusTautanHandler(hapusDeps),
      HAPUS_FILE: hapus.createHapusFileHandler(hapusDeps),
    },
    tandaiPerluHubungUlang: (id, now) => akunMod.tandaiPerluHubungUlang(id, now, { executor: tx }),
    tandaiTautanGagal: (id) => repo.tandaiGagal(id),
  }
}

async function driveSiap(tx: Tx, files: (dokumenId: string) => RencanaFileDrive[]) {
  const drive = new FakeDrive()
  const root = (await drive.createFolder({ name: 'DMS Kepser', appProperties: { dmsJenis: 'AKAR' } })).id
  const akunId = await akunFixture(tx, root)
  const dokumenId = await dokumenFixture(tx)
  const tautan = await tautanDrive(tx, akunId, files(dokumenId))
  const deps = runnerDeps(tx, drive)
  await runner.runDriveRunnerOnce({ now: () => NOW, deps })
  expect((await tautanOf(tx, tautan.id)).driveStatus).toBe('SIAP')
  return { drive, deps, akunId, dokumenId, tautanId: tautan.id }
}

const folderTautan = (drive: FakeDrive) => [...drive.objects.values()].find((o) => o.appProperties.dmsJenis === 'TAUTAN')
const lampiranDi = (drive: FakeDrive) => [...drive.objects.values()].filter((o) => o.appProperties.dmsJenis === 'LAMPIRAN')
const daftarIsiDi = (drive: FakeDrive) => [...drive.objects.values()].find((o) => o.appProperties.dmsJenis === 'DAFTAR_ISI')

describe('cabut tautan (revokeTautanByCreator)', () => {
  it('satu transaksi: revoked_at, MENGHAPUS, job sinkron & hapus-file MENUNGGU dibatalkan, HAPUS_TAUTAN', async () => {
    await inRollback(async (tx) => {
      const akunId = await akunFixture(tx)
      const dokumenId = await dokumenFixture(tx)
      const tautan = await tautanDrive(tx, akunId, [rencanaDokumen(dokumenId, 1)])
      await jobs.enqueueDriveJob(tx, { jenis: 'HAPUS_FILE', akunId, tautanId: tautan.id, now: NOW })

      expect(await tautanRepo.revokeTautanByCreator(tautan.id, base.userId, tx)).toBe('revoked')

      const row = await tautanOf(tx, tautan.id)
      expect(row.revokedAt).not.toBeNull()
      expect(row.revokedBy).toBe(base.userId)
      expect(row.driveStatus).toBe('MENGHAPUS')
      expect((await jobsOf(tx, tautan.id)).sort((a, b) => a.jenis.localeCompare(b.jenis))).toEqual([
        { jenis: 'HAPUS_FILE', status: 'DIBATALKAN' },
        { jenis: 'HAPUS_TAUTAN', status: 'MENUNGGU' },
        { jenis: 'SINKRON_TAUTAN', status: 'DIBATALKAN' },
      ])

      // Cabut kedua: tidak mengubah apa pun.
      expect(await tautanRepo.revokeTautanByCreator(tautan.id, base.userId, tx)).toBe('already_revoked')
      expect(await jobsOf(tx, tautan.id)).toHaveLength(3)
      expect(await tautanRepo.revokeTautanByCreator(tautan.id, randomUUID(), tx)).toBe('not_found')
    })
  })

  it('tautan LOGIN: hanya revoked_at, tanpa job Drive', async () => {
    await inRollback(async (tx) => {
      const [login] = await tx.insert(app.laporanTautan).values({
        token: randomBytes(24).toString('base64url'), sumber: 'LAPORAN_SAYA', akses: 'LOGIN', judul: 'Login', createdBy: base.userId,
      }).returning()

      expect(await tautanRepo.revokeTautanByCreator(login.id, base.userId, tx)).toBe('revoked')
      expect((await tautanOf(tx, login.id)).driveStatus).toBeNull()
      expect(await tx.select().from(app.driveJob)).toHaveLength(0)
    })
  })

  it('rollback transaksi pemicu: tautan tetap aktif, tidak ada job hapus, sinkron tetap MENUNGGU', async () => {
    await inRollback(async (tx) => {
      const akunId = await akunFixture(tx)
      const tautan = await tautanDrive(tx, akunId, [rencanaDokumen(await dokumenFixture(tx), 1)])

      await inSavepointRolledBack(tx, async (sp) => {
        expect(await tautanRepo.revokeTautanByCreator(tautan.id, base.userId, sp)).toBe('revoked')
      })

      const row = await tautanOf(tx, tautan.id)
      expect(row).toMatchObject({ revokedAt: null, driveStatus: 'MENUNGGU' })
      expect(await jobsOf(tx, tautan.id)).toEqual([{ jenis: 'SINKRON_TAUTAN', status: 'MENUNGGU' }])
    })
  })

  it('ujung ke ujung: tautan SIAP dicabut -> runner menghapus folder di FakeDrive -> DIHAPUS + baris DIHAPUS (DICABUT) + audit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await inRollback(async (tx) => {
      const { drive, deps, tautanId } = await driveSiap(tx, (id) => [rencanaDokumen(id, 1), rencanaDokumen(randomUUID(), 2)])
      const folder = folderTautan(drive)!
      expect(lampiranDi(drive)).toHaveLength(2)

      expect(await tautanRepo.revokeTautanByCreator(tautanId, base.userId, tx)).toBe('revoked')
      const waktuHapus = setelahPemicu()
      const hasil = await runner.runDriveRunnerOnce({ now: () => waktuHapus, deps })
      expect(hasil).toMatchObject({ diproses: 1, selesai: 1, gagal: 0 })

      // Folder, lampiran, dan DAFTAR_ISI.txt benar-benar terhapus dari Drive.
      expect(drive.objects.has(folder.id)).toBe(false)
      expect(lampiranDi(drive)).toEqual([])
      expect(daftarIsiDi(drive)).toBeUndefined()
      expect(drive.calls.filter((c) => c.method === 'deleteFile').map((c) => c.args[0])).toEqual([folder.id])

      expect((await tautanOf(tx, tautanId)).driveStatus).toBe('DIHAPUS')
      expect((await filesOf(tx, tautanId)).map((f) => [f.status, f.keteranganHapus, f.dihapusPada])).toEqual([
        ['DIHAPUS', 'DICABUT', waktuHapus],
        ['DIHAPUS', 'DICABUT', waktuHapus],
      ])
      expect(await jobsOf(tx, tautanId)).toContainEqual({ jenis: 'HAPUS_TAUTAN', status: 'SELESAI' })
      const auditRows = await tx.select().from(audit.auditLog)
        .where(and(eq(audit.auditLog.entityId, tautanId), eq(audit.auditLog.aksi, 'DRIVE_TAUTAN_DIHAPUS')))
      expect(auditRows).toHaveLength(1)
      expect(auditRows[0]).toMatchObject({ entityType: 'LAPORAN_TAUTAN', actorUserId: null, metadataSnapshot: { jumlah_file: 2 } })
    })
  })

  it('akun DIPUTUS saat cabut: job GAGAL AKUN_DIPUTUS dan muncul di daftar "perlu dihapus manual"', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await inRollback(async (tx) => {
      const { drive, deps, akunId, tautanId } = await driveSiap(tx, (id) => [rencanaDokumen(id, 1)])
      await tx.update(app.googleDriveAkun).set({ status: 'DIPUTUS', refreshTokenEnc: null }).where(eq(app.googleDriveAkun.id, akunId))

      await tautanRepo.revokeTautanByCreator(tautanId, base.userId, tx)
      const waktuHapus = setelahPemicu()
      await runner.runDriveRunnerOnce({ now: () => waktuHapus, deps })

      const [job] = await tx.select().from(app.driveJob)
        .where(and(eq(app.driveJob.tautanId, tautanId), eq(app.driveJob.jenis, 'HAPUS_TAUTAN')))
      expect(job).toMatchObject({ status: 'GAGAL', galatKategori: 'AKUN_DIPUTUS' })
      expect(folderTautan(drive)).toBeDefined()
      const ringkasan = await akunMod.muatRingkasanAdmin({ executor: tx })
      expect(ringkasan.perlu_hapus_manual.map((p) => [p.job_id, p.kategori, p.jumlah_file])).toEqual([[job.id, 'AKUN_DIPUTUS', null]])
    })
  })
})

describe('pemusnahan berkas (transitionBerkasArchiveStatus approve_destruction)', () => {
  async function berkasFixture(tx: Tx, statusArsip: 'AKTIF' | 'USUL_MUSNAH', dokumenId: string, manualId: string) {
    const [berkas] = await tx.insert(arsip.berkasArsip).values({
      klasifikasiId: base.klasifikasiId, tahunAnggaran: 2098, klasifikasiNamaSnapshot: 'Uji pemusnahan Drive',
      statusBerkas: 'CLOSED', statusArsip, closedAt: NOW, closedBy: base.userId, createdBy: base.userId,
    }).returning({ id: arsip.berkasArsip.id })
    await tx.insert(arsip.manualArsip).values({
      id: manualId, nama: 'Manual uji', tanggal: '2026-10-01', keterangan: 'uji', fungsiId: base.fungsiId,
      kegiatanId: base.kegiatanId, komponenId: base.komponenId, createdBy: base.userId,
    })
    await tx.insert(arsip.berkasArsipItem).values([
      { berkasId: berkas.id, sourceType: 'WORKFLOW', dokumenId, addedBy: base.userId },
      { berkasId: berkas.id, sourceType: 'MANUAL', manualArsipId: manualId, addedBy: base.userId },
    ])
    return berkas.id
  }

  async function skenario(tx: Tx) {
    const drive = new FakeDrive()
    const root = (await drive.createFolder({ name: 'DMS Kepser', appProperties: { dmsJenis: 'AKAR' } })).id
    const akunId = await akunFixture(tx, root)
    const dokumenId = await dokumenFixture(tx)
    const manualId = randomUUID()
    const attachmentId = randomUUID()
    const berkasId = await berkasFixture(tx, 'USUL_MUSNAH', dokumenId, manualId)
    const lain = randomUUID()
    const tautan = await tautanDrive(tx, akunId, [
      rencanaDokumen(dokumenId, 1), rencanaManual(manualId, attachmentId, 2), rencanaDokumen(lain, 3),
    ])
    const deps = runnerDeps(tx, drive)
    await runner.runDriveRunnerOnce({ now: () => NOW, deps })
    // Tautan kedua masih menunggu unggah (baris MENUNGGU), tautan ketiga sudah dicabut.
    const menunggu = await tautanDrive(tx, akunId, [rencanaDokumen(dokumenId, 1)])
    const dicabut = await tautanDrive(tx, akunId, [rencanaDokumen(dokumenId, 1)])
    await tx.update(app.laporanTautan).set({ revokedAt: NOW, revokedBy: base.userId, driveStatus: 'MENGHAPUS' })
      .where(eq(app.laporanTautan.id, dicabut.id))
    await tx.delete(app.driveJob).where(inArray(app.driveJob.tautanId, [menunggu.id, dicabut.id]))
    return { drive, deps, berkasId, tautanId: tautan.id, menungguId: menunggu.id, dicabutId: dicabut.id }
  }

  const approve = (tx: Tx, berkasId: string, repository = berkasService.createBerkasArsipRepositoryForExecutor(tx)) =>
    berkasService.transitionBerkasArchiveStatus(
      { berkasId, actorUserId: base.userId, action: 'approve_destruction' },
      { repository },
    )

  it('TERUNGGAH -> MENGHAPUS, MENUNGGU -> DILEWATI (DIMUSNAHKAN), HAPUS_FILE per tautan; tautan dicabut tidak disentuh', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await inRollback(async (tx) => {
      const { berkasId, tautanId, menungguId, dicabutId } = await skenario(tx)

      const updated = await approve(tx, berkasId)
      expect(updated.status_arsip).toBe('DIMUSNAHKAN')

      expect((await filesOf(tx, tautanId)).map((f) => [f.status, f.keteranganHapus])).toEqual([
        ['MENGHAPUS', 'DIMUSNAHKAN'],
        ['MENGHAPUS', 'DIMUSNAHKAN'],
        ['TERUNGGAH', null],
      ])
      expect((await filesOf(tx, menungguId)).map((f) => [f.status, f.keteranganHapus])).toEqual([['DILEWATI', 'DIMUSNAHKAN']])
      expect((await filesOf(tx, dicabutId)).map((f) => f.status)).toEqual(['MENUNGGU'])
      expect(await jobsOf(tx, tautanId)).toContainEqual({ jenis: 'HAPUS_FILE', status: 'MENUNGGU' })
      expect(await jobsOf(tx, menungguId)).toEqual([{ jenis: 'HAPUS_FILE', status: 'MENUNGGU' }])
      expect(await jobsOf(tx, dicabutId)).toEqual([])
      const activity = await tx.select().from(arsip.berkasArsipActivity).where(eq(arsip.berkasArsipActivity.berkasId, berkasId))
      expect(activity.map((a) => a.eventType)).toEqual(['BERKAS_DIMUSNAHKAN'])
    })
  })

  it('runner HAPUS_FILE menghapus salinan di FakeDrive dan menandai "telah dimusnahkan" di DAFTAR_ISI.txt', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await inRollback(async (tx) => {
      const { drive, deps, berkasId, tautanId } = await skenario(tx)
      const sebelum = lampiranDi(drive)
      expect(sebelum).toHaveLength(3)

      await approve(tx, berkasId)
      const waktuHapus = setelahPemicu()
      await runner.runDriveRunnerOnce({ now: () => waktuHapus, deps })

      expect(lampiranDi(drive).map((o) => o.name)).toEqual(['Lampiran 3.pdf'])
      const isi = daftarIsiDi(drive)?.content ?? ''
      expect(isi).toContain('- Lampiran 1.pdf (telah dimusnahkan)')
      expect(isi).toContain('- Manual 2.pdf (telah dimusnahkan)')
      expect(isi).toContain('- Lampiran 3.pdf\n')
      expect((await filesOf(tx, tautanId)).map((f) => f.status)).toEqual(['DIHAPUS', 'DIHAPUS', 'TERUNGGAH'])
      expect((await tautanOf(tx, tautanId)).driveStatus).toBe('SIAP')
      const [auditRow] = await tx.select().from(audit.auditLog)
        .where(and(eq(audit.auditLog.entityId, tautanId), eq(audit.auditLog.aksi, 'DRIVE_FILE_DIHAPUS')))
      expect(auditRow).toMatchObject({ actorUserId: null, metadataSnapshot: { jumlah_file: 2, keterangan: ['DIMUSNAHKAN'] } })
    })
  })

  it('rollback transaksi lifecycle: status berkas, baris file, job hapus, dan activity tidak ada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await inRollback(async (tx) => {
      const { berkasId, tautanId } = await skenario(tx)

      await inSavepointRolledBack(tx, async (sp) => {
        await approve(sp, berkasId)
      })

      const [berkas] = await tx.select().from(arsip.berkasArsip).where(eq(arsip.berkasArsip.id, berkasId))
      expect(berkas.statusArsip).toBe('USUL_MUSNAH')
      expect((await filesOf(tx, tautanId)).map((f) => f.status)).toEqual(['TERUNGGAH', 'TERUNGGAH', 'TERUNGGAH'])
      expect((await jobsOf(tx, tautanId)).filter((j) => j.jenis === 'HAPUS_FILE')).toEqual([])
      expect(await tx.select().from(arsip.berkasArsipActivity).where(eq(arsip.berkasArsipActivity.berkasId, berkasId))).toEqual([])
    })
  })

  it('update lifecycle gagal bersyarat (status sudah berubah) -> tidak ada job hapus maupun perubahan baris', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await inRollback(async (tx) => {
      const { berkasId, tautanId } = await skenario(tx)
      // Pengguna lain sudah membatalkan usulan; pembaca ini masih melihat USUL_MUSNAH.
      await tx.update(arsip.berkasArsip).set({ statusArsip: 'AKTIF' }).where(eq(arsip.berkasArsip.id, berkasId))
      const repository = berkasService.createBerkasArsipRepositoryForExecutor(tx)
      const basi = {
        ...repository,
        findBerkasById: async (id: string) => {
          const row = await repository.findBerkasById(id)
          return row ? { ...row, statusArsip: 'USUL_MUSNAH' as const } : null
        },
      }

      await expect(approve(tx, berkasId, basi)).rejects.toMatchObject({ code: 'BERKAS_LIFECYCLE_INVALID' })

      expect((await filesOf(tx, tautanId)).map((f) => f.status)).toEqual(['TERUNGGAH', 'TERUNGGAH', 'TERUNGGAH'])
      expect((await jobsOf(tx, tautanId)).filter((j) => j.jenis === 'HAPUS_FILE')).toEqual([])
    })
  })

  it('USUL_MUSNAH dan cancel_proposal tidak membuat job', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await inRollback(async (tx) => {
      const { berkasId, tautanId } = await skenario(tx)
      const repository = berkasService.createBerkasArsipRepositoryForExecutor(tx)

      await berkasService.transitionBerkasArchiveStatus({ berkasId, actorUserId: base.userId, action: 'cancel_proposal' }, { repository })
      await berkasService.transitionBerkasArchiveStatus({ berkasId, actorUserId: base.userId, action: 'propose_destruction' }, { repository })

      expect((await jobsOf(tx, tautanId)).filter((j) => j.jenis === 'HAPUS_FILE')).toEqual([])
      expect((await filesOf(tx, tautanId)).every((f) => f.status === 'TERUNGGAH')).toBe(true)
    })
  })
})

describe('Pembersihan Dokumen (applyCleanupInTransaction)', () => {
  it('lampiran dibersihkan + audit + salinan Drive DIBERSIHKAN dalam satu transaksi; rollback -> tidak ada apa pun', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await inRollback(async (tx) => {
      const { dokumenId, tautanId } = await driveSiap(tx, (id) => [rencanaDokumen(id, 1)])
      const entries = [{ dokumenId, metadataSnapshot: { judul: 'Uji hapus Drive' } }]

      await inSavepointRolledBack(tx, async (sp) => {
        await pembersihan.applyCleanupInTransaction(sp, { actorUserId: base.userId, entries, now: NOW })
      })
      expect((await filesOf(tx, tautanId)).map((f) => f.status)).toEqual(['TERUNGGAH'])
      expect((await jobsOf(tx, tautanId)).filter((j) => j.jenis === 'HAPUS_FILE')).toEqual([])

      await pembersihan.applyCleanupInTransaction(tx, { actorUserId: base.userId, entries, now: NOW })

      const [dok] = await tx.select().from(dokumen.dokumenTransaksi).where(eq(dokumen.dokumenTransaksi.id, dokumenId))
      expect(dok.lampiranDibersihkanAt).toEqual(NOW)
      expect((await filesOf(tx, tautanId)).map((f) => [f.status, f.keteranganHapus])).toEqual([['MENGHAPUS', 'DIBERSIHKAN']])
      expect(await jobsOf(tx, tautanId)).toContainEqual({ jenis: 'HAPUS_FILE', status: 'MENUNGGU' })
    })
  })
})

describe('hapus permanen dokumen non-material (P4)', () => {
  it('baris file ditandai DIHAPUS_PEMILIK di transaksi DELETE dan tetap ada setelah dokumennya terhapus; runner menghapus salinannya', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await inRollback(async (tx) => {
      const { drive, deps, dokumenId, tautanId } = await driveSiap(tx, (id) => [rencanaDokumen(id, 1)])

      // Rollback: tidak ada perubahan.
      await inSavepointRolledBack(tx, async (sp) => {
        await penghapusan.tandaiFileDihapusUntukSumber(sp, { dokumenIds: [dokumenId], keterangan: 'DIHAPUS_PEMILIK', now: NOW })
        await sp.delete(dokumen.dokumenTransaksi).where(eq(dokumen.dokumenTransaksi.id, dokumenId))
      })
      expect((await filesOf(tx, tautanId)).map((f) => f.status)).toEqual(['TERUNGGAH'])

      // Urutan rute DELETE: hook lalu hapus baris dokumen, dalam satu transaksi.
      await tx.transaction(async (sp) => {
        await penghapusan.tandaiFileDihapusUntukSumber(sp, { dokumenIds: [dokumenId], keterangan: 'DIHAPUS_PEMILIK', now: NOW })
        await sp.delete(dokumen.dokumenTransaksi).where(eq(dokumen.dokumenTransaksi.id, dokumenId))
      })
      expect((await filesOf(tx, tautanId)).map((f) => [f.status, f.keteranganHapus])).toEqual([['MENGHAPUS', 'DIHAPUS_PEMILIK']])

      await runner.runDriveRunnerOnce({ now: () => NOW, deps })
      expect(lampiranDi(drive)).toEqual([])
      expect(daftarIsiDi(drive)?.content).toContain('- Lampiran 1.pdf (telah dihapus pemiliknya)')
      expect((await filesOf(tx, tautanId)).map((f) => f.status)).toEqual(['DIHAPUS'])
    })
  })
})

describe('D13: job hapus saat sinkron tautan yang sama masih PROSES', () => {
  it('ditunda 30 dtk tanpa menambah percobaan', async () => {
    await inRollback(async (tx) => {
      const akunId = await akunFixture(tx)
      const tautan = await tautanDrive(tx, akunId, [rencanaDokumen(await dokumenFixture(tx), 1)])
      const waktu = setelahPemicu()
      // Sinkron sedang diproses runner lain (kunci belum macet).
      await tx.update(app.driveJob).set({ status: 'PROSES', dikunciPada: waktu }).where(eq(app.driveJob.tautanId, tautan.id))
      await tautanRepo.revokeTautanByCreator(tautan.id, base.userId, tx)

      const hasil = await runner.runDriveRunnerOnce({ now: () => waktu, deps: runnerDeps(tx, new FakeDrive()) })
      expect(hasil).toMatchObject({ diproses: 1, dijeda: 1, gagal: 0, selesai: 0 })

      const [job] = await tx.select().from(app.driveJob)
        .where(and(eq(app.driveJob.tautanId, tautan.id), eq(app.driveJob.jenis, 'HAPUS_TAUTAN')))
      expect(job).toMatchObject({ status: 'MENUNGGU', percobaan: 0, jadwalBerikut: new Date(waktu.getTime() + 30_000) })
      expect((await tautanOf(tx, tautan.id)).driveStatus).toBe('MENGHAPUS')
    })
  })
})
