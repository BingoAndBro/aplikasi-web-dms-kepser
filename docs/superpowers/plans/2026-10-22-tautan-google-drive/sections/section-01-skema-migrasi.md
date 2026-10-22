# Section 01: Skema, Migrasi 0024, dan Konstanta Dasar

## Context

Belum ada kode fitur. Tautan Laporan sudah punya akses `LOGIN`/`PUBLIK` (migrasi 0022/0023). Migrasi repo
ini ditulis tangan dan didaftarkan manual di `drizzle/meta/_journal.json` (keputusan P2; `pnpm db:local:generate`
tidak dipakai karena snapshot meta hanya sampai 0000).

## Objective

Bentuk data lengkap fitur Drive ada di skema Drizzle dan di database lewat migrasi 0024, dengan constraint
yang menjadi jaring pengaman balapan. Tidak ada perilaku aplikasi yang berubah; Zod tautan **belum**
menerima `DRIVE`.

## Prerequisites
- Section(s) yang harus selesai dulu: none
- Files/modules yang harus sudah tersedia: none
- Lingkungan: ikuti "Persiapan lingkungan tes" di `index.md` (pnpm install, PostgreSQL, DB `dms_kepser_test`).
  Jalankan langkah `drizzle-kit migrate` **setelah** SQL 0024 ditulis.

## Implementation Steps

1. Baca skill `db-fsm-guard` (§4 skema & migrasi) sebelum menulis.
2. `src/db/schema/app/google-drive-akun.ts` (baru):
   - `GOOGLE_DRIVE_AKUN_STATUS_VALUES = ['AKTIF', 'NONAKTIF', 'DIPUTUS'] as const` + tipe `GoogleDriveAkunStatus`.
   - Tabel `app.google_drive_akun`: `id uuid pk defaultRandom`, `email text not null`, `refresh_token_enc text`,
     `root_folder_id text`, `status text not null`, `perlu_hubung_ulang_sejak timestamptz`,
     `dihubungkan_oleh uuid not null` FK `auth.users` (no action), `dihubungkan_pada timestamptz not null default now()`,
     `dinonaktifkan_pada timestamptz`, `diputus_oleh uuid` FK users, `diputus_pada timestamptz`.
   - Index: `uniqueIndex('google_drive_akun_satu_aktif').on(t.status).where(sql\`${t.status} = 'AKTIF'\`)`,
     `uniqueIndex('google_drive_akun_email_belum_diputus').on(t.email).where(sql\`${t.status} <> 'DIPUTUS'\`)`,
     check `google_drive_akun_status_check`.
   - Ekspor `GoogleDriveAkun`, `NewGoogleDriveAkun`. Komentar singkat bahasa Indonesia (gaya file skema lain).
3. `src/db/schema/app/laporan-tautan.ts` (ubah):
   - `LAPORAN_TAUTAN_AKSES_VALUES = ['LOGIN', 'PUBLIK', 'DRIVE']`; komentar akses diperbarui (DRIVE = salinan di Google Drive,
     token DMS tidak bisa dipakai).
   - `LAPORAN_TAUTAN_DRIVE_STATUS_VALUES = ['MENUNGGU','MENGUNGGAH','SIAP','GAGAL','MENGHAPUS','DIHAPUS']` + tipe.
   - Tipe `LaporanTautanDriveDilewati = { label: string; alasan: string }`.
   - Kolom: `driveAkunId` (`drive_akun_id`, FK `googleDriveAkun.id` `onDelete: 'restrict'`), `driveFolderId`,
     `driveFolderUrl`, `driveStatus` (`$type<…>()`), `driveDaftarIsiFileId`, `driveFolderDicobaPada` (timestamptz),
     `driveDokumenDilewati` (jsonb `$type<LaporanTautanDriveDilewati[]>()` not null default `'[]'::jsonb`).
   - Check akses diperbarui; check `laporan_tautan_drive_check`:
     `(akses = 'DRIVE') = (drive_akun_id IS NOT NULL AND drive_status IS NOT NULL)`; check `laporan_tautan_drive_status_check`
     (`drive_status IS NULL OR drive_status IN (…)`). Index `idx_laporan_tautan_drive_akun` pada `drive_akun_id`.
   - Hindari impor melingkar: `google-drive-akun.ts` tidak mengimpor `laporan-tautan.ts`.
4. `src/db/schema/app/laporan-tautan-drive-file.ts` (baru): konstanta sumber, status, keterangan hapus
   (`DICABUT`, `DIMUSNAHKAN`, `DIBERSIHKAN`, `DIHAPUS_PEMILIK`). Kolom: `id`, `tautan_id` (FK laporan_tautan no action, not null),
   `sumber`, `dokumen_id uuid`, `lampiran_index integer`, `manual_arsip_id uuid`, `attachment_id uuid` (keempatnya **tanpa FK**),
   `kunci_lampiran text not null`, `nama_file text not null`, `label_dokumen text not null`, `urutan integer not null`,
   `content_type text not null`, `drive_file_id text`, `status text not null default 'MENUNGGU'`, `keterangan_hapus text`,
   `dicoba_pada`, `diunggah_pada`, `dihapus_pada` (timestamptz). Unique `laporan_tautan_drive_file_kunci_unique (tautan_id, kunci_lampiran)`;
   index `(dokumen_id)`, `(manual_arsip_id)`, `(tautan_id, status)`; check sumber, status, keterangan, dan
   konsistensi sumber (`DOKUMEN` ⇒ `dokumen_id` & `lampiran_index` not null; `MANUAL_ARSIP` ⇒ `manual_arsip_id` & `attachment_id` not null).
