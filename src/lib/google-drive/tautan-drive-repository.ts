// Server-only module. Do not import from client components.
//
// Kueri dan aksi tabel `laporan_tautan_drive_file` + kolom `drive_*` tautan
// yang dipakai handler SINKRON_TAUTAN. Semua perubahan status bersyarat pada
// status lama (db-fsm-guard), sehingga pemicu hapus yang berjalan bersamaan
// (section 09) selalu menang atas runner. Handler memakai antarmuka
// `TautanDriveRepository` supaya tes bisa memakai implementasi in-memory.
// `db` dimuat malas (pola jobs.ts) agar modul bisa diimpor tanpa DATABASE_URL.
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import type { db as Database } from '#/db/client'
import { driveJob } from '#/db/schema/app/drive-job'
import {
  laporanTautan,
  type LaporanTautanDriveStatus,
} from '#/db/schema/app/laporan-tautan'
import {
  laporanTautanDriveFile,
  type LaporanTautanDriveFile,
  type LaporanTautanDriveFileKeteranganHapus,
} from '#/db/schema/app/laporan-tautan-drive-file'
import { users } from '#/db/schema/auth/users'
import { auditLog } from '#/db/schema/audit/audit-log'
import type { DriveDaftarIsiInput } from '#/lib/google-drive/daftar-isi'
import { enqueueDriveJob } from '#/lib/google-drive/jobs'
import { TAUTAN_SUMBER_LABEL } from '#/lib/laporan/tautan-shared'

export type TautanDriveExecutor = Pick<typeof Database, 'select' | 'insert' | 'update' | 'execute' | 'transaction'>

export type TautanUntukSinkron = {
  id: string
  judul: string
  createdAt: Date
  revokedAt: Date | null
  driveAkunId: string | null
  driveStatus: LaporanTautanDriveStatus | null
  driveFolderId: string | null
  driveFolderDicobaPada: Date | null
  driveDaftarIsiFileId: string | null
}

export type BarisFileUnggah = Pick<
  LaporanTautanDriveFile,
  | 'id'
  | 'tautanId'
  | 'sumber'
  | 'dokumenId'
  | 'lampiranIndex'
  | 'manualArsipId'
  | 'attachmentId'
  | 'kunciLampiran'
  | 'namaFile'
  | 'contentType'
  | 'dicobaPada'
>

export type DataDaftarIsi = Omit<DriveDaftarIsiInput, 'diperbaruiPada'>

export interface TautanDriveRepository {
  /** Tautan akses DRIVE, atau null. */
  muatTautanUntukSinkron(id: string): Promise<TautanUntukSinkron | null>
  /** Ubah drive_status bila status sekarang ∈ `dari` dan tautan belum dicabut. */
  setDriveStatus(id: string, input: { dari: LaporanTautanDriveStatus[]; ke: LaporanTautanDriveStatus }): Promise<boolean>
  simpanFolderDicoba(id: string, now: Date): Promise<void>
  simpanFolderId(id: string, folderId: string): Promise<void>
  /** Baris MENUNGGU berikutnya urut kunci_lampiran (diambil ulang tiap iterasi). */
  ambilBarisMenungguBerikut(tautanId: string): Promise<BarisFileUnggah | null>
  tandaiBarisDicoba(id: string, now: Date): Promise<void>
  /** MENUNGGU -> TERUNGGAH; false bila baris sudah bukan MENUNGGU. */
  tandaiBarisTerunggah(id: string, driveFileId: string, now: Date): Promise<boolean>
  /** MENUNGGU -> DILEWATI (file tidak tersedia saat akan diunggah). */
  tandaiBarisDilewati(id: string): Promise<boolean>
  /**
   * Unggahan yang selesai setelah pemicu hapus menandai barisnya DILEWATI:
   * simpan drive_file_id, status MENGHAPUS (keterangan dipertahankan), dan
   * enqueue HAPUS_FILE dalam satu transaksi.
   */
  pindahkanUnggahanTerbangKeMenghapus(input: {
    barisId: string
    tautanId: string
    akunId: string
    driveFileId: string
    now: Date
  }): Promise<boolean>
  simpanDaftarIsiFileId(id: string, fileId: string): Promise<void>
  muatDataDaftarIsi(tautanId: string): Promise<DataDaftarIsi | null>
  /**
   * Satu transaksi: drive_folder_url + SIAP (bersyarat MENGUNGGAH & belum
   * dicabut), audit DRIVE_TAUTAN_SIAP (actor null), job SELESAI. false bila
   * tautan sudah berubah (dicabut) -- tidak ada yang ditulis.
   */
  tandaiSiap(input: { id: string; jobId: string; url: string; now: Date }): Promise<boolean>
  /** MENUNGGU/MENGUNGGAH -> GAGAL bila belum dicabut. */
  tandaiGagal(id: string): Promise<boolean>
}

