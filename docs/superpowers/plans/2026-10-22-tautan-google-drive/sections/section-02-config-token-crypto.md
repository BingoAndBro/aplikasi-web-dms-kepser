# Section 02: Konfigurasi, Enkripsi Token, Konstanta Bersama

## Context

Section 01 selesai: konstanta status (`GOOGLE_DRIVE_AKUN_STATUS_VALUES`, `LAPORAN_TAUTAN_DRIVE_STATUS_VALUES`,
`DRIVE_GALAT_KATEGORI_VALUES`, dll.) tersedia di `src/db/schema/app/*`. Belum ada modul `src/lib/google-drive/`.

## Objective

Modul murni (tanpa DB, tanpa jaringan) untuk membaca env Drive dengan aman, mengenkripsi/mendekripsi refresh
token (K9), dan konstanta/tipe/pesan yang dipakai bersama server dan klien.

## Prerequisites
- Section(s) yang harus selesai dulu: 01
- Files/modules yang harus sudah tersedia: konstanta skema dari section 01

## Implementation Steps

1. `src/lib/google-drive/config.ts` (server-only; komentar kepala "Server-only module"):
   - `type DriveConfig = { clientId: string; clientSecret: string; tokenKey: Buffer }`.
   - `readDriveConfig(env: NodeJS.ProcessEnv = process.env): { ok: true; config: DriveConfig } | { ok: false }`.
     Syarat: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (trim, tidak kosong), `DMS_DRIVE_TOKEN_KEY`
     (trim, base64 standar atau base64url, terdekode **tepat 32 byte**). Tidak pernah melempar, tidak mencetak nilai.
   - `isDriveConfigured(env?)`.
   - Konstanta: `GOOGLE_OAUTH_REDIRECT_URI = 'http://127.0.0.1:53682/'`,
     `GOOGLE_OAUTH_SCOPES = ['https://www.googleapis.com/auth/drive.file', 'openid', 'email']`,
     `GOOGLE_DRIVE_FILE_SCOPE`, `DRIVE_ROOT_FOLDER_NAME = 'DMS Kepser'`, `DRIVE_HTTP_TIMEOUT_MS = 60_000`,
     `DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'`, `DRIVE_MAX_FILE_BYTES = 5 * 1024 * 1024`
     (impor dari kebijakan unggah bila ada konstanta yang sama: `DOCUMENT_UPLOAD_MAX_BYTES`).
2. `src/lib/google-drive/token-crypto.ts` (server-only):
   - `class TokenCryptoError extends Error { kode: 'FORMAT_TIDAK_DIKENAL' | 'DEKRIPSI_GAGAL' }` dengan pesan umum.
   - `encryptRefreshToken(plain: string, key: Buffer): string` → `v1:<iv>:<tag>:<data>`, semua bagian base64url,
     IV 12 byte `randomBytes`, `createCipheriv('aes-256-gcm', key, iv)`, tag 16 byte.
   - `decryptRefreshToken(enc: string, key: Buffer): string`: validasi 4 bagian + awalan `v1`; panjang IV 12 dan tag 16;
     `setAuthTag`; galat apa pun dari `final()` → `DEKRIPSI_GAGAL`. Kunci bukan 32 byte → `DEKRIPSI_GAGAL`.
3. `src/lib/google-drive/shared.ts` (klien-aman: hanya impor tipe dari skema, seperti `tautan-shared.ts`):
   - `DRIVE_ALASAN_TIDAK_TERSEDIA = { BELUM_DIKONFIGURASI: 'Fitur Google Drive belum dikonfigurasi', BELUM_ADA_AKUN:
     'Belum ada akun Google Drive terhubung — hubungi Admin', PERLU_HUBUNG_ULANG: 'Akun Google Drive perlu dihubungkan ulang — hubungi Admin' }`.
   - `DRIVE_PERINGATAN_PUBLIK` = teks persis SPEC 10.1 (peringatan kuning).
   - `DRIVE_PESAN_GALAT: Record<DriveGalatKategori, string>` (mis. `KUOTA_PENUH: 'Kuota Google Drive penuh'`,
     `TIDAK_DITEMUKAN: 'Folder di Drive tidak ditemukan — cabut lalu buat tautan baru'`, `AKUN_DIPUTUS: 'Akun Google Drive diputus — hapus manual di Drive'`,
     `SEMENTARA: 'Gangguan sementara saat menghubungi Google Drive'`, `TOKEN_TIDAK_VALID: 'Akun Google Drive perlu dihubungkan ulang'`,
     `PERMANEN: 'Google Drive menolak permintaan'`).
   - Tipe respons API: `GoogleDriveStatusResponse { tersedia: boolean; alasan: DriveAlasan | null }`,
     `GoogleDriveAkunSummary { id, email, status, perlu_hubung_ulang: boolean, jumlah_tautan_aktif, jumlah_job_gagal }`,
     `PerluHapusManualItem { job_id, judul_tautan, nama_folder, email_akun, kategori, jumlah_file }`,
     `GoogleDriveAdminResponse { dikonfigurasi, akun_aktif: GoogleDriveAkunSummary | null, akun_lain: GoogleDriveAkunSummary[], perlu_hapus_manual: PerluHapusManualItem[] }`,
     `MulaiHubungMode = 'HUBUNGKAN' | 'GANTI' | 'HUBUNGKAN_ULANG'`.
   - `buildDriveFolderName(judul, createdAt)` → `<judul> (<YYYY-MM-DD>)` dengan tanggal zona `Asia/Jakarta`
     (`Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' })`), judul disanitasi dari `/ \ : * ? " < > |` dan
     dipotong 150 karakter (dipakai handler dan daftar ADMIN).
