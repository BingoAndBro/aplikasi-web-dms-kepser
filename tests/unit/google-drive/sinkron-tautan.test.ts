import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it } from 'vitest'

import type { DriveJob } from '#/lib/google-drive/jobs'
import { DriveApiError } from '#/lib/google-drive/drive-errors'
import type { FileUntukUnggah } from '#/lib/google-drive/file-source'
import { createSinkronTautanHandler } from '#/lib/google-drive/sinkron-tautan'
import type { BarisFileUnggah } from '#/lib/google-drive/tautan-drive-repository'

import { FakeDrive } from './helpers/fake-drive'
import { AKUN_ID, MemoryAkun, MemoryTautanRepo, TAUTAN_ID } from './helpers/memory-tautan-repo'

const NOW = new Date('2026-10-22T03:00:00.000Z')
const JOB_ID = '88888888-8888-4888-8888-888888888888'

const job: DriveJob = {
  id: JOB_ID, jenis: 'SINKRON_TAUTAN', akunId: AKUN_ID, tautanId: TAUTAN_ID, prioritas: 10, status: 'PROSES',
  percobaan: 0, jadwalBerikut: NOW, dikunciPada: NOW, galatKategori: null, galatPesan: null, dibuatPada: NOW, selesaiPada: null,
}

let drive: FakeDrive
let repo: MemoryTautanRepo
let akun: MemoryAkun
let rootId: string
let tidakTersedia: Set<string>

function handler() {
  return createSinkronTautanHandler({
    repo,
    akun,
    driveClientFor: async () => drive,
    bukaFile: async (baris: BarisFileUnggah): Promise<FileUntukUnggah> => {
      if (tidakTersedia.has(baris.id)) return { ok: false }
      const isi = `isi ${baris.namaFile}`
      return { ok: true, size: isi.length, buka: () => Readable.from([Buffer.from(isi)]) }
    },
  })
}

const run = () => handler()({ job, now: () => NOW })
const runError = () => run().then(() => null, (error: unknown) => error)

const tautanFolder = () => [...drive.objects.values()].find((o) => o.appProperties.dmsJenis === 'TAUTAN')
const lampiran = () => [...drive.objects.values()].filter((o) => o.appProperties.dmsJenis === 'LAMPIRAN')
const daftarIsi = () => [...drive.objects.values()].find((o) => o.appProperties.dmsJenis === 'DAFTAR_ISI')
const uploads = (jenis = 'LAMPIRAN') => drive.calls.filter(
  (c) => c.method === 'uploadFile' && (c.args[0] as { appProperties: Record<string, string> }).appProperties.dmsJenis === jenis,
)

beforeEach(async () => {
  drive = new FakeDrive()
  repo = new MemoryTautanRepo()
  akun = new MemoryAkun()
  tidakTersedia = new Set()
  rootId = (await drive.createFolder({ name: 'DMS Kepser', appProperties: { dmsJenis: 'AKAR' } })).id
  akun.akun.rootFolderId = rootId
  drive.calls.length = 0
  repo.addTautan()
  for (const i of [1, 2, 3]) repo.addFile(i)
})

describe('handleSinkronTautan: jalur bahagia', () => {
  it('3 dokumen -> folder tautan di akar, 3 file + DAFTAR_ISI.txt, izin anyone, SIAP + URL + audit + job SELESAI', async () => {
    expect(await run()).toEqual({ hasil: 'SELESAI' })

    const folder = tautanFolder()!
    expect(folder).toMatchObject({
      name: 'Bukti Dukung Q3 (2026-10-21)', parents: [rootId], appProperties: { dmsJenis: 'TAUTAN', dmsTautanId: TAUTAN_ID }, shared: true,
    })
    expect(lampiran().map((f) => [f.name, f.content, f.parents[0], f.appProperties.dmsKunci, f.mimeType])).toEqual(
      repo.files.map((f) => [f.namaFile, `isi ${f.namaFile}`, folder.id, f.kunciLampiran, 'application/pdf']),
    )
    expect(daftarIsi()).toMatchObject({ name: 'DAFTAR_ISI.txt', parents: [folder.id], mimeType: 'text/plain; charset=utf-8' })
    expect(daftarIsi()!.content).toContain('- Lampiran 2.pdf\n')

    const tautan = repo.tautan.get(TAUTAN_ID)!
    expect(tautan).toMatchObject({
      driveStatus: 'SIAP', driveFolderId: folder.id, driveFolderUrl: `https://drive.google.com/drive/folders/${folder.id}`,
      driveDaftarIsiFileId: daftarIsi()!.id,
    })
    expect(repo.files.every((f) => f.status === 'TERUNGGAH' && f.driveFileId && f.diunggahPada === NOW)).toBe(true)
    expect(repo.audits).toEqual([{ aksi: 'DRIVE_TAUTAN_SIAP', entityId: TAUTAN_ID, metadata: { jumlah_file: 3, jumlah_dilewati: 0 } }])
    expect(repo.jobSelesai).toEqual([JOB_ID])
  })

  it('drive_folder_id tersimpan sebelum file pertama diunggah; drive_folder_dicoba_pada sebelum folder dibuat', async () => {
    const urutan: string[] = []
    repo.hooks.simpanFolderDicoba = () => { urutan.push(`dicoba:folders=${drive.calls.filter((c) => c.method === 'createFolder').length}`) }
    repo.hooks.simpanFolderId = () => { urutan.push(`folderId:uploads=${uploads().length}`) }
    await run()
    expect(urutan).toEqual(['dicoba:folders=0', 'folderId:uploads=0'])
  })

  it('urutan: MENGUNGGAH, folder, file per file, daftar isi, izin, link, lalu SIAP', async () => {
    await run()
    expect(drive.calls.map((c) => c.method)).toEqual([
      'createFolder', 'uploadFile', 'uploadFile', 'uploadFile', 'findChildByAppProperty', 'uploadFile', 'shareAnyoneReader', 'getWebViewLink',
    ])
    expect(repo.events.indexOf('setDriveStatus')).toBeLessThan(repo.events.indexOf('simpanFolderId'))
    expect(repo.events.at(-1)).toBe('tandaiSiap')
  })
})

