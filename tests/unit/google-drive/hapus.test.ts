// Handler HAPUS_TAUTAN dan HAPUS_FILE (section 09) dengan FakeDrive + repo in-memory.
import { beforeEach, describe, expect, it } from 'vitest'

import type { DriveJob } from '#/lib/google-drive/jobs'
import { DRIVE_JOB_TUNDA_SINKRON_MS } from '#/lib/google-drive/jobs'
import { DriveApiError } from '#/lib/google-drive/drive-errors'
import { createHapusFileHandler, createHapusTautanHandler } from '#/lib/google-drive/hapus'

import { FakeDrive } from './helpers/fake-drive'
import { AKUN_ID, MemoryAkun, MemoryTautanRepo, TAUTAN_ID } from './helpers/memory-tautan-repo'

const NOW = new Date('2026-10-22T03:00:00.000Z')
const REVOKED = new Date('2026-10-22T02:00:00.000Z')

function jobOf(jenis: 'HAPUS_TAUTAN' | 'HAPUS_FILE'): DriveJob {
  return {
    id: `job-${jenis}`, jenis, akunId: AKUN_ID, tautanId: TAUTAN_ID, prioritas: 0, status: 'PROSES',
    percobaan: 2, jadwalBerikut: NOW, dikunciPada: NOW, galatKategori: null, galatPesan: null, dibuatPada: NOW, selesaiPada: null,
  }
}

let drive: FakeDrive
let repo: MemoryTautanRepo
let akun: MemoryAkun
let rootId: string
let sinkronAktif: { id: string } | null
let ditunda: Array<{ id: string; now: Date; ms: number }>

function deps() {
  return {
    repo,
    akun,
    driveClientFor: async () => drive,
    jobs: {
      findActiveSinkron: async (tautanId: string, now: Date) => {
        expect(tautanId).toBe(TAUTAN_ID)
        expect(now).toEqual(NOW)
        return sinkronAktif
      },
      defer: async (id: string, input: { now: Date; ms: number }) => {
        ditunda.push({ id, ...input })
        return true
      },
    },
  }
}

const hapusTautan = () => createHapusTautanHandler(deps())({ job: jobOf('HAPUS_TAUTAN'), now: () => NOW })
const hapusFile = () => createHapusFileHandler(deps())({ job: jobOf('HAPUS_FILE'), now: () => NOW })
const errorOf = (p: Promise<unknown>) => p.then(() => null, (error: unknown) => error)

/** Folder tautan berisi dua lampiran + DAFTAR_ISI.txt seperti hasil sinkron. */
async function folderSiap() {
  const folder = (await drive.createFolder({ name: 'Bukti (2026-10-21)', parentId: rootId, appProperties: { dmsJenis: 'TAUTAN', dmsTautanId: TAUTAN_ID } })).id
  const f1 = (await drive.uploadFile({ parentId: folder, name: 'Lampiran 1.pdf', mimeType: 'application/pdf', body: 'a', appProperties: { dmsJenis: 'LAMPIRAN' } })).id
  const f2 = (await drive.uploadFile({ parentId: folder, name: 'Lampiran 2.pdf', mimeType: 'application/pdf', body: 'b', appProperties: { dmsJenis: 'LAMPIRAN' } })).id
  const daftarIsi = (await drive.uploadFile({ parentId: folder, name: 'DAFTAR_ISI.txt', mimeType: 'text/plain', body: 'lama', appProperties: { dmsJenis: 'DAFTAR_ISI' } })).id
  drive.calls.length = 0
  return { folder, f1, f2, daftarIsi }
}

beforeEach(async () => {
  drive = new FakeDrive()
  repo = new MemoryTautanRepo()
  akun = new MemoryAkun()
  sinkronAktif = null
  ditunda = []
  rootId = (await drive.createFolder({ name: 'DMS Kepser', appProperties: { dmsJenis: 'AKAR' } })).id
  akun.akun.rootFolderId = rootId
  drive.calls.length = 0
})

