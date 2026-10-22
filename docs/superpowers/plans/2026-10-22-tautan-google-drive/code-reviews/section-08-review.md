# Code Review: Section 08 — Rute Tautan (Buat DRIVE, Riwayat, Coba Lagi, 404 Pembuka, Pemicu Runner)

## Auto-fixes Applied
- `toTautanListItem` menyalin field satu per satu dan diuji dengan JSON item: tidak memuat token tautan DRIVE,
  `drive_folder_id`, `drive_daftar_isi_file_id`, `drive_file_id`, maupun id akun (unit + integrasi).
- `drive_galat` hanya diisi saat `drive_status = GAGAL`, dan `drive_tertunda_akun` hanya untuk tautan yang belum
  dicabut — mencegah penanda basi setelah coba lagi/cabut.
- `cobaLagiTautanDrive` tidak mengubah job GAGAL bila sudah ada job `SINKRON_TAUTAN` MENUNGGU/PROSES untuk tautan itu
  (partial unique `drive_job_satu_menunggu` akan menolak), dan meng-enqueue job baru bila tidak ada job GAGAL sama sekali.
- `insertTautanDrive` memotong insert baris file per 1000 baris (batas 65535 parameter PostgreSQL; 500 dokumen bisa
  punya ribuan lampiran).
- Tes `tautan-drive-route` memock `laporan-zip-entries` (memuat `#/db/client` saat diimpor) — tes sendiri, bukan pelemahan.
- Uji mutasi: membuang penolakan DRIVE di `resolveActiveTautan` dan `handleTautanLampiranRequest` membuat 10 tes merah.

## User Decisions
- Tidak ada.

## Passed / No Action Needed
- Ketersediaan Drive diperiksa setelah 413 dan sebelum penyaringan cakupan, sehingga non-PJ Kinerja yang meminta
  DRIVE saat Drive tidak tersedia mendapat 409 (bukan 403). Info ketersediaan memang terbuka untuk semua sesi
  (`GET /api/google-drive/status`), jadi urutan ini tidak membocorkan apa pun.
- Akun aktif bisa berganti di antara cek ketersediaan dan insert; tautan lalu memakai akun yang kini NONAKTIF.
  Akun NONAKTIF tetap menyimpan token dan tetap diproses runner (K5/K6), jadi tidak ada perbaikan.
- `GET /api/laporan/tautan` selalu memicu runner (juga bagi pengguna tanpa tautan DRIVE): pemicu single-flight dan
  no-op tanpa env, sesuai daftar pemicu SPEC 8.3.
- Coba lagi untuk tautan yang gagal karena `AKUN_DIPUTUS` atau `TIDAK_DITEMUKAN` akan gagal lagi; UI section 10
  menampilkan pesannya ("cabut lalu buat tautan baru").
- Tes lama yang disesuaikan (injeksi saja, asersi lama tidak dilemahkan): tiruan `toTautanListItem` di
  `tautan-route.test.ts` kini mencatat argumen dan mengembalikan `path: null` untuk DRIVE; `admin-routes.test.ts`
  memock `#/lib/google-drive/runner`; tes `google-drive-migration-source.test.ts` "Zod masih menolak DRIVE (dibuka di
  section 08)" dibalik sesuai rencana dan kini juga memeriksa nilai akses asing tetap ditolak.
