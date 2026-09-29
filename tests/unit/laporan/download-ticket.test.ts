import { beforeEach, describe, expect, it } from 'vitest'

import {
  consumeDownloadTicket,
  createDownloadTicket,
  resetDownloadTicketsForTest,
} from '#/lib/export/download-ticket'

// D-31: tiket sekali pakai untuk unduhan ZIP laporan secara bawaan browser.

describe('download ticket', () => {
  beforeEach(() => resetDownloadTicketsForTest())

  const USER = 'user-a'
  const OTHER = 'user-b'
  const NOW = 1_000_000

  it('returns the payload once to the same user and export kind', () => {
    const token = createDownloadTicket({ userId: USER, kind: 'laporan-kegiatan', payload: { dokumen_ids: ['x'] } }, NOW)

    expect(consumeDownloadTicket({ token, userId: USER, kind: 'laporan-kegiatan' }, NOW + 1000)).toEqual({ dokumen_ids: ['x'] })
    expect(consumeDownloadTicket({ token, userId: USER, kind: 'laporan-kegiatan' }, NOW + 1000)).toBeNull()
  })

  it('refuses another user or another export kind without burning the ticket', () => {
    const token = createDownloadTicket({ userId: USER, kind: 'laporan-kegiatan', payload: 1 }, NOW)

    expect(consumeDownloadTicket({ token, userId: OTHER, kind: 'laporan-kegiatan' }, NOW)).toBeNull()
    expect(consumeDownloadTicket({ token, userId: USER, kind: 'laporan-saya' }, NOW)).toBeNull()
    expect(consumeDownloadTicket({ token, userId: USER, kind: 'laporan-kegiatan' }, NOW)).toBe(1)
  })

  it('expires after 2 minutes', () => {
    const token = createDownloadTicket({ userId: USER, kind: 'laporan-saya', payload: 1 }, NOW)

    expect(consumeDownloadTicket({ token, userId: USER, kind: 'laporan-saya' }, NOW + 2 * 60 * 1000)).toBeNull()
  })

  it('issues unguessable, distinct tokens', () => {
    const a = createDownloadTicket({ userId: USER, kind: 'k', payload: 1 }, NOW)
    const b = createDownloadTicket({ userId: USER, kind: 'k', payload: 1 }, NOW)

    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(40)
  })
})