5. `src/db/schema/app/drive-job.ts` (baru): `DRIVE_JOB_JENIS_VALUES = ['SINKRON_TAUTAN','HAPUS_TAUTAN','HAPUS_FILE']`,
   `DRIVE_JOB_STATUS_VALUES = ['MENUNGGU','PROSES','SELESAI','GAGAL','DIBATALKAN']`,
   `DRIVE_GALAT_KATEGORI_VALUES = ['SEMENTARA','TOKEN_TIDAK_VALID','KUOTA_PENUH','TIDAK_DITEMUKAN','PERMANEN','AKUN_DIPUTUS']`.
   Kolom SPEC 6.4 (`prioritas integer not null`, `percobaan integer not null default 0`, `jadwal_berikut timestamptz not null default now()`,
   `dikunci_pada`, `galat_kategori`, `galat_pesan`, `dibuat_pada not null default now()`, `selesai_pada`). FK `akun_id` (restrict),
   `tautan_id` (no action). Index `idx_drive_job_antrean (status, prioritas, jadwal_berikut)`, `idx_drive_job_tautan (tautan_id)`,
   unique partial `drive_job_satu_menunggu (tautan_id, jenis) WHERE status = 'MENUNGGU'`. Check jenis, status, kategori.
6. `src/db/schema/app/index.ts`: ekspor tiga file baru.
7. `src/db/schema/audit/audit-log.ts`: tambah `GOOGLE_DRIVE_AKUN`, `LAPORAN_TAUTAN` ke entity type; enam aksi SPEC 6.5
   (`DRIVE_AKUN_DIHUBUNGKAN`, `DRIVE_AKUN_DINONAKTIFKAN`, `DRIVE_AKUN_DIPUTUS`, `DRIVE_TAUTAN_SIAP`, `DRIVE_TAUTAN_DIHAPUS`,
   `DRIVE_FILE_DIHAPUS`) beserta komentar kanonik; perbarui string kedua check.
8. `drizzle/0024_google_drive_tautan.sql` (tulis tangan, idempoten, gaya 0022/0023):
   komentar kepala → `CREATE TABLE IF NOT EXISTS` tiga tabel (urutan: akun, ubah tautan, file, job) → FK lewat blok
   `DO $$ … IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = …) … $$` → `ALTER TABLE app.laporan_tautan ADD COLUMN IF NOT EXISTS …`
   → `ALTER TABLE … DROP CONSTRAINT IF EXISTS laporan_tautan_akses_check` lalu tambah ulang → check baru → index
   (`CREATE [UNIQUE] INDEX IF NOT EXISTS … WHERE …`) → `ALTER TABLE audit.audit_log DROP CONSTRAINT IF EXISTS …` + tambah ulang.
   Pisahkan pernyataan dengan `--> statement-breakpoint`. Nama constraint/index **sama persis** dengan skema Drizzle.
9. `drizzle/meta/_journal.json`: entri `{ idx: 24, version: "7", when: 1790748234780, tag: "0024_google_drive_tautan", breakpoints: true }`
   (`when` = entri 23 + 86 400 000).
10. `src/lib/laporan/tautan-shared.ts`: `TAUTAN_AKSES.DRIVE = 'DRIVE'`, `TAUTAN_AKSES_LABEL.DRIVE = 'Google Drive'`.
    **Jangan** ubah `src/lib/schemas/tautan.ts` (tetap `LOGIN`/`PUBLIK`).
11. Terapkan migrasi ke DB tes (`pnpm exec drizzle-kit migrate` dengan `DATABASE_URL` DB tes) dan baca ulang SQL yang
    diterapkan. Jangan menjalankan migrasi terhadap DB pengembangan/produksi dari sesi cloud.
12. Perbarui `tests/TEST-CLASSIFICATION.md` (file tes baru).

## Files to Create/Modify
- `src/db/schema/app/google-drive-akun.ts` — baru.
- `src/db/schema/app/laporan-tautan-drive-file.ts` — baru.
- `src/db/schema/app/drive-job.ts` — baru.
- `src/db/schema/app/laporan-tautan.ts` — akses DRIVE + kolom drive_* + check.
- `src/db/schema/app/index.ts` — ekspor.
- `src/db/schema/audit/audit-log.ts` — entity type & aksi.
- `drizzle/0024_google_drive_tautan.sql` — baru.
- `drizzle/meta/_journal.json` — entri idx 24.
- `src/lib/laporan/tautan-shared.ts` — `DRIVE` di `TAUTAN_AKSES` dan label.
- `tests/unit/db/google-drive-migration-source.test.ts` — baru (pola `username-migration-source.test.ts`).
- `tests/integration/google-drive-schema.test.ts` — baru (pola `manual-arsip-effective-status.test.ts`, transaksi rollback).
- `tests/TEST-CLASSIFICATION.md`.

