# Implementation Notes: Bagikan Tautan Laporan ke Google Drive

## What Was Built
Akses tautan laporan ketiga, `DRIVE`: ADMIN menghubungkan satu akun Google aktif (OAuth salin-tempel, scope `drive.file`,
refresh token terenkripsi). Membuat tautan DRIVE mengantrekan job `SINKRON_TAUTAN` yang diproses runner di proses server
(dan `pnpm drive:sync`) untuk mengunggah lampiran + `DAFTAR_ISI.txt` ke folder yang dibagikan "siapa saja dengan link".
Cabut, pemusnahan berkas, Pembersihan Dokumen, dan hapus permanen non-material mengantrekan job hapus di transaksi yang
sama. UI: dialog Bagikan tiga pilihan + progres, Riwayat Tautan dengan status Drive, dan kartu Google Drive di Pengaturan ADMIN.

## Files Created/Modified
Rincian per section ada di bagian "Implementasi Aktual"/catatan penyimpangan setiap `sections/section-NN-*.md` dan di
`code-reviews/section-NN-review.md`. Ringkasan:
- 01: `src/db/schema/app/{google-drive-akun,drive-job,laporan-tautan-drive-file,laporan-tautan}.ts`, `drizzle/0024_google_drive_tautan.sql`, audit.
- 02–05: `src/lib/google-drive/{config,token-crypto,shared,drive-errors,drive-client,jobs,oauth,akun-repository,akun-connect,availability}.ts`.
- 06: `src/routes/api/google-drive/status.ts`, `src/routes/api/admin/google-drive/*`, `src/lib/schemas/google-drive.ts`, `admin-route.ts`.
- 07: `rencana-file.ts`, `daftar-isi.ts`, `file-source.ts`, `sinkron-tautan.ts`, `runner.ts`, perluasan helper ZIP.
- 08: `src/routes/api/laporan/tautan.ts`, `tautan.$id.coba-lagi.ts`, `tautan-drive-repository.ts`, 404 pembuka DMS untuk DRIVE.
- 09: `hapus.ts`, `penghapusan.ts`, hook di `tautan-repository.ts`, `berkas-arsip-service.ts`, `pembersihan-service.ts`, `api/dokumen.$id.ts`.
- 10: `src/components/laporan/BagikanTautan.tsx`.
- 11: `src/components/admin/GoogleDriveSettings.tsx`, `src/routes/admin.settings.tsx`.
- 12: `src/scripts/drive-sync.ts`, `package.json`, `.env.example`, `AGENTS.md`, `docs/skripsi/rancangan-erd.md`, `uji-terima-manual.md`.

## How to Use
1. Ikuti `uji-terima-manual.md` bagian A–B (Google Cloud, env lokal, migrasi 0024).
2. ADMIN → Pengaturan → Google Drive → Hubungkan akun Google.
3. Pengguna laporan → Bagikan Tautan → Google Drive. Pantau di Riwayat Tautan.
4. Opsional: jadwalkan `pnpm drive:sync` di Windows Task Scheduler.

## Known Deviations from Plan
Dicatat per section (01–12) di file section dan `code-reviews/`. Sesi D (10–12): lihat `section-10/11/12` "Implementasi Aktual".

## Commits
| Section | Commit |
|---|---|
| 01 | 86bb6ee |
| 02 | 6f86071 |
| 03 | 607e9ee |
| 04 | 98b6913 |
| 05 | e07c45e |
| 06 | 2da5a23 |
| 07 | d74eaa9 |
| 08 | ed36592 |
| 09 | 1052461 |
| 10 | 548f8b3 |
| 11 | df02b37 |
| 12 | f9ffc9d |
