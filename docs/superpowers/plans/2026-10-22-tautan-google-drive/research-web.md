# Riset Web — OAuth Desktop App, Drive API v3, dan Versi Paket

Tanggal: 2026-10-22. Cakupan dibatasi ke dokumentasi resmi Google dan registry npm.

**Catatan metode.** Kebijakan jaringan sandbox cloud menolak akses langsung ke
`developers.google.com` (WebFetch/curl gagal: host tidak terjangkau / tunnel 403). Fakta dokumentasi
diambil dari hasil pencarian yang dibatasi ke domain resmi `developers.google.com`, lalu
**diverifikasi silang** dengan berkas typings (`.d.ts`) dan kode paket resmi yang diunduh dari
registry npm (`@googleapis/drive@27.0.0`, `google-auth-library@11.3.1`, `googleapis-common@9.3.1`).
Fakta yang belum terverifikasi penuh ditandai **[VERIFIKASI SAAT IMPLEMENTASI]**.

---

## 1. OAuth 2.0 untuk "Desktop app" (installed app)

Sumber: [OAuth 2.0 for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app),
[OOB migration](https://developers.google.com/identity/protocols/oauth2/resources/oob-migration),
[Best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices),
[Using OAuth 2.0](https://developers.google.com/identity/protocols/oauth2),
[OAuth app state](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

### 1.1 Redirect loopback
- Client tipe Desktop memakai redirect loopback IP (`http://127.0.0.1:<port>` atau `localhost`). OOB
  sudah dihentikan; panduan migrasi mengarahkan ke loopback. Port: Google menerima port apa pun pada
  loopback untuk client Desktop (contoh resmi memakai port acak), jadi port tetap `53682` sah.
- Implikasi desain K6: tidak ada listener sungguhan; browser ADMIN akan gagal memuat
  `http://127.0.0.1:53682/?state=…&code=…` dan ADMIN menempel URL itu. Parser menerima host
  `127.0.0.1` atau `localhost` (dan menolak yang lain).
- `redirect_uri` yang dikirim saat tukar code **harus sama persis** dengan yang dipakai saat membuat
  URL login (termasuk garis miring akhir `/`).

### 1.2 PKCE
- Disarankan kuat untuk aplikasi desktop.
- `code_verifier`: 43–128 karakter dari `[A-Z] [a-z] [0-9] - . _ ~`.
- `code_challenge = BASE64URL(SHA256(code_verifier))` tanpa padding; **wajib** kirim
  `code_challenge_method=S256` — bila tidak dikirim, Google menganggap `plain`.
- `google-auth-library`: `OAuth2Client.generateCodeVerifierAsync()` → `{ codeVerifier, codeChallenge }`;
  `generateAuthUrl({ code_challenge, code_challenge_method: CodeChallengeMethod.S256, … })`;
  `getToken({ code, codeVerifier, redirect_uri })` (terverifikasi dari `oauth2client.d.ts`).

### 1.3 Parameter URL otorisasi
- `access_type=offline` (agar refresh token diberikan), `prompt=consent` (memaksa refresh token baru
  setiap kali dihubungkan, termasuk hubungkan ulang), `scope` = `https://www.googleapis.com/auth/drive.file openid email`,
  `state` (anti-CSRF, dicocokkan saat tempel), `response_type=code` (diisi library),
  `include_granted_scopes` tidak dipakai. `login_hint` opsional (bisa diisi email akun saat "Hubungkan ulang").
- Bila pengguna menolak: redirect berisi `error=access_denied` (dan `state`).

### 1.4 Penukaran code
- Endpoint token Google menerima `client_id`, `client_secret`, `code`, `code_verifier`, `grant_type=authorization_code`,
  `redirect_uri`. Untuk client Desktop, secret **bukan rahasia sungguhan** (public client) tetapi tetap
  dikirim; aplikasi tetap menyimpannya di env (invariant "rahasia hanya di env").
- Respons berisi `access_token`, `expires_in`, `refresh_token` (hanya bila offline + consent), `id_token`, `scope`.
- Periksa `scope` yang diberikan: pengguna bisa menghapus centang izin granular → bila `drive.file`
  tidak ada dalam `tokens.scope`, tolak dengan pesan jelas. **[VERIFIKASI SAAT IMPLEMENTASI]** perilaku
  granular consent untuk scope `drive.file` pada client Desktop.

### 1.5 Verifikasi `id_token` (email akun)
Sumber: [Verify the Google ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token),
[OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).
- `OAuth2Client.verifyIdToken({ idToken, audience: GOOGLE_OAUTH_CLIENT_ID })` memverifikasi tanda tangan
  (sertifikat Google, butuh koneksi keluar), `aud`, `exp`, `iss` (`accounts.google.com` /
  `https://accounts.google.com`).
- Ambil `payload.email` dan wajibkan `payload.email_verified === true`. `sub` adalah identitas stabil;
  spec memakai `email` sebagai kunci tampilan/unik — simpan juga `sub`? (tidak diminta spec; dicatat
  sebagai opsi, tidak dipakai).

### 1.6 Masa berlaku refresh token & `invalid_grant`
- Project berstatus **Testing** dengan user type External: refresh token kedaluwarsa **7 hari** (kecuali
  hanya scope identitas dasar) → `invalid_grant`.
- Token juga hangus bila: dicabut pengguna, tidak dipakai **6 bulan**, atau melebihi **100 refresh token
  per akun Google per client ID** (token tertua dicabut diam-diam). Implikasi: hubungkan ulang berkali-kali
  saat uji tidak masalah (<100), dan setiap hubungkan ulang menggantikan token tersimpan.
- Status Testing dibatasi 100 test user.
- Penanganan: `invalid_grant` saat refresh → kategori `TOKEN_TIDAK_VALID`.

### 1.7 Pencabutan token
- `OAuth2Client.revokeToken(token)` → POST ke endpoint revoke Google (`https://oauth2.googleapis.com/revoke`).
  Dipakai *best effort* saat Putuskan (K5/7.2). Mencabut refresh token juga mematikan access token terkait.

## 2. Google Drive API v3

Sumber: [Upload file data](https://developers.google.com/workspace/drive/api/guides/manage-uploads),
[files.create](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/create),
[REST v3](https://developers.google.com/workspace/drive/api/reference/rest/v3),
[Share files](https://developers.google.com/drive/api/guides/manage-sharing),
[permissions](https://developers.google.com/workspace/drive/api/reference/rest/v3/permissions),
[Resolve errors](https://developers.google.com/workspace/drive/api/guides/handle-errors),
[Usage limits](https://developers.google.com/workspace/drive/api/guides/limits).

### 2.1 Scope `drive.file`
- Aplikasi hanya bisa melihat/mengubah file yang **dibuat atau dibuka** oleh aplikasi itu. Folder `DMS Kepser`,
  folder tautan, dan file unggahan semuanya dibuat aplikasi → cukup. Scope ini termasuk non-sensitive
  (tidak butuh verifikasi Google untuk mode produksi; sesuai spec bagian 5).
- Konsekuensi: file yang dipindah/diunggah manual oleh manusia ke folder itu tidak terlihat oleh aplikasi;
  penghapusan folder hanya menghapus turunan **milik pengguna** (lihat 2.4).

### 2.2 Membuat folder
- `drive.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id' })`.
- Parent tidak ada / tidak bisa diakses → 404 `notFound` (dipakai untuk mendeteksi folder akar hilang).

### 2.3 Unggah file (multipart) dan perbarui isi
- `files.create` dengan `requestBody` + `media: { mimeType, body: ReadableStream }`: `googleapis-common`
  otomatis memakai `uploadType=multipart` (terverifikasi di `apirequest.js`: `params.uploadType = 'multipart'`
  bila ada `requestBody` dan `media`). Multipart cocok untuk file kecil yang bisa diunggah ulang utuh bila
  koneksi putus; semua lampiran DMS ≤ 5 MB (batas unggah DMS), jadi resumable tidak diperlukan.
  **[VERIFIKASI SAAT IMPLEMENTASI]** angka ambang 5 MB di panduan Google (hasil pencarian tidak memuat angkanya);
  tidak berpengaruh karena lampiran DMS memang ≤ 5 MB.
- `files.update({ fileId, media: { mimeType: 'text/plain', body } })` mengganti isi (dipakai untuk `DAFTAR_ISI.txt`).
- Minta `fields: 'id'` (atau `id,webViewLink`) agar respons kecil.
- Unggahan **tidak idempoten**: bila respons hilang setelah server Google menerima file, percobaan ulang
  membuat salinan kedua. Mitigasi di rencana: `appProperties` berisi `dmsKunci` pada setiap file, dan
  sebelum mengunggah ulang file yang pernah "dicoba", handler mencari file dengan
  `files.list({ q: "'<folderId>' in parents and appProperties has { key='dmsKunci' and value='…' } and trashed=false" })`.
  (Kueri `appProperties has` didukung Drive v3; **[VERIFIKASI SAAT IMPLEMENTASI]** sintaks persis.)

### 2.4 Hapus permanen
- `files.delete({ fileId })` menghapus **permanen** file milik pengguna **tanpa** melewati Trash.
  Untuk folder: semua turunan milik pengguna ikut terhapus. Ini memenuhi K4 dengan satu panggilan untuk
  `HAPUS_TAUTAN`.
- File/folder sudah tidak ada → 404 `notFound` → dianggap berhasil (spec 11.2).

### 2.5 Izin "siapa saja yang memegang link"
- `drive.permissions.create({ fileId: folderId, requestBody: { type: 'anyone', role: 'reader' } })`.
  Tipe `anyone` tidak butuh field tambahan; tidak mengirim email notifikasi (opsi
  `sendNotificationEmail` hanya relevan untuk user/group).
- Izin pada folder diwarisi file di dalamnya. Karena K10, izin dipasang **setelah** semua file terunggah.
- `webViewLink` diambil dengan `files.get({ fileId, fields: 'webViewLink' })` (field `webViewLink` ada di
  `Schema$File`, terverifikasi di `v3.d.ts`).
- Membuat permission `anyone` bisa terkena `sharingRateLimitExceeded` (403) → perlakukan `SEMENTARA`.

### 2.6 Galat dan klasifikasi
Bentuk galat JSON: `{ "error": { "code": 403, "message": "...", "errors": [{ "domain": "...", "reason": "...", "message": "..." }] } }`.
Di Node, `googleapis-common` melempar `GaxiosError` dengan `status` / `response.status`,
`response.data.error.errors[0].reason`, dan untuk kegagalan jaringan `code` (`ECONNRESET`, `ETIMEDOUT`,
`ENOTFOUND`, `EAI_AGAIN`, `ECONNREFUSED`). Refresh token ditolak → respons token endpoint
`{ error: 'invalid_grant' }` (HTTP 400) yang dibungkus `GaxiosError`.

| Kondisi | Status/reason | Kategori DMS |
|---|---|---|
| Kuota penyimpanan penuh | 403 `storageQuotaExceeded` | `KUOTA_PENUH` (jangan retry) |
| Rate limit per pengguna | 403 `userRateLimitExceeded` | `SEMENTARA` |
| Rate limit project | 403 `rateLimitExceeded` / 429 | `SEMENTARA` |
| Batas berbagi | 403 `sharingRateLimitExceeded` | `SEMENTARA` |
| Batas harian | 403 `dailyLimitExceeded` | `SEMENTARA` (jeda panjang) |
| Backend | 500/502/503/504 `backendError` | `SEMENTARA` |
| Tidak ditemukan | 404 `notFound` | `TIDAK_DITEMUKAN` |
| Token akses tidak valid | 401 `authError` (setelah refresh) | `TOKEN_TIDAK_VALID` |
| Refresh token ditolak | 400 `invalid_grant` | `TOKEN_TIDAK_VALID` |
| Izin file kurang | 403 `insufficientFilePermissions` / `appNotAuthorizedToFile` | `PERMANEN` |
| Jaringan | tanpa status, `code` jaringan / timeout | `SEMENTARA` |
| 400 lain | `badRequest`, `invalid` | `PERMANEN` |

Google menyarankan exponential backoff untuk 429/403-rate-limit/5xx. Jadwal backoff job spec
(1 m → 24 j, 8 percobaan) sudah lebih konservatif.

### 2.7 Retry bawaan library
- `googleapis-common` mengatur `retry: true` secara bawaan (gaxios: hingga 3 kali untuk metode idempoten
  pada 5xx/429). Supaya perilaku deterministik dan antrean yang menentukan jeda, `DriveClient` membuat
  instance dengan `retry: false` dan `timeout` eksplisit (mis. 60 detik).

## 3. Versi paket

Diperiksa di registry npm pada 2026-10-22.

| Paket | Versi terbaru | `engines.node` | Format | Catatan |
|---|---|---|---|---|
| `@googleapis/drive` | **27.0.0** (2026-10-20) | `>=22.0.0` | CJS (`main: build/index.js`, `types`) | dependensi `googleapis-common ^9.0.0` |
| `googleapis-common` | 9.3.1 | `>=22` | CJS | 9.0.2+ bergantung `google-auth-library ^11.0.0` |
| `google-auth-library` | **11.3.1** (2026-10-15) | `>=22` | CJS (`main: build/src/index.js`) | ekspor `OAuth2Client`, `CodeChallengeMethod` |

Jalur kompatibel Node 20 (bila server satker masih Node 20):

| Paket | Versi | `engines.node` |
|---|---|---|
| `@googleapis/drive` | 22.0.0 (versi terakhir di `googleapis-common ^8`) | `>=12` (efektif ≥18 via common 8) |
| `google-auth-library` | 10.9.1 | `>=18` |

Kedua paket CommonJS dengan typings; impor bernama dari modul ESM proyek (`import { drive } from '@googleapis/drive'`,
`import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library'`) didukung Node lewat interop CJS dan oleh
Vite/Nitro. Agar hanya ada satu salinan `google-auth-library`, versi langsung proyek harus satu major dengan yang
dipakai `googleapis-common` (11.x untuk drive 27; 10.x untuk drive 22).
**[VERIFIKASI SAAT IMPLEMENTASI]** `pnpm build` membundel/menandai eksternal kedua paket dengan benar (Nitro);
bila bermasalah, tambahkan ke `rollupConfig.external` seperti `pg-native`.
Pemilihan jalur ditentukan di interview (versi Node server satker).
