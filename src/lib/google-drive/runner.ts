// Server-only module. Do not import from client components.
//
// Runner antrean Google Drive di dalam proses server (K7, SPEC 8.3). Satu
// loop aktif per proses (single-flight): pemicu saat loop berjalan hanya
// menandai "jalankan lagi". Setiap putaran dibatasi anggaran waktu (D10);
// setelah antrean kosong runner tidur sampai jadwal job terdekat (maks 1 jam).
// Galat handler tidak pernah menghentikan loop dan tidak pernah dilempar ke
// pemicu; log hanya berisi jenis job + kategori galat.
import type { DriveGalatKategori, DriveJobJenis } from '#/db/schema/app/drive-job'
import {
  muatAkunUntukJob,
  perbaruiRootFolder,
  tandaiPerluHubungUlang,
  type AkunUntukJob,
} from '#/lib/google-drive/akun-repository'
import { isDriveConfigured, readDriveConfig } from '#/lib/google-drive/config'
import { createGoogleDriveClient, type DriveClient } from '#/lib/google-drive/drive-client'
import { DriveApiError } from '#/lib/google-drive/drive-errors'
import { bukaFileUntukUnggah } from '#/lib/google-drive/file-source'
import { createHapusFileHandler, createHapusTautanHandler, type HapusDriveDeps } from '#/lib/google-drive/hapus'
import {
  claimNextDriveJob,
  completeDriveJob,
  deferDriveJob,
  failDriveJob,
  findActiveSinkronJob,
  nextScheduledAt,
  type DriveJob,
} from '#/lib/google-drive/jobs'
import { createSinkronTautanHandler } from '#/lib/google-drive/sinkron-tautan'
import { createTautanDriveRepository } from '#/lib/google-drive/tautan-drive-repository'
import { decryptRefreshToken } from '#/lib/google-drive/token-crypto'

export const DRIVE_RUNNER_ANGGARAN_MS = 5 * 60_000
export const DRIVE_RUNNER_TIMER_MAKS_MS = 60 * 60_000
export const DRIVE_RUNNER_PESAN_UMUM = 'Gagal memproses salinan Google Drive'
export const DRIVE_RUNNER_PESAN_TANPA_HANDLER = 'Pemroses belum tersedia'

/**
 * DITUNDA: handler sudah mengembalikan job ke antrean sendiri (deferDriveJob,
 * D13) -- runner tidak menandainya selesai dan tidak menghitungnya gagal.
 */
export type DriveJobHandler = (input: { job: DriveJob; now: () => Date }) => Promise<{ hasil: 'SELESAI' | 'DIBATALKAN' | 'DITUNDA' }>

export type DriveRunnerDeps = {
  isConfigured: () => boolean
  jobs: {
    claim(input: { now: Date }): Promise<DriveJob | null>
    complete(id: string, input: { status: 'SELESAI' | 'DIBATALKAN'; now: Date }): Promise<boolean>
    fail(id: string, input: { kategori: DriveGalatKategori; pesan: string; now: Date }): Promise<'MENUNGGU' | 'GAGAL' | null>
    nextScheduledAt(): Promise<Date | null>
  }
  /** Handler per jenis; jenis tanpa handler -> PERMANEN "Pemroses belum tersedia". */
  handlers: Partial<Record<DriveJobJenis, DriveJobHandler>>
  tandaiPerluHubungUlang(akunId: string, now: Date): Promise<unknown>
  /** drive_status tautan -> GAGAL (bersyarat belum dicabut). */
  tandaiTautanGagal(tautanId: string): Promise<unknown>
}

export type DriveRunnerRingkasan = {
  diproses: number
  selesai: number
  dibatalkan: number
  gagal: number
  /** Job yang dikembalikan ke antrean (masih akan dicoba). */
  dijeda: number
  anggaranHabis: boolean
}

/** DriveClient dari refresh token akun; galat dekripsi -> TOKEN_TIDAK_VALID. */
export async function defaultDriveClientFor(akun: AkunUntukJob): Promise<DriveClient> {
  const config = readDriveConfig()
  if (!config.ok) throw new DriveApiError('PERMANEN')
  if (!akun.refreshTokenEnc) throw new DriveApiError('AKUN_DIPUTUS')
  let refreshToken: string
  try {
    refreshToken = decryptRefreshToken(akun.refreshTokenEnc, config.config.tokenKey)
  } catch {
    throw new DriveApiError('TOKEN_TIDAK_VALID')
  }
  return createGoogleDriveClient({ refreshToken, config: config.config })
}

export function createDefaultDriveRunnerDeps(): DriveRunnerDeps {
  const repo = createTautanDriveRepository()
  const hapusDeps: HapusDriveDeps = {
    repo,
    akun: { muatAkunUntukJob: (akunId) => muatAkunUntukJob(akunId) },
    driveClientFor: defaultDriveClientFor,
    jobs: {
      findActiveSinkron: (tautanId, now) => findActiveSinkronJob(tautanId, { now }),
      defer: (id, input) => deferDriveJob(id, input),
    },
  }
  return {
    isConfigured: () => isDriveConfigured(),
    jobs: {
      claim: ({ now }) => claimNextDriveJob({ now }),
      complete: (id, input) => completeDriveJob(id, input),
      fail: (id, input) => failDriveJob(id, input),
      nextScheduledAt: () => nextScheduledAt(),
    },
    handlers: {
      SINKRON_TAUTAN: createSinkronTautanHandler({
        repo,
        akun: {
          muatAkunUntukJob: (akunId) => muatAkunUntukJob(akunId),
          perbaruiRootFolder: (akunId, folderId) => perbaruiRootFolder(akunId, folderId),
        },
        driveClientFor: defaultDriveClientFor,
        bukaFile: (baris) => bukaFileUntukUnggah(baris),
      }),
      HAPUS_TAUTAN: createHapusTautanHandler(hapusDeps),
      HAPUS_FILE: createHapusFileHandler(hapusDeps),
    },
    tandaiPerluHubungUlang: (akunId, now) => tandaiPerluHubungUlang(akunId, now),
    tandaiTautanGagal: (tautanId) => repo.tandaiGagal(tautanId),
  }
}

