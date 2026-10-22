import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DriveGalatKategori, DriveJobJenis } from '#/db/schema/app/drive-job'
import { DriveApiError } from '#/lib/google-drive/drive-errors'
import type { DriveJob } from '#/lib/google-drive/jobs'
import {
  DRIVE_RUNNER_ANGGARAN_MS,
  DRIVE_RUNNER_TIMER_MAKS_MS,
  resetDriveRunnerForTest,
  runDriveRunnerOnce,
  triggerDriveRunner,
  type DriveJobHandler,
  type DriveRunnerDeps,
} from '#/lib/google-drive/runner'
import { createSinkronTautanHandler } from '#/lib/google-drive/sinkron-tautan'

import { FakeDrive } from './helpers/fake-drive'
import { AKUN_ID, MemoryAkun, MemoryTautanRepo, TAUTAN_ID } from './helpers/memory-tautan-repo'

const NOW = new Date('2026-10-22T03:00:00.000Z')
const MENIT = 60_000

type Nasib = 'MENUNGGU' | 'GAGAL' | null

/** Antrean in-memory: urutan klaim = urutan tambah; nasib galat bisa diatur per tes. */
class FakeJobs {
  readonly jobs: DriveJob[] = []
  readonly completed: Array<{ id: string; status: string }> = []
  readonly failed: Array<{ id: string; kategori: DriveGalatKategori; pesan: string }> = []
  next: Date | null = null
  nasib: (kategori: DriveGalatKategori) => Nasib = (k) => (k === 'SEMENTARA' || k === 'TOKEN_TIDAK_VALID' ? 'MENUNGGU' : 'GAGAL')
  claimCalls = 0

  add(jenis: DriveJobJenis = 'SINKRON_TAUTAN', overrides: Partial<DriveJob> = {}): DriveJob {
    const job: DriveJob = {
      id: `job-${this.jobs.length + 1}`, jenis, akunId: AKUN_ID, tautanId: TAUTAN_ID, prioritas: 10, status: 'MENUNGGU',
      percobaan: 0, jadwalBerikut: NOW, dikunciPada: null, galatKategori: null, galatPesan: null, dibuatPada: NOW, selesaiPada: null,
      ...overrides,
    }
    this.jobs.push(job)
    return job
  }

  deps(): DriveRunnerDeps['jobs'] {
    return {
      claim: async () => {
        this.claimCalls += 1
        const job = this.jobs.find((j) => j.status === 'MENUNGGU')
        if (!job) return null
        job.status = 'PROSES'
        return { ...job }
      },
      complete: async (id, { status }) => {
        this.completed.push({ id, status })
        const job = this.jobs.find((j) => j.id === id)!
        job.status = status
        return true
      },
      fail: async (id, { kategori, pesan }) => {
        this.failed.push({ id, kategori, pesan })
        const nasib = this.nasib(kategori)
        const job = this.jobs.find((j) => j.id === id)!
        // MENUNGGU di sini = dijadwalkan ulang ke masa depan (tidak diklaim lagi di putaran ini).
        job.status = nasib === 'GAGAL' ? 'GAGAL' : 'DIBATALKAN'
        return nasib
      },
      nextScheduledAt: async () => this.next,
    }
  }
}

let jobs: FakeJobs
let tautanGagal: string[]
let perluHubungUlang: string[]

function deps(handlers: DriveRunnerDeps['handlers'], overrides: Partial<DriveRunnerDeps> = {}): DriveRunnerDeps {
  return {
    isConfigured: () => true,
    jobs: jobs.deps(),
    handlers,
    tandaiPerluHubungUlang: async (akunId) => { perluHubungUlang.push(akunId) },
    tandaiTautanGagal: async (tautanId) => { tautanGagal.push(tautanId) },
    ...overrides,
  }
}

const ok: DriveJobHandler = async () => ({ hasil: 'SELESAI' })
const throws = (error: unknown): DriveJobHandler => async () => { throw error }

