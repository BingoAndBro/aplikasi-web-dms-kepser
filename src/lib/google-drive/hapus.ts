// Server-only module. Do not import from client components.
//
// Handler job HAPUS_TAUTAN dan HAPUS_FILE (SPEC 9, K4 + P4). Pemicu sudah
// menandai baris/tautan di transaksinya (penghapusan.ts); handler hanya
// menghapus PERMANEN di Drive lalu mencatat hasilnya. 404 = sudah terhapus
// (berhasil). Job hapus untuk tautan yang sinkronnya masih PROSES ditunda
// 30 dtk tanpa menambah percobaan (D13), supaya DAFTAR_ISI.txt dan folder
// tidak diubah dua handler sekaligus. Galat Drive dilempar ke runner.
import type { LaporanTautanDriveFileKeteranganHapus } from '#/db/schema/app/laporan-tautan-drive-file'
import type { AkunUntukJob } from '#/lib/google-drive/akun-repository'
import { buildDriveDaftarIsiText } from '#/lib/google-drive/daftar-isi'
import type { DriveClient } from '#/lib/google-drive/drive-client'
import { DriveApiError, classifyDriveError } from '#/lib/google-drive/drive-errors'
import { DRIVE_JOB_TUNDA_SINKRON_MS, type DriveJob } from '#/lib/google-drive/jobs'
import type { DriveJobHandler } from '#/lib/google-drive/runner'
import type { HapusDriveRepository } from '#/lib/google-drive/tautan-drive-repository'

const DAFTAR_ISI_MIME = 'text/plain; charset=utf-8'

export type HapusDriveDeps = {
  repo: HapusDriveRepository
  akun: { muatAkunUntukJob(akunId: string): Promise<AkunUntukJob | null> }
  driveClientFor(akun: AkunUntukJob): Promise<DriveClient>
  jobs: {
    /** Job SINKRON_TAUTAN tautan ini yang PROSES dan belum macet, atau null. */
    findActiveSinkron(tautanId: string, now: Date): Promise<{ id: string } | null>
    /** PROSES -> MENUNGGU pada now + ms tanpa menambah percobaan. */
    defer(id: string, input: { now: Date; ms: number }): Promise<boolean>
  }
}

/** DriveClient dibuat malas: job yang tidak perlu menyentuh Drive tidak butuh akun. */
function driveSaatPerlu(deps: HapusDriveDeps, job: DriveJob): () => Promise<DriveClient> {
  let client: Promise<DriveClient> | null = null
  return () => {
    client ??= (async () => {
      const akun = await deps.akun.muatAkunUntukJob(job.akunId)
      // Akun diputus: token sudah dicabut, salinan hanya bisa dihapus manual (daftar ADMIN).
      if (!akun || akun.status === 'DIPUTUS' || !akun.refreshTokenEnc) throw new DriveApiError('AKUN_DIPUTUS')
      return deps.driveClientFor(akun)
    })()
    return client
  }
}

async function hapusPermanen(drive: DriveClient, fileId: string): Promise<void> {
  try {
    await drive.deleteFile(fileId)
  } catch (error) {
    const galat = classifyDriveError(error)
    if (galat.kategori !== 'TIDAK_DITEMUKAN') throw galat
  }
}

async function tundaBilaSinkronBerjalan(deps: HapusDriveDeps, job: DriveJob, now: () => Date): Promise<boolean> {
  const waktu = now()
  if (!await deps.jobs.findActiveSinkron(job.tautanId, waktu)) return false
  await deps.jobs.defer(job.id, { now: waktu, ms: DRIVE_JOB_TUNDA_SINKRON_MS })
  return true
}

export function createHapusTautanHandler(deps: HapusDriveDeps): DriveJobHandler {
  return async ({ job, now }) => {
    const tautan = await deps.repo.muatTautanUntukSinkron(job.tautanId)
    if (!tautan || tautan.driveStatus === 'DIHAPUS') return { hasil: 'SELESAI' }
    if (await tundaBilaSinkronBerjalan(deps, job, now)) return { hasil: 'DITUNDA' }

    const drive = driveSaatPerlu(deps, job)
    let folderId = tautan.driveFolderId
    if (!folderId && tautan.driveFolderDicobaPada) {
      // Folder mungkin sudah dibuat tetapi ID-nya belum sempat tersimpan.
      const akun = await deps.akun.muatAkunUntukJob(job.akunId)
      if (akun?.rootFolderId) {
        folderId = await (await drive()).findChildByAppProperty({
          parentId: akun.rootFolderId,
          key: 'dmsTautanId',
          value: tautan.id,
        })
      }
    }
    // Menghapus folder ikut menghapus semua isinya (lampiran + DAFTAR_ISI.txt).
    if (folderId) await hapusPermanen(await drive(), folderId)

    await deps.repo.selesaikanHapusTautan({ tautanId: tautan.id, jobId: job.id, now: now() })
    return { hasil: 'SELESAI' }
  }
}

export function createHapusFileHandler(deps: HapusDriveDeps): DriveJobHandler {
  return async ({ job, now }) => {
    const tautan = await deps.repo.muatTautanUntukSinkron(job.tautanId)
    // Tautan dicabut: folder utuh ditangani HAPUS_TAUTAN.
    if (!tautan || tautan.revokedAt) return { hasil: 'SELESAI' }
    if (await tundaBilaSinkronBerjalan(deps, job, now)) return { hasil: 'DITUNDA' }

    const drive = driveSaatPerlu(deps, job)
    let jumlahFile = 0
    const keterangan = new Set<LaporanTautanDriveFileKeteranganHapus>()
    for (;;) {
      const baris = await deps.repo.ambilBarisMenghapusBerikut(tautan.id)
      if (!baris) break
      if (baris.driveFileId) await hapusPermanen(await drive(), baris.driveFileId)
      if (await deps.repo.tandaiBarisDihapus(baris.id, now()) && baris.driveFileId) {
        jumlahFile += 1
        if (baris.keteranganHapus) keterangan.add(baris.keteranganHapus)
      }
    }

    // DAFTAR_ISI.txt menandai lampiran yang "telah dimusnahkan/dibersihkan/dihapus pemiliknya".
    const terkini = await deps.repo.muatTautanUntukSinkron(tautan.id)
    if (terkini && !terkini.revokedAt && terkini.driveDaftarIsiFileId) {
      const data = await deps.repo.muatDataDaftarIsi(tautan.id)
      if (data) {
        try {
          await (await drive()).updateFileContent({
            fileId: terkini.driveDaftarIsiFileId,
            mimeType: DAFTAR_ISI_MIME,
            body: buildDriveDaftarIsiText({ ...data, diperbaruiPada: now() }),
          })
        } catch (error) {
          // Dihapus manual: tidak ditulis ulang di sini; salinan lampiran sudah terhapus.
          const galat = classifyDriveError(error)
          if (galat.kategori !== 'TIDAK_DITEMUKAN') throw galat
        }
      }
    }

    await deps.repo.selesaikanHapusFile({
      tautanId: tautan.id,
      jobId: job.id,
      jumlahFile,
      keterangan: [...keterangan].sort(),
      now: now(),
    })
    return { hasil: 'SELESAI' }
  }
}
