// Server-only module. Do not import from client components.
//
// Akun Google Drive yang dikelola ADMIN (SPEC 7.1-7.2, K5). Setiap penulisan
// berjalan dalam satu transaksi bersama audit-nya; perubahan status bersyarat
// pada status lama. Ganti akun menonaktifkan akun AKTIF lama lebih dulu, baru
// mengaktifkan target, sehingga partial unique `google_drive_akun_satu_aktif`
// hanya terlanggar bila dua ADMIN menghubungkan bersamaan (-> AKUN_BERUBAH).
// Audit hanya memuat email + mode / jumlah tautan -- tidak pernah token.
// `db` dimuat malas (pola jobs.ts) agar modul bisa diimpor tanpa DATABASE_URL.
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { db as Database } from '#/db/client'
import { driveJob } from '#/db/schema/app/drive-job'
import { googleDriveAkun, type GoogleDriveAkunStatus } from '#/db/schema/app/google-drive-akun'
import { laporanTautan } from '#/db/schema/app/laporan-tautan'
import { auditLog } from '#/db/schema/audit/audit-log'
import { classifyDriveError } from '#/lib/google-drive/drive-errors'
import {
  DRIVE_PESAN_GALAT,
  buildDriveFolderName,
  type DriveGalatKategori,
  type GoogleDriveAkunSummary,
  type MulaiHubungMode,
  type PerluHapusManualItem,
} from '#/lib/google-drive/shared'

/** Executor Drizzle: `db`, transaksi Drizzle (savepoint), atau `drizzle(poolClient)`. */
export type AkunExecutor = Pick<typeof Database, 'select' | 'insert' | 'update' | 'execute' | 'transaction'>

export type AkunDriveErrorKode = 'EMAIL_BERBEDA' | 'AKUN_BERUBAH' | 'AKUN_TIDAK_DITEMUKAN' | 'AKUN_SUDAH_DIPUTUS'

const PESAN: Record<AkunDriveErrorKode, string> = {
  EMAIL_BERBEDA: 'Akun Google yang dipakai berbeda dengan akun yang dihubungkan ulang — login dengan email yang sama.',
  AKUN_BERUBAH: 'Akun aktif berubah, muat ulang halaman lalu ulangi.',
  AKUN_TIDAK_DITEMUKAN: 'Akun Google Drive tidak ditemukan.',
  AKUN_SUDAH_DIPUTUS: 'Akun Google Drive sudah diputus.',
}

export class AkunDriveError extends Error {
  readonly kode: AkunDriveErrorKode
  readonly pesan: string

  constructor(kode: AkunDriveErrorKode) {
    super(PESAN[kode])
    this.name = 'AkunDriveError'
    this.kode = kode
    this.pesan = PESAN[kode]
  }
}

/** Status tautan DRIVE yang masih punya (atau akan punya) salinan di Drive. */
const TAUTAN_DRIVE_AKTIF = ['MENUNGGU', 'MENGUNGGAH', 'SIAP', 'GAGAL'] as const