beforeEach(() => {
  jobs = new FakeJobs()
  tautanGagal = []
  perluHubungUlang = []
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  resetDriveRunnerForTest()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('runDriveRunnerOnce', () => {
  it('no-op bila env tidak lengkap (tidak mengklaim apa pun)', async () => {
    jobs.add()
    const ringkasan = await runDriveRunnerOnce({ deps: deps({ SINKRON_TAUTAN: ok }, { isConfigured: () => false }) })
    expect(ringkasan).toEqual({ diproses: 0, selesai: 0, dibatalkan: 0, gagal: 0, dijeda: 0, anggaranHabis: false })
    expect(jobs.claimCalls).toBe(0)
  })

  it('dispatch per jenis: SELESAI dan DIBATALKAN dicatat lewat complete', async () => {
    jobs.add()
    jobs.add('SINKRON_TAUTAN', { tautanId: 'lain' })
    let ke = 0
    const handler: DriveJobHandler = async () => ({ hasil: ke++ === 0 ? 'SELESAI' : 'DIBATALKAN' })
    const ringkasan = await runDriveRunnerOnce({ now: () => NOW, deps: deps({ SINKRON_TAUTAN: handler }) })
    expect(jobs.completed).toEqual([{ id: 'job-1', status: 'SELESAI' }, { id: 'job-2', status: 'DIBATALKAN' }])
    expect(ringkasan).toMatchObject({ diproses: 2, selesai: 1, dibatalkan: 1 })
  })

  it('KUOTA_PENUH -> job GAGAL dan drive_status GAGAL (handler asli + FakeDrive + repo in-memory)', async () => {
    const drive = new FakeDrive()
    const repo = new MemoryTautanRepo()
    const akun = new MemoryAkun()
    repo.addTautan()
    repo.addFile(1)
    drive.failNext('uploadFile', 'KUOTA_PENUH')
    const handler = createSinkronTautanHandler({
      repo, akun, driveClientFor: async () => drive,
      bukaFile: async () => ({ ok: true, size: 1, buka: () => Readable.from(['x']) }),
    })
    jobs.add()

    await runDriveRunnerOnce({
      now: () => NOW,
      deps: deps({ SINKRON_TAUTAN: handler }, { tandaiTautanGagal: (id) => repo.tandaiGagal(id) }),
    })

    expect(jobs.failed).toEqual([{ id: 'job-1', kategori: 'KUOTA_PENUH', pesan: 'Kuota Google Drive penuh' }])
    expect(repo.tautan.get(TAUTAN_ID)!.driveStatus).toBe('GAGAL')
  })

  it('TOKEN_TIDAK_VALID -> job dijeda (MENUNGGU), akun ditandai perlu hubung ulang, tautan tidak GAGAL', async () => {
    const akun = new MemoryAkun()
    jobs.add()
    const ringkasan = await runDriveRunnerOnce({
      now: () => NOW,
      deps: deps({ SINKRON_TAUTAN: throws(new DriveApiError('TOKEN_TIDAK_VALID')) }, { tandaiPerluHubungUlang: akun.tandaiPerluHubungUlang }),
    })
    expect(ringkasan).toMatchObject({ dijeda: 1, gagal: 0 })
    expect(akun.akun.perluHubungUlang).toBe(true)
    expect(tautanGagal).toEqual([])
  })

  it("failDriveJob 'MENUNGGU' = masih akan dicoba, termasuk job yang DIBATALKAN karena ada job kembar: tautan tidak GAGAL", async () => {
    // Antrean asli (jobs.ts) membatalkan job ini bila sudah ada job MENUNGGU kembar untuk (tautan, jenis)
    // dan tetap melaporkan 'MENUNGGU' karena job kembar itu yang akan memproses tautannya.
    jobs.nasib = () => 'MENUNGGU'
    jobs.add()
    const ringkasan = await runDriveRunnerOnce({ now: () => NOW, deps: deps({ SINKRON_TAUTAN: throws(new DriveApiError('SEMENTARA')) }) })
    expect(ringkasan).toMatchObject({ dijeda: 1, gagal: 0 })
    expect(tautanGagal).toEqual([])
    expect(perluHubungUlang).toEqual([])
  })

  it('fail mengembalikan null (job sudah tidak PROSES) -> tidak menandai apa pun', async () => {
    jobs.nasib = () => null
    jobs.add()
    const ringkasan = await runDriveRunnerOnce({ now: () => NOW, deps: deps({ SINKRON_TAUTAN: throws(new DriveApiError('PERMANEN')) }) })
    expect(ringkasan).toMatchObject({ diproses: 1, gagal: 0, dijeda: 0 })
    expect(tautanGagal).toEqual([])
  })

  it('AKUN_DIPUTUS -> GAGAL dan tautan GAGAL; GAGAL job hapus tidak menyentuh drive_status tautan', async () => {
    jobs.add()
    jobs.add('HAPUS_TAUTAN', { tautanId: 'hapus' })
    await runDriveRunnerOnce({
      now: () => NOW,
      deps: deps({
        SINKRON_TAUTAN: throws(new DriveApiError('AKUN_DIPUTUS')),
        HAPUS_TAUTAN: throws(new DriveApiError('AKUN_DIPUTUS')),
      }),
    })
    expect(jobs.failed.map((f) => f.kategori)).toEqual(['AKUN_DIPUTUS', 'AKUN_DIPUTUS'])
    expect(tautanGagal).toEqual([TAUTAN_ID])
  })

  it('galat non-Drive -> PERMANEN pesan umum, runner lanjut ke job berikutnya, tidak melempar, log tanpa objek galat', async () => {
    jobs.add()
    jobs.add('SINKRON_TAUTAN', { tautanId: 'kedua' })
    let ke = 0
    const handler: DriveJobHandler = async () => {
      if (ke++ === 0) throw new Error('ENOENT /var/dms/storage/rahasia.pdf')
      return { hasil: 'SELESAI' }
    }
    const ringkasan = await runDriveRunnerOnce({ now: () => NOW, deps: deps({ SINKRON_TAUTAN: handler }) })

    expect(jobs.failed).toEqual([{ id: 'job-1', kategori: 'PERMANEN', pesan: 'Gagal memproses salinan Google Drive' }])
    expect(jobs.completed).toEqual([{ id: 'job-2', status: 'SELESAI' }])
    expect(ringkasan).toMatchObject({ diproses: 2, selesai: 1, gagal: 1 })
    expect(console.error).toHaveBeenCalledWith('[google-drive/runner] job gagal', { jenis: 'SINKRON_TAUTAN', kategori: 'PERMANEN' })
    for (const call of vi.mocked(console.error).mock.calls) {
      expect(call.some((arg) => arg instanceof Error)).toBe(false)
      expect(JSON.stringify(call)).not.toContain('rahasia')
    }
  })

  it('jenis tanpa handler -> PERMANEN "Pemroses belum tersedia"', async () => {
    jobs.add('HAPUS_FILE')
    await runDriveRunnerOnce({ now: () => NOW, deps: deps({ SINKRON_TAUTAN: ok }) })
    expect(jobs.failed).toEqual([{ id: 'job-1', kategori: 'PERMANEN', pesan: 'Pemroses belum tersedia' }])
  })

  it('berhenti setelah anggaran waktu habis (default 5 menit) dan melaporkan anggaranHabis', async () => {
    expect(DRIVE_RUNNER_ANGGARAN_MS).toBe(5 * MENIT)
    for (let i = 0; i < 5; i += 1) jobs.add('SINKRON_TAUTAN', { tautanId: `t${i}` })
    let t = NOW.getTime()
    const now = () => new Date(t)
    const handler: DriveJobHandler = async () => {
      t += 2 * MENIT
      return { hasil: 'SELESAI' }
    }
    const ringkasan = await runDriveRunnerOnce({ now, deps: deps({ SINKRON_TAUTAN: handler }) })
    expect(ringkasan).toMatchObject({ diproses: 3, anggaranHabis: true })
    expect(jobs.jobs.filter((j) => j.status === 'MENUNGGU')).toHaveLength(2)
  })
})

describe('triggerDriveRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW })
  })

  it('single-flight: dua pemicu saat loop berjalan -> satu loop + satu putaran ulang', async () => {
    let lepas!: () => void
    let aktif = 0
    let maksAktif = 0
    const handler: DriveJobHandler = async () => {
      aktif += 1
      maksAktif = Math.max(maksAktif, aktif)
      await new Promise<void>((resolve) => { lepas = resolve })
      aktif -= 1
      return { hasil: 'SELESAI' }
    }
    jobs.add()
    resetDriveRunnerForTest(deps({ SINKRON_TAUTAN: handler }))

    triggerDriveRunner()
    await vi.advanceTimersByTimeAsync(0)
    triggerDriveRunner()
    triggerDriveRunner()
    expect(jobs.claimCalls).toBe(1)

    lepas()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    // Putaran 1: klaim job-1 lalu null; putaran ulang: satu klaim null.
    expect(jobs.claimCalls).toBe(3)
    expect(maksAktif).toBe(1)
    await vi.advanceTimersByTimeAsync(DRIVE_RUNNER_TIMER_MAKS_MS * 2)
    expect(jobs.claimCalls).toBe(3)
  })

  it('menjadwalkan timer ke jadwal_berikut terdekat lalu menjalankan putaran saat timer berbunyi', async () => {
    jobs.next = new Date(NOW.getTime() + 10 * MENIT)
    resetDriveRunnerForTest(deps({ SINKRON_TAUTAN: ok }))
    triggerDriveRunner()
    await vi.advanceTimersByTimeAsync(0)
    expect(jobs.claimCalls).toBe(1)

    jobs.next = null
    await vi.advanceTimersByTimeAsync(10 * MENIT - 1)
    expect(jobs.claimCalls).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(jobs.claimCalls).toBe(2)
  })

  it('timer paling lama 1 jam walau jadwal berikut lebih jauh', async () => {
    expect(DRIVE_RUNNER_TIMER_MAKS_MS).toBe(60 * MENIT)
    jobs.next = new Date(NOW.getTime() + 5 * 60 * MENIT)
    resetDriveRunnerForTest(deps({ SINKRON_TAUTAN: ok }))
    triggerDriveRunner()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(60 * MENIT)
    expect(jobs.claimCalls).toBe(2)
  })

  it('anggaran habis dengan job tersisa -> putaran berikutnya segera (setImmediate)', async () => {
    for (let i = 0; i < 3; i += 1) jobs.add('SINKRON_TAUTAN', { tautanId: `t${i}` })
    const handler: DriveJobHandler = async () => {
      vi.setSystemTime(Date.now() + 6 * MENIT)
      return { hasil: 'SELESAI' }
    }
    resetDriveRunnerForTest(deps({ SINKRON_TAUTAN: handler }))
    triggerDriveRunner()
    // setSystemTime menggeser jam palsu, jadi setImmediate dijalankan lewat runAllTimers.
    for (let i = 0; i < 5; i += 1) await vi.runAllTimersAsync()
    expect(jobs.completed).toHaveLength(3)
  })

  it('tidak pernah melempar: galat DB saat klaim hanya dicatat kategorinya; tanpa env tidak menjadwalkan timer', async () => {
    const nextScheduledAt = vi.fn(async () => new Date(NOW.getTime() + MENIT))
    resetDriveRunnerForTest(deps({ SINKRON_TAUTAN: ok }, {
      jobs: { ...jobs.deps(), claim: async () => { throw new Error('ECONNREFUSED postgres://rahasia') }, nextScheduledAt },
    }))
    expect(() => triggerDriveRunner()).not.toThrow()
    await vi.advanceTimersByTimeAsync(0)
    expect(console.error).toHaveBeenCalledWith('[google-drive/runner] putaran gagal', { kategori: 'TAK_TERDUGA' })
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('rahasia')

    resetDriveRunnerForTest(deps({ SINKRON_TAUTAN: ok }, { isConfigured: () => false, jobs: { ...jobs.deps(), nextScheduledAt } }))
    nextScheduledAt.mockClear()
    triggerDriveRunner()
    await vi.advanceTimersByTimeAsync(0)
    expect(nextScheduledAt).not.toHaveBeenCalled()
  })
})