describe('HAPUS_TAUTAN', () => {
  it('menghapus permanen folder tautan (beserta isinya), lalu DIHAPUS + baris DIHAPUS (DICABUT) + audit + job SELESAI', async () => {
    const { folder, f1, f2, daftarIsi } = await folderSiap()
    repo.addTautan({ revokedAt: REVOKED, driveStatus: 'MENGHAPUS', driveFolderId: folder, driveDaftarIsiFileId: daftarIsi })
    repo.addFile(1, { status: 'TERUNGGAH', driveFileId: f1 })
    repo.addFile(2, { status: 'MENGHAPUS', driveFileId: f2, keteranganHapus: 'DIMUSNAHKAN' })
    repo.addFile(3, { status: 'DILEWATI' })

    await expect(hapusTautan()).resolves.toEqual({ hasil: 'SELESAI' })

    expect(drive.calls.map((c) => [c.method, c.args[0]])).toEqual([['deleteFile', folder]])
    expect(drive.objects.has(folder)).toBe(false)
    expect(drive.objects.has(f1)).toBe(false)
    expect(drive.objects.has(daftarIsi)).toBe(false)
    expect(repo.tautan.get(TAUTAN_ID)?.driveStatus).toBe('DIHAPUS')
    expect(repo.files.map((f) => [f.status, f.keteranganHapus, f.dihapusPada])).toEqual([
      ['DIHAPUS', 'DICABUT', NOW],
      ['DIHAPUS', 'DIMUSNAHKAN', NOW],
      ['DIHAPUS', 'DICABUT', NOW],
    ])
    expect(repo.audits).toEqual([{ aksi: 'DRIVE_TAUTAN_DIHAPUS', entityId: TAUTAN_ID, metadata: { jumlah_file: 2 } }])
    expect(repo.jobSelesai).toEqual(['job-HAPUS_TAUTAN'])
  })

  it('folder sudah hilang (404) dianggap berhasil', async () => {
    repo.addTautan({ revokedAt: REVOKED, driveStatus: 'MENGHAPUS', driveFolderId: 'folder-hilang' })

    await expect(hapusTautan()).resolves.toEqual({ hasil: 'SELESAI' })
    expect(repo.tautan.get(TAUTAN_ID)?.driveStatus).toBe('DIHAPUS')
  })

  it('folder belum pernah dibuat: DIHAPUS tanpa satu pun panggilan Drive (akun DIPUTUS pun tidak masalah)', async () => {
    repo.addTautan({ revokedAt: REVOKED, driveStatus: 'MENGHAPUS', driveFolderId: null, driveFolderDicobaPada: null })
    repo.addFile(1)
    akun.akun = { ...akun.akun, status: 'DIPUTUS', refreshTokenEnc: null }

    await expect(hapusTautan()).resolves.toEqual({ hasil: 'SELESAI' })
    expect(drive.calls).toEqual([])
    expect(repo.tautan.get(TAUTAN_ID)?.driveStatus).toBe('DIHAPUS')
    expect(repo.files[0]).toMatchObject({ status: 'DIHAPUS', keteranganHapus: 'DICABUT' })
  })

  it('folder pernah dicoba dibuat tetapi ID belum tersimpan: dicari lewat dmsTautanId lalu dihapus', async () => {
    const { folder } = await folderSiap()
    repo.addTautan({ revokedAt: REVOKED, driveStatus: 'MENGHAPUS', driveFolderId: null, driveFolderDicobaPada: REVOKED })

    await expect(hapusTautan()).resolves.toEqual({ hasil: 'SELESAI' })
    expect(drive.calls.map((c) => c.method)).toEqual(['findChildByAppProperty', 'deleteFile'])
    expect(drive.objects.has(folder)).toBe(false)
  })

  it('pencarian tidak menemukan folder: tetap DIHAPUS tanpa deleteFile', async () => {
    repo.addTautan({ revokedAt: REVOKED, driveStatus: 'MENGHAPUS', driveFolderId: null, driveFolderDicobaPada: REVOKED })

    await expect(hapusTautan()).resolves.toEqual({ hasil: 'SELESAI' })
    expect(drive.calls.map((c) => c.method)).toEqual(['findChildByAppProperty'])
    expect(repo.tautan.get(TAUTAN_ID)?.driveStatus).toBe('DIHAPUS')
  })

  it('D13: sinkron tautan yang sama masih PROSES -> ditunda 30 dtk tanpa menyentuh Drive/DB', async () => {
    await folderSiap()
    repo.addTautan({ revokedAt: REVOKED, driveStatus: 'MENGHAPUS', driveFolderId: 'folder-x' })
    sinkronAktif = { id: 'job-sinkron' }

    await expect(hapusTautan()).resolves.toEqual({ hasil: 'DITUNDA' })
    expect(ditunda).toEqual([{ id: 'job-HAPUS_TAUTAN', now: NOW, ms: DRIVE_JOB_TUNDA_SINKRON_MS }])
    expect(drive.calls).toEqual([])
    expect(repo.tautan.get(TAUTAN_ID)?.driveStatus).toBe('MENGHAPUS')
    expect(repo.jobSelesai).toEqual([])
  })

  it('akun DIPUTUS dengan folder yang masih ada -> AKUN_DIPUTUS (daftar hapus manual), status tidak berubah', async () => {
    const { folder } = await folderSiap()
    repo.addTautan({ revokedAt: REVOKED, driveStatus: 'MENGHAPUS', driveFolderId: folder })
    akun.akun = { ...akun.akun, status: 'DIPUTUS', refreshTokenEnc: null }

    const error = await errorOf(hapusTautan())
    expect(error).toBeInstanceOf(DriveApiError)
    expect((error as DriveApiError).kategori).toBe('AKUN_DIPUTUS')
    expect(drive.objects.has(folder)).toBe(true)
    expect(repo.tautan.get(TAUTAN_ID)?.driveStatus).toBe('MENGHAPUS')
  })

  it('SEMENTARA saat menghapus dilempar ke runner (dijadwalkan ulang), status tidak berubah', async () => {
    const { folder } = await folderSiap()
    repo.addTautan({ revokedAt: REVOKED, driveStatus: 'MENGHAPUS', driveFolderId: folder })
    drive.failNext('deleteFile', 'SEMENTARA')

    const error = await errorOf(hapusTautan())
    expect((error as DriveApiError).kategori).toBe('SEMENTARA')
    expect(repo.tautan.get(TAUTAN_ID)?.driveStatus).toBe('MENGHAPUS')
    expect(repo.audits).toEqual([])
  })

  it('tautan sudah DIHAPUS (job ganda) -> SELESAI tanpa Drive', async () => {
    repo.addTautan({ revokedAt: REVOKED, driveStatus: 'DIHAPUS', driveFolderId: 'folder-x' })

    await expect(hapusTautan()).resolves.toEqual({ hasil: 'SELESAI' })
    expect(drive.calls).toEqual([])
    expect(repo.audits).toEqual([])
  })
})