describe('handleSinkronTautan: tahan putus tanpa unggahan ganda', () => {
  it('SIAP hanya setelah semua file + izin: share gagal -> tidak SIAP, tanpa audit', async () => {
    drive.failNext('shareAnyoneReader', 'SEMENTARA')
    expect(await runError()).toMatchObject({ kategori: 'SEMENTARA' })
    expect(repo.tautan.get(TAUTAN_ID)).toMatchObject({ driveStatus: 'MENGUNGGAH', driveFolderUrl: null })
    expect(repo.audits).toEqual([])
    expect(repo.jobSelesai).toEqual([])
  })

  it('gagal SEMENTARA di file ke-2 -> putaran berikutnya hanya mengunggah file 2-3 di folder yang sama', async () => {
    let uploadKe = 0
    drive.failWhen((call) => (call.method === 'uploadFile' && ++uploadKe === 2 ? 'SEMENTARA' : null))
    expect(await runError()).toBeInstanceOf(DriveApiError)
    expect(repo.files.map((f) => f.status)).toEqual(['TERUNGGAH', 'MENUNGGU', 'MENUNGGU'])
    drive.failWhen(null)

    expect(await run()).toEqual({ hasil: 'SELESAI' })
    expect(lampiran()).toHaveLength(3)
    expect(uploads()).toHaveLength(3 + 1) // 1, 2 (gagal), 2, 3
    expect(drive.calls.filter((c) => c.method === 'createFolder')).toHaveLength(1)
  })

  it('respons hilang saat unggah file ke-2 -> percobaan ulang menemukannya via appProperties, tidak mengunggah ulang', async () => {
    // Mode "respons hilang": objek tersimpan lalu galat (FakeDrive.failNext simpanObjek).
    let ke = 0
    repo.hooks.tandaiBarisDicoba = () => {
      ke += 1
      if (ke === 2) drive.failNext('uploadFile', 'SEMENTARA', { simpanObjek: true })
    }
    expect(await runError()).toMatchObject({ kategori: 'SEMENTARA' })
    expect(lampiran()).toHaveLength(2)
    expect(repo.file('file-2')).toMatchObject({ status: 'MENUNGGU', dicobaPada: NOW })

    await run()
    expect(lampiran()).toHaveLength(3)
    expect(new Set(lampiran().map((f) => f.appProperties.dmsKunci)).size).toBe(3)
    expect(repo.file('file-2').driveFileId).toBe(lampiran().find((f) => f.name === 'Lampiran 2.pdf')!.id)
  })

  it('respons hilang saat membuat folder tautan -> folder lama ditemukan via dmsTautanId, tanpa folder kembar', async () => {
    drive.failNext('createFolder', 'SEMENTARA', { simpanObjek: true })
    expect(await runError()).toMatchObject({ kategori: 'SEMENTARA' })
    expect(repo.tautan.get(TAUTAN_ID)!.driveFolderId).toBeNull()

    await run()
    const folders = [...drive.objects.values()].filter((o) => o.appProperties.dmsJenis === 'TAUTAN')
    expect(folders).toHaveLength(1)
    expect(repo.tautan.get(TAUTAN_ID)!.driveFolderId).toBe(folders[0].id)
  })

  it('respons hilang saat unggah DAFTAR_ISI.txt -> ditemukan via dmsJenis; ID tersimpan -> isi diperbarui', async () => {
    let ke = 0
    repo.hooks.muatDataDaftarIsi = () => {
      if (ke++ === 0) drive.failNext('uploadFile', 'SEMENTARA', { simpanObjek: true })
    }
    expect(await runError()).toMatchObject({ kategori: 'SEMENTARA' })
    await run()
    expect([...drive.objects.values()].filter((o) => o.appProperties.dmsJenis === 'DAFTAR_ISI')).toHaveLength(1)

    // Yang ditemukan lewat dmsJenis diperbarui isinya dan ID-nya disimpan.
    expect(drive.calls.filter((c) => c.method === 'updateFileContent')).toHaveLength(1)
    expect(repo.tautan.get(TAUTAN_ID)!.driveDaftarIsiFileId).toBe(daftarIsi()!.id)

    // Sinkron ulang (mis. coba lagi) memperbarui isi file yang sama lewat ID tersimpan.
    repo.tautan.get(TAUTAN_ID)!.driveStatus = 'MENUNGGU'
    await run()
    expect(drive.calls.filter((c) => c.method === 'updateFileContent')).toHaveLength(2)
    expect([...drive.objects.values()].filter((o) => o.appProperties.dmsJenis === 'DAFTAR_ISI')).toHaveLength(1)
  })
})

