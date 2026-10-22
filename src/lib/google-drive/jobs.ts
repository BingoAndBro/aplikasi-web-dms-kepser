// Server-only module. Do not import from client components.
//
// Antrean kerja Google Drive (app.drive_job). Enqueue berjalan di transaksi
// pemanggil supaya job lahir bersama perubahan pemicunya; klaim memakai
// `FOR UPDATE OF j SKIP LOCKED` sehingga dua runner tidak pernah memproses job
// yang sama. Setiap perubahan status bersyarat pada status lama (PROSES).
// Waktu selalu dikirim sebagai parameter (bukan now() SQL) agar tes
// deterministik. `db` dimuat malas seperti pembersihan-service.ts sehingga
// fungsi murni bisa dites tanpa DATABASE_URL.
import { and, eq, gte, sql } from 'drizzle-orm'
import type { db as Database } from '#/db/client'
import {
  driveJob,
  type DriveGalatKategori,
  type DriveJob,
  type DriveJobJenis,
  type DriveJobStatus,
} from '#/db/schema/app/drive-job'
import { googleDriveAkun } from '#/db/schema/app/google-drive-akun'

export type { DriveJob }

/** Executor Drizzle: `db`, transaksi Drizzle, atau `drizzle(poolClient)`. */
export type DriveJobExecutor = Pick<typeof Database, 'select' | 'insert' | 'update' | 'execute'>

export const DRIVE_JOB_PRIORITAS: Record<DriveJobJenis, number> = {
  HAPUS_TAUTAN: 0,
  HAPUS_FILE: 0,
  SINKRON_TAUTAN: 10,
}

const MENIT = 60_000
const JAM = 60 * MENIT

/** Jeda sebelum percobaan ulang ke-1..8 untuk galat SEMENTARA (SPEC 11.2). */
export const DRIVE_JOB_JEDA_MS = [MENIT, 5 * MENIT, 15 * MENIT, JAM, 3 * JAM, 6 * JAM, 12 * JAM, 24 * JAM] as const
/** 8 percobaan ulang setelah percobaan pertama (D11); kegagalan berikutnya GAGAL. */
export const DRIVE_JOB_MAKS_PERCOBAAN_ULANG = 8
/** Job PROSES yang dikunci lebih lama dari ini dianggap ditinggal runner yang mati. */
export const DRIVE_JOB_KUNCI_MACET_MS = 15 * MENIT
/** Penundaan job hapus saat sinkron tautan yang sama masih berjalan (D13). */
export const DRIVE_JOB_TUNDA_SINKRON_MS = 30_000
export const DRIVE_JOB_PESAN_MAKS = 200

export type RetrySchedule =
  | { status: 'MENUNGGU'; percobaan: number; jadwalBerikut: Date }
  | { status: 'GAGAL'; percobaan: number }

export function computeRetrySchedule({ percobaan, now }: { percobaan: number; now: Date }): RetrySchedule {
  const ke = percobaan + 1
  if (ke > DRIVE_JOB_MAKS_PERCOBAAN_ULANG) return { status: 'GAGAL', percobaan: ke }
  return { status: 'MENUNGGU', percobaan: ke, jadwalBerikut: new Date(now.getTime() + DRIVE_JOB_JEDA_MS[ke - 1]) }
}

export function truncateGalatPesan(pesan: string): string {
  return Array.from(pesan).slice(0, DRIVE_JOB_PESAN_MAKS).join('')
}

async function getDatabase(): Promise<DriveJobExecutor> {
  const client = await import('#/db/client')
  return client.db
}

type DriveJobSqlRow = {
  id: string
  jenis: DriveJobJenis
  akun_id: string
  tautan_id: string
  prioritas: number
  status: DriveJobStatus
  percobaan: number
  jadwal_berikut: Date
  dikunci_pada: Date | null
  galat_kategori: DriveGalatKategori | null
  galat_pesan: string | null
  dibuat_pada: Date
  selesai_pada: Date | null
}

function toDate(value: Date | string): Date
function toDate(value: Date | string | null): Date | null
function toDate(value: Date | string | null): Date | null {
  if (value === null) return null
  return value instanceof Date ? value : new Date(value)
}

function fromSqlRow(row: DriveJobSqlRow): DriveJob {
  return {
    id: row.id,
    jenis: row.jenis,
    akunId: row.akun_id,
    tautanId: row.tautan_id,
    prioritas: row.prioritas,
    status: row.status,
    percobaan: row.percobaan,
    jadwalBerikut: toDate(row.jadwal_berikut),
    dikunciPada: toDate(row.dikunci_pada),
    galatKategori: row.galat_kategori,
    galatPesan: row.galat_pesan,
    dibuatPada: toDate(row.dibuat_pada),
    selesaiPada: toDate(row.selesai_pada),
  }
}

