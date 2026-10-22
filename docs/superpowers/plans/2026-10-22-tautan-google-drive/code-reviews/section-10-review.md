# Code Review: Section 10 — UI Dialog Bagikan dan Riwayat Tautan

## Auto-fixes Applied
- Polling progres di dialog Bagikan awalnya bergantung pada objek `driveItem`; bila putaran pertama gagal (atau tautan
  belum terlihat di daftar) state tidak berubah dan polling berhenti diam-diam. Diganti penghitung `pollTick` yang naik
  di `finally` setiap putaran, sehingga galat jaringan sesaat tidak menghentikan polling. Putaran pertama langsung (0 ms)
  untuk memuat total lampiran, berikutnya tiap 3000 ms. Timer dibersihkan saat dialog ditutup/unmount.
- Cabut: baris langsung ditandai dicabut secara lokal (DRIVE → `MENGHAPUS`, `drive_url` dikosongkan) sebelum `reload()`,
  supaya tampilan tidak basi bila muat ulang gagal. Untuk DRIVE, polling 5000 ms lalu menyusul status `DIHAPUS`.
- `reload()` Riwayat membuang respons yang tiba setelah dialog ditutup atau tersalip permintaan yang lebih baru
  (`openRef` + nomor urut permintaan). Galat saat polling tidak menimpa daftar; polling berikutnya mencoba lagi.
- Tombol **Buat Tautan** nonaktif bila pilihan DRIVE tetapi Drive tidak tersedia (pertahanan berlapis selain kartu nonaktif).

## User Decisions
- Tidak ada.

## Passed / No Action Needed
- `path` tidak pernah dirender untuk DRIVE (`!isDrive && item.path`); hitungan "dibuka N×" disembunyikan untuk DRIVE.
  Respons API memang `path: null` untuk DRIVE (section 08); penjagaan UI ini berlapis.
- `drive_url` hanya ditampilkan saat `SIAP` dan belum dicabut, sesuai bentuk respons section 08.
- Badge akses Google Drive memakai token tema `info-*` (bukan warna arbitrary); `color-budget.test.ts` tetap lulus.
- GET riwayat memicu runner tiap polling (catatan section 08); polling hanya berjalan selama dialog terbuka dan ada baris
  `MENUNGGU`/`MENGUNGGAH`/`MENGHAPUS`. Dicatat sebagai batasan yang diketahui di section 12.
- Baris tertunda akun tetap dipoll (statusnya `MENGUNGGAH`); dibiarkan sesuai SPEC 10.2.