4. Perbarui `tests/TEST-CLASSIFICATION.md` (bagian baru "google-drive").

## Files to Create/Modify
- `src/lib/google-drive/config.ts` — baru.
- `src/lib/google-drive/token-crypto.ts` — baru.
- `src/lib/google-drive/shared.ts` — baru.
- `tests/unit/google-drive/config.test.ts`, `tests/unit/google-drive/token-crypto.test.ts`, `tests/unit/google-drive/shared.test.ts` — baru.
- `tests/TEST-CLASSIFICATION.md`.

## Test Stubs (dari TDD plan)

### Happy Path
- [ ] `readDriveConfig` dengan tiga env valid → `ok: true`, kunci 32 byte.
- [ ] Roundtrip encrypt/decrypt; format `v1:` 4 bagian base64url.
- [ ] Dua enkripsi token sama → ciphertext berbeda.
- [ ] `buildDriveFolderName('Laporan Okt', 2026-10-21T20:00Z)` → `Laporan Okt (2026-10-22)` (zona Jakarta).

### Edge Cases
- [ ] Env dengan spasi di-trim; kunci 31/33 byte → `ok: false`.
- [ ] Token panjang dengan `/ + =` roundtrip benar.
- [ ] Judul berisi `/` dan `:` disanitasi.

### Error Cases
- [ ] Env kosong → `ok: false` tanpa melempar.
- [ ] Ciphertext/tag diubah atau kunci beda → `DEKRIPSI_GAGAL`; awalan/bagian salah → `FORMAT_TIDAK_DIKENAL`.
- [ ] Pesan galat tidak memuat ciphertext, kunci, atau token.
- [ ] [S] `shared.ts` tidak mengimpor modul server (`#/db/client`, `node:`).

## Perintah Tes

```bash
pnpm test tests/unit/google-drive
pnpm typecheck
```

## Definition of Done
- [ ] Ketiga modul ada dan teruji; `shared.ts` aman diimpor klien.
- [ ] Semua test stubs di section ini sudah diimplementasi dan passing.
- [ ] `pnpm typecheck` bersih; tidak ada regresi section 01.

## Catatan Implementasi (deep-implement)

Status: **selesai**.

- File sesuai rencana. `config.ts` juga mengekspor tipe `DriveConfigResult`; `shared.ts` mengekspor ulang tipe
  `DriveGalatKategori` dan `GoogleDriveAkunStatus` (impor tipe saja) serta tipe `DriveAlasan`.
- Kunci env diterima bila cocok regex base64 standar atau base64url (padding opsional) **dan** terdekode tepat 32 byte.
- Sanitasi nama folder: karakter `/ \ : * ? " < > |` dan karakter kontrol diganti `-`, spasi beruntun dirapatkan,
  dipotong 150 code point; judul kosong memakai `Tautan Laporan`.
- Tipe nullable (penyimpangan kecil): `PerluHapusManualItem.kategori: DriveGalatKategori | null`,
  `jumlah_file: number | null` (null untuk `HAPUS_TAUTAN`).
- Label status Drive untuk UI (Step 2 `claude-plan.md`) belum dibuat; ditunda ke section 10.
- Hasil tes: `tests/unit/google-drive` 36 lulus (config 14, token-crypto 15, shared 7),
  `tests/unit/db` lulus, `pnpm typecheck` bersih.