describe('HAPUS_FILE', () => {
  it('menghapus permanen tiap file MENGHAPUS, menandai DIHAPUS, memperbarui DAFTAR_ISI.txt, audit per job', async () => {
    const { folder, f1, f2, daftarIsi } = await folderSiap()
    repo.addTautan({ driveStatus: 'SIAP', driveFolderId: folder, driveDaftarIsiFileId: daftarIsi })
    repo.addFile(1, { status: 'MENGHAPUS', driveFileId: f1, keteranganHapus: 'DIMUSNAHKAN' })
    repo.addFile(2, { status: 'TERUNGGAH', driveFileId: f2 })
    repo.addFile(3, { status: 'DILEWATI', keteranganHapus: 'DIMUSNAHKAN' })

    await expect(hapusFile()).resolves.toEqual({ hasil: 'SELESAI' })

    expect(drive.objects.has(f1)).toBe(false)
    expect(drive.objects.has(f2)).toBe(true)
    expect(repo.files.map((f) => f.status)).toEqual(['DIHAPUS', 'TERUNGGAH', 'DILEWATI'])
    expect(repo.file('file-1').dihapusPada).toEqual(NOW)
    const isi = drive.objects.get(daftarIsi)?.content ?? ''
    expect(isi).toContain('- Lampiran 1.pdf (telah dimusnahkan)')
    expect(isi).toContain('- Lampiran 2.pdf\n')
    expect(isi).toContain('- Lampiran 3.pdf (telah dimusnahkan)')
    expect(isi).not.toContain(f1)
    expect(repo.audits).toEqual([{
      aksi: 'DRIVE_FILE_DIHAPUS', entityId: TAUTAN_ID, metadata: { jumlah_file: 1, keterangan: ['DIMUSNAHKAN'] },
    }])
    expect(repo.jobSelesai).toEqual(['job-HAPUS_FILE'])
    expect(drive.objects.has(folder)).toBe(true)
  })

  it.each([
    ['DIBERSIHKAN', '(telah dibersihkan)'],
    ['DIHAPUS_PEMILIK', '(telah dihapus pemiliknya)'],
  ] as const)('keterangan %s tercatat di daftar isi dan audit', async (keterangan, penanda) => {
    const { folder, f1, daftarIsi } = await folderSiap()
    repo.addTautan({ driveStatus: 'SIAP', driveFolderId: folder, driveDaftarIsiFileId: daftarIsi })
    repo.addFile(1, { status: 'MENGHAPUS', driveFileId: f1, keteranganHapus: keterangan })

    await hapusFile()

    expect(drive.objects.get(daftarIsi)?.content).toContain(`- Lampiran 1.pdf ${penanda}`)
    expect(repo.audits[0].metadata).toEqual({ jumlah_file: 1, keterangan: [keterangan] })
  })

  it('file sudah hilang (404) dianggap berhasil; drive_file_id null langsung DIHAPUS tanpa panggilan', async () => {
    const { folder, daftarIsi } = await folderSiap()
    repo.addTautan({ driveStatus: 'SIAP', driveFolderId: folder, driveDaftarIsiFileId: daftarIsi })
    repo.addFile(1, { status: 'MENGHAPUS', driveFileId: 'file-hilang', keteranganHapus: 'DIBERSIHKAN' })
    repo.addFile(2, { status: 'MENGHAPUS', driveFileId: null, keteranganHapus: 'DIBERSIHKAN' })

    await expect(hapusFile()).resolves.toEqual({ hasil: 'SELESAI' })
    expect(repo.files.map((f) => f.status)).toEqual(['DIHAPUS', 'DIHAPUS'])
    expect(drive.calls.filter((c) => c.method === 'deleteFile').map((c) => c.args[0])).toEqual(['file-hilang'])
    expect(repo.audits[0].metadata).toEqual({ jumlah_file: 1, keterangan: ['DIBERSIHKAN'] })
  })

  it('tautan sudah dicabut -> SELESAI tanpa panggilan Drive (folder ditangani HAPUS_TAUTAN)', async () => {
    const { folder, f1 } = await folderSiap()
    repo.addTautan({ revokedAt: REVOKED, driveStatus: 'MENGHAPUS', driveFolderId: folder })
    repo.addFile(1, { status: 'MENGHAPUS', driveFileId: f1, keteranganHapus: 'DIMUSNAHKAN' })

    await expect(hapusFile()).resolves.toEqual({ hasil: 'SELESAI' })
    expect(drive.calls).toEqual([])
    expect(repo.file('file-1').status).toBe('MENGHAPUS')
    expect(repo.audits).toEqual([])
  })

  it('D13: sinkron masih PROSES -> ditunda 30 dtk, percobaan tidak disentuh', async () => {
    const { folder, f1 } = await folderSiap()
    repo.addTautan({ driveStatus: 'MENGUNGGAH', driveFolderId: folder })
    repo.addFile(1, { status: 'MENGHAPUS', driveFileId: f1, keteranganHapus: 'DIMUSNAHKAN' })
    sinkronAktif = { id: 'job-sinkron' }

    await expect(hapusFile()).resolves.toEqual({ hasil: 'DITUNDA' })
    expect(ditunda).toEqual([{ id: 'job-HAPUS_FILE', now: NOW, ms: DRIVE_JOB_TUNDA_SINKRON_MS }])
    expect(drive.calls).toEqual([])
    expect(repo.file('file-1').status).toBe('MENGHAPUS')
  })

  it('tanpa file MENGHAPUS dan tanpa DAFTAR_ISI (hanya baris MENUNGGU -> DILEWATI): SELESAI tanpa Drive dan tanpa audit', async () => {
    repo.addTautan({ driveStatus: 'MENUNGGU' })
    repo.addFile(1, { status: 'DILEWATI', keteranganHapus: 'DIMUSNAHKAN' })
    akun.akun = { ...akun.akun, status: 'DIPUTUS', refreshTokenEnc: null }

    await expect(hapusFile()).resolves.toEqual({ hasil: 'SELESAI' })
    expect(drive.calls).toEqual([])
    expect(repo.audits).toEqual([])
    expect(repo.jobSelesai).toEqual(['job-HAPUS_FILE'])
  })

  it('akun DIPUTUS dengan file yang masih ada -> AKUN_DIPUTUS, baris tetap MENGHAPUS', async () => {
    const { folder, f1 } = await folderSiap()
    repo.addTautan({ driveStatus: 'SIAP', driveFolderId: folder })
    repo.addFile(1, { status: 'MENGHAPUS', driveFileId: f1, keteranganHapus: 'DIMUSNAHKAN' })
    akun.akun = { ...akun.akun, status: 'DIPUTUS', refreshTokenEnc: null }

    const error = await errorOf(hapusFile())
    expect((error as DriveApiError).kategori).toBe('AKUN_DIPUTUS')
    expect(repo.file('file-1').status).toBe('MENGHAPUS')
    expect(drive.objects.has(f1)).toBe(true)
  })

  it('SEMENTARA di tengah: file yang sudah terhapus tetap DIHAPUS, sisanya menunggu percobaan berikut', async () => {
    const { folder, f1, f2 } = await folderSiap()
    repo.addTautan({ driveStatus: 'SIAP', driveFolderId: folder })
    repo.addFile(1, { status: 'MENGHAPUS', driveFileId: f1, keteranganHapus: 'DIMUSNAHKAN' })
    repo.addFile(2, { status: 'MENGHAPUS', driveFileId: f2, keteranganHapus: 'DIMUSNAHKAN' })
    drive.failWhen((call) => (call.method === 'deleteFile' && call.args[0] === f2 ? 'SEMENTARA' : null))

    const error = await errorOf(hapusFile())
    expect((error as DriveApiError).kategori).toBe('SEMENTARA')
    expect(repo.files.map((f) => f.status)).toEqual(['DIHAPUS', 'MENGHAPUS'])
    expect(repo.jobSelesai).toEqual([])

    drive.failWhen(null)
    await expect(hapusFile()).resolves.toEqual({ hasil: 'SELESAI' })
    expect(repo.files.map((f) => f.status)).toEqual(['DIHAPUS', 'DIHAPUS'])
  })

  it('DAFTAR_ISI.txt hilang (404) saat diperbarui: tidak menggagalkan penghapusan', async () => {
    const { folder, f1 } = await folderSiap()
    repo.addTautan({ driveStatus: 'SIAP', driveFolderId: folder, driveDaftarIsiFileId: 'daftar-isi-hilang' })
    repo.addFile(1, { status: 'MENGHAPUS', driveFileId: f1, keteranganHapus: 'DIBERSIHKAN' })

    await expect(hapusFile()).resolves.toEqual({ hasil: 'SELESAI' })
    expect(repo.file('file-1').status).toBe('DIHAPUS')
  })
})
