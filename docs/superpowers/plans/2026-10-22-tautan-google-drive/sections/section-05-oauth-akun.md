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

## Catatan Implementasi (deep-implement)

Status: **selesai**.

- File sesuai rencana: `oauth.ts`, `akun-repository.ts`, `availability.ts`, `akun-connect.ts`; tes `oauth.test.ts` (29),
  `availability.test.ts` (5), `akun-connect.test.ts` (9), integrasi `google-drive-akun.test.ts` (17).
- Signature aktual:
  - `mulaiHubung({ sessionId, mode, akunId?, loginHint?, now, deps: { config, createOAuthClient? } })`,
    `ambilState({ state, sessionId, now })` → `{ mode, akunId, codeVerifier }`, `tukarCode({ code, codeVerifier, deps })`.
    Konstanta ekspor `OAUTH_STATE_TTL_MS`, `OAUTH_STATE_MAKS_ENTRI`; tipe `OAuthClientLike`, `OAuthDeps`.
  - Repository menerima `executor?` (bukan `tx`), tipe `AkunExecutor` (`db`, transaksi Drizzle → savepoint, atau
    `drizzle(poolClient)`); semua fungsi baca memakai objek opsi `{ executor? }`.
  - `putuskanAkun({ akunId, actorUserId, now, revoke: (() => Promise<void>) | null })` → `{ id, email, jumlah_tautan_aktif }`.
  - `hubungkanDariAlamat({ alamat, session: { sessionId, userId }, now, deps: { config, createOAuthClient?, driveClientForToken?, repo? } })`
    → `{ id, email, status }`.
- **Penyimpangan / tambahan (dicatat juga di `code-reviews/section-05-review.md`):**
  1. Fungsi baca baru `cariAkunBelumDiputus(email)` (dipakai `akun-connect` untuk memilih folder akar yang dipakai ulang).
  2. Galat repository berbentuk `AkunDriveError { kode }` dengan kode `EMAIL_BERBEDA`, `AKUN_BERUBAH` (409),
     `AKUN_TIDAK_DITEMUKAN` (404), `AKUN_SUDAH_DIPUTUS` (409). Plan hanya menyebut dua yang pertama.
  3. Pesan untuk kode yang tidak ditulis plan: `STATE_SESI_BERBEDA` "Alamat ini dibuat dari sesi login lain — ulangi dari
     langkah 1.", `EMAIL_TIDAK_TERVERIFIKASI` "Email akun Google belum terverifikasi — gunakan akun lain.",
     `PENUKARAN_GAGAL` "Google tidak dapat memverifikasi login — ulangi dari langkah 1." (dipakai juga untuk id_token
     kosong / verifikasi gagal / `getToken` ditolak atau jaringan putus).
  4. `ambilState` dengan sesi berbeda **tidak** menghabiskan state (percobaan dari sesi lain tidak menggagalkan alur ADMIN
     pemiliknya); state yang tidak ada/kedaluwarsa dihapus.
  5. `hubungkanDariAlamat` mode `HUBUNGKAN_ULANG` memeriksa email = akun target **sebelum** menyentuh Drive (supaya tidak
     membuat folder akar di akun yang salah); `simpanAkunTerhubung` tetap memeriksa ulang di transaksi. Akun target hilang
     atau `DIPUTUS` → `AKUN_BERUBAH`.
  6. `muatRingkasanAdmin` daftar "perlu dihapus manual" hanya memuat job `HAPUS_*` `GAGAL` yang masih relevan: satu entri
     terbaru per (tautan, jenis), tanpa job kembar `MENUNGGU`/`PROSES`, `HAPUS_TAUTAN` hanya bila tautan belum `DIHAPUS`,
     `HAPUS_FILE` hanya bila masih ada file `MENGHAPUS`. Alasan: job lama yang sudah tertangani tidak boleh menumpuk di
     daftar ADMIN. `perlu_hubung_ulang` di ringkasan juga `true` bila token kosong.
  7. HUBUNGKAN/GANTI dan HUBUNGKAN_ULANG memperbarui juga `dihubungkan_oleh/pada`; GANTI ke akun NONAKTIF mengosongkan
     `dinonaktifkan_pada`.

### Verifikasi `tokens.scope` pada consent granular

- **Terverifikasi dari sumber, belum dari login nyata.** `google-auth-library@11.3.1` `getTokenAsync` mengembalikan
  `res.data` endpoint token apa adanya (`tokens.scope` tidak diolah). Dokumentasi resmi "OAuth 2.0 for iOS & Desktop Apps"
  (developers.google.com/identity/protocols/oauth2/native-app) mendefinisikan `scope` sebagai "The scopes of access
  granted by the access_token", meminta aplikasi memeriksa field itu, dan menyatakan bahwa pengguna bisa tidak memberikan
  semua scope yang diminta (consent granular berlaku untuk aplikasi terpasang). Endpoint token Google terjangkau dari VM
  (uji dengan client palsu → `401 invalid_client`), tetapi tanpa client ID nyata dan login sungguhan respons granular tidak
  bisa dibuktikan.
- Implementasi defensif: `scope` dipecah per spasi dan harus memuat **persis** `https://www.googleapis.com/auth/drive.file`;
  `scope` kosong atau tidak dikirim → `IZIN_DRIVE_TIDAK_DIBERIKAN`. Pemeriksaan dilakukan sebelum verifikasi `id_token`.
- **Perlu uji terima manual di lokal** (section 12): hubungkan akun dengan centang izin Drive dilepas → harus muncul
  "Izin akses Google Drive tidak dicentang — ulangi dan centang izin Drive." dan tidak ada akun tersimpan; ulangi dengan
  centang lengkap → berhasil.

- Uji mutasi integrasi: membuang pemetaan 23505 → tes "dua ADMIN bersamaan" merah; membalik urutan (aktifkan target dulu,
  nonaktifkan sesudahnya) → dua tes ganti akun merah. Kode asli dikembalikan.
- Hasil tes: `tests/unit/google-drive` 149 lulus; seluruh `pnpm test` 1475 lulus / 1 skip (baseline 1432 / 1 skip);
  integrasi 69 lulus (baseline 52), tanpa data uji tertinggal; `pnpm typecheck` bersih.
