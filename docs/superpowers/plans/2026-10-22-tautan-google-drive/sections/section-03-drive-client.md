# Section 03: Paket Google, Klasifikasi Galat, DriveClient, FakeDrive

## Context

Section 01–02 selesai: skema, `config.ts` (konstanta OAuth/Drive), `token-crypto.ts` (`TokenCryptoError`), `shared.ts`
(pesan galat per kategori). Belum ada paket Google terpasang.

## Objective

Satu-satunya pintu ke Google Drive (`DriveClient`) dengan galat yang selalu terklasifikasi, plus `FakeDrive`
in-memory untuk semua tes berikutnya.

## Prerequisites
- Section(s) yang harus selesai dulu: 02
- Files/modules yang harus sudah tersedia: `config.ts`, `token-crypto.ts`, `shared.ts`, konstanta kategori galat (section 01)

## Implementation Steps

1. Pasang paket (disetujui pemilik; versi persis, P1):
   `pnpm add @googleapis/drive@27.0.0 google-auth-library@11.3.1`.
   Periksa `pnpm-lock.yaml`: hanya satu versi `google-auth-library` (11.x) yang terpasang. Jangan menambah paket lain.
2. `src/lib/google-drive/drive-errors.ts`:
   - `class DriveApiError extends Error { readonly kategori: DriveGalatKategori; readonly pesan: string }` —
     `message` = `pesan` (tanpa data mentah).
   - `classifyDriveError(error: unknown): DriveApiError`. Urutan: sudah `DriveApiError` → kembalikan;
     `TokenCryptoError` → `TOKEN_TIDAK_VALID`; baca aman (optional chaining, cek tipe) `status ?? response?.status`,
     `reason = response?.data?.error?.errors?.[0]?.reason`, `oauthError = typeof response?.data?.error === 'string'`,
     `code` jaringan. Pemetaan:
     - `oauthError === 'invalid_grant'` atau status 401 → `TOKEN_TIDAK_VALID`;
     - 403 `storageQuotaExceeded` → `KUOTA_PENUH`;
     - 403 `userRateLimitExceeded|rateLimitExceeded|sharingRateLimitExceeded|dailyLimitExceeded`, 408, 429, ≥ 500 → `SEMENTARA`;
     - 404 → `TIDAK_DITEMUKAN`;
     - `code` ∈ {`ECONNRESET`,`ETIMEDOUT`,`ECONNREFUSED`,`ENOTFOUND`,`EAI_AGAIN`,`ECONNABORTED`,`EPIPE`} atau nama `AbortError`/timeout → `SEMENTARA`;
     - 400/403 lain → `PERMANEN`; selain itu → `PERMANEN`.
     Pesan dari `DRIVE_PESAN_GALAT`.
   - `isDriveNotFound(err)`.
3. `src/lib/google-drive/drive-client.ts`:
   - Interface `DriveClient` (lihat `claude-plan.md` Step 3) dengan tipe `DriveAppProperties = Record<string, string>`
     dan `body: NodeJS.ReadableStream | Readable | string`.
   - `createGoogleDriveClient({ refreshToken, config, deps? }): DriveClient`: `new OAuth2Client({ clientId, clientSecret, redirectUri })`,
     `setCredentials({ refresh_token })`, `drive({ version: 'v3', auth, retry: false, timeout: DRIVE_HTTP_TIMEOUT_MS })`.
     `deps.driveFactory` dan `deps.oauthClientFactory` opsional untuk tes (tanpa jaringan).
   - Setiap metode: `try { … } catch (err) { throw classifyDriveError(err) }`.
     - `createFolder` → `files.create({ requestBody: { name, mimeType: folder, parents: parentId ? [parentId] : undefined, appProperties }, fields: 'id' })`.
     - `fileExists(id)` → `files.get({ fileId: id, fields: 'id, trashed' })`; 404 → `false`; `trashed: true` → `false`.
     - `findChildByAppProperty({ parentId, key, value })` → validasi `key`/`value`/`parentId` cocok `^[A-Za-z0-9:_-]+$`
       (tolak lainnya dengan `PERMANEN`), `files.list({ q, fields: 'files(id)', pageSize: 1, spaces: 'drive' })`;
       kembalikan id pertama atau `null`. **Verifikasi sintaks `appProperties has { key='k' and value='v' }` saat implementasi.**
     - `uploadFile` → `files.create({ requestBody: { name, parents: [parentId], appProperties }, media: { mimeType, body }, fields: 'id' })`.
     - `updateFileContent` → `files.update({ fileId, media: { mimeType, body } })`.
     - `shareAnyoneReader` → `permissions.create({ fileId, requestBody: { type: 'anyone', role: 'reader' } })`.
     - `getWebViewLink` → `files.get({ fileId, fields: 'webViewLink' })`; kosong → `PERMANEN`.
     - `deleteFile` → `files.delete({ fileId })`.
     - `revokeToken` → `oauthClient.revokeToken(refreshToken)`.
   - Tidak ada `console.*` di modul ini.
4. `tests/unit/google-drive/helpers/fake-drive.ts`:
   - Kelas `FakeDrive implements DriveClient` dengan `objects: Map<string, FakeDriveObject>`, id berurutan (`fake-1`…),
     `calls: Array<{ method, args }>`, `revoked: boolean`.
   - `failNext(method, kategori, opts?: { simpanObjek?: boolean })` dan `failWhen(predicate)`; `deleteObject(id)`
     (simulasi hapus manual) dan `listChildren(parentId)`. Folder yang dihapus ikut menghapus turunan.
   - Membaca `body` stream ke string agar tes bisa memeriksa isi `DAFTAR_ISI.txt`.
   - `parentId` yang tidak ada → lempar `DriveApiError('TIDAK_DITEMUKAN')`.