/**
 * Tambah job MENUNGGU di transaksi pemanggil. Bila (tautan, jenis) sudah punya
 * job MENUNGGU, tidak ada baris baru: jadwalnya dimajukan ke yang lebih awal (D12).
 */
export async function enqueueDriveJob(
  tx: DriveJobExecutor,
  input: { jenis: DriveJobJenis; akunId: string; tautanId: string; now: Date },
): Promise<string> {
  const [row] = await tx
    .insert(driveJob)
    .values({
      jenis: input.jenis,
      akunId: input.akunId,
      tautanId: input.tautanId,
      prioritas: DRIVE_JOB_PRIORITAS[input.jenis],
      status: 'MENUNGGU',
      jadwalBerikut: input.now,
      dibuatPada: input.now,
    })
    .onConflictDoUpdate({
      target: [driveJob.tautanId, driveJob.jenis],
      targetWhere: sql`status = 'MENUNGGU'`,
      set: { jadwalBerikut: sql`LEAST(${driveJob.jadwalBerikut}, excluded.jadwal_berikut)` },
    })
    .returning({ id: driveJob.id })
  return row.id
}

/**
 * Klaim satu job: MENUNGGU yang jadwalnya tiba, atau PROSES yang macet. Job
 * akun yang perlu dihubungkan ulang dilewati (dijeda); job akun DIPUTUS tetap
 * diklaim agar handler menandainya GAGAL AKUN_DIPUTUS.
 */
export async function claimNextDriveJob(
  { now, executor }: { now: Date; executor?: DriveJobExecutor },
): Promise<DriveJob | null> {
  const run = executor ?? await getDatabase()
  const macetSebelum = new Date(now.getTime() - DRIVE_JOB_KUNCI_MACET_MS)
  const result = await run.execute<DriveJobSqlRow>(sql`
    UPDATE app.drive_job
       SET status = 'PROSES', dikunci_pada = ${now}::timestamptz
     WHERE id = (
       SELECT j.id
         FROM app.drive_job j
         JOIN app.google_drive_akun a ON a.id = j.akun_id
        WHERE ((j.status = 'MENUNGGU' AND j.jadwal_berikut <= ${now}::timestamptz)
            OR (j.status = 'PROSES' AND j.dikunci_pada < ${macetSebelum}::timestamptz))
          AND a.perlu_hubung_ulang_sejak IS NULL
        ORDER BY j.prioritas, j.jadwal_berikut
        FOR UPDATE OF j SKIP LOCKED
        LIMIT 1
     )
    RETURNING *
  `)
  const row = result.rows[0]
  return row ? fromSqlRow(row) : null
}

/** PROSES -> SELESAI | DIBATALKAN. false bila job sudah tidak PROSES. */
export async function completeDriveJob(
  id: string,
  { status, now, executor }: { status: 'SELESAI' | 'DIBATALKAN'; now: Date; executor?: DriveJobExecutor },
): Promise<boolean> {
  const run = executor ?? await getDatabase()
  const updated = await run
    .update(driveJob)
    .set({ status, selesaiPada: now, dikunciPada: null })
    .where(and(eq(driveJob.id, id), eq(driveJob.status, 'PROSES')))
    .returning({ id: driveJob.id })
  return updated.length > 0
}

/**
 * Kembalikan job PROSES ke MENUNGGU. Bila sementara itu sudah ada job MENUNGGU
 * kembar untuk (tautan, jenis) yang sama -- enqueue baru saat job ini berjalan --
 * job ini DIBATALKAN karena kerjanya sudah tercakup job kembar itu; tanpa ini
 * partial unique `drive_job_satu_menunggu` akan menolak perubahan status.
 */
