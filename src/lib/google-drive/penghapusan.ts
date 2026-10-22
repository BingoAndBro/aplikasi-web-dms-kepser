// Server-only module. Do not import from client components.
//
// Hook pemicu penghapusan salinan Google Drive (SPEC 9, K4 + P4). Setiap fungsi
// menerima transaksi PEMICU (cabut tautan, pemusnahan berkas, Pembersihan
// Dokumen, hapus permanen dokumen non-material), sehingga perubahan status
// baris file dan job hapus lahir -- atau batal -- bersama perubahan pemicunya.
// DMS memblokir akses seketika; runner menyusul menghapus di Drive.
// Semua update bersyarat pada status lama (db-fsm-guard), jadi unggahan yang
// sedang berjalan tidak bisa menimpa keputusan hapus (lihat sinkron-tautan.ts,
// "unggahan terbang"). Hanya tautan DRIVE yang belum dicabut yang disentuh:
// folder tautan yang sudah dicabut dihapus utuh oleh HAPUS_TAUTAN.
import { and, eq, inArray, isNull, notInArray, or } from 'drizzle-orm'
import type { db as Database } from '#/db/client'
import { driveJob } from '#/db/schema/app/drive-job'
import { laporanTautan } from '#/db/schema/app/laporan-tautan'
import {
  laporanTautanDriveFile,
  type LaporanTautanDriveFileKeteranganHapus,
} from '#/db/schema/app/laporan-tautan-drive-file'
import { berkasArsipItem } from '#/db/schema/arsip'
import { ARCHIVE_SOURCE_TYPE } from '#/lib/constants/archive-status'
import { enqueueDriveJob } from '#/lib/google-drive/jobs'

/** `db`, transaksi Drizzle, atau executor repository arsip (tanpa `execute`). */
export type PenghapusanExecutor = Pick<typeof Database, 'select' | 'insert' | 'update'>

/**
 * Cabut tautan DRIVE (dipanggil di transaksi `revokeTautanByCreator`, setelah
 * revoked_at terisi): drive_status MENGHAPUS, job SINKRON_TAUTAN dan HAPUS_FILE
 * yang masih MENUNGGU dibatalkan (folder dihapus utuh), lalu enqueue HAPUS_TAUTAN.
 */
export async function tandaiTautanDicabut(
  tx: PenghapusanExecutor,
  { tautanId, akunId, now }: { tautanId: string; akunId: string; now: Date },
): Promise<void> {
  await tx
    .update(laporanTautan)
    .set({ driveStatus: 'MENGHAPUS' })
    .where(and(
      eq(laporanTautan.id, tautanId),
      eq(laporanTautan.akses, 'DRIVE'),
      notInArray(laporanTautan.driveStatus, ['MENGHAPUS', 'DIHAPUS']),
    ))

  await tx
    .update(driveJob)
    .set({ status: 'DIBATALKAN', selesaiPada: now })
    .where(and(
      eq(driveJob.tautanId, tautanId),
      inArray(driveJob.jenis, ['SINKRON_TAUTAN', 'HAPUS_FILE']),
      eq(driveJob.status, 'MENUNGGU'),
    ))

  await enqueueDriveJob(tx, { jenis: 'HAPUS_TAUTAN', akunId, tautanId, now })
}

/**
 * Lampiran dokumen/arsip manual yang aksesnya ditutup DMS: pada tautan DRIVE
 * yang belum dicabut, baris TERUNGGAH -> MENGHAPUS dan MENUNGGU -> DILEWATI
 * (keduanya mencatat `keterangan` untuk DAFTAR_ISI.txt), lalu satu HAPUS_FILE per
 * tautan yang barisnya berubah (handler juga memperbarui DAFTAR_ISI.txt).
 */