export type BarisFileHapus = Pick<LaporanTautanDriveFile, 'id' | 'driveFileId' | 'keteranganHapus'>

/** Bagian repository yang dipakai handler HAPUS_TAUTAN / HAPUS_FILE (hapus.ts). */
export interface HapusDriveRepository {
  muatTautanUntukSinkron(id: string): Promise<TautanUntukSinkron | null>
  muatDataDaftarIsi(tautanId: string): Promise<DataDaftarIsi | null>
  /** Baris MENGHAPUS berikutnya urut kunci_lampiran (diambil ulang tiap iterasi). */
  ambilBarisMenghapusBerikut(tautanId: string): Promise<BarisFileHapus | null>
  /** MENGHAPUS -> DIHAPUS + dihapus_pada; false bila baris sudah bukan MENGHAPUS. */
  tandaiBarisDihapus(id: string, now: Date): Promise<boolean>
  /**
   * Satu transaksi setelah folder terhapus: drive_status DIHAPUS (bersyarat
   * sudah dicabut & belum DIHAPUS), semua baris yang belum DIHAPUS -> DIHAPUS
   * (keterangan DICABUT bila kosong), audit DRIVE_TAUTAN_DIHAPUS (actor null),
   * job SELESAI. false bila tautan tidak dalam keadaan itu (tidak ada yang ditulis).
   */
  selesaikanHapusTautan(input: { tautanId: string; jobId: string; now: Date }): Promise<boolean>
  /** Satu transaksi: audit DRIVE_FILE_DIHAPUS (bila ada file terhapus) + job SELESAI. */
  selesaikanHapusFile(input: {
    tautanId: string
    jobId: string
    jumlahFile: number
    keterangan: LaporanTautanDriveFileKeteranganHapus[]
    now: Date
  }): Promise<void>
}

async function getDatabase(): Promise<TautanDriveExecutor> {
  const client = await import('#/db/client')
  return client.db
}