5. `tests/TEST-CLASSIFICATION.md`.

## Files to Create/Modify
- `package.json`, `pnpm-lock.yaml` — dua paket baru.
- `src/lib/google-drive/drive-errors.ts`, `src/lib/google-drive/drive-client.ts` — baru.
- `tests/unit/google-drive/helpers/fake-drive.ts` — baru.
- `tests/unit/google-drive/drive-errors.test.ts`, `drive-client.test.ts`, `fake-drive.test.ts` — baru.
- `tests/TEST-CLASSIFICATION.md`.

## Test Stubs (dari TDD plan)

### Happy Path
- [ ] 403 `storageQuotaExceeded` → `KUOTA_PENUH` "Kuota Google Drive penuh".
- [ ] 403 rate-limit (tiga reason), 429, 500, 503 → `SEMENTARA`; 404 → `TIDAK_DITEMUKAN`.
- [ ] `invalid_grant`, 401 → `TOKEN_TIDAK_VALID`; galat jaringan → `SEMENTARA`; `TokenCryptoError` → `TOKEN_TIDAK_VALID`.
- [ ] Client (drive di-mock) membuat folder dengan mimeType folder + parents + appProperties + `fields: 'id'`; instance `retry: false` + timeout.
- [ ] `uploadFile` mengirim `requestBody` + `media`; `shareAnyoneReader` mengirim anyone/reader.

### Edge Cases
- [ ] 403 reason tak dikenal → `PERMANEN`; non-Error/`undefined` → `PERMANEN`.
- [ ] `fileExists` → `false` untuk 404 dan `trashed`; melempar untuk kategori lain.
- [ ] `findChildByAppProperty` menolak `'` / `\` sebelum memanggil API.

### Error Cases
- [ ] Pesan/`message` galat tidak memuat isi `response.data` (uji dengan respons berisi string token palsu).
- [ ] FakeDrive `failNext('uploadFile', 'SEMENTARA', { simpanObjek: true })` menyimpan objek lalu melempar.

## Perintah Tes

```bash
pnpm test tests/unit/google-drive
pnpm typecheck
```

## Definition of Done
- [ ] Paket terpasang dengan versi persis; lockfile hanya berisi satu major `google-auth-library`.
- [ ] Tidak ada impor `@googleapis/drive`/`google-auth-library` di luar `drive-client.ts` (dan `oauth.ts` di section 05).
- [ ] Semua test stubs di section ini sudah diimplementasi dan passing.
- [ ] `pnpm typecheck` bersih; tidak ada regresi.

## Catatan Implementasi (deep-implement)

Status: **selesai**.

- Paket: `@googleapis/drive@27.0.0` dan `google-auth-library@11.3.1` (versi persis). Lockfile hanya berisi satu
  `google-auth-library` (11.3.1; dipakai juga oleh `googleapis-common@9.3.1`). Diff lockfile murni penambahan
  (baris `libc:` yang dihapus pnpm VM dikembalikan); `pnpm install --frozen-lockfile` lulus. `@googleapis/drive`
  mensyaratkan Node ≥ 22 (VM: 22.22.0).
- Interface `DriveClient` sesuai plan, ditambah tipe `DriveUploadBody` dan `GoogleDriveClientDeps`.
  `updateFileContent`/`shareAnyoneReader` meminta `fields: 'id'`. Sukses tanpa `id` → `PERMANEN`.
- `classifyDriveError`: kode jaringan dicari di rantai `cause`/`error` (maks. 4 tingkat), juga `code`/`name`
  `AbortError`/`TimeoutError`; hanya bila tidak ada status HTTP.
- Tes: `drive-errors` 29, `drive-client` 20, `fake-drive` 8 (total `tests/unit/google-drive` 93). Seluruh `pnpm test`
  1419 lulus / 1 skip; `pnpm typecheck` bersih.

### Verifikasi saat implementasi

1. **Sintaks `appProperties has` — terverifikasi** dari dokumentasi resmi Drive API v3 ("Search for files and folders",
   developers.google.com/workspace/drive/api/guides/search-files): contoh
   `appProperties has { key='additionalID' and value='8e8aceg2af2ge72e78' }`. Escape petik di string kueri memakai `\'`;
   dokumentasi tidak mengatur backslash, jadi keduanya ditolak sebelum memanggil API (sesuai plan). Kueri yang dipakai:
   `'<parentId>' in parents and appProperties has { key='<k>' and value='<v>' } and trashed = false`.
2. **Bundling Nitro paket CJS Google — terverifikasi** dengan rute API sementara (`src/routes/api/zz-drive-probe.ts`,
   dihapus lagi; `routeTree.gen.ts` dikembalikan, tidak ada yang di-commit): `pnpm build` sukses, paket Google dibundel
   ke chunk server (tidak dieksternalkan ke `.output/server/node_modules`), server hasil build (`node .output/server/index.mjs`)
   membuat client dengan dependensi asli dan `fileExists` mencapai Google lalu galatnya terklasifikasi
   (`DriveApiError`, `TOKEN_TIDAK_VALID` untuk kredensial palsu). Catatan: jaringan VM ternyata bisa mencapai Google lewat proxy.
3. Isi `tokens.scope` pada consent granular: di luar cakupan section ini (section 05, `oauth.ts`).
