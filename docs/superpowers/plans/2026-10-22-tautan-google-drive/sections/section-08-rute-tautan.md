# Section 08: Rute Tautan — Buat DRIVE, Riwayat, Coba Lagi, 404 Pembuka, Pemicu Runner

## Context

Section 01–07 selesai: runner dan handler sinkron teruji dengan FakeDrive; rute admin dan status ada. Zod tautan masih
menolak `DRIVE`.

## Objective

Pengguna (lewat API) bisa membuat tautan `DRIVE`, memantau progres di riwayat, dan mencoba lagi bila gagal. Tautan
`DRIVE` tidak pernah bisa dibuka lewat jalur DMS. Runner dipicu dari semua rute pemicu SPEC 8.3.

## Prerequisites
- Section(s) yang harus selesai dulu: 06, 07
- Files/modules yang harus sudah tersedia: `availability.ts`, `rencana-file.ts`, `jobs.ts` (`enqueueDriveJob`), `runner.ts`
  (`triggerDriveRunner`), `GOOGLE_DRIVE_API`/`TAUTAN_API`

## Implementation Steps

1. `src/lib/schemas/tautan.ts`: `akses: z.enum(['LOGIN','PUBLIK','DRIVE']).default('LOGIN')`.
2. `src/lib/laporan/tautan-shared.ts`: `TautanListItem.path: string | null`; field baru `drive_status`, `drive_progres`,
   `drive_url`, `drive_galat`, `drive_tertunda_akun` (null/false untuk non-DRIVE); `TautanCreateResponse.path: string | null`,
   `drive_status: LaporanTautanDriveStatus | null`. Klien di `BagikanTautan.tsx` diperbarui minimal agar typecheck lulus
   (tampilan lengkap di section 10): jangan render `TautanUrlField` bila `path` null.
3. `src/lib/laporan/tautan.ts`:
   - `createTautanForSession`: cabang `DRIVE` (lihat `claude-plan.md` Step 8); hasil menyertakan `driveStatus`.
   - `toTautanListItem(tautan, ringkasanDrive?)`.
   - `resolveActiveTautan`: setelah tautan ditemukan, `akses === 'DRIVE'` → 404 `TAUTAN_NOT_FOUND_MESSAGE` (sebelum cek dicabut).
   - `handleTautanLampiranRequest`: `tautan.akses === 'DRIVE'` → `notFound()` setelah verifikasi tanda tangan (respons identik).
4. `src/lib/laporan/tautan-repository.ts`: `insertTautanDrive({ tautan, files, akunId, now })` dalam `db.transaction`
   (insert tautan → insert baris file batch → `enqueueDriveJob(tx, SINKRON_TAUTAN)`); `loadDriveRingkasanByTautanIds(ids)`
   (agregat per tautan: total, selesai = `TERUNGGAH`+`DILEWATI`, galat job sinkron `GAGAL` terbaru, akun perlu hubung ulang).
5. `src/routes/api/laporan/tautan.ts`: GET menggabungkan ringkasan Drive dan memanggil `triggerDriveRunner()`; POST
   memetakan galat ketersediaan ke 409, log `console.info` menambah `akses` saja, memicu runner setelah sukses DRIVE.
6. `src/routes/api/laporan/tautan.$id.coba-lagi.ts` (baru): same-origin → sesi (401) → `isUuid` (404) → transaksi bersyarat
   (`cobaLagiTautanDrive({ tautanId, userId, now })` di `tautan-drive-repository.ts`) → 404 bila bukan pembuat/tidak ada/dicabut/bukan DRIVE,
   409 "Tautan tidak dalam keadaan gagal" bila status lain → picu runner → `{ success: true }`.
7. Pemicu runner di rute admin (section 06): `GET /api/admin/google-drive`, `POST …/hubungkan` (setelah sukses),
   `POST …/coba-lagi-penghapusan`.
8. Regenerasi `src/routeTree.gen.ts` lewat `pnpm build`.
9. Tes: perluas `tests/unit/laporan/tautan-route.test.ts` dan `tautan-service.test.ts` (mock modul Drive), buat
   `tests/unit/laporan/tautan-drive-route.test.ts` (coba lagi + 404 pembuka untuk semua rute `/api/tautan/$token/*` dan `/lampiran/*`).
10. `tests/TEST-CLASSIFICATION.md`.

## Files to Create/Modify
- `src/lib/schemas/tautan.ts`, `src/lib/laporan/{tautan,tautan-repository,tautan-shared}.ts`.
- `src/lib/google-drive/tautan-drive-repository.ts` — `cobaLagiTautanDrive`.
- `src/routes/api/laporan/tautan.ts`, `src/routes/api/laporan/tautan.$id.coba-lagi.ts` (baru).
- `src/routes/api/admin/google-drive/{index,hubungkan,coba-lagi-penghapusan}.ts` — pemicu runner.
- `src/components/laporan/BagikanTautan.tsx` — penyesuaian tipe minimal.
- `src/routeTree.gen.ts` — dibuat ulang otomatis.
- Tes di atas + `tests/TEST-CLASSIFICATION.md`.

## Test Stubs (dari TDD plan)

### Happy Path
- [ ] POST `akses: 'DRIVE'` (tersedia) → 201, `drive_status: 'MENUNGGU'`, `path: null`, runner dipicu.
- [ ] Insert tautan + baris file + job dalam satu transaksi.
- [ ] GET riwayat mengembalikan lima field Drive dengan aturan `drive_url` (hanya `SIAP` & belum dicabut); memicu runner.
- [ ] Coba lagi oleh pembuat pada `GAGAL` → 200; job `MENUNGGU`, `percobaan 0`.

### Edge Cases
- [ ] Tautan `LOGIN`/`PUBLIK` tidak berubah (tes lama lulus).
- [ ] Penyaringan snapshot DRIVE sama dengan tautan biasa (`jumlah_diabaikan`).
- [ ] Coba lagi pada `SIAP` → 409.

### Error Cases
- [ ] DRIVE tanpa akun aktif → 409 + pesan; juga `BELUM_DIKONFIGURASI`, `PERLU_HUBUNG_ULANG`.
- [ ] Coba lagi: bukan pembuat → 404; dicabut → 404; id bukan uuid → 404; tanpa sesi → 401; beda origin → 403.
- [ ] `/api/tautan/<token>` (dan preview/download/export-zip/manual) untuk DRIVE → 404.
- [ ] `/lampiran/...` untuk DRIVE → 404 halaman galat.
- [ ] > 500 dokumen → 413 sebelum menyentuh Drive.

## Perintah Tes

```bash
pnpm test tests/unit/laporan tests/unit/google-drive
pnpm build        # regenerasi routeTree.gen.ts
pnpm typecheck
DATABASE_URL=postgresql://kepser:kepser_dev_password@localhost:5432/dms_kepser_test pnpm test:integration
```

## Definition of Done
- [ ] Tautan DRIVE bisa dibuat lewat API dan diproses runner (diuji dengan FakeDrive/mocks).
- [ ] Tidak ada jalur DMS yang membuka tautan DRIVE.
- [ ] Semua test stubs di section ini sudah diimplementasi dan passing.
- [ ] `pnpm typecheck` bersih; tes tautan lama lulus.
