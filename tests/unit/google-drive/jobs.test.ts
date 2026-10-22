import { describe, expect, it } from 'vitest'

import {
  DRIVE_JOB_JEDA_MS,
  DRIVE_JOB_KUNCI_MACET_MS,
  DRIVE_JOB_MAKS_PERCOBAAN_ULANG,
  DRIVE_JOB_PESAN_MAKS,
  DRIVE_JOB_PRIORITAS,
  DRIVE_JOB_TUNDA_SINKRON_MS,
  computeRetrySchedule,
  truncateGalatPesan,
} from '#/lib/google-drive/jobs'

const NOW = new Date('2026-10-22T03:00:00.000Z')
const MENIT = 60_000
const JAM = 60 * MENIT

describe('konstanta antrean Drive', () => {
  it('HAPUS_* diproses lebih dulu daripada SINKRON_TAUTAN', () => {
    expect(DRIVE_JOB_PRIORITAS).toEqual({ HAPUS_TAUTAN: 0, HAPUS_FILE: 0, SINKRON_TAUTAN: 10 })
  })

  it('jeda 1 m, 5 m, 15 m, 1 j, 3 j, 6 j, 12 j, 24 j; 8 percobaan ulang; kunci macet 15 m; tunda sinkron 30 dtk', () => {
    expect(DRIVE_JOB_JEDA_MS).toEqual([MENIT, 5 * MENIT, 15 * MENIT, JAM, 3 * JAM, 6 * JAM, 12 * JAM, 24 * JAM])
    expect(DRIVE_JOB_MAKS_PERCOBAAN_ULANG).toBe(8)
    expect(DRIVE_JOB_KUNCI_MACET_MS).toBe(15 * MENIT)
    expect(DRIVE_JOB_TUNDA_SINKRON_MS).toBe(30_000)
    expect(DRIVE_JOB_PESAN_MAKS).toBe(200)
  })
})

describe('computeRetrySchedule', () => {
  it.each(DRIVE_JOB_JEDA_MS.map((jeda, index) => [index + 1, jeda] as const))(
    'kegagalan sementara ke-%i dijadwalkan ulang setelah %i ms',
    (ke, jeda) => {
      expect(computeRetrySchedule({ percobaan: ke - 1, now: NOW })).toEqual({
        status: 'MENUNGGU',
        percobaan: ke,
        jadwalBerikut: new Date(NOW.getTime() + jeda),
      })
    },
  )

  it('kegagalan ke-9 (setelah 8 percobaan ulang) -> GAGAL', () => {
    expect(computeRetrySchedule({ percobaan: 8, now: NOW })).toEqual({ status: 'GAGAL', percobaan: 9 })
    expect(computeRetrySchedule({ percobaan: 20, now: NOW })).toEqual({ status: 'GAGAL', percobaan: 21 })
  })
})

describe('truncateGalatPesan', () => {
  it('memotong pesan menjadi paling banyak 200 karakter tanpa membelah emoji', () => {
    expect(truncateGalatPesan('Kuota Google Drive penuh')).toBe('Kuota Google Drive penuh')
    expect(Array.from(truncateGalatPesan('x'.repeat(500)))).toHaveLength(200)
    const emoji = truncateGalatPesan(`${'a'.repeat(199)}😀😀`)
    expect(emoji).toBe(`${'a'.repeat(199)}😀`)
  })
})

describe('modul jobs.ts', () => {
  it('bisa diimpor tanpa DATABASE_URL (db dimuat malas)', async () => {
    const mod = await import('#/lib/google-drive/jobs')
    expect(typeof mod.claimNextDriveJob).toBe('function')
  })
})
