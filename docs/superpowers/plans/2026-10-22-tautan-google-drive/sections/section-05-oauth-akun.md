# Section 05: OAuth Salin-Tempel, Repository Akun, Ketersediaan

## Context

Section 01–04 selesai: skema, config/token-crypto/shared, `DriveClient` + FakeDrive + klasifikasi galat, antrean job.
Belum ada rute. Alur hubungkan SPEC 7.1–7.2 dan keputusan K5, K6, K8, K9 berlaku.

## Objective

Logika server lengkap untuk menghubungkan, mengganti, menghubungkan ulang, dan memutus akun Google, beserta fungsi
ketersediaan yang dipakai status API dan pembuatan tautan. Semua teruji tanpa jaringan.

## Prerequisites
- Section(s) yang harus selesai dulu: 02, 03, 04
- Files/modules yang harus sudah tersedia: `config.ts`, `token-crypto.ts`, `shared.ts`, `drive-client.ts`, `drive-errors.ts`, `jobs.ts`

## Implementation Steps

1. `src/lib/google-drive/oauth.ts` (server-only; satu-satunya pemakai `google-auth-library` selain `drive-client.ts`):
   - `class OAuthFlowError extends Error { kode: 'ALAMAT_TIDAK_VALID' | 'STATE_KEDALUWARSA' | 'STATE_SESI_BERBEDA' | 'IZIN_DITOLAK'
     | 'TANPA_REFRESH_TOKEN' | 'IZIN_DRIVE_TIDAK_DIBERIKAN' | 'EMAIL_TIDAK_TERVERIFIKASI' | 'PENUKARAN_GAGAL' }` + pesan Indonesia:
     - alamat: "Alamat yang ditempel tidak dikenali. Salin seluruh alamat dari tab yang gagal dimuat (diawali http://127.0.0.1)."
     - state: "Sesi menghubungkan sudah kedaluwarsa — ulangi dari langkah 1."
     - ditolak: "Izin ditolak di halaman Google."
     - tanpa refresh token: "Google tidak mengirim refresh token — ulangi dari langkah 1."
     - izin Drive: "Izin akses Google Drive tidak dicentang — ulangi dan centang izin Drive."
   - Store memori + TTL 10 menit + batas 20 entri + `resetOAuthStoreForTest()`.
   - `mulaiHubung({ sessionId, mode, akunId, loginHint, now, deps })` → `{ authUrl }`.
   - `parsePastedAddress(text)` (murni).
   - `ambilState({ state, sessionId, now })` (sekali pakai).
   - `tukarCode({ code, codeVerifier, deps })` → `{ refreshToken, email }` (lihat `claude-plan.md` Step 5).
   - `deps.createOAuthClient(config)` diinjeksi; bawaan membuat `OAuth2Client` dengan redirect konstanta.
2. `src/lib/google-drive/akun-repository.ts` (server-only, transaksi + audit):
   - `simpanAkunTerhubung(...)`, `tandaiPerluHubungUlang(akunId, now)`, `putuskanAkun(...)`, `muatAkunUntukJob(akunId)`,
     `perbaruiRootFolder(akunId, folderId)`, `muatRingkasanAdmin()`, `muatAkunAktif()` — perilaku sesuai `claude-plan.md` Step 5.
   - Urutan update ganti akun: nonaktifkan akun `AKTIF` lama **dulu**, lalu aktifkan target (partial unique).
   - Tangkap `23505` dari partial unique → lempar galat terklasifikasi `AKUN_BERUBAH` (rute memetakan ke 409).
   - Semua audit: `entityType: 'GOOGLE_DRIVE_AKUN'`, `entityId: akun.id`, `metadataSnapshot` hanya `{ email, mode }` /
     `{ email, jumlah_tautan_aktif }` — **tanpa token**.
   - `muatRingkasanAdmin` menghitung jumlah tautan aktif dan job gagal per akun, serta daftar "perlu dihapus manual"
     (`nama_folder` dari `buildDriveFolderName(judul, created_at)`); tidak memuat nama file/dokumen.
3. `src/lib/google-drive/availability.ts`: `getDriveAvailability({ env?, loadAkunAktif? })` → `{ tersedia: true, alasan: null, akunId }`
   atau `{ tersedia: false, alasan }`. Fungsi `toStatusResponse(av)` membuang `akunId`.
