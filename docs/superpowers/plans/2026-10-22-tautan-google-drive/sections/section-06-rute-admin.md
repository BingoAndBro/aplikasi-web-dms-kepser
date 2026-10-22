# Section 06: Rute ADMIN Google Drive dan Status Ketersediaan

## Context

Section 05 selesai: `oauth.ts`, `akun-repository.ts`, `availability.ts`, `akun-connect.ts`. Belum ada rute HTTP.
Runner belum ada (dibuat section 07); pemicu runner di rute ini ditambahkan di section 08.

## Objective

Enam endpoint SPEC 7.3 dengan pola keamanan repo (same-origin → sesi → peran → Zod → DB), konstanta path, dan tes
negatif lengkap.

## Prerequisites
- Section(s) yang harus selesai dulu: 05
- Files/modules yang harus sudah tersedia: modul akun/OAuth/ketersediaan; `ROLES` di `src/lib/constants/roles.ts`

## Implementation Steps

1. `src/lib/constants/routes.ts`: tambah
   `GOOGLE_DRIVE_API = { STATUS: '/api/google-drive/status', ADMIN: '/api/admin/google-drive',
   MULAI_HUBUNG: '/api/admin/google-drive/mulai-hubung', HUBUNGKAN: '/api/admin/google-drive/hubungkan',
   putuskan: (id: string) => \`/api/admin/google-drive/${encodeURIComponent(id)}/putuskan\`,
   COBA_LAGI_PENGHAPUSAN: '/api/admin/google-drive/coba-lagi-penghapusan' } as const` dan
   `TAUTAN_API = { cobaLagi: (id) => \`/api/laporan/tautan/${encodeURIComponent(id)}/coba-lagi\` }` (dipakai section 08/10).
2. `src/lib/schemas/google-drive.ts`: `mulaiHubungRequestSchema` (strict; `mode` enum; `akun_id` uuid opsional; `superRefine`
   wajib `akun_id` untuk `HUBUNGKAN_ULANG`), `hubungkanRequestSchema` (strict; `alamat` trim 1–2048),
   `putuskanRequestSchema` (strict; `konfirmasi: z.literal(true)`).
3. Helper bersama `src/lib/google-drive/admin-route.ts`: `requireDriveAdmin(request)` → `LocalServerSession | Response`
   (same-origin untuk POST, 401, 403 "Akses ditolak - hanya admin") dan `driveRouteError(error)` yang memetakan:
   `OAuthFlowError` → 400 (alamat, izin ditolak, izin Drive, tanpa refresh token, email tidak terverifikasi) / 409 (state,
   sesi berbeda); `EMAIL_BERBEDA`, `AKUN_BERUBAH` → 409; `DriveApiError` → 502 "Google Drive tidak dapat dihubungi, coba lagi"
   (`SEMENTARA`) / 400 (lainnya); sisanya 500 "Gagal memproses permintaan Google Drive". Log hanya
   `console.error('[admin/google-drive] <aksi> gagal', { kategori })`.
4. Rute (pola `createFileRoute('/api/…')({ server: { handlers: { … } } })`, `Cache-Control: no-store` untuk GET):
   - `src/routes/api/google-drive/status.ts` — GET; sesi apa pun (401 tanpa sesi); `toStatusResponse(await getDriveAvailability())`.
   - `src/routes/api/admin/google-drive/index.ts` — GET; `{ dikonfigurasi: isDriveConfigured(), ...muatRingkasanAdmin() }`.
   - `src/routes/api/admin/google-drive/mulai-hubung.ts` — POST; 409 bila belum dikonfigurasi; `HUBUNGKAN_ULANG` → akun target
     harus ada & belum `DIPUTUS` (404); `loginHint` = email akun target; respons `{ auth_url }`.
   - `src/routes/api/admin/google-drive/hubungkan.ts` — POST; `hubungkanDariAlamat`; respons ringkasan akun.
   - `src/routes/api/admin/google-drive/$id.putuskan.ts` (path `/api/admin/google-drive/$id/putuskan`) — POST; `isUuid` → 404;
     `putuskanAkun` dengan `revoke` = `createGoogleDriveClient(...).revokeToken` (bila token bisa didekripsi).
   - `src/routes/api/admin/google-drive/coba-lagi-penghapusan.ts` — POST; reset job `HAPUS_*` `GAGAL` non-`AKUN_DIPUTUS`
     (fungsi `resetFailedDeletionJobs({ now })` di `jobs.ts`); respons `{ jumlah }`.
5. Regenerasi `src/routeTree.gen.ts` lewat `pnpm build` (jangan edit manual). Periksa diff hanya menambah rute baru.
   Bila `pnpm build` gagal karena hal di luar section ini, catat dan gunakan `pnpm dev` sesaat untuk regenerasi.
6. Tes unit rute dengan dependency di-mock (pola `tests/unit/laporan/tautan-route.test.ts`): mock
   `#/lib/auth/local-server-auth`, modul akun/OAuth/ketersediaan.
7. `tests/TEST-CLASSIFICATION.md`.

