import { describe, expect, it } from 'vitest'

import {
  addPendingUploadUrl,
  collectReferencedPendingUploadUrls,
  collectUnreferencedPendingUploadUrls,
  removePendingUploadUrls,
  replaceLampiranByKelengkapanId,
  resetLampiranByKelengkapanId,
} from '#/lib/storage/pending-upload-session'
import type { LampiranUrl } from '#/lib/dokumen/types'

const FORMAL_PATH = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.pdf'
const PENDING_A = '11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444_1778064971564_a.pdf'
const PENDING_B = '11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444_1778064971565_b.pdf'
const DOC_ID = '44444444-4444-4444-8444-444444444444'

describe('pending upload session helpers', () => {
  it('tracks every pending upload created in the current editor session', () => {
    let sessionUrls = new Set<string>()
    sessionUrls = addPendingUploadUrl(sessionUrls, PENDING_A)
    sessionUrls = addPendingUploadUrl(sessionUrls, PENDING_B)
    sessionUrls = addPendingUploadUrl(sessionUrls, ' ')

    expect([...sessionUrls]).toEqual([PENDING_A, PENDING_B])
  })

  it('identifies the first replacement as superseded after replacing with a second pending upload', () => {
    const sessionUrls = new Set([PENDING_A, PENDING_B])
    const nextLampirans = replaceLampiranByKelengkapanId([lampiran(PENDING_A)], lampiran(PENDING_B))

    expect(collectReferencedPendingUploadUrls(sessionUrls, nextLampirans)).toEqual(new Set([PENDING_B]))
    expect(collectUnreferencedPendingUploadUrls(sessionUrls, nextLampirans)).toEqual([PENDING_A])
  })

  it('returns all session-created pending uploads for cancel cleanup', () => {
    const sessionUrls = new Set([PENDING_A, PENDING_B])

    expect(collectUnreferencedPendingUploadUrls(sessionUrls, [])).toEqual([PENDING_A, PENDING_B])
  })

  it('preserves the currently selected pending upload for failed submit retry cleanup', () => {
    const sessionUrls = new Set([PENDING_A, PENDING_B])
    const currentLampirans = [lampiran(PENDING_B)]

    expect(collectUnreferencedPendingUploadUrls(sessionUrls, currentLampirans)).toEqual([PENDING_A])
  })

  it('does not put old formal attachments in the pending cleanup list unless they were session-created', () => {
    const sessionUrls = new Set([PENDING_A])
    const nextLampirans = resetLampiranByKelengkapanId({
      lampiranUrls: [lampiran(PENDING_A)],
      kelengkapanId: DOC_ID,
      originalLampiran: lampiran(FORMAL_PATH),
    })

    expect(nextLampirans).toEqual([lampiran(FORMAL_PATH)])
    expect(collectUnreferencedPendingUploadUrls(sessionUrls, nextLampirans)).toEqual([PENDING_A])
  })

  it('removes cleaned pending urls from the tracked session set', () => {
    const sessionUrls = new Set([PENDING_A, PENDING_B])

    expect([...removePendingUploadUrls(sessionUrls, [PENDING_A])]).toEqual([PENDING_B])
  })
})

function lampiran(url: string): LampiranUrl {
  return {
    kelengkapan_id: DOC_ID,
    nama: 'Bukti',
    url,
    uploaded_at: '2026-05-20T00:00:00.000Z',
  }
}