4. `src/lib/google-drive/akun-connect.ts` (orkestrasi yang dipanggil rute `hubungkan`, di luar transaksi DB):
   `hubungkanDariAlamat({ alamat, session, now, deps })` → parse → `ambilState` → bila `kind: 'error'` → `IZIN_DITOLAK` →
   `tukarCode` → tentukan baris yang dipakai ulang (email belum `DIPUTUS`) → pastikan folder akar (`fileExists` root lama, atau
   `createFolder('DMS Kepser', { dmsJenis: 'AKAR' })` via `DriveClient` dari refresh token baru) → `encryptRefreshToken` →
   `simpanAkunTerhubung`. Kembalikan ringkasan akun.
5. Tes unit memakai repo/klien Google palsu; tes integrasi `tests/integration/google-drive-akun.test.ts` menguji transaksi
   ganti akun, hubungkan ulang, dan putus pada DB asli (rollback).
6. `tests/TEST-CLASSIFICATION.md`.

## Files to Create/Modify
- `src/lib/google-drive/oauth.ts`, `akun-repository.ts`, `availability.ts`, `akun-connect.ts` — baru.
- `tests/unit/google-drive/oauth.test.ts`, `akun-connect.test.ts`, `availability.test.ts` — baru.
- `tests/integration/google-drive-akun.test.ts` — baru.
- `tests/TEST-CLASSIFICATION.md`.

## Test Stubs (dari TDD plan)

### Happy Path
- [ ] URL login memuat offline, consent, scope K8, S256, redirect konstanta, state.
- [ ] `parsePastedAddress` menerima `127.0.0.1` dan `localhost` dengan `state` + `code`.
- [ ] `tukarCode` (mock) → refresh token + email huruf kecil.
- [ ] [I] Hubungkan pertama → satu akun `AKTIF` + audit `DRIVE_AKUN_DIHUBUNGKAN`.
- [ ] [I] Ganti akun atomik: lama `NONAKTIF`, baru `AKTIF`, dua audit.
- [ ] Ketersediaan `tersedia: true` untuk konfigurasi + akun sehat.

### Edge Cases
- [ ] `HUBUNGKAN_ULANG` email sama → token baru, status tetap, `perlu_hubung_ulang_sejak` kosong, job dijadwalkan `now`.
- [ ] `GANTI` ke email `NONAKTIF` → baris itu `AKTIF`, tanpa baris baru.
- [ ] Email pernah `DIPUTUS` → baris baru; folder akar baru.
- [ ] Root lama masih ada → dipakai ulang; root lama 404 → dibuat baru.
- [ ] Store state membuang entri tertua (>20) dan yang kedaluwarsa.
- [ ] [I] `putuskanAkun` → token null, `DIPUTUS`, job `MENUNGGU` `GAGAL AKUN_DIPUTUS`, tautan `MENUNGGU/MENGUNGGAH` `GAGAL`, audit; galat revoke diabaikan.
- [ ] Ketersediaan: `BELUM_DIKONFIGURASI`, `BELUM_ADA_AKUN`, `PERLU_HUBUNG_ULANG`.

### Error Cases
- [ ] State tak dikenal/kedaluwarsa → `STATE_KEDALUWARSA`; sesi lain → `STATE_SESI_BERBEDA`; state sekali pakai.
- [ ] `error=access_denied` → `IZIN_DITOLAK`.
- [ ] Host bukan loopback, `https:`, `javascript:`, teks acak, tanpa `state` → `ALAMAT_TIDAK_VALID`.
- [ ] Tanpa refresh token / scope tanpa `drive.file` / email tidak terverifikasi → galat masing-masing.
- [ ] `HUBUNGKAN_ULANG` email berbeda → `EMAIL_BERBEDA`.
- [ ] [I] Dua akun menjadi `AKTIF` bersamaan → `AKUN_BERUBAH` (23505 dipetakan).
- [ ] Pesan galat tidak memuat `code`, token, atau respons Google.

## Perintah Tes

```bash
pnpm test tests/unit/google-drive
DATABASE_URL=postgresql://kepser:kepser_dev_password@localhost:5432/dms_kepser_test pnpm test:integration
pnpm typecheck
```

## Definition of Done
- [ ] Alur hubungkan/ganti/hubungkan ulang/putus sesuai SPEC 7.1–7.2 terbukti lewat tes.
- [ ] Refresh token hanya tersimpan terenkripsi; tidak ada token di audit/log.
- [ ] Semua test stubs di section ini sudah diimplementasi dan passing.
- [ ] `pnpm typecheck` bersih; tidak ada regresi.