export async function tandaiFileDihapusUntukSumber(
  tx: PenghapusanExecutor,
  {
    dokumenIds = [],
    manualArsipIds = [],
    keterangan,
    now,
  }: {
    dokumenIds?: readonly string[]
    manualArsipIds?: readonly string[]
    keterangan: LaporanTautanDriveFileKeteranganHapus
    now: Date
  },
): Promise<{ tautanTerdampak: number }> {
  const sumber = [
    ...(dokumenIds.length > 0 ? [inArray(laporanTautanDriveFile.dokumenId, [...dokumenIds])] : []),
    ...(manualArsipIds.length > 0 ? [inArray(laporanTautanDriveFile.manualArsipId, [...manualArsipIds])] : []),
  ]
  if (sumber.length === 0) return { tautanTerdampak: 0 }

  const target = await tx
    .select({
      id: laporanTautanDriveFile.id,
      tautanId: laporanTautanDriveFile.tautanId,
      akunId: laporanTautan.driveAkunId,
    })
    .from(laporanTautanDriveFile)
    .innerJoin(laporanTautan, eq(laporanTautan.id, laporanTautanDriveFile.tautanId))
    .where(and(
      or(...sumber),
      inArray(laporanTautanDriveFile.status, ['TERUNGGAH', 'MENUNGGU']),
      eq(laporanTautan.akses, 'DRIVE'),
      isNull(laporanTautan.revokedAt),
    ))
  if (target.length === 0) return { tautanTerdampak: 0 }

  const ids = target.map(row => row.id)
  const menghapus = await tx
    .update(laporanTautanDriveFile)
    .set({ status: 'MENGHAPUS', keteranganHapus: keterangan })
    .where(and(inArray(laporanTautanDriveFile.id, ids), eq(laporanTautanDriveFile.status, 'TERUNGGAH')))
    .returning({ tautanId: laporanTautanDriveFile.tautanId })
  const dilewati = await tx
    .update(laporanTautanDriveFile)
    .set({ status: 'DILEWATI', keteranganHapus: keterangan })
    .where(and(inArray(laporanTautanDriveFile.id, ids), eq(laporanTautanDriveFile.status, 'MENUNGGU')))
    .returning({ tautanId: laporanTautanDriveFile.tautanId })

  const akunPerTautan = new Map(target.map(row => [row.tautanId, row.akunId]))
  const terdampak = [...new Set([...menghapus, ...dilewati].map(row => row.tautanId))]
  for (const tautanId of terdampak) {
    const akunId = akunPerTautan.get(tautanId)
    // drive_akun_id selalu terisi untuk akses DRIVE (laporan_tautan_drive_check).
    if (akunId) await enqueueDriveJob(tx, { jenis: 'HAPUS_FILE', akunId, tautanId, now })
  }
  return { tautanTerdampak: terdampak.length }
}

/**
 * Berkas USUL_MUSNAH -> DIMUSNAHKAN: seluruh isi berkas (dokumen alur WORKFLOW
 * dan dokumen tambahan MANUAL) ditandai DIMUSNAHKAN. Dipanggil repository arsip
 * di transaksi `transitionBerkasArchiveStatus`.
 */
export async function tandaiFileBerkasDimusnahkan(
  tx: PenghapusanExecutor,
  { berkasId, now }: { berkasId: string; now: Date },
): Promise<{ tautanTerdampak: number }> {
  const items = await tx
    .select({ dokumenId: berkasArsipItem.dokumenId, manualArsipId: berkasArsipItem.manualArsipId })
    .from(berkasArsipItem)
    .where(and(
      eq(berkasArsipItem.berkasId, berkasId),
      inArray(berkasArsipItem.sourceType, [ARCHIVE_SOURCE_TYPE.WORKFLOW, ARCHIVE_SOURCE_TYPE.MANUAL]),
    ))
  if (items.length === 0) return { tautanTerdampak: 0 }

  return tandaiFileDihapusUntukSumber(tx, {
    dokumenIds: items.flatMap(item => (item.dokumenId ? [item.dokumenId] : [])),
    manualArsipIds: items.flatMap(item => (item.manualArsipId ? [item.manualArsipId] : [])),
    keterangan: 'DIMUSNAHKAN',
    now,
  })
}