## Test Stubs (dari TDD plan)

### Happy Path
- [ ] [S] Journal memuat idx 24 `0024_google_drive_tautan` dan berkas SQL-nya ada.
- [ ] [S] CHECK `laporan_tautan_akses_check` = `LAPORAN_TAUTAN_AKSES_VALUES`.
- [ ] [S] CHECK `audit_log_aksi_check`/`audit_log_entity_type_check` = konstanta audit.
- [ ] [S] CHECK status tiga tabel baru = konstanta skema.
- [ ] [I] Tabel dan kolom baru ada setelah migrasi.
- [ ] [I] Insert tautan `LOGIN` lama tetap berhasil; tautan `DRIVE` lengkap berhasil.

### Edge Cases
- [ ] [I] Dua akun `NONAKTIF` boleh; email sama boleh sekali `DIPUTUS` + sekali `AKTIF`.
- [ ] [I] Unique `(tautan_id, kunci_lampiran)` menolak kembar.
- [ ] [I] Dua job `MENUNGGU` `(tautan, jenis)` sama ditolak; `MENUNGGU` + `SELESAI` diterima.
- [ ] [I] Baris file dengan `dokumen_id` tak dikenal diterima (tanpa FK).

### Error Cases
- [ ] [I] Dua akun `AKTIF` → `23505`; dua akun belum diputus email sama → `23505`.
- [ ] [I] `DRIVE` tanpa `drive_akun_id` → `23514`; `LOGIN` dengan `drive_status` → `23514`.
- [ ] [I] Nilai akses/status di luar daftar → `23514`; `DOKUMEN` tanpa `lampiran_index` → `23514`.
- [ ] [U] `createTautanRequestSchema` masih menolak `akses: 'DRIVE'`.

## Perintah Tes

```bash
pnpm test tests/unit/db/google-drive-migration-source.test.ts tests/unit/db/username-migration-source.test.ts
pnpm test tests/unit/laporan
DATABASE_URL=postgresql://kepser:kepser_dev_password@localhost:5432/dms_kepser_test pnpm test:integration
pnpm typecheck
```

## Definition of Done
- [ ] Migrasi 0024 diterapkan bersih ke DB tes kosong **dan** ke DB tes yang sudah berisi 0000–0023 + seed (idempoten: menjalankan ulang SQL tidak galat).
- [ ] Skema Drizzle cocok dengan SQL (nama kolom, constraint, index).
- [ ] Semua test stubs di section ini sudah diimplementasi dan passing.
- [ ] `pnpm typecheck` bersih; tes `tests/unit/laporan` lama lulus.
- [ ] Tidak ada perubahan perilaku aplikasi (Zod tautan belum menerima `DRIVE`).

## Catatan Implementasi (deep-implement)

Status: **selesai**.

- File sesuai rencana. Tambahan di luar daftar: fixture `tautanRow()` di `tests/unit/laporan/tautan-service.test.ts`
  diberi tujuh kolom `drive_*` (tipe `LaporanTautan` bertambah; tanpa itu typecheck merah). Tidak ada asersi yang diubah.
- Nama constraint yang dipilih untuk check yang tidak dinamai plan: `laporan_tautan_drive_file_sumber_check`,
  `laporan_tautan_drive_file_status_check`, `laporan_tautan_drive_file_keterangan_hapus_check`,
  `laporan_tautan_drive_file_sumber_kolom_check`, `drive_job_jenis_check`, `drive_job_status_check`,
  `drive_job_galat_kategori_check`. Index file: `idx_laporan_tautan_drive_file_dokumen`, `…_manual_arsip`, `…_tautan_status`.
- `drive_job.status` tanpa default (plan tidak menyebutkannya; enqueue selalu mengisi).
- Tes static juga membandingkan CHECK di skema Drizzle (lewat `getTableConfig` + `PgDialect`) dengan konstanta, bukan hanya SQL;
  tes integrasi membandingkan kolom `information_schema` dan nama constraint/index `pg_constraint`/`pg_indexes` dengan Drizzle.
- Tes `createTautanRequestSchema` masih menolak `DRIVE` ditaruh di `google-drive-migration-source.test.ts`.
- Verifikasi migrasi: diterapkan ke DB tes berisi 0000–0023 + seed, ke DB kosong sementara (lalu di-drop), dan SQL 0024
  dijalankan ulang dengan `psql -v ON_ERROR_STOP=1` tanpa galat di keduanya.
- Hasil tes: `google-drive-migration-source` 18 lulus (+ `username-migration-source` 3), integrasi 31 lulus (22 baru),
  `tests/unit/laporan` + `tests/unit/db` 270 lulus, seluruh `pnpm test` 1326 lulus / 1 skip, `pnpm typecheck` bersih.