/**
 * Satu putaran: klaim dan proses job sampai antrean kosong atau anggaran
 * waktu habis. Galat handler dicatat lewat failDriveJob; nasib 'MENUNGGU'
 * berarti kerja itu masih akan dicoba (termasuk job yang dibatalkan karena
 * sudah ada job MENUNGGU kembar), jadi tautan tidak ditandai GAGAL.
 */
export async function runDriveRunnerOnce({
  now = () => new Date(),
  deps = createDefaultDriveRunnerDeps(),
  anggaranMs = DRIVE_RUNNER_ANGGARAN_MS,
}: {
  now?: () => Date
  deps?: DriveRunnerDeps
  anggaranMs?: number
} = {}): Promise<DriveRunnerRingkasan> {
  const ringkasan: DriveRunnerRingkasan = { diproses: 0, selesai: 0, dibatalkan: 0, gagal: 0, dijeda: 0, anggaranHabis: false }
  if (!deps.isConfigured()) return ringkasan

  const mulai = now().getTime()
  for (;;) {
    if (now().getTime() - mulai >= anggaranMs) {
      ringkasan.anggaranHabis = true
      break
    }
    const job = await deps.jobs.claim({ now: now() })
    if (!job) break
    ringkasan.diproses += 1

    try {
      const handler = deps.handlers[job.jenis]
      if (!handler) throw new DriveApiError('PERMANEN', DRIVE_RUNNER_PESAN_TANPA_HANDLER)
      const { hasil } = await handler({ job, now })
      if (hasil === 'DITUNDA') {
        ringkasan.dijeda += 1
        continue
      }
      await deps.jobs.complete(job.id, { status: hasil, now: now() })
      if (hasil === 'SELESAI') ringkasan.selesai += 1
      else ringkasan.dibatalkan += 1
    } catch (error) {
      const galat = error instanceof DriveApiError ? error : new DriveApiError('PERMANEN', DRIVE_RUNNER_PESAN_UMUM)
      console.error('[google-drive/runner] job gagal', { jenis: job.jenis, kategori: galat.kategori })

      const nasib = await deps.jobs.fail(job.id, { kategori: galat.kategori, pesan: galat.pesan, now: now() })
      if (galat.kategori === 'TOKEN_TIDAK_VALID') await deps.tandaiPerluHubungUlang(job.akunId, now())
      if (nasib === 'MENUNGGU') ringkasan.dijeda += 1
      if (nasib === 'GAGAL') {
        ringkasan.gagal += 1
        if (job.jenis === 'SINKRON_TAUTAN') await deps.tandaiTautanGagal(job.tautanId)
      }
    }
  }
  return ringkasan
}

type RunnerState = {
  deps: DriveRunnerDeps | null
  berjalan: boolean
  ulangi: boolean
  timer: ReturnType<typeof setTimeout> | null
}

const state: RunnerState = { deps: null, berjalan: false, ulangi: false, timer: null }

function getDeps(): DriveRunnerDeps {
  state.deps ??= createDefaultDriveRunnerDeps()
  return state.deps
}

function hentikanTimer(): void {
  if (state.timer) clearTimeout(state.timer)
  state.timer = null
}

function jadwalkanTimer(berikut: Date): void {
  hentikanTimer()
  const delay = Math.min(Math.max(berikut.getTime() - Date.now(), 0), DRIVE_RUNNER_TIMER_MAKS_MS)
  const timer = setTimeout(() => {
    state.timer = null
    triggerDriveRunner()
  }, delay)
  // Timer runner tidak boleh menahan proses tetap hidup (skrip, tes).
  timer.unref?.()
  state.timer = timer
}

async function putaran(): Promise<void> {
  const deps = getDeps()
  let segera = false
  try {
    state.ulangi = false
    segera = (await runDriveRunnerOnce({ deps })).anggaranHabis
    if (!segera && !state.ulangi && deps.isConfigured()) {
      const berikut = await deps.jobs.nextScheduledAt()
      if (berikut) jadwalkanTimer(berikut)
    }
  } catch {
    console.error('[google-drive/runner] putaran gagal', { kategori: 'TAK_TERDUGA' })
  } finally {
    state.berjalan = false
  }
  if (segera || state.ulangi) setImmediate(triggerDriveRunner)
}

/** Pemicu tanpa menunggu: tautan dibuat/dicabut/coba lagi, hubungkan akun, timer. Tidak pernah melempar. */
export function triggerDriveRunner(): void {
  if (state.berjalan) {
    state.ulangi = true
    return
  }
  state.berjalan = true
  hentikanTimer()
  void putaran()
}

/** Untuk tes: hentikan timer, kosongkan status, dan pasang deps tiruan (null = bawaan). */
export function resetDriveRunnerForTest(deps: DriveRunnerDeps | null = null): void {
  hentikanTimer()
  state.deps = deps
  state.berjalan = false
  state.ulangi = false
}