describe('handler hapus (section 09)', () => {
  it("hasil 'DITUNDA' (D13): job tidak di-complete dan tidak dihitung gagal, tautan tidak ditandai", async () => {
    jobs.add('HAPUS_TAUTAN')
    jobs.add('HAPUS_FILE')
    const ditunda: DriveJobHandler = async ({ job }) => {
      // Handler sendiri yang memanggil deferDriveJob; tiru job kembali ke antrean masa depan.
      jobs.jobs.find((j) => j.id === job.id)!.status = 'DIBATALKAN'
      return { hasil: 'DITUNDA' }
    }

    const ringkasan = await runDriveRunnerOnce({ now: () => NOW, deps: deps({ HAPUS_TAUTAN: ditunda, HAPUS_FILE: ok }) })

    expect(ringkasan).toMatchObject({ diproses: 2, selesai: 1, dijeda: 1, gagal: 0, dibatalkan: 0 })
    expect(jobs.completed).toEqual([{ id: 'job-2', status: 'SELESAI' }])
    expect(jobs.failed).toEqual([])
    expect(tautanGagal).toEqual([])
  })

  it('GAGAL pada job HAPUS_* tidak menandai tautan GAGAL (hanya SINKRON_TAUTAN)', async () => {
    jobs.add('HAPUS_TAUTAN')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const ringkasan = await runDriveRunnerOnce({
      now: () => NOW,
      deps: deps({ HAPUS_TAUTAN: throws(new DriveApiError('AKUN_DIPUTUS')) }),
    })

    expect(ringkasan).toMatchObject({ gagal: 1 })
    expect(jobs.failed).toEqual([{ id: 'job-1', kategori: 'AKUN_DIPUTUS', pesan: 'Akun Google Drive diputus — hapus manual di Drive' }])
    expect(tautanGagal).toEqual([])
  })

  it('deps bawaan mendaftarkan handler SINKRON_TAUTAN, HAPUS_TAUTAN, dan HAPUS_FILE', async () => {
    const { createDefaultDriveRunnerDeps } = await import('#/lib/google-drive/runner')
    expect(Object.keys(createDefaultDriveRunnerDeps().handlers).sort()).toEqual(['HAPUS_FILE', 'HAPUS_TAUTAN', 'SINKRON_TAUTAN'])
  })
})