export function createTautanDriveRepository(executor?: TautanDriveExecutor): TautanDriveRepository & HapusDriveRepository {
  const database = () => (executor ? Promise.resolve(executor) : getDatabase())

  return {
    async muatTautanUntukSinkron(id) {
      const run = await database()
      const [row] = await run
        .select({
          id: laporanTautan.id,
          judul: laporanTautan.judul,
          createdAt: laporanTautan.createdAt,
          revokedAt: laporanTautan.revokedAt,
          driveAkunId: laporanTautan.driveAkunId,
          driveStatus: laporanTautan.driveStatus,
          driveFolderId: laporanTautan.driveFolderId,
          driveFolderDicobaPada: laporanTautan.driveFolderDicobaPada,
          driveDaftarIsiFileId: laporanTautan.driveDaftarIsiFileId,
        })
        .from(laporanTautan)
        .where(and(eq(laporanTautan.id, id), eq(laporanTautan.akses, 'DRIVE')))
      return row ?? null
    },

    async setDriveStatus(id, { dari, ke }) {
      const run = await database()
      const updated = await run
        .update(laporanTautan)
        .set({ driveStatus: ke })
        .where(and(eq(laporanTautan.id, id), isNull(laporanTautan.revokedAt), inArray(laporanTautan.driveStatus, dari)))
        .returning({ id: laporanTautan.id })
      return updated.length > 0
    },

    async simpanFolderDicoba(id, now) {
      const run = await database()
      await run.update(laporanTautan).set({ driveFolderDicobaPada: now }).where(eq(laporanTautan.id, id))
    },

    async simpanFolderId(id, folderId) {
      const run = await database()
      await run.update(laporanTautan).set({ driveFolderId: folderId }).where(eq(laporanTautan.id, id))
    },

    async ambilBarisMenungguBerikut(tautanId) {
      const run = await database()
      const [row] = await run
        .select({
          id: laporanTautanDriveFile.id,
          tautanId: laporanTautanDriveFile.tautanId,
          sumber: laporanTautanDriveFile.sumber,
          dokumenId: laporanTautanDriveFile.dokumenId,
          lampiranIndex: laporanTautanDriveFile.lampiranIndex,
          manualArsipId: laporanTautanDriveFile.manualArsipId,
          attachmentId: laporanTautanDriveFile.attachmentId,
          kunciLampiran: laporanTautanDriveFile.kunciLampiran,
          namaFile: laporanTautanDriveFile.namaFile,
          contentType: laporanTautanDriveFile.contentType,
          dicobaPada: laporanTautanDriveFile.dicobaPada,
        })
        .from(laporanTautanDriveFile)
        .where(and(eq(laporanTautanDriveFile.tautanId, tautanId), eq(laporanTautanDriveFile.status, 'MENUNGGU')))
        .orderBy(asc(laporanTautanDriveFile.kunciLampiran))
        .limit(1)
      return row ?? null
    },

    async tandaiBarisDicoba(id, now) {
      const run = await database()
      await run.update(laporanTautanDriveFile).set({ dicobaPada: now }).where(eq(laporanTautanDriveFile.id, id))
    },

    async tandaiBarisTerunggah(id, driveFileId, now) {
      const run = await database()
      const updated = await run
        .update(laporanTautanDriveFile)
        .set({ status: 'TERUNGGAH', driveFileId, diunggahPada: now })
        .where(and(eq(laporanTautanDriveFile.id, id), eq(laporanTautanDriveFile.status, 'MENUNGGU')))
        .returning({ id: laporanTautanDriveFile.id })
      return updated.length > 0
    },

    async tandaiBarisDilewati(id) {
      const run = await database()
      const updated = await run
        .update(laporanTautanDriveFile)
        .set({ status: 'DILEWATI' })
        .where(and(eq(laporanTautanDriveFile.id, id), eq(laporanTautanDriveFile.status, 'MENUNGGU')))
        .returning({ id: laporanTautanDriveFile.id })
      return updated.length > 0
    },

    async pindahkanUnggahanTerbangKeMenghapus({ barisId, tautanId, akunId, driveFileId, now }) {
      const run = await database()
      return run.transaction(async (tx) => {
        const updated = await tx
          .update(laporanTautanDriveFile)
          .set({ status: 'MENGHAPUS', driveFileId, diunggahPada: now })
          .where(and(eq(laporanTautanDriveFile.id, barisId), eq(laporanTautanDriveFile.status, 'DILEWATI')))
          .returning({ id: laporanTautanDriveFile.id })
        if (updated.length === 0) return false
        await enqueueDriveJob(tx, { jenis: 'HAPUS_FILE', akunId, tautanId, now })
        return true
      })
    },

    async simpanDaftarIsiFileId(id, fileId) {
      const run = await database()
      await run.update(laporanTautan).set({ driveDaftarIsiFileId: fileId }).where(eq(laporanTautan.id, id))
    },

    async muatDataDaftarIsi(tautanId) {
      const run = await database()
      const [tautan] = await run
        .select({
          judul: laporanTautan.judul,
          sumber: laporanTautan.sumber,
          dilewati: laporanTautan.driveDokumenDilewati,
          namaLengkap: users.namaLengkap,
          displayName: users.displayName,
          username: users.username,
        })
        .from(laporanTautan)
        .leftJoin(users, eq(users.id, laporanTautan.createdBy))
        .where(eq(laporanTautan.id, tautanId))
      if (!tautan) return null

      const files = await run
        .select({
          labelDokumen: laporanTautanDriveFile.labelDokumen,
          namaFile: laporanTautanDriveFile.namaFile,
          urutan: laporanTautanDriveFile.urutan,
          status: laporanTautanDriveFile.status,
          keteranganHapus: laporanTautanDriveFile.keteranganHapus,
        })
        .from(laporanTautanDriveFile)
        .where(eq(laporanTautanDriveFile.tautanId, tautanId))
        .orderBy(asc(laporanTautanDriveFile.urutan))

      return {
        judul: tautan.judul,
        sumberLabel: TAUTAN_SUMBER_LABEL[tautan.sumber],
        dibagikanOleh: tautan.namaLengkap || tautan.displayName || tautan.username || null,
        files,
        dilewati: tautan.dilewati,
      }
    },

    async tandaiSiap({ id, jobId, url, now }) {
      const run = await database()
      return run.transaction(async (tx) => {
        const updated = await tx
          .update(laporanTautan)
          .set({ driveFolderUrl: url, driveStatus: 'SIAP' })
          .where(and(eq(laporanTautan.id, id), isNull(laporanTautan.revokedAt), eq(laporanTautan.driveStatus, 'MENGUNGGAH')))
          .returning({ dilewati: laporanTautan.driveDokumenDilewati })
        if (updated.length === 0) return false

        const [hitung] = await tx
          .select({
            terunggah: sql<number>`count(*) FILTER (WHERE ${laporanTautanDriveFile.status} = 'TERUNGGAH')::int`,
            dilewati: sql<number>`count(*) FILTER (WHERE ${laporanTautanDriveFile.status} = 'DILEWATI')::int`,
          })
          .from(laporanTautanDriveFile)
          .where(eq(laporanTautanDriveFile.tautanId, id))

        await tx.insert(auditLog).values({
          entityType: 'LAPORAN_TAUTAN',
          entityId: id,
          aksi: 'DRIVE_TAUTAN_SIAP',
          actorUserId: null,
          metadataSnapshot: {
            jumlah_file: Number(hitung?.terunggah ?? 0),
            jumlah_dilewati: Number(hitung?.dilewati ?? 0) + updated[0].dilewati.length,
          },
          createdAt: now,
        })
        await tx
          .update(driveJob)
          .set({ status: 'SELESAI', selesaiPada: now, dikunciPada: null })
          .where(and(eq(driveJob.id, jobId), eq(driveJob.status, 'PROSES')))
        return true
      })
    },

    async tandaiGagal(id) {
      const run = await database()
      const updated = await run
        .update(laporanTautan)
        .set({ driveStatus: 'GAGAL' })
        .where(and(
          eq(laporanTautan.id, id),
          isNull(laporanTautan.revokedAt),
          inArray(laporanTautan.driveStatus, ['MENUNGGU', 'MENGUNGGAH']),
        ))
        .returning({ id: laporanTautan.id })
      return updated.length > 0
    },

    async ambilBarisMenghapusBerikut(tautanId) {
      const run = await database()
      const [row] = await run
        .select({
          id: laporanTautanDriveFile.id,
          driveFileId: laporanTautanDriveFile.driveFileId,
          keteranganHapus: laporanTautanDriveFile.keteranganHapus,
        })
        .from(laporanTautanDriveFile)
        .where(and(eq(laporanTautanDriveFile.tautanId, tautanId), eq(laporanTautanDriveFile.status, 'MENGHAPUS')))
        .orderBy(asc(laporanTautanDriveFile.kunciLampiran))
        .limit(1)
      return row ?? null
    },

    async tandaiBarisDihapus(id, now) {
      const run = await database()
      const updated = await run
        .update(laporanTautanDriveFile)
        .set({ status: 'DIHAPUS', dihapusPada: now })
        .where(and(eq(laporanTautanDriveFile.id, id), eq(laporanTautanDriveFile.status, 'MENGHAPUS')))
        .returning({ id: laporanTautanDriveFile.id })
      return updated.length > 0
    },

    async selesaikanHapusTautan({ tautanId, jobId, now }) {
      const run = await database()
      return run.transaction(async (tx) => {
        const updated = await tx
          .update(laporanTautan)
          .set({ driveStatus: 'DIHAPUS' })
          .where(and(
            eq(laporanTautan.id, tautanId),
            isNotNull(laporanTautan.revokedAt),
            ne(laporanTautan.driveStatus, 'DIHAPUS'),
          ))
          .returning({ id: laporanTautan.id })
        if (updated.length === 0) return false

        // Salinan yang memang ada di Drive (bukan baris yang dilewati / belum diunggah).
        const [hitung] = await tx
          .select({ jumlah: sql<number>`count(*)::int` })
          .from(laporanTautanDriveFile)
          .where(and(
            eq(laporanTautanDriveFile.tautanId, tautanId),
            inArray(laporanTautanDriveFile.status, ['TERUNGGAH', 'MENGHAPUS']),
            isNotNull(laporanTautanDriveFile.driveFileId),
          ))
        await tx
          .update(laporanTautanDriveFile)
          .set({
            status: 'DIHAPUS',
            keteranganHapus: sql`coalesce(${laporanTautanDriveFile.keteranganHapus}, 'DICABUT')`,
            dihapusPada: now,
          })
          .where(and(eq(laporanTautanDriveFile.tautanId, tautanId), ne(laporanTautanDriveFile.status, 'DIHAPUS')))

        await tx.insert(auditLog).values({
          entityType: 'LAPORAN_TAUTAN',
          entityId: tautanId,
          aksi: 'DRIVE_TAUTAN_DIHAPUS',
          actorUserId: null,
          metadataSnapshot: { jumlah_file: Number(hitung?.jumlah ?? 0) },
          createdAt: now,
        })
        await tx
          .update(driveJob)
          .set({ status: 'SELESAI', selesaiPada: now, dikunciPada: null })
          .where(and(eq(driveJob.id, jobId), eq(driveJob.status, 'PROSES')))
        return true
      })
    },

    async selesaikanHapusFile({ tautanId, jobId, jumlahFile, keterangan, now }) {
      const run = await database()
      await run.transaction(async (tx) => {
        if (jumlahFile > 0) {
          await tx.insert(auditLog).values({
            entityType: 'LAPORAN_TAUTAN',
            entityId: tautanId,
            aksi: 'DRIVE_FILE_DIHAPUS',
            actorUserId: null,
            metadataSnapshot: { jumlah_file: jumlahFile, keterangan },
            createdAt: now,
          })
        }
        await tx
          .update(driveJob)
          .set({ status: 'SELESAI', selesaiPada: now, dikunciPada: null })
          .where(and(eq(driveJob.id, jobId), eq(driveJob.status, 'PROSES')))
      })
    },
  }
}

