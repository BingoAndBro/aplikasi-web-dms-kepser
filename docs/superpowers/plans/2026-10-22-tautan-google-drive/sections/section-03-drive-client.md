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
