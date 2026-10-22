# Code Review: Section 06 — Rute ADMIN Google Drive dan Status Ketersediaan

## Auto-fixes Applied
- `resetFailedDeletionJobs` menghindari pelanggaran partial unique `drive_job_satu_menunggu`: GAGAL kembar hanya yang
  terbaru direset dan pasangan yang sudah punya job MENUNGGU/PROSES dilewati (diuji di integrasi).
- Job hapus milik akun yang sudah `DIPUTUS` tidak direset walau kategorinya bukan `AKUN_DIPUTUS` (tidak mungkin diproses).
- Putuskan: dekripsi token di dalam callback `revoke` supaya kunci yang berubah tidak memblokir pemutusan.
- Tes rute membisukan `console.info` dan memastikan `console.error` tidak menerima objek galat mentah.

## User Decisions
- Tidak ada.

## Passed / No Action Needed
- Path literal di `createFileRoute` tetap ditulis langsung (syarat plugin router TanStack); klien memakai `GOOGLE_DRIVE_API`.
- `GET /api/admin/google-drive` terdaftar sebagai `/api/admin/google-drive/` (rute index); konstanta tanpa garis miring
  akhir tetap cocok.
- Pemicu runner di rute hubungkan/coba-lagi/GET admin sengaja belum dipasang (section 08, runner dibuat section 07).
- `isDriveUuid` lokal (regex) dipakai alih-alih `isUuid` dari `#/lib/manual-arsip` agar rute admin tidak memuat modul arsip.
