// Server-only module. Do not import from client components.
//
// Handler job SINKRON_TAUTAN (SPEC 8.2, K2/K7/K10, P5). Tahan putus/restart:
// drive_folder_id disimpan segera setelah folder dibuat, setiap file dicatat
// per baris, dan objek yang mungkin sudah dibuat percobaan sebelumnya (kolom
// *_dicoba_pada terisi) dicari dulu lewat appProperties sebelum membuat ulang.
// Link folder baru diberikan setelah semua file, DAFTAR_ISI.txt, dan izin
// selesai. Galat Drive dilempar ke runner (runner.ts) yang mencatat nasib job.
import { DRIVE_ROOT_FOLDER_NAME } from '#/lib/google-drive/config'
import type { AkunUntukJob } from '#/lib/google-drive/akun-repository'
import { buildDriveDaftarIsiText } from '#/lib/google-drive/daftar-isi'
import type { DriveClient } from '#/lib/google-drive/drive-client'
import { DriveApiError, classifyDriveError } from '#/lib/google-drive/drive-errors'
import type { FileUntukUnggah } from '#/lib/google-drive/file-source'
import { DRIVE_DAFTAR_ISI_NAMA } from '#/lib/google-drive/rencana-file'
import type { DriveJobHandler } from '#/lib/google-drive/runner'
import { buildDriveFolderName } from '#/lib/google-drive/shared'
import type { BarisFileUnggah, TautanDriveRepository } from '#/lib/google-drive/tautan-drive-repository'

const DAFTAR_ISI_MIME = 'text/plain; charset=utf-8'

export type SinkronTautanDeps = {
  repo: TautanDriveRepository
  akun: {
    muatAkunUntukJob(akunId: string): Promise<AkunUntukJob | null>
    perbaruiRootFolder(akunId: string, folderId: string): Promise<void>
  }
  /** DriveClient untuk akun ini; galat (mis. dekripsi token) dilempar sebagai DriveApiError. */
  driveClientFor(akun: AkunUntukJob): Promise<DriveClient>
  bukaFile(baris: BarisFileUnggah): Promise<FileUntukUnggah>
}

function akunBisaDipakai(akun: AkunUntukJob | null): akun is AkunUntukJob {
  return akun !== null && akun.status !== 'DIPUTUS' && akun.refreshTokenEnc !== null
}

/** 404 pada folder tautan saat mengisinya: folder dihapus manual (SPEC 11.2). */
function folderTautanHilang(error: unknown): never {
  const classified = classifyDriveError(error)
  throw classified.kategori === 'TIDAK_DITEMUKAN' ? new DriveApiError('TIDAK_DITEMUKAN') : classified
}

