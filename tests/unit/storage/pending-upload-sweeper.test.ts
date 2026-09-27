import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  maybeSweepStalePendingUploads,
  PENDING_UPLOAD_MAX_AGE_MINUTES,
  PENDING_UPLOAD_SWEEP_INTERVAL_MS,
  resetPendingUploadSweepThrottleForTest,
  sweepStalePendingUploads,
} from '#/lib/storage/pending-upload-sweeper'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const DOKUMEN_ID = '22222222-2222-4222-8222-222222222222'
const MANUAL_ID = '33333333-3333-4333-8333-333333333333'
const KELENGKAPAN_ID = '44444444-4444-4444-8444-444444444444'
const FILE_UUID = '55555555-5555-4555-8555-555555555555'
const HOUR_MS = 60 * 60 * 1000

const PATHS = {
  stalePending: `${OWNER_ID}/${KELENGKAPAN_ID}_1778064971564_Laporan.pdf`,
  staleDashPending: `${OWNER_ID}/1778064971565-abc123-Foto.jpg`,
  recentPending: `${OWNER_ID}/${KELENGKAPAN_ID}_1778064971566_Baru.pdf`,
  // Legacy document that still references a pending-looking path.
  referencedPending: `${OWNER_ID}/${KELENGKAPAN_ID}_1778064971567_Lama.pdf`,
  formal: `${OWNER_ID}/${DOKUMEN_ID}/${FILE_UUID}.pdf`,
  avatar: `avatars/${OWNER_ID}/${FILE_UUID}.png`,
  manual: `manual-arsip/${OWNER_ID}/${MANUAL_ID}/${FILE_UUID}.pdf`,
}

let storageRoot: string
let previousStorageRoot: string | undefined

beforeEach(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), 'dms-pending-sweep-'))
  previousStorageRoot = process.env.DMS_LOCAL_STORAGE_ROOT
  process.env.DMS_LOCAL_STORAGE_ROOT = storageRoot
  resetPendingUploadSweepThrottleForTest()

  const staleAge = (PENDING_UPLOAD_MAX_AGE_MINUTES + 60) * 60 * 1000
  await writeAged(PATHS.stalePending, staleAge)
  await writeAged(PATHS.staleDashPending, staleAge)
  await writeAged(PATHS.recentPending, HOUR_MS)
  await writeAged(PATHS.referencedPending, staleAge)
  await writeAged(PATHS.formal, staleAge)
  await writeAged(PATHS.avatar, staleAge)
  await writeAged(PATHS.manual, staleAge)
})

afterEach(async () => {
  if (previousStorageRoot === undefined) delete process.env.DMS_LOCAL_STORAGE_ROOT
  else process.env.DMS_LOCAL_STORAGE_ROOT = previousStorageRoot
  await rm(storageRoot, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('sweepStalePendingUploads', () => {
  it('uses a 24-hour maximum age for pending uploads', () => {
    expect(PENDING_UPLOAD_MAX_AGE_MINUTES).toBe(24 * 60)
  })

  it('deletes only unreferenced pending uploads older than the maximum age', async () => {
    const result = await sweepStalePendingUploads({ loadReferences: async () => references() })

    expect(result).toMatchObject({ deletedCount: 2, failedCount: 0, keptRecentCount: 1 })
    expect(await exists(PATHS.stalePending)).toBe(false)
    expect(await exists(PATHS.staleDashPending)).toBe(false)

    expect(await exists(PATHS.recentPending)).toBe(true)
    expect(await exists(PATHS.referencedPending)).toBe(true)
    expect(await exists(PATHS.formal)).toBe(true)
    expect(await exists(PATHS.avatar)).toBe(true)
    expect(await exists(PATHS.manual)).toBe(true)
  })

  it('honours a custom maximum age', async () => {
    await sweepStalePendingUploads({ maxAgeMinutes: 30, loadReferences: async () => references() })

    expect(await exists(PATHS.recentPending)).toBe(false)
    expect(await exists(PATHS.referencedPending)).toBe(true)
  })
})

describe('maybeSweepStalePendingUploads', () => {
  it('runs at most once per interval per process', async () => {
    const sweep = vi.fn(async () => ({ deletedCount: 0, missingCount: 0, failedCount: 0, keptRecentCount: 0 }))
    const start = 1_800_000_000_000

    await maybeSweepStalePendingUploads({ now: start, sweep })
    expect(maybeSweepStalePendingUploads({ now: start + PENDING_UPLOAD_SWEEP_INTERVAL_MS - 1, sweep })).toBeNull()
    await maybeSweepStalePendingUploads({ now: start + PENDING_UPLOAD_SWEEP_INTERVAL_MS, sweep })

    expect(sweep).toHaveBeenCalledTimes(2)
  })

  it('does not start a second sweep while one is still running', () => {
    let finish: () => void = () => undefined
    const sweep = vi.fn(() => new Promise<{ deletedCount: number; missingCount: number; failedCount: number; keptRecentCount: number }>((resolve) => {
      finish = () => resolve({ deletedCount: 0, missingCount: 0, failedCount: 0, keptRecentCount: 0 })
    }))

    const first = maybeSweepStalePendingUploads({ now: 1, sweep })
    // Far enough in the future that only the in-flight guard can block it.
    expect(maybeSweepStalePendingUploads({ now: 1 + PENDING_UPLOAD_SWEEP_INTERVAL_MS * 2, sweep })).toBeNull()

    finish()
    expect(first).not.toBeNull()
    expect(sweep).toHaveBeenCalledTimes(1)
  })

  it('never throws into the upload request when the sweep fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const sweep = vi.fn(async () => {
      throw new Error('database unavailable')
    })

    await expect(maybeSweepStalePendingUploads({ now: 1, sweep })).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith('[pending-upload-sweeper] Sweep failed')
  })
})

function references() {
  return {
    documents: [{
      id: DOKUMEN_ID,
      lampiranUrls: [
        { kelengkapan_id: KELENGKAPAN_ID, nama: 'Lama', url: PATHS.referencedPending },
        { kelengkapan_id: KELENGKAPAN_ID, nama: 'Formal', url: PATHS.formal },
      ],
    }],
    manualAttachments: [{ id: MANUAL_ID, logicalPath: PATHS.manual }],
  }
}

function physical(logicalPath: string) {
  return path.join(storageRoot, ...logicalPath.split('/'))
}

async function writeAged(logicalPath: string, ageMs: number) {
  const target = physical(logicalPath)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, 'content')
  const time = new Date(Date.now() - ageMs)
  await utimes(target, time, time)
}

async function exists(logicalPath: string) {
  try {
    return (await stat(physical(logicalPath))).isFile()
  } catch {
    return false
  }
}