async function requeue(
  run: DriveJobExecutor,
  id: string,
  values: {
    percobaanLama?: number
    percobaan?: number
    jadwalBerikut: Date
    now: Date
    galat?: { kategori: DriveGalatKategori; pesan: string }
  },
): Promise<boolean> {
  const adaKembar = sql`EXISTS (
    SELECT 1 FROM app.drive_job s
     WHERE s.tautan_id = ${driveJob.tautanId}
       AND s.jenis = ${driveJob.jenis}
       AND s.status = 'MENUNGGU'
       AND s.id <> ${driveJob.id}
  )`
  const updated = await run
    .update(driveJob)
    .set({
      status: sql`CASE WHEN ${adaKembar} THEN 'DIBATALKAN' ELSE 'MENUNGGU' END`,
      selesaiPada: sql`CASE WHEN ${adaKembar} THEN ${values.now}::timestamptz ELSE NULL END`,
      jadwalBerikut: values.jadwalBerikut,
      dikunciPada: null,
      ...(values.percobaan === undefined ? {} : { percobaan: values.percobaan }),
      ...(values.galat
        ? { galatKategori: values.galat.kategori, galatPesan: truncateGalatPesan(values.galat.pesan) }
        : {}),
    })
    .where(and(
      eq(driveJob.id, id),
      eq(driveJob.status, 'PROSES'),
      ...(values.percobaanLama === undefined ? [] : [eq(driveJob.percobaan, values.percobaanLama)]),
    ))
    .returning({ id: driveJob.id })
  return updated.length > 0
}

/**
 * Catat kegagalan job PROSES. SEMENTARA -> dijadwalkan ulang dengan jeda (atau
 * GAGAL setelah 8 percobaan ulang); TOKEN_TIDAK_VALID -> MENUNGGU segera tanpa
 * menambah percobaan (dijeda lewat filter akun di klaim); kategori lain -> GAGAL.
 * Mengembalikan nasib kerja itu ('MENUNGGU' bila masih akan dicoba, 'GAGAL'),
 * atau null bila job sudah tidak PROSES.
 */
export async function failDriveJob(
  id: string,
  { kategori, pesan, now, executor }: { kategori: DriveGalatKategori; pesan: string; now: Date; executor?: DriveJobExecutor },
): Promise<'MENUNGGU' | 'GAGAL' | null> {
  const run = executor ?? await getDatabase()
  const galat = { kategori, pesan }

  if (kategori === 'TOKEN_TIDAK_VALID') {
    return (await requeue(run, id, { jadwalBerikut: now, now, galat })) ? 'MENUNGGU' : null
  }

  if (kategori === 'SEMENTARA') {
    const [current] = await run
      .select({ percobaan: driveJob.percobaan })
      .from(driveJob)
      .where(and(eq(driveJob.id, id), eq(driveJob.status, 'PROSES')))
    if (!current) return null

    const schedule = computeRetrySchedule({ percobaan: current.percobaan, now })
    if (schedule.status === 'MENUNGGU') {
      const ok = await requeue(run, id, {
        percobaanLama: current.percobaan,
        percobaan: schedule.percobaan,
        jadwalBerikut: schedule.jadwalBerikut,
        now,
        galat,
      })
      return ok ? 'MENUNGGU' : null
    }
    return (await markGagal(run, id, { now, galat, percobaanLama: current.percobaan, percobaan: schedule.percobaan }))
      ? 'GAGAL'
      : null
  }

  return (await markGagal(run, id, { now, galat })) ? 'GAGAL' : null
}

async function markGagal(
  run: DriveJobExecutor,
  id: string,
  values: { now: Date; galat: { kategori: DriveGalatKategori; pesan: string }; percobaanLama?: number; percobaan?: number },
): Promise<boolean> {
  const updated = await run
    .update(driveJob)
    .set({
      status: 'GAGAL',
      selesaiPada: values.now,
      dikunciPada: null,
      galatKategori: values.galat.kategori,
      galatPesan: truncateGalatPesan(values.galat.pesan),
      ...(values.percobaan === undefined ? {} : { percobaan: values.percobaan }),
    })
    .where(and(
      eq(driveJob.id, id),
      eq(driveJob.status, 'PROSES'),
      ...(values.percobaanLama === undefined ? [] : [eq(driveJob.percobaan, values.percobaanLama)]),
    ))
    .returning({ id: driveJob.id })
  return updated.length > 0
}

/** PROSES -> MENUNGGU pada now + ms tanpa menambah percobaan (mis. D13). false bila tidak PROSES. */
export async function deferDriveJob(
  id: string,
  { now, ms, executor }: { now: Date; ms: number; executor?: DriveJobExecutor },
): Promise<boolean> {
  const run = executor ?? await getDatabase()
  return requeue(run, id, { jadwalBerikut: new Date(now.getTime() + ms), now })
}

/**
 * Kapan runner perlu bangun berikutnya: jadwal job MENUNGGU terdekat, atau saat
 * job PROSES terdekat menjadi macet (supaya job yang ditinggal runner mati
 * diklaim ulang tanpa pemicu lain). Akun yang perlu dihubungkan ulang
 * diabaikan. null bila tidak ada yang perlu ditunggu.
 */