async function getDatabase(): Promise<AkunExecutor> {
  const client = await import('#/db/client')
  return client.db
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; current && typeof current === 'object' && depth < 3; depth += 1) {
    if ((current as { code?: unknown }).code === '23505') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

export type AkunTerhubung = { id: string; email: string; status: GoogleDriveAkunStatus }

export async function cariAkunBelumDiputus(
  email: string,
  { executor }: { executor?: AkunExecutor } = {},
): Promise<(AkunTerhubung & { rootFolderId: string | null }) | null> {
  const run = executor ?? await getDatabase()
  const [row] = await run
    .select({
      id: googleDriveAkun.id,
      email: googleDriveAkun.email,
      status: googleDriveAkun.status,
      rootFolderId: googleDriveAkun.rootFolderId,
    })
    .from(googleDriveAkun)
    .where(and(eq(googleDriveAkun.email, normalizeEmail(email)), ne(googleDriveAkun.status, 'DIPUTUS')))
    .limit(1)
  return row ?? null
}

/**
 * Simpan hasil hubungkan (SPEC 7.1 langkah 6 + 7.2). Email yang belum DIPUTUS
 * memakai baris yang sama; HUBUNGKAN_ULANG mempertahankan status dan wajib
 * email yang sama dengan akun target; HUBUNGKAN/GANTI menjadikan email itu
 * AKTIF dan akun AKTIF sebelumnya NONAKTIF. Job MENUNGGU akun target
 * dijadwalkan `now` supaya runner segera melanjutkannya.
 */
export async function simpanAkunTerhubung(input: {
  email: string
  refreshTokenEnc: string
  rootFolderId: string
  mode: MulaiHubungMode
  akunIdTarget: string | null
  actorUserId: string
  now: Date
  executor?: AkunExecutor
}): Promise<AkunTerhubung> {
  const run = input.executor ?? await getDatabase()
  const email = normalizeEmail(input.email)
  const { now, mode, actorUserId } = input
  const tersambung = {
    refreshTokenEnc: input.refreshTokenEnc,
    rootFolderId: input.rootFolderId,
    perluHubungUlangSejak: null,
    dihubungkanOleh: actorUserId,
    dihubungkanPada: now,
  }

  try {
    return await run.transaction(async (tx) => {
      const audit = (entityId: string, aksi: 'DRIVE_AKUN_DIHUBUNGKAN' | 'DRIVE_AKUN_DINONAKTIFKAN', auditEmail: string) =>
        tx.insert(auditLog).values({
          entityType: 'GOOGLE_DRIVE_AKUN', entityId, aksi, actorUserId, metadataSnapshot: { email: auditEmail, mode }, createdAt: now,
        })

      const [existing] = await tx
        .select({ id: googleDriveAkun.id, status: googleDriveAkun.status })
        .from(googleDriveAkun)
        .where(and(eq(googleDriveAkun.email, email), ne(googleDriveAkun.status, 'DIPUTUS')))
        .limit(1)

      let target: AkunTerhubung
      if (mode === 'HUBUNGKAN_ULANG') {
        if (!input.akunIdTarget) throw new AkunDriveError('AKUN_TIDAK_DITEMUKAN')
        const [akun] = await tx
          .select({ id: googleDriveAkun.id, email: googleDriveAkun.email, status: googleDriveAkun.status })
          .from(googleDriveAkun)
          .where(eq(googleDriveAkun.id, input.akunIdTarget))
        if (!akun) throw new AkunDriveError('AKUN_TIDAK_DITEMUKAN')
        if (akun.status === 'DIPUTUS') throw new AkunDriveError('AKUN_BERUBAH')
        if (akun.email !== email) throw new AkunDriveError('EMAIL_BERBEDA')

        const updated = await tx
          .update(googleDriveAkun)
          .set(tersambung)
          .where(and(eq(googleDriveAkun.id, akun.id), eq(googleDriveAkun.status, akun.status)))
          .returning({ id: googleDriveAkun.id })
        if (updated.length === 0) throw new AkunDriveError('AKUN_BERUBAH')
        target = akun
      } else if (existing?.status === 'AKTIF') {
        const updated = await tx
          .update(googleDriveAkun)
          .set(tersambung)
          .where(and(eq(googleDriveAkun.id, existing.id), eq(googleDriveAkun.status, 'AKTIF')))
          .returning({ id: googleDriveAkun.id })
        if (updated.length === 0) throw new AkunDriveError('AKUN_BERUBAH')
        target = { id: existing.id, email, status: 'AKTIF' }
      } else {
        // Nonaktifkan dulu, baru aktifkan target (partial unique satu AKTIF).
        const dinonaktifkan = await tx
          .update(googleDriveAkun)
          .set({ status: 'NONAKTIF', dinonaktifkanPada: now })
          .where(eq(googleDriveAkun.status, 'AKTIF'))
          .returning({ id: googleDriveAkun.id, email: googleDriveAkun.email })
        for (const akun of dinonaktifkan) await audit(akun.id, 'DRIVE_AKUN_DINONAKTIFKAN', akun.email)

        if (existing) {
          const updated = await tx
            .update(googleDriveAkun)
            .set({ ...tersambung, status: 'AKTIF', dinonaktifkanPada: null })
            .where(and(eq(googleDriveAkun.id, existing.id), eq(googleDriveAkun.status, 'NONAKTIF')))
            .returning({ id: googleDriveAkun.id })
          if (updated.length === 0) throw new AkunDriveError('AKUN_BERUBAH')
          target = { id: existing.id, email, status: 'AKTIF' }
        } else {
          const [inserted] = await tx
            .insert(googleDriveAkun)
            .values({ email, status: 'AKTIF', ...tersambung })
            .returning({ id: googleDriveAkun.id })
          target = { id: inserted.id, email, status: 'AKTIF' }
        }
      }

      await audit(target.id, 'DRIVE_AKUN_DIHUBUNGKAN', email)
      await tx
        .update(driveJob)
        .set({ jadwalBerikut: now })
        .where(and(eq(driveJob.akunId, target.id), eq(driveJob.status, 'MENUNGGU')))
      return target
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new AkunDriveError('AKUN_BERUBAH')
    throw error
  }
}

/** Isi `perlu_hubung_ulang_sejak` sekali; true bila baru ditandai. */
export async function tandaiPerluHubungUlang(
  akunId: string,
  now: Date,
  { executor }: { executor?: AkunExecutor } = {},
): Promise<boolean> {
  const run = executor ?? await getDatabase()
  const updated = await run
    .update(googleDriveAkun)
    .set({ perluHubungUlangSejak: now })
    .where(and(eq(googleDriveAkun.id, akunId), isNull(googleDriveAkun.perluHubungUlangSejak)))
    .returning({ id: googleDriveAkun.id })
  return updated.length > 0
}

/**
 * Putus permanen (SPEC 7.2). `revoke` (cabut token di Google) dipanggil best
 * effort di luar transaksi; galatnya hanya dicatat kategorinya. Job MENUNGGU
 * akun ini menjadi GAGAL AKUN_DIPUTUS (masuk daftar hapus manual), tautan
 * yang belum selesai diunggah menjadi GAGAL.
 */
export async function putuskanAkun({
  akunId,
  actorUserId,
  now,
  revoke,
  executor,
}: {
  akunId: string
  actorUserId: string
  now: Date
  revoke: (() => Promise<void>) | null
  executor?: AkunExecutor
}): Promise<{ id: string; email: string; jumlah_tautan_aktif: number }> {
  const run = executor ?? await getDatabase()
  const [akun] = await run
    .select({ id: googleDriveAkun.id, email: googleDriveAkun.email, status: googleDriveAkun.status })
    .from(googleDriveAkun)
    .where(eq(googleDriveAkun.id, akunId))
  if (!akun) throw new AkunDriveError('AKUN_TIDAK_DITEMUKAN')
  if (akun.status === 'DIPUTUS') throw new AkunDriveError('AKUN_SUDAH_DIPUTUS')

  if (revoke) {
    try {
      await revoke()
    } catch (error) {
      console.warn('[google-drive/akun] cabut token gagal', { kategori: classifyDriveError(error).kategori })
    }
  }

  return run.transaction(async (tx) => {
    const updated = await tx
      .update(googleDriveAkun)
      .set({ refreshTokenEnc: null, status: 'DIPUTUS', diputusOleh: actorUserId, diputusPada: now })
      .where(and(eq(googleDriveAkun.id, akunId), ne(googleDriveAkun.status, 'DIPUTUS')))
      .returning({ id: googleDriveAkun.id })
    if (updated.length === 0) throw new AkunDriveError('AKUN_SUDAH_DIPUTUS')

    const [{ jumlah }] = await tx
      .select({ jumlah: sql<number>`count(*)::int` })
      .from(laporanTautan)
      .where(and(
        eq(laporanTautan.driveAkunId, akunId),
        isNull(laporanTautan.revokedAt),
        inArray(laporanTautan.driveStatus, [...TAUTAN_DRIVE_AKTIF]),
      ))

    const kategori: DriveGalatKategori = 'AKUN_DIPUTUS'
    await tx
      .update(driveJob)
      .set({ status: 'GAGAL', galatKategori: kategori, galatPesan: DRIVE_PESAN_GALAT[kategori], selesaiPada: now, dikunciPada: null })
      .where(and(eq(driveJob.akunId, akunId), eq(driveJob.status, 'MENUNGGU')))

    await tx
      .update(laporanTautan)
      .set({ driveStatus: 'GAGAL' })
      .where(and(eq(laporanTautan.driveAkunId, akunId), inArray(laporanTautan.driveStatus, ['MENUNGGU', 'MENGUNGGAH'])))

    await tx.insert(auditLog).values({
      entityType: 'GOOGLE_DRIVE_AKUN',
      entityId: akunId,
      aksi: 'DRIVE_AKUN_DIPUTUS',
      actorUserId,
      metadataSnapshot: { email: akun.email, jumlah_tautan_aktif: jumlah },
      createdAt: now,
    })
    return { id: akunId, email: akun.email, jumlah_tautan_aktif: jumlah }
  })
}

export type AkunUntukJob = {
  id: string
  email: string
  status: GoogleDriveAkunStatus
  refreshTokenEnc: string | null
  rootFolderId: string | null
  perluHubungUlang: boolean
}

export async function muatAkunUntukJob(
  akunId: string,
  { executor }: { executor?: AkunExecutor } = {},
): Promise<AkunUntukJob | null> {
  const run = executor ?? await getDatabase()
  const [row] = await run
    .select({
      id: googleDriveAkun.id,
      email: googleDriveAkun.email,
      status: googleDriveAkun.status,
      refreshTokenEnc: googleDriveAkun.refreshTokenEnc,
      rootFolderId: googleDriveAkun.rootFolderId,
      perluHubungUlangSejak: googleDriveAkun.perluHubungUlangSejak,
    })
    .from(googleDriveAkun)
    .where(eq(googleDriveAkun.id, akunId))
  if (!row) return null
  const { perluHubungUlangSejak, ...rest } = row
  return { ...rest, perluHubungUlang: perluHubungUlangSejak !== null }
}

export async function perbaruiRootFolder(
  akunId: string,
  folderId: string,
  { executor }: { executor?: AkunExecutor } = {},
): Promise<void> {
  const run = executor ?? await getDatabase()
  await run.update(googleDriveAkun).set({ rootFolderId: folderId }).where(eq(googleDriveAkun.id, akunId))
}

export type AkunAktif = {
  id: string
  email: string
  refreshTokenEnc: string | null
  perluHubungUlangSejak: Date | null
}

export async function muatAkunAktif({ executor }: { executor?: AkunExecutor } = {}): Promise<AkunAktif | null> {
  const run = executor ?? await getDatabase()
  const [row] = await run
    .select({
      id: googleDriveAkun.id,
      email: googleDriveAkun.email,
      refreshTokenEnc: googleDriveAkun.refreshTokenEnc,
      perluHubungUlangSejak: googleDriveAkun.perluHubungUlangSejak,
    })
    .from(googleDriveAkun)
    .where(eq(googleDriveAkun.status, 'AKTIF'))
    .limit(1)
  return row ?? null
}

type RingkasanAkunRow = {
  id: string
  email: string
  status: GoogleDriveAkunStatus
  perlu_hubung_ulang: boolean
  jumlah_tautan_aktif: number
  jumlah_job_gagal: number
}

type PerluHapusRow = {
  job_id: string
  judul_tautan: string
  created_at: Date | string
  email_akun: string
  kategori: DriveGalatKategori | null
  jumlah_file: number | null
}

/**
 * Data bagian Google Drive di Pengaturan ADMIN. Daftar "perlu dihapus manual"
 * hanya memuat job HAPUS_* GAGAL yang masih relevan: satu entri per (tautan,
 * jenis) -- yang terbaru --, tidak sedang dicoba ulang, folder belum DIHAPUS
 * (HAPUS_TAUTAN) atau masih ada file MENGHAPUS (HAPUS_FILE). Tidak memuat nama
 * file atau dokumen.
 */
export async function muatRingkasanAdmin({ executor }: { executor?: AkunExecutor } = {}): Promise<{
  akun_aktif: GoogleDriveAkunSummary | null
  akun_lain: GoogleDriveAkunSummary[]
  perlu_hapus_manual: PerluHapusManualItem[]
}> {
  const run = executor ?? await getDatabase()
  const akunResult = await run.execute<RingkasanAkunRow>(sql`
    SELECT a.id, a.email, a.status,
           (a.perlu_hubung_ulang_sejak IS NOT NULL OR a.refresh_token_enc IS NULL) AS perlu_hubung_ulang,
           (SELECT count(*)::int FROM app.laporan_tautan t
             WHERE t.drive_akun_id = a.id AND t.revoked_at IS NULL
               AND t.drive_status IN ('MENUNGGU', 'MENGUNGGAH', 'SIAP', 'GAGAL')) AS jumlah_tautan_aktif,
           (SELECT count(*)::int FROM app.drive_job j
             WHERE j.akun_id = a.id AND j.status = 'GAGAL') AS jumlah_job_gagal
      FROM app.google_drive_akun a
     WHERE a.status <> 'DIPUTUS'
     ORDER BY a.dihubungkan_pada DESC, a.email
  `)

  const hapusResult = await run.execute<PerluHapusRow>(sql`
    SELECT job_id, judul_tautan, created_at, email_akun, kategori, jumlah_file FROM (
      SELECT DISTINCT ON (j.tautan_id, j.jenis)
             j.id AS job_id, j.jenis, t.judul AS judul_tautan, t.created_at, a.email AS email_akun,
             j.galat_kategori AS kategori, j.selesai_pada, t.drive_status,
             CASE WHEN j.jenis = 'HAPUS_FILE' THEN (
               SELECT count(*)::int FROM app.laporan_tautan_drive_file f
                WHERE f.tautan_id = j.tautan_id AND f.status = 'MENGHAPUS'
             ) END AS jumlah_file
        FROM app.drive_job j
        JOIN app.laporan_tautan t ON t.id = j.tautan_id
        JOIN app.google_drive_akun a ON a.id = j.akun_id
       WHERE j.jenis IN ('HAPUS_TAUTAN', 'HAPUS_FILE') AND j.status = 'GAGAL'
         AND NOT EXISTS (
           SELECT 1 FROM app.drive_job s
            WHERE s.tautan_id = j.tautan_id AND s.jenis = j.jenis AND s.status IN ('MENUNGGU', 'PROSES')
         )
       ORDER BY j.tautan_id, j.jenis, j.selesai_pada DESC NULLS LAST, j.dibuat_pada DESC
    ) terbaru
     WHERE (jenis = 'HAPUS_TAUTAN' AND drive_status IS DISTINCT FROM 'DIHAPUS')
        OR (jenis = 'HAPUS_FILE' AND jumlah_file > 0)
     ORDER BY selesai_pada DESC NULLS LAST, job_id
  `)

  const summaries: GoogleDriveAkunSummary[] = akunResult.rows.map((row) => ({
    id: row.id,
    email: row.email,
    status: row.status,
    perlu_hubung_ulang: row.perlu_hubung_ulang,
    jumlah_tautan_aktif: Number(row.jumlah_tautan_aktif),
    jumlah_job_gagal: Number(row.jumlah_job_gagal),
  }))

  return {
    akun_aktif: summaries.find((akun) => akun.status === 'AKTIF') ?? null,
    akun_lain: summaries.filter((akun) => akun.status !== 'AKTIF'),
    perlu_hapus_manual: hapusResult.rows.map((row) => ({
      job_id: row.job_id,
      judul_tautan: row.judul_tautan,
      nama_folder: buildDriveFolderName(row.judul_tautan, row.created_at instanceof Date ? row.created_at : new Date(row.created_at)),
      email_akun: row.email_akun,
      kategori: row.kategori,
      jumlah_file: row.jumlah_file === null ? null : Number(row.jumlah_file),
    })),
  }
}
