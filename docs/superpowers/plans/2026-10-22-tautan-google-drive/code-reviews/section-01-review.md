# Code Review: Section 01 — Skema, Migrasi 0024, Konstanta Dasar

## Auto-fixes Applied
- Fixture `tautanRow()` di `tests/unit/laporan/tautan-service.test.ts` dilengkapi tujuh kolom `drive_*` (null / `[]`)
  karena tipe `LaporanTautan` bertambah kolom; tanpa itu `pnpm typecheck` merah. Tidak ada asersi yang diubah.
- Tes integrasi "akun AKTIF kedua" hanya menonaktifkan baris yang `AKTIF` (bukan semua baris) agar tidak
  memicu unique email untuk baris `DIPUTUS` bila DB tes sudah berisi data.
- `getName()` unique constraint bertipe `string | undefined`; diberi `!` di dua tes (typecheck).

## User Decisions
- Tidak ada.

## Passed / No Action Needed
- `drive_job.status` sengaja tanpa default (plan tidak menyebut default; `enqueueDriveJob` selalu mengisinya).
- Email huruf kecil tidak dipaksa di DB; normalisasi di `oauth.ts`/`akun-repository.ts` (section 05) sesuai plan.
- Kolom baru `laporan_tautan` tidak bocor ke respons API: `toTautanListItem` memetakan field secara eksplisit.
- Semua nama FK/index ≤ 63 karakter (diuji), jadi tidak ada pemotongan nama oleh PostgreSQL.
- Badge Riwayat Tautan (`BagikanTautan.tsx`) belum membedakan `DRIVE`; belum ada baris DRIVE sampai section 08,
  tampilan diurus section 10.