describe('handleSinkronTautan: perubahan di tengah jalan', () => {
  it('dicabut di tengah -> berhenti, DIBATALKAN, tidak SIAP', async () => {
    repo.hooks.tandaiBarisTerunggah = (id) => {
      if (id === 'file-1') repo.tautan.get(TAUTAN_ID)!.revokedAt = NOW
    }
    expect(await run()).toEqual({ hasil: 'DIBATALKAN' })
    expect(lampiran()).toHaveLength(1)
    expect(repo.tautan.get(TAUTAN_ID)!.driveStatus).toBe('MENGUNGGAH')
    expect(drive.calls.some((c) => c.method === 'shareAnyoneReader')).toBe(false)
  })

  it('tautan sudah dicabut / bukan MENUNGGU-MENGUNGGAH / tidak ada -> DIBATALKAN tanpa memanggil Drive', async () => {
    repo.tautan.get(TAUTAN_ID)!.revokedAt = NOW
    expect(await run()).toEqual({ hasil: 'DIBATALKAN' })
    repo.tautan.get(TAUTAN_ID)!.revokedAt = null
    repo.tautan.get(TAUTAN_ID)!.driveStatus = 'SIAP'
    expect(await run()).toEqual({ hasil: 'DIBATALKAN' })
    repo.tautan.clear()
    expect(await run()).toEqual({ hasil: 'DIBATALKAN' })
    expect(drive.calls).toEqual([])
  })

  it('dicabut tepat sebelum SIAP -> tandaiSiap menolak, DIBATALKAN', async () => {
    repo.hooks.tandaiSiap = () => { repo.tautan.get(TAUTAN_ID)!.revokedAt = NOW }
    expect(await run()).toEqual({ hasil: 'DIBATALKAN' })
    expect(repo.audits).toEqual([])
  })

  it('file hilang / > 5 MB / dimusnahkan -> baris DILEWATI, tautan tetap SIAP, daftar isi menandai tidak tersedia', async () => {
    tidakTersedia.add('file-2')
    await run()
    expect(repo.files.map((f) => f.status)).toEqual(['TERUNGGAH', 'DILEWATI', 'TERUNGGAH'])
    expect(repo.tautan.get(TAUTAN_ID)!.driveStatus).toBe('SIAP')
    expect(lampiran().map((f) => f.name)).toEqual(['Lampiran 1.pdf', 'Lampiran 3.pdf'])
    expect(daftarIsi()!.content).toContain('- Lampiran 2.pdf (tidak tersedia)\n')
    expect(repo.audits[0].metadata).toEqual({ jumlah_file: 2, jumlah_dilewati: 1 })
  })

  it('salinan dari percobaan terputus ditemukan tetapi file kini tidak tersedia -> salinan dihapus, baris DILEWATI', async () => {
    let ke = 0
    repo.hooks.tandaiBarisDicoba = () => {
      if (++ke === 2) drive.failNext('uploadFile', 'SEMENTARA', { simpanObjek: true })
    }
    expect(await runError()).toMatchObject({ kategori: 'SEMENTARA' })
    expect(lampiran().map((f) => f.name)).toEqual(['Lampiran 1.pdf', 'Lampiran 2.pdf'])

    tidakTersedia.add('file-2')
    await run()
    expect(lampiran().map((f) => f.name)).toEqual(['Lampiran 1.pdf', 'Lampiran 3.pdf'])
    expect(repo.file('file-2')).toMatchObject({ status: 'DILEWATI', driveFileId: null })
    expect(repo.tautan.get(TAUTAN_ID)!.driveStatus).toBe('SIAP')
  })

  it('baris jadi DILEWATI saat unggahan terbang -> MENGHAPUS dengan drive_file_id + job HAPUS_FILE', async () => {
    repo.hooks.tandaiBarisTerunggah = (id) => {
      if (id === 'file-2') Object.assign(repo.file('file-2'), { status: 'DILEWATI', keteranganHapus: 'DIMUSNAHKAN' })
    }
    await run()
    const terbang = lampiran().find((f) => f.name === 'Lampiran 2.pdf')!
    expect(repo.file('file-2')).toMatchObject({ status: 'MENGHAPUS', keteranganHapus: 'DIMUSNAHKAN', driveFileId: terbang.id })
    expect(repo.enqueued).toEqual([{ jenis: 'HAPUS_FILE', tautanId: TAUTAN_ID, akunId: AKUN_ID }])
    expect(daftarIsi()!.content).toContain('- Lampiran 2.pdf (telah dimusnahkan)\n')
  })

  it('folder akar hilang (404 saat membuat folder tautan) -> akar dibuat ulang, root_folder_id diperbarui, lanjut', async () => {
    drive.deleteObject(rootId)
    await run()
    const roots = [...drive.objects.values()].filter((o) => o.appProperties.dmsJenis === 'AKAR')
    expect(roots).toHaveLength(1)
    expect(roots[0].id).not.toBe(rootId)
    expect(akun.akun.rootFolderId).toBe(roots[0].id)
    expect(tautanFolder()!.parents).toEqual([roots[0].id])
    expect(repo.tautan.get(TAUTAN_ID)!.driveStatus).toBe('SIAP')
  })

  it('akun tanpa root_folder_id -> akar dibuat lebih dulu', async () => {
    akun.akun.rootFolderId = null
    await run()
    expect(akun.akun.rootFolderId).toBe(tautanFolder()!.parents[0])
  })

  it('semua lampiran tidak tersedia -> folder hanya berisi DAFTAR_ISI.txt, SIAP', async () => {
    for (const f of repo.files) tidakTersedia.add(f.id)
    await run()
    expect(drive.listChildren(tautanFolder()!.id).map((o) => o.name)).toEqual(['DAFTAR_ISI.txt'])
    expect(repo.tautan.get(TAUTAN_ID)!.driveStatus).toBe('SIAP')
  })
})