export function createSinkronTautanHandler(deps: SinkronTautanDeps): DriveJobHandler {
  const { repo } = deps

  async function buatFolderAkar(drive: DriveClient, akunId: string): Promise<string> {
    const { id } = await drive.createFolder({ name: DRIVE_ROOT_FOLDER_NAME, appProperties: { dmsJenis: 'AKAR' } })
    await deps.akun.perbaruiRootFolder(akunId, id)
    return id
  }

  async function pastikanFolderTautan(
    drive: DriveClient,
    akun: AkunUntukJob,
    tautan: { id: string; judul: string; createdAt: Date; driveFolderDicobaPada: Date | null },
    now: () => Date,
  ): Promise<string> {
    let rootId = akun.rootFolderId
    if (tautan.driveFolderDicobaPada && rootId) {
      const found = await drive.findChildByAppProperty({ parentId: rootId, key: 'dmsTautanId', value: tautan.id })
      if (found) {
        await repo.simpanFolderId(tautan.id, found)
        return found
      }
    }

    await repo.simpanFolderDicoba(tautan.id, now())
    const folder = {
      name: buildDriveFolderName(tautan.judul, tautan.createdAt),
      appProperties: { dmsJenis: 'TAUTAN', dmsTautanId: tautan.id },
    }
    if (!rootId) rootId = await buatFolderAkar(drive, akun.id)

    let folderId: string
    try {
      folderId = (await drive.createFolder({ ...folder, parentId: rootId })).id
    } catch (error) {
      // Folder akar dihapus manual: buat ulang sekali, lalu lanjutkan (SPEC 7.2).
      if (classifyDriveError(error).kategori !== 'TIDAK_DITEMUKAN') throw classifyDriveError(error)
      rootId = await buatFolderAkar(drive, akun.id)
      folderId = (await drive.createFolder({ ...folder, parentId: rootId })).id
    }
    await repo.simpanFolderId(tautan.id, folderId)
    return folderId
  }

  async function unggahBaris(drive: DriveClient, folderId: string, baris: BarisFileUnggah, now: () => Date): Promise<string | null> {
    const sumber = await deps.bukaFile(baris)

    try {
      if (!sumber.ok) {
        // Percobaan terputus mungkin sudah menaruh salinannya; file yang kini tidak
        // tersedia di DMS tidak boleh tertinggal di Drive tanpa tercatat.
        if (baris.dicobaPada) {
          const yatim = await drive.findChildByAppProperty({ parentId: folderId, key: 'dmsKunci', value: baris.kunciLampiran })
          if (yatim) {
            await drive.deleteFile(yatim).catch((error: unknown) => {
              if (classifyDriveError(error).kategori !== 'TIDAK_DITEMUKAN') throw error
            })
          }
        }
        return null
      }
      if (baris.dicobaPada) {
        const found = await drive.findChildByAppProperty({ parentId: folderId, key: 'dmsKunci', value: baris.kunciLampiran })
        if (found) return found
      }
      await repo.tandaiBarisDicoba(baris.id, now())
      const { id } = await drive.uploadFile({
        parentId: folderId,
        name: baris.namaFile,
        mimeType: baris.contentType,
        body: sumber.buka(),
        appProperties: { dmsJenis: 'LAMPIRAN', dmsKunci: baris.kunciLampiran },
      })
      return id
    } catch (error) {
      return folderTautanHilang(error)
    }
  }

  async function tulisDaftarIsi(drive: DriveClient, tautanId: string, folderId: string, daftarIsiId: string | null, now: () => Date) {
    const data = await repo.muatDataDaftarIsi(tautanId)
    if (!data) return
    const body = buildDriveDaftarIsiText({ ...data, diperbaruiPada: now() })

    try {
      let fileId = daftarIsiId
        ?? await drive.findChildByAppProperty({ parentId: folderId, key: 'dmsJenis', value: 'DAFTAR_ISI' })
      if (fileId) {
        try {
          await drive.updateFileContent({ fileId, mimeType: DAFTAR_ISI_MIME, body })
        } catch (error) {
          // DAFTAR_ISI.txt dihapus manual: tulis baru di folder yang sama.
          if (classifyDriveError(error).kategori !== 'TIDAK_DITEMUKAN') throw error
          fileId = null
        }
      }
      if (!fileId) {
        fileId = (await drive.uploadFile({
          parentId: folderId,
          name: DRIVE_DAFTAR_ISI_NAMA,
          mimeType: DAFTAR_ISI_MIME,
          body,
          appProperties: { dmsJenis: 'DAFTAR_ISI' },
        })).id
      }
      if (fileId !== daftarIsiId) await repo.simpanDaftarIsiFileId(tautanId, fileId)
    } catch (error) {
      folderTautanHilang(error)
    }
  }

  return async ({ job, now }) => {
    const tautan = await repo.muatTautanUntukSinkron(job.tautanId)
    if (!tautan || tautan.revokedAt || (tautan.driveStatus !== 'MENUNGGU' && tautan.driveStatus !== 'MENGUNGGAH')) {
      return { hasil: 'DIBATALKAN' }
    }

    const akun = await deps.akun.muatAkunUntukJob(job.akunId)
    if (!akunBisaDipakai(akun)) throw new DriveApiError('AKUN_DIPUTUS')

    if (!await repo.setDriveStatus(tautan.id, { dari: ['MENUNGGU', 'MENGUNGGAH'], ke: 'MENGUNGGAH' })) {
      return { hasil: 'DIBATALKAN' }
    }

    const drive = await deps.driveClientFor(akun)
    const folderId = tautan.driveFolderId ?? await pastikanFolderTautan(drive, akun, tautan, now)

    // Satu per satu (tanpa paralel); status tautan dan akun diperiksa ulang tiap file.
    for (;;) {
      const terkini = await repo.muatTautanUntukSinkron(tautan.id)
      if (!terkini || terkini.revokedAt) return { hasil: 'DIBATALKAN' }
      if (!akunBisaDipakai(await deps.akun.muatAkunUntukJob(job.akunId))) throw new DriveApiError('AKUN_DIPUTUS')

      const baris = await repo.ambilBarisMenungguBerikut(tautan.id)
      if (!baris) break

      const driveFileId = await unggahBaris(drive, folderId, baris, now)
      if (!driveFileId) {
        await repo.tandaiBarisDilewati(baris.id)
        continue
      }
      if (!await repo.tandaiBarisTerunggah(baris.id, driveFileId, now())) {
        // Pemicu hapus menandai baris ini DILEWATI saat unggahannya terbang.
        await repo.pindahkanUnggahanTerbangKeMenghapus({
          barisId: baris.id, tautanId: tautan.id, akunId: job.akunId, driveFileId, now: now(),
        })
      }
    }

    const sebelumSiap = await repo.muatTautanUntukSinkron(tautan.id)
    if (!sebelumSiap || sebelumSiap.revokedAt) return { hasil: 'DIBATALKAN' }
    await tulisDaftarIsi(drive, tautan.id, folderId, sebelumSiap.driveDaftarIsiFileId, now)

    try {
      await drive.shareAnyoneReader(folderId)
    } catch (error) {
      folderTautanHilang(error)
    }
    const url = await drive.getWebViewLink(folderId)

    const siap = await repo.tandaiSiap({ id: tautan.id, jobId: job.id, url, now: now() })
    return { hasil: siap ? 'SELESAI' : 'DIBATALKAN' }
  }
}