## Files to Create/Modify
- `src/lib/constants/routes.ts` — konstanta API.
- `src/lib/schemas/google-drive.ts` — baru.
- `src/lib/google-drive/admin-route.ts` — baru.
- `src/lib/google-drive/jobs.ts` — tambah `resetFailedDeletionJobs`.
- `src/routes/api/google-drive/status.ts`, `src/routes/api/admin/google-drive/{index,mulai-hubung,hubungkan,$id.putuskan,coba-lagi-penghapusan}.ts` — baru.
- `src/routeTree.gen.ts` — dibuat ulang otomatis.
- `tests/unit/google-drive/status-route.test.ts`, `admin-routes.test.ts` — baru.
- `tests/TEST-CLASSIFICATION.md`.

## Test Stubs (dari TDD plan)

### Happy Path
- [ ] Status GET sesi PEGAWAI → 200 `{ tersedia, alasan }`.
- [ ] Admin GET → ringkasan + daftar perlu hapus manual.
- [ ] mulai-hubung → `{ auth_url }`; hubungkan → ringkasan akun; putuskan → 200; coba-lagi-penghapusan → `{ jumlah }`.

### Edge Cases
- [ ] Respons status tanpa `email`/`akunId`/token (cek JSON mentah).
- [ ] coba-lagi-penghapusan tidak mereset `AKUN_DIPUTUS`.
- [ ] Env tidak lengkap → POST 409; GET admin 200 `dikonfigurasi: false`.

### Error Cases
- [ ] Semua endpoint admin: 401 tanpa sesi; 403 PEGAWAI dan KEPALA_SUB_BAGIAN_UMUM.
- [ ] Semua POST: `Origin` beda → 403 sebelum sesi dibaca (mock sesi tidak dipanggil).
- [ ] Body tidak valid → 400; `$id` bukan uuid → 404; status tanpa sesi → 401.
- [ ] Galat tak terduga → 500 pesan umum; `console.error` tidak menerima objek galat mentah.

## Perintah Tes

```bash
pnpm test tests/unit/google-drive
pnpm build        # regenerasi routeTree.gen.ts
pnpm typecheck
```

## Definition of Done
- [ ] Enam endpoint aktif dengan pola keamanan lengkap; tidak ada string path ajaib di luar `routes.ts`.
- [ ] `src/routeTree.gen.ts` dibuat ulang oleh tool, bukan diedit tangan.
- [ ] Semua test stubs di section ini sudah diimplementasi dan passing.
- [ ] `pnpm typecheck` bersih; tidak ada regresi.

## Catatan Implementasi (deep-implement)

Status: **selesai**.

- File sesuai rencana: `routes.ts` (`GOOGLE_DRIVE_API`, `TAUTAN_API`), `schemas/google-drive.ts`, `admin-route.ts`,
  `jobs.ts` (`resetFailedDeletionJobs`), rute `api/google-drive/status.ts` dan
  `api/admin/google-drive/{index,mulai-hubung,hubungkan,$id.putuskan,coba-lagi-penghapusan}.ts`.
- `routeTree.gen.ts` dibuat ulang oleh `pnpm build` (sukses); diff murni penambahan enam rute, tanpa baris lama berubah.
- Helper di `admin-route.ts`: `requireDriveAdmin`, `requireDriveConfig` (409 `{ error, kode: 'BELUM_DIKONFIGURASI' }`),
  `parseDriveBody` (JSON rusak/Zod → 400 dengan pesan isu pertama), `driveRouteError(error, aksi)`, `isDriveUuid`, `NO_STORE`.
- Bentuk respons: mulai-hubung `{ auth_url }`; hubungkan `{ akun: { id, email, status } }`; putuskan
  `{ success: true, jumlah_tautan_aktif }`; coba-lagi-penghapusan `{ jumlah }`; galat `{ error, kode? }`.
- **Penyimpangan / tambahan (dicatat juga di `code-reviews/section-06-review.md`):**
  1. `AkunDriveError` `AKUN_TIDAK_DITEMUKAN` → 404 dan `AKUN_SUDAH_DIPUTUS` → 409 (kode tambahan dari section 05).
  2. `DriveApiError` non-`SEMENTARA` → 400 dengan pesan kategorinya (mis. "Kuota Google Drive penuh").
  3. `console.error('[admin/google-drive] <aksi> gagal', { kategori })` hanya untuk 500 (`kategori: 'TAK_TERDUGA'`) dan 502;
     galat 400/409 yang wajar tidak dicatat sebagai error.
  4. `resetFailedDeletionJobs` memakai aturan relevansi yang sama dengan daftar "perlu dihapus manual" (section 05
     penyimpangan 6): hanya job GAGAL terbaru per (tautan, jenis), tidak ada kembar `MENUNGGU`/`PROSES` (menghindari
     pelanggaran `drive_job_satu_menunggu`), akun belum `DIPUTUS`, folder belum `DIHAPUS` / masih ada file `MENGHAPUS`.
  5. Putuskan: `revoke` mendekripsi token di dalam callback, sehingga galat dekripsi ikut "best effort" (dicatat kategori
     `TOKEN_TIDAK_VALID` oleh `putuskanAkun`) dan tidak menggagalkan pemutusan. Akun tanpa token → `revoke: null`.
  6. `mulai-hubung` mode selain `HUBUNGKAN_ULANG` mengabaikan `akun_id` (tetap divalidasi uuid oleh Zod).
- Hasil tes: `status-route` 4, `admin-routes` 44, integrasi `resetFailedDeletionJobs` 2 baru. Seluruh `pnpm test` 1523 lulus /
  1 skip; integrasi 71 lulus; `pnpm typecheck` bersih; `pnpm build` sukses.
