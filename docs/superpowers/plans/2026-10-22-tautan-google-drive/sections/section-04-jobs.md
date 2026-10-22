# Section 04: Antrean Job (`jobs.ts`)

## Context

Section 01 selesai (tabel `app.drive_job` dengan unique partial `drive_job_satu_menunggu`, index antrean, konstanta
jenis/status/kategori). Section 02–03 boleh belum selesai; modul ini hanya butuh DB dan konstanta.

## Objective

Operasi antrean yang aman terhadap konkurensi: enqueue di dalam transaksi pemanggil, klaim satu job dengan
`FOR UPDATE SKIP LOCKED`, selesai, gagal dengan jadwal jeda, tunda, dan jadwal berikutnya untuk timer runner.

## Prerequisites
- Section(s) yang harus selesai dulu: 01
- Files/modules yang harus sudah tersedia: skema `drive-job.ts`, `google-drive-akun.ts`; DB tes ter-migrasi (index.md)

## Implementation Steps

1. `src/lib/google-drive/jobs.ts` (server-only). Impor `db` secara malas (`await import('#/db/client')`) seperti
   `pembersihan-service.ts`, dan terima `executor` opsional agar unit test tidak butuh DB.
2. Konstanta: `DRIVE_JOB_PRIORITAS` (`HAPUS_TAUTAN`/`HAPUS_FILE` = 0, `SINKRON_TAUTAN` = 10),
   `DRIVE_JOB_JEDA_MS = [60_000, 300_000, 900_000, 3_600_000, 10_800_000, 21_600_000, 43_200_000, 86_400_000]`,
   `DRIVE_JOB_MAKS_PERCOBAAN_ULANG = 8`, `DRIVE_JOB_KUNCI_MACET_MS = 15 * 60_000`,
   `DRIVE_JOB_TUNDA_SINKRON_MS = 30_000`, `DRIVE_JOB_PESAN_MAKS = 200`.
3. Fungsi murni `computeRetrySchedule({ percobaan, now })` → `{ status: 'MENUNGGU', percobaan: n+1, jadwalBerikut }` atau
   `{ status: 'GAGAL', percobaan: n+1 }` bila `n+1 > 8` (D11).
4. `enqueueDriveJob(tx, { jenis, akunId, tautanId, now })`: insert dengan `onConflictDoUpdate({ target: [tautanId, jenis],
   targetWhere: sql\`status = 'MENUNGGU'\`, set: { jadwalBerikut: sql\`LEAST(${driveJob.jadwalBerikut}, excluded.jadwal_berikut)\` } })`.
   Kembalikan id job.
5. `claimNextDriveJob({ now, executor? })`: satu `UPDATE … WHERE id = (SELECT … FOR UPDATE OF j SKIP LOCKED LIMIT 1) RETURNING …`
   lewat `db.execute(sql\`…\`)` (lihat `claude-plan.md` Step 4). Parameter waktu dikirim sebagai nilai terikat
   (bukan `now()` SQL) agar tes deterministik. Petakan baris snake_case → objek `DriveJob` camelCase.
6. `completeDriveJob(id, { status: 'SELESAI' | 'DIBATALKAN', now, tx? })` — bersyarat `status = 'PROSES'`; isi `selesai_pada`,
   kosongkan `dikunci_pada`.
7. `failDriveJob(id, { kategori, pesan, now })` — bersyarat `PROSES`:
   - `SEMENTARA` → `computeRetrySchedule`;
   - `TOKEN_TIDAK_VALID` → `MENUNGGU`, `jadwal_berikut = now`, `percobaan` tetap;
   - lain → `GAGAL`, `selesai_pada = now`.
   Simpan `galat_kategori`, `galat_pesan` (dipotong 200). Kembalikan status akhir (`'MENUNGGU' | 'GAGAL'`) agar runner tahu
   apakah perlu menandai tautan `GAGAL`.
8. `deferDriveJob(id, { now, ms })` — `MENUNGGU`, `jadwal_berikut = now + ms`, `percobaan` tetap.
9. `nextScheduledAt({ now })` — `min(jadwal_berikut)` job `MENUNGGU` yang akunnya tidak `perlu_hubung_ulang`; `null` bila kosong.
10. `findActiveSinkronJob(tautanId, { now })` — job `SINKRON_TAUTAN` `PROSES` dengan `dikunci_pada >= now - 15m` (dipakai D13 di section 09).
11. `tests/integration/google-drive-jobs.test.ts`: fixture akun + tautan `DRIVE` (pakai user seed). Untuk tes biasa, jalankan
    di transaksi rollback dengan `executor = tx`. Untuk **dua klaim bersamaan**: buat data dengan `pool` lalu commit; buka dua
    `PoolClient`, `BEGIN` di keduanya, klaim di klien A (jangan commit), klaim di klien B → `null`; `ROLLBACK` keduanya; hapus
    data uji di `finally` (urutan: job → tautan → akun). Fungsi klaim perlu varian yang menerima `PoolClient`/executor mentah.
