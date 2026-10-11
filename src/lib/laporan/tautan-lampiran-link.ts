// Server-only module. Do not import from client components.
import { createHmac, timingSafeEqual } from 'node:crypto'

import type { LaporanTautan } from '#/db/schema/app'
import {
  TAUTAN_LAMPIRAN_SIGNATURE_LENGTH,
  buildTautanLampiranPath,
} from '#/lib/laporan/tautan-shared'

/**
 * Tautan per lampiran: /lampiran/<tautanId>/<dokumenId>/<ref>/<sig>.
 *
 * `sig` = HMAC-SHA256 yang berkunci TOKEN batch atas (tautanId, dokumenId,
 * ref), dipotong 128 bit. Token batch tersimpan di DB dan tidak pernah ada di
 * URL ini; HMAC satu arah, jadi pemegang satu tautan lampiran tidak bisa
 * membuka halaman batch maupun lampiran lain. Tidak butuh tabel atau env
 * secret baru, dan mencabut batch otomatis mematikan semua tautan lampirannya.
 */

const SIGNATURE_CONTEXT = 'lampiran:v1'

type LampiranSignatureInput = {
  tautanId: string
  tautanToken: string
  dokumenId: string
  /** Indeks lampiran (dokumen alur) atau id lampiran (dokumen manual). */
  ref: string
}

export function signTautanLampiran({ tautanId, tautanToken, dokumenId, ref }: LampiranSignatureInput): string {
  return createHmac('sha256', tautanToken)
    .update(`${SIGNATURE_CONTEXT}:${tautanId}:${dokumenId}:${ref}`)
    .digest('base64url')
    .slice(0, TAUTAN_LAMPIRAN_SIGNATURE_LENGTH)
}

export function verifyTautanLampiranSignature(input: LampiranSignatureInput & { sig: string }): boolean {
  const expected = Buffer.from(signTautanLampiran(input))
  const actual = Buffer.from(input.sig)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function buildTautanLampiranLinkPath(
  tautan: Pick<LaporanTautan, 'id' | 'token'>,
  dokumenId: string,
  ref: string,
): string {
  return buildTautanLampiranPath({
    tautanId: tautan.id,
    dokumenId,
    ref,
    sig: signTautanLampiran({ tautanId: tautan.id, tautanToken: tautan.token, dokumenId, ref }),
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const ERROR_TITLE_BY_STATUS: Record<number, string> = {
  404: 'Tautan tidak ditemukan',
  410: 'Berkas tidak tersedia',
}

/**
 * Halaman galat kecil untuk tautan lampiran yang dibuka langsung di tab:
 * pengunjung melihat penjelasan, bukan JSON mentah. Pesan di-escape.
 */
export function renderTautanErrorPage(status: number, message: string): Response {
  const title = ERROR_TITLE_BY_STATUS[status] ?? 'Terjadi kesalahan'
  const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>
  /* Halaman berdiri sendiri (tanpa CSS aplikasi): warna sistem CSS mengikuti mode terang/gelap. */
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: Canvas; color: CanvasText; }
  main { max-width: 440px; width: 100%; padding: 28px; border: 1px solid ButtonBorder; border-radius: 20px; }
  h1 { margin: 0 0 8px; font-size: 20px; }
  p { margin: 0; font-size: 14px; line-height: 1.6; color: GrayText; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
</main>
</body>
</html>`

  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    },
  })
}
