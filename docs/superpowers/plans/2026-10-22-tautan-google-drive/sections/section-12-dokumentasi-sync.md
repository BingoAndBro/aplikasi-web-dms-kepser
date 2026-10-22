# Section 12: Dokumentasi, `.env.example`, Skrip `drive:sync`, Checklist Uji Terima

## Context

Section 01–11 selesai: fitur lengkap dan teruji otomatis. Belum ada dokumentasi pemasangan, skrip penjadwal, atau
catatan arsitektur di AGENTS.md/ERD.

## Objective

Fitur bisa dipasang dan dioperasikan orang lain (atau sesi AI lain) tanpa membaca percakapan perancangan, dan siap
diuji terima manual sesuai SPEC 12.3.

## Prerequisites
- Section(s) yang harus selesai dulu: 01–11
- Files/modules yang harus sudah tersedia: `runner.ts` (`runDriveRunnerOnce`)

## Implementation Steps

1. `src/scripts/drive-sync.ts` meniru `src/scripts/sweep-pending-uploads.ts`: komentar kepala (untuk Windows Task Scheduler;
   server sudah menjalankan runner otomatis saat dipicu), `runDriveRunnerOnce()`, cetak ringkasan angka saja
   ("Job diproses: x. Selesai: y. Gagal: z. Dijeda: w."), env tidak lengkap → pesan "Google Drive belum dikonfigurasi" dan exit 0,
   galat sistem → `exitCode = 1`, `pool.end()` di `finally`.
2. `package.json` scripts: `"drive:sync": "dotenv -e .env -- tsx src/scripts/drive-sync.ts"` (perubahan `package.json` diizinkan:
   bagian dari spec 13 yang disetujui).
3. `.env.example`: blok baru setelah `DMS_PUBLIC_BASE_URL`:
   ```
   # GOOGLE DRIVE (opsional) — fitur "Bagikan Tautan" tujuan Google Drive.
   # Butuh Node.js 22+. Kosongkan untuk mematikan fitur (pilihan Drive tampil nonaktif).
   # Buat OAuth client ID tipe "Desktop app" di Google Cloud Console (Drive API aktif).
   # GOOGLE_OAUTH_CLIENT_ID=
   # GOOGLE_OAUTH_CLIENT_SECRET=
   # Kunci enkripsi refresh token: 32 byte acak base64. Buat dengan:
   #   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   # Mengganti kunci ini membuat akun Drive perlu dihubungkan ulang.
   # DMS_DRIVE_TOKEN_KEY=
   ```
   Jangan menyentuh `.env`.
4. `AGENTS.md`:
   - §1 Stack: baris "Integrasi: Google Drive API v3 (opsional, koneksi keluar saja)".
   - Bagian baru "Google Drive (Tautan Laporan)": tabel `google_drive_akun`, `laporan_tautan_drive_file`, `drive_job`; status
     (`drive_status`, status file, status job, status akun); pemicu hapus empat jalur; runner (pemicu + `pnpm drive:sync`);
     batasan (link masih bisa dibuka sampai job hapus berhasil; mode Testing OAuth 7 hari; state OAuth di memori).
   - §4.8 catatan: migrasi 0001–0024 ditulis tangan; `db:local:generate` belum bisa dipakai sampai snapshot meta diperbaiki.
   - §5 batas beban: lampiran ke Drive ≤ 5 MB (mengikuti batas unggah).
   - §6 peta kode: `src/lib/google-drive/` dan rute baru.
   - §11 batasan diketahui: tambahan terkait Drive.
5. `docs/skripsi/rancangan-erd.md`: inventaris tabel (+ `laporan_tautan` bila belum, + tiga tabel baru), relasi baru
   (akun → tautan, akun → job, tautan → file, tautan → job, users → akun), constraint di §6 (partial unique, check DRIVE, unique kunci,
   unique job menunggu). Jangan mengubah bagian verifikasi historis; tambahkan subbagian bertanggal.
6. `docs/superpowers/plans/2026-10-22-tautan-google-drive/uji-terima-manual.md`: persiapan Google Cloud (SPEC 5), pengisian env lokal,
   langkah SPEC 12.3 (1–6) sebagai checklist dengan kolom hasil, ditambah: (7) tanpa env → kartu Drive nonaktif; (8) hapus permanen
   dokumen non-material → file hilang dan `DAFTAR_ISI.txt` diperbarui; (9) `pnpm drive:sync` saat server mati memproses antrean.
