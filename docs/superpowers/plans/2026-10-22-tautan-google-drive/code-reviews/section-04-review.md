# Code Review: Section 04 — Antrean Job (`jobs.ts`)

## Auto-fixes Applied
- **Bentrok partial unique saat job dikembalikan ke MENUNGGU.** Bila sebuah (tautan, jenis) di-enqueue lagi selama
  job lamanya `PROSES`, enqueue membuat baris `MENUNGGU` baru (PROSES tidak termasuk index `drive_job_satu_menunggu`).
  Lalu `failDriveJob` (SEMENTARA/TOKEN_TIDAK_VALID) atau `deferDriveJob` yang mengembalikan job lama ke `MENUNGGU`
  akan ditolak PostgreSQL (23505). Diperbaiki: update yang sama memeriksa kembaran `MENUNGGU`; bila ada, job lama
  `DIBATALKAN` (kerjanya sudah tercakup job kembar: handler memproses seluruh baris tautan) dan fungsi tetap
  melaporkan `'MENUNGGU'`. Diuji di integrasi.
- `failDriveJob` SEMENTARA membaca `percobaan` lalu update bersyarat `status = 'PROSES' AND percobaan = <lama>`,
  supaya dua pemanggil tidak menambah percobaan dua kali.
- `nextScheduledAt` juga memperhitungkan job `PROSES` (saat `dikunci_pada + 15 m`), agar job yang ditinggal runner
  mati diklaim ulang tanpa pemicu lain. Parameter `now` di plan tidak dipakai, jadi dihapus dari signature.
- Tes dua koneksi memasang `SET LOCAL lock_timeout = '2s'` di koneksi B: bila `SKIP LOCKED` hilang, tes gagal cepat
  dan `finally` tetap menghapus data uji (dibuktikan dengan uji mutasi; tanpa itu run yang menggantung meninggalkan data).

## User Decisions
- Tidak ada.

## Passed / No Action Needed
- Uji mutasi: membuang `SKIP LOCKED` atau `j.prioritas` dari `ORDER BY` membuat tes integrasi merah; kode asli dikembalikan.
- Varian klaim untuk `PoolClient` tidak dibuat terpisah: `drizzle(poolClient)` sudah memenuhi `DriveJobExecutor`.
- Klaim ulang job macet tidak menambah `percobaan` (plan tidak mengaturnya; kegagalan dihitung saat handler melapor).
