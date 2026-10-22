# Code Review: Section 05 — OAuth Salin-Tempel, Repository Akun, Ketersediaan

## Auto-fixes Applied
- `tukarCode` tidak meneruskan galat Google sebagai `cause` dan tidak menyalin pesannya (diuji: pesan, stack, dan JSON galat
  tidak memuat code, refresh token, id_token, client secret, atau `invalid_grant`).
- `parsePastedAddress` juga menolak kredensial di URL (`user:pw@`), state kosong, dan teks > 2048 karakter.
- `ambilState` tidak menghabiskan state bila dipakai sesi lain (lihat penyimpangan 4 di file section).
- `hubungkanDariAlamat` menolak email berbeda untuk HUBUNGKAN_ULANG sebelum membuat folder di Drive.
- `muatRingkasanAdmin` menyaring job hapus GAGAL yang sudah tidak relevan / kembar (penyimpangan 6).
- `isUniqueViolation` menelusuri `cause` (Drizzle membungkus galat `pg`) agar 23505 tetap dikenali.
- Tipe mock di tes diperbaiki untuk `pnpm typecheck` (asersi tidak diubah).

## User Decisions
- Tidak ada.

## Passed / No Action Needed
- `tokens.scope` tidak bisa dibuktikan tanpa login nyata; diimplementasikan defensif (scope hilang = izin tidak diberikan)
  dan ditandai untuk uji terima manual (lihat file section).
- Store state di memori proses (asumsi satu proses server, `claude-spec.md` asumsi 1). State hilang saat server restart →
  `STATE_KEDALUWARSA` (sesuai tabel Edge Cases plan).
- Galat Drive saat memastikan folder akar keluar sebagai `DriveApiError` dan state sudah terpakai; ADMIN mengulang dari
  langkah 1. Dipetakan rute di section 06.
- Revoke token saat putus dipanggil di luar transaksi; galatnya dicatat `console.warn` dengan kategori saja.
- Job `PROSES` milik akun yang diputus tidak diubah di sini: handler (section 07) memeriksa akun tiap iterasi dan
  melempar `AKUN_DIPUTUS`.
