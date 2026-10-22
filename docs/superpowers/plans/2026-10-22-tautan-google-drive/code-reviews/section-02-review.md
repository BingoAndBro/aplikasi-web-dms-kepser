# Code Review: Section 02 — Konfigurasi, Enkripsi Token, Konstanta Bersama

## Auto-fixes Applied
- `readDriveConfig` memeriksa bentuk base64/base64url dengan regex sebelum `Buffer.from`, karena `Buffer.from`
  diam-diam membuang karakter liar (kunci rusak bisa lolos bila panjang hasilnya kebetulan 32 byte).
- `decryptRefreshToken` tidak meneruskan galat asli sebagai `cause` (diuji), sehingga detail kripto tidak ikut tercetak.
- Komentar `eslint-disable` dihapus dari `shared.ts`: repo tidak memakai ESLint.

## User Decisions
- Tidak ada.

## Passed / No Action Needed
- `encryptRefreshToken` dengan kunci bukan 32 byte melempar `Error` biasa (bukan `TokenCryptoError`): kasus itu
  adalah salah konfigurasi yang sudah dicegah `readDriveConfig`; plan hanya mengatur kode galat untuk dekripsi.
- `PerluHapusManualItem.kategori` bertipe `DriveGalatKategori | null` dan `jumlah_file` `number | null` (null untuk
  `HAPUS_TAUTAN`): kolom DB `galat_kategori` nullable, dan hitungan file hanya bermakna untuk `HAPUS_FILE`.
- Label status Drive untuk UI (disebut di `claude-plan.md` Step 2, tidak di section 02) ditunda ke section 10 yang
  merancang tampilan Riwayat Tautan.