12. `tests/TEST-CLASSIFICATION.md`.

## Files to Create/Modify
- `src/lib/google-drive/jobs.ts` — baru.
- `tests/unit/google-drive/jobs.test.ts` — baru (fungsi murni).
- `tests/integration/google-drive-jobs.test.ts` — baru.
- `tests/TEST-CLASSIFICATION.md`.

## Test Stubs (dari TDD plan)

### Happy Path
- [ ] [U] Kegagalan ke-1..8 → jeda 1 m … 24 j.
- [ ] [I] Enqueue dalam transaksi → job `MENUNGGU` dengan prioritas sesuai jenis.
- [ ] [I] Klaim memilih `HAPUS_*` sebelum `SINKRON_TAUTAN`, lalu `jadwal_berikut` terlama.
- [ ] [I] `completeDriveJob` → `SELESAI` + `selesai_pada`.

### Edge Cases
- [ ] [U] Kegagalan ke-9 → `GAGAL`.
- [ ] [I] Jadwal masa depan tidak diklaim; `nextScheduledAt` = waktu itu.
- [ ] [I] `PROSES` dikunci 16 menit lalu diklaim ulang; 14 menit tidak.
- [ ] [I] Akun `perlu_hubung_ulang_sejak` terisi → tidak diklaim.
- [ ] [I] Enqueue kedua `(tautan, jenis)` `MENUNGGU` → tidak ada baris baru, jadwal maju.
- [ ] [I] `TOKEN_TIDAK_VALID` → `MENUNGGU`, percobaan tetap; `deferDriveJob` → percobaan tetap.

### Error Cases
- [ ] [I] Dua klaim bersamaan dari dua koneksi → hanya satu mendapat job.
- [ ] [I] Selesai/gagal pada job bukan `PROSES` → tidak mengubah apa pun.
- [ ] [I] `KUOTA_PENUH` → `GAGAL` langsung; `galat_pesan` ≤ 200 karakter.

## Perintah Tes

```bash
pnpm test tests/unit/google-drive/jobs.test.ts
DATABASE_URL=postgresql://kepser:kepser_dev_password@localhost:5432/dms_kepser_test pnpm test:integration
pnpm typecheck
```

## Definition of Done
- [ ] Klaim terbukti eksklusif di PostgreSQL asli; tidak ada data uji tertinggal setelah suite integrasi.
- [ ] Semua test stubs di section ini sudah diimplementasi dan passing.
- [ ] `pnpm typecheck` bersih; tidak ada regresi section sebelumnya.

## Catatan Implementasi (deep-implement)

Status: **selesai**.

- File sesuai rencana. Ekspor tambahan: tipe `DriveJobExecutor` (`Pick<typeof db, 'select'|'insert'|'update'|'execute'>`),
  `RetrySchedule`, `truncateGalatPesan`. Tipe `DriveJob` memakai `$inferSelect` skema (bentuk camelCase yang sama).
- `DRIVE_JOB_PRIORITAS` berbentuk per jenis: `{ HAPUS_TAUTAN: 0, HAPUS_FILE: 0, SINKRON_TAUTAN: 10 }`.
- Tes dua klaim bersamaan memakai `drizzle(poolClient)` sebagai executor (tidak perlu varian fungsi terpisah).
- Signature yang berubah: `completeDriveJob`/`failDriveJob`/`deferDriveJob`/`findActiveSinkronJob` menerima
  `executor?` (bukan `tx?`); `completeDriveJob`/`deferDriveJob` mengembalikan `boolean`, `failDriveJob` mengembalikan
  `'MENUNGGU' | 'GAGAL' | null` (null = job sudah tidak PROSES); `nextScheduledAt({ executor? })` tanpa `now`.
- **Penyimpangan 1 (perlu diketahui section 07/09):** mengembalikan job ke `MENUNGGU` saat sudah ada job `MENUNGGU`
  kembar untuk (tautan, jenis) yang sama akan melanggar `drive_job_satu_menunggu`. `failDriveJob`/`deferDriveJob`
  menangani ini dengan menandai job lama `DIBATALKAN` (+ `selesai_pada`, galat tetap dicatat) dan tetap melaporkan
  `'MENUNGGU'`/`true`, karena job kembar akan memproses seluruh baris tautan itu.
- **Penyimpangan 2:** `nextScheduledAt` juga mengembalikan `dikunci_pada + 15 m` untuk job `PROSES`, agar runner bangun
  untuk mengklaim ulang job macet. Job akun yang `perlu_hubung_ulang_sejak` terisi tetap diabaikan.
- Hasil tes: unit `jobs.test.ts` 13 lulus; integrasi 52 lulus (21 baru di `google-drive-jobs.test.ts`), tanpa data uji
  tertinggal; uji mutasi (buang `SKIP LOCKED` / urutan prioritas) membuat tes merah. Seluruh `pnpm test` 1432 lulus /
  1 skip; `pnpm typecheck` bersih.