describe('handleSinkronTautan: galat', () => {
  it('KUOTA_PENUH saat unggah dilempar ke runner', async () => {
    drive.failNext('uploadFile', 'KUOTA_PENUH')
    expect(await runError()).toMatchObject({ kategori: 'KUOTA_PENUH' })
  })

  it('folder tautan dihapus manual saat unggah (404) -> TIDAK_DITEMUKAN dengan pesan SPEC', async () => {
    repo.hooks.tandaiBarisTerunggah = (id) => {
      if (id === 'file-1') drive.deleteObject(tautanFolder()!.id)
    }
    const error = await runError()
    expect(error).toBeInstanceOf(DriveApiError)
    expect(error).toMatchObject({ kategori: 'TIDAK_DITEMUKAN', pesan: 'Folder di Drive tidak ditemukan — cabut lalu buat tautan baru' })
  })

  it('akun DIPUTUS / tanpa token -> AKUN_DIPUTUS tanpa memanggil Drive; diputus di tengah -> AKUN_DIPUTUS', async () => {
    akun.akun.status = 'DIPUTUS'
    expect(await runError()).toMatchObject({ kategori: 'AKUN_DIPUTUS' })
    akun.akun = { ...akun.akun, status: 'AKTIF', refreshTokenEnc: null }
    expect(await runError()).toMatchObject({ kategori: 'AKUN_DIPUTUS' })
    expect(drive.calls).toEqual([])

    akun.akun.refreshTokenEnc = 'v1:enc'
    repo.hooks.tandaiBarisTerunggah = (id) => {
      if (id === 'file-1') akun.akun.status = 'DIPUTUS'
    }
    expect(await runError()).toMatchObject({ kategori: 'AKUN_DIPUTUS' })
    expect(lampiran()).toHaveLength(1)
  })

  it('DAFTAR_ISI.txt tidak memuat logical path, id dokumen, atau token', async () => {
    await run()
    const isi = daftarIsi()!.content!
    for (const f of repo.files) {
      expect(isi).not.toContain(f.dokumenId!)
      expect(isi).not.toContain(f.kunciLampiran)
    }
    expect(isi).not.toMatch(/dokumen\/|storage|token|v1:enc/i)
  })
})