export async function nextScheduledAt({ executor }: { executor?: DriveJobExecutor } = {}): Promise<Date | null> {
  const run = executor ?? await getDatabase()
  const macetMs = DRIVE_JOB_KUNCI_MACET_MS
  const [row] = await run
    .select({
      berikut: sql<Date | string | null>`min(CASE
        WHEN ${driveJob.status} = 'MENUNGGU' THEN ${driveJob.jadwalBerikut}
        ELSE ${driveJob.dikunciPada} + make_interval(secs => ${macetMs / 1000})
      END)`,
    })
    .from(driveJob)
    .innerJoin(googleDriveAkun, eq(googleDriveAkun.id, driveJob.akunId))
    .where(and(
      sql`${driveJob.status} IN ('MENUNGGU', 'PROSES')`,
      sql`${googleDriveAkun.perluHubungUlangSejak} IS NULL`,
    ))
  return row?.berikut ? toDate(row.berikut) : null
}

/** Job SINKRON_TAUTAN tautan ini yang sedang PROSES dan belum macet (D13), atau null. */
export async function findActiveSinkronJob(
  tautanId: string,
  { now, executor }: { now: Date; executor?: DriveJobExecutor },
): Promise<DriveJob | null> {
  const run = executor ?? await getDatabase()
  const [row] = await run
    .select()
    .from(driveJob)
    .where(and(
      eq(driveJob.tautanId, tautanId),
      eq(driveJob.jenis, 'SINKRON_TAUTAN'),
      eq(driveJob.status, 'PROSES'),
      gte(driveJob.dikunciPada, new Date(now.getTime() - DRIVE_JOB_KUNCI_MACET_MS)),
    ))
    .limit(1)
  return row ?? null
}

/**
 * "Coba lagi penghapusan" ADMIN: job HAPUS_* GAGAL -> MENUNGGU dengan
 * percobaan 0, jadwal `now`, galat dikosongkan. Dilewati: kategori
 * AKUN_DIPUTUS dan akun yang sudah DIPUTUS (tidak bisa diproses lagi),
 * pasangan (tautan, jenis) yang sudah punya job MENUNGGU/PROSES (partial
 * unique `drive_job_satu_menunggu`), dan job yang sudah tidak relevan (folder
 * sudah DIHAPUS / tidak ada file MENGHAPUS). Untuk GAGAL kembar hanya yang
 * terbaru direset -- aturan yang sama dengan daftar "perlu dihapus manual"
 * di akun-repository.ts. Mengembalikan jumlah job yang direset.
 */
export async function resetFailedDeletionJobs(
  { now, executor }: { now: Date; executor?: DriveJobExecutor },
): Promise<number> {
  const run = executor ?? await getDatabase()
  const result = await run.execute<{ id: string }>(sql`
    UPDATE app.drive_job j
       SET status = 'MENUNGGU', percobaan = 0, jadwal_berikut = ${now}::timestamptz,
           galat_kategori = NULL, galat_pesan = NULL, selesai_pada = NULL, dikunci_pada = NULL
     WHERE j.status = 'GAGAL'
       AND j.id IN (
         SELECT DISTINCT ON (g.tautan_id, g.jenis) g.id
           FROM app.drive_job g
           JOIN app.google_drive_akun a ON a.id = g.akun_id
           JOIN app.laporan_tautan t ON t.id = g.tautan_id
          WHERE g.jenis IN ('HAPUS_TAUTAN', 'HAPUS_FILE')
            AND g.status = 'GAGAL'
            AND g.galat_kategori IS DISTINCT FROM 'AKUN_DIPUTUS'
            AND a.status <> 'DIPUTUS'
            AND NOT EXISTS (
              SELECT 1 FROM app.drive_job s
               WHERE s.tautan_id = g.tautan_id AND s.jenis = g.jenis AND s.status IN ('MENUNGGU', 'PROSES')
            )
            AND ((g.jenis = 'HAPUS_TAUTAN' AND t.drive_status IS DISTINCT FROM 'DIHAPUS')
              OR (g.jenis = 'HAPUS_FILE' AND EXISTS (
                SELECT 1 FROM app.laporan_tautan_drive_file f
                 WHERE f.tautan_id = g.tautan_id AND f.status = 'MENGHAPUS'
              )))
          ORDER BY g.tautan_id, g.jenis, g.selesai_pada DESC NULLS LAST, g.dibuat_pada DESC
       )
    RETURNING j.id
  `)
  return result.rows.length
}