export type CobaLagiHasil = 'DIJADWALKAN' | 'BUKAN_GAGAL' | 'TIDAK_DITEMUKAN'

/**
 * "Coba lagi" oleh pembuat (SPEC 8.4), satu transaksi: drive_status GAGAL ->
 * MENUNGGU (bersyarat pembuat, akses DRIVE, belum dicabut, masih GAGAL), lalu
 * job SINKRON_TAUTAN GAGAL terbaru -> MENUNGGU dengan percobaan 0, jadwal
 * `now`, galat dikosongkan. Bila sudah ada job sinkron MENUNGGU/PROSES untuk
 * tautan itu, job lama tidak diubah (partial unique `drive_job_satu_menunggu`);
 * bila tidak ada job GAGAL sama sekali, job baru di-enqueue.
 * TIDAK_DITEMUKAN: bukan pembuat / tidak ada / dicabut / bukan DRIVE (404).
 */
export async function cobaLagiTautanDrive(
  { tautanId, userId, now }: { tautanId: string; userId: string; now: Date },
  executor?: TautanDriveExecutor,
): Promise<CobaLagiHasil> {
  const run = executor ?? await getDatabase()
  return run.transaction(async (tx) => {
    const milikPembuat = and(
      eq(laporanTautan.id, tautanId),
      eq(laporanTautan.createdBy, userId),
      eq(laporanTautan.akses, 'DRIVE'),
      isNull(laporanTautan.revokedAt),
    )
    const [tautan] = await tx
      .update(laporanTautan)
      .set({ driveStatus: 'MENUNGGU' })
      .where(and(milikPembuat, eq(laporanTautan.driveStatus, 'GAGAL')))
      .returning({ akunId: laporanTautan.driveAkunId })

    if (!tautan) {
      const [ada] = await tx.select({ id: laporanTautan.id }).from(laporanTautan).where(milikPembuat).limit(1)
      return ada ? 'BUKAN_GAGAL' : 'TIDAK_DITEMUKAN'
    }

    const [aktif] = await tx
      .select({ id: driveJob.id })
      .from(driveJob)
      .where(and(
        eq(driveJob.tautanId, tautanId),
        eq(driveJob.jenis, 'SINKRON_TAUTAN'),
        inArray(driveJob.status, ['MENUNGGU', 'PROSES']),
      ))
      .limit(1)
    if (aktif) return 'DIJADWALKAN'

    const [gagal] = await tx
      .select({ id: driveJob.id })
      .from(driveJob)
      .where(and(eq(driveJob.tautanId, tautanId), eq(driveJob.jenis, 'SINKRON_TAUTAN'), eq(driveJob.status, 'GAGAL')))
      .orderBy(sql`${driveJob.selesaiPada} DESC NULLS LAST`, desc(driveJob.dibuatPada))
      .limit(1)

    const direset = gagal
      ? await tx
        .update(driveJob)
        .set({
          status: 'MENUNGGU',
          percobaan: 0,
          jadwalBerikut: now,
          galatKategori: null,
          galatPesan: null,
          selesaiPada: null,
          dikunciPada: null,
        })
        .where(and(eq(driveJob.id, gagal.id), eq(driveJob.status, 'GAGAL')))
        .returning({ id: driveJob.id })
      : []
    if (direset.length === 0) {
      // drive_akun_id selalu terisi untuk akses DRIVE (laporan_tautan_drive_check).
      await enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId: tautan.akunId as string, tautanId, now })
    }
    return 'DIJADWALKAN'
  })
}
