# Code Review: Section 11 — UI Pengaturan ADMIN (Google Drive)

## Auto-fixes Applied
- `window.open(..., 'noopener,noreferrer')` selalu mengembalikan `null`, sehingga pemblokir pop-up tidak bisa dideteksi.
  Setelah langkah 1, tautan cadangan "Tab tidak terbuka? Klik di sini." (`target="_blank" rel="noopener noreferrer"`) ke
  `auth_url` yang sama ditampilkan. `auth_url` memang respons yang diizinkan SPEC 7.3 (berisi client ID publik, state, dan
  challenge PKCE — bukan rahasia).
- Tombol akun aktif (Ganti/Putuskan/Hubungkan ulang) dan "Hubungkan akun Google" nonaktif selama panel 2 langkah terbuka,
  supaya mode panel tidak berganti di tengah alur. Batal/Simpan nonaktif selama permintaan berjalan.
- Respons yang tiba setelah komponen di-unmount tidak mengubah state (`mounted` ref).
- Guard tes awal melarang kata `token`/`refresh` secara umum dan bentrok dengan nama env `DMS_DRIVE_TOKEN_KEY` dan ikon
  `RefreshCw`; guard dipersempit ke nama field rahasia (`refresh_token`, `client_secret`, `token_enc`, `access_token`, …)
  dan ID Drive (`drive_file_id`, `drive_folder_id`). Tes ini ditulis di section ini, bukan tes lama.

## User Decisions
- Tidak ada.

## Passed / No Action Needed
- Tidak ada pemanggilan `/auth/logout`, endpoint `/settings/`, maupun `ROUTES.LOGIN`; simpan tema/identitas tetap memakai
  alur lama (konfirmasi + logout) tanpa perubahan.
- UI tidak menampilkan token, client secret, ID folder/file Drive, nama file, atau daftar dokumen. Kartu tanpa konfigurasi
  hanya menyebut nama tiga variabel env.
- Label kategori di daftar "perlu dihapus manual" memakai `DRIVE_PESAN_GALAT` (pesan yang sama dengan Riwayat Tautan) dan
  fallback "Penyebab tidak diketahui" untuk `kategori: null`. Job `HAPUS_TAUTAN` (termasuk kategori `AKUN_DIPUTUS`) dengan
  `jumlah_file: null` ditampilkan sebagai "Seluruh folder".
- "Coba lagi penghapusan yang gagal" menampilkan toast jumlah; bila 0 (mis. semua berkategori `AKUN_DIPUTUS`, yang memang
  tidak di-reset server) toast peringatan menjelaskan alasannya.
