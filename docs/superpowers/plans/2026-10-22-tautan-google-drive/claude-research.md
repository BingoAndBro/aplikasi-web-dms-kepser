# Ringkasan Riset — Tautan Google Drive

Gabungan `research-codebase.md` (fakta kode) dan `research-web.md` (dokumentasi resmi + registry npm).
Bagian ini hanya memuat temuan yang **mengubah atau mempertajam** rencana; detail dan sumber ada di dua
berkas tersebut.

## A. Temuan yang memengaruhi desain

| # | Temuan | Dampak pada rencana |
|---|---|---|
| R1 | Migrasi 0001–0023 ditulis tangan + journal manual; `drizzle/meta` hanya punya snapshot 0000 | `pnpm db:local:generate` tidak dipakai; tulis `drizzle/0024_google_drive_tautan.sql` + entri journal, lalu `pnpm db:local:migrate`; static guard migrasi |
| R2 | `transitionBerkasArchiveStatus` tidak transaksional (update status + activity terpisah) | Section hook pemusnahan membungkusnya dengan `runInRepositoryTransaction` dan menambah metode repository opsional untuk enqueue Drive |
| R3 | `revokeTautanByCreator` dan `insertTautan` tanpa transaksi / tanpa parameter `tx` | Tambah varian transaksional; alur `LOGIN`/`PUBLIK` tetap berperilaku sama |
| R4 | `applyCleanup` pembersihan sudah membuka transaksi | Hook Drive cukup ditambahkan di dalamnya |
| R5 | Helper ZIP tidak membawa indeks lampiran / id attachment; teks daftar isi privat | Tambah field opsional `kunci` pada `DocumentZipFileInput` dan ekspor pembentuk teks daftar isi berparameter judul |
| R6 | `inferContentType` privat | Ekspor untuk dipakai unggahan Drive |
| R7 | Pintu pembuka tautan: `resolveActiveTautan` (+`requireTautanViewer`) dan `findTautanById` di `handleTautanLampiranRequest` | Dua titik itu menolak `akses='DRIVE'` → 404 |
| R8 | Halaman Pengaturan memaksa logout setiap simpan | Bagian Drive dibuat komponen terpisah dengan alur sendiri (tanpa epoch/logout) |
| R9 | Hapus permanen dokumen non-material tidak disebut spec | Diputuskan di interview |
| R10 | Tidak ada hook startup server | Runner hanya hidup lewat pemicu request + `pnpm drive:sync`; sesuai spec 8.3 |
| R11 | `googleapis-common` retry bawaan aktif | `DriveClient` memakai `retry: false` + timeout eksplisit |
| R12 | Unggahan multipart tidak idempoten bila respons hilang | Diputuskan di interview (mitigasi `appProperties` atau terima risiko) |
| R13 | Paket terbaru (`@googleapis/drive` 27.0.0, `google-auth-library` 11.3.1) butuh Node ≥ 22; jalur Node 20: 22.0.0 + 10.9.1 | Diputuskan di interview |
| R14 | `SKIP LOCKED` hanya terbukti dengan dua koneksi + data ter-commit | Tes integrasi klaim memakai dua `PoolClient` dan pembersihan eksplisit |
| R15 | ERD skripsi belum memuat `laporan_tautan` | Section dokumentasi menambah `laporan_tautan` + tiga tabel baru |
| R16 | Sandbox cloud tidak bisa menjangkau Google | Uji terima manual (spec 12.3) dikerjakan di mesin lokal; tes otomatis memakai FakeDrive |

## B. API pihak ketiga yang dipakai (terverifikasi dari typings)

- `google-auth-library`: `new OAuth2Client({ clientId, clientSecret, redirectUri })`,
  `generateCodeVerifierAsync()`, `generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope, state,
  code_challenge, code_challenge_method: CodeChallengeMethod.S256 })`, `getToken({ code, codeVerifier, redirect_uri })`,
  `verifyIdToken({ idToken, audience })`, `setCredentials({ refresh_token })`, `revokeToken(token)`.
- `@googleapis/drive`: `drive({ version: 'v3', auth, retry: false, timeout })` lalu `files.create`
  (folder / multipart), `files.update` (media), `files.get` (`fields: 'webViewLink'`), `files.delete`
  (permanen), `files.list` (cari per `appProperties`), `permissions.create` (`anyone`/`reader`).

## C. Hal yang belum terverifikasi (ditandai di rencana)

- Sintaks persis kueri `appProperties has { key=… and value=… }` (bila mitigasi R12 dipilih).
- Perilaku consent granular untuk `drive.file` (pengguna bisa tidak mencentang) → cek `tokens.scope`.
- Bundling Nitro untuk kedua paket CJS.