7. `tests/TEST-CLASSIFICATION.md`: verifikasi semua file tes baru dari section 01–11 tercatat; perbarui jumlah total file.
8. Gerbang global (index.md): `pnpm typecheck`, `pnpm test`, `pnpm test:integration` (DB tes), `pnpm build`.

## Files to Create/Modify
- `src/scripts/drive-sync.ts` — baru.
- `package.json` — script `drive:sync`.
- `.env.example`.
- `AGENTS.md`.
- `docs/skripsi/rancangan-erd.md`.
- `docs/superpowers/plans/2026-10-22-tautan-google-drive/uji-terima-manual.md` — baru.
- `tests/unit/google-drive/drive-sync-script-source.test.ts` — baru.
- `tests/TEST-CLASSIFICATION.md`.

## Test Stubs (dari TDD plan)

### Happy Path
- [ ] `package.json` memuat `drive:sync` → `dotenv -e .env -- tsx src/scripts/drive-sync.ts`.
- [ ] `.env.example` memuat tiga variabel tanpa nilai rahasia.

### Edge Cases
- [ ] Skrip menutup `pool` di `finally`; `exitCode = 1` bila galat sistem.

### Error Cases
- [ ] Skrip tidak mencetak token/email.
- [ ] Seluruh suite hijau; checklist uji terima tersedia.

## Perintah Tes

```bash
pnpm test tests/unit/google-drive/drive-sync-script-source.test.ts
pnpm typecheck
pnpm test
DATABASE_URL=postgresql://kepser:kepser_dev_password@localhost:5432/dms_kepser_test pnpm test:integration
pnpm build
```

## Definition of Done
- [ ] Dokumentasi memungkinkan pemasangan dari nol (Google Cloud → env → hubungkan akun → buat tautan).
- [ ] Gerbang global hijau.
- [ ] Uji terima manual SPEC 12.3 **dijadwalkan** di mesin lokal (tidak bisa di sandbox cloud karena Google diblokir); hasilnya
      dicatat di `uji-terima-manual.md` sebelum fitur dinyatakan selesai (SPEC 14).
- [ ] Semua test stubs di section ini sudah diimplementasi dan passing.

## Implementasi Aktual (deep-implement, sesi D)

- File: `src/scripts/drive-sync.ts` (baru), `package.json` (skrip `drive:sync`), `.env.example` (blok Google Drive setelah
  `DMS_PUBLIC_BASE_URL`), `AGENTS.md`, `docs/skripsi/rancangan-erd.md` (§10 baru), `uji-terima-manual.md` (baru),
  `tests/unit/google-drive/drive-sync-script-source.test.ts` (baru), `tests/TEST-CLASSIFICATION.md`.
- AGENTS.md: §1 baris Integrasi; §3 subbagian Tautan Laporan; **§3A baru "Google Drive"** (tabel + status, akses tautan
  DRIVE, empat pemicu hapus yang kini mengantrekan hapus Drive di transaksi yang sama, `transitionBerkasArchiveStatus` kini
  transaksional, runner + `pnpm drive:sync`, alur akun ADMIN); §4.8 catatan migrasi tulis tangan; §5 batas Drive; §6 peta
  kode; §7 aturan hapus file → antrekan hapus Drive; §11 batasan Drive (termasuk dua batasan sesi C dan verifikasi
  `tokens.scope` yang masih manual).
- **Penyimpangan / tambahan (dicatat juga di `code-reviews/section-12-review.md`):**
  1. Skrip mencetak penyebab galat saja (bukan pesan Drizzle yang memuat SQL + parameter) dan menambah catatan bila batas
     waktu putaran tercapai.
  2. Checklist uji terima menambah 1a (verifikasi `tokens.scope` dengan centang Drive dilepas), 5a (akun diputus/berganti
     di antara dialog dibuka dan tautan dibuat), dan 10 (uji visual UI section 10–11), selain 1–6 SPEC + 7–9 plan.
  3. ERD menambah empat tabel (termasuk `laporan_tautan` yang belum tercatat), relasi R-53–R-62 (R-61/R-62 logis karena
     snapshot), diagram Mermaid, dan constraint `audit_log` terkini.
  4. `TEST-CLASSIFICATION.md`: jumlah total diperbaiki (146 file unit; 13 file lama belum diklasifikasi, didaftar).
- Gerbang global: `pnpm typecheck` bersih; `pnpm test` 1715 lulus / 1 skip (146 file); `pnpm test:integration` 101 lulus;
  `pnpm build` sukses. Uji terima manual SPEC 12.3 **belum** dijalankan (butuh Google nyata di mesin lokal).
