// Server-only module. Do not import from client components.
import { randomBytes } from 'node:crypto'

/**
 * Tiket unduh ZIP laporan (D-31). Ekspor ZIP Laporan Saya / Laporan Kegiatan /
 * Monitoring Dokumen Tim dulu diunduh lewat `fetch()` + blob di halaman. Di
 * Edge dengan ekstensi/pengelola unduhan, respons berbentuk lampiran ZIP
 * direbut oleh ekstensi dan `fetch` halaman gagal ("Failed to fetch"),
 * padahal server mengirim file utuh. Ekspor berkas KSBU tidak kena karena
 * diunduh lewat navigasi biasa (GET).
 *
 * Daftar dokumen bisa sampai 500 UUID — terlalu panjang untuk URL — jadi
 * alurnya dua langkah: POST memvalidasi daftar lalu menyimpan permintaan di
 * sini dan mengembalikan tautan GET sekali pakai; halaman lalu menavigasi ke
 * tautan itu dan browser mengunduh secara bawaan. Tiket terikat ke pengguna,
 * sekali pakai, dan kedaluwarsa dalam 2 menit. Disimpan di memori proses:
 * aplikasi berjalan sebagai satu proses server (satu satker).
 */

const TICKET_TTL_MS = 2 * 60 * 1000

type StoredTicket = {
  userId: string
  kind: string
  payload: unknown
  expiresAt: number
}

const tickets = new Map<string, StoredTicket>()

export function createDownloadTicket(
  { userId, kind, payload }: { userId: string; kind: string; payload: unknown },
  now: number = Date.now(),
): string {
  pruneExpired(now)
  const token = randomBytes(32).toString('base64url')
  tickets.set(token, { userId, kind, payload, expiresAt: now + TICKET_TTL_MS })
  return token
}

/**
 * Mengembalikan payload dan menghapus tiket (sekali pakai). `null` bila tiket
 * tidak ada, kedaluwarsa, milik pengguna lain, atau untuk jenis ekspor lain.
 */
export function consumeDownloadTicket(
  { token, userId, kind }: { token: string; userId: string; kind: string },
  now: number = Date.now(),
): unknown | null {
  const ticket = tickets.get(token)
  if (!ticket) return null
  if (ticket.expiresAt <= now) {
    tickets.delete(token)
    return null
  }
  // Pengguna/jenis salah: jangan hapus tiket, supaya tidak bisa dipakai untuk
  // membatalkan unduhan milik orang lain.
  if (ticket.userId !== userId || ticket.kind !== kind) return null

  tickets.delete(token)
  return ticket.payload
}

function pruneExpired(now: number) {
  for (const [token, ticket] of tickets) {
    if (ticket.expiresAt <= now) tickets.delete(token)
  }
}

/** Hanya untuk tes. */
export function resetDownloadTicketsForTest() {
  tickets.clear()
}

export const DOWNLOAD_TICKET_EXPIRED_MESSAGE =
  'Tautan unduhan sudah kedaluwarsa atau sudah dipakai. Tutup tab ini dan klik Ekspor lagi.'
