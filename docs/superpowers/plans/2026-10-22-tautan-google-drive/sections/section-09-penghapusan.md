# Section 09: Handler Hapus dan Hook Pemicu Penghapusan

## Context

Section 01–08 selesai: tautan DRIVE bisa dibuat dan diunggah; runner punya handler `SINKRON_TAUTAN` saja. Cabut,
pemusnahan berkas, Pembersihan Dokumen, dan hapus permanen dokumen non-material belum menyentuh Drive.
Catatan riset: `transitionBerkasArchiveStatus` dan `revokeTautanByCreator` saat ini **tidak** transaksional.

## Objective

Empat pemicu (K4 + P4) membuat job hapus di transaksi yang sama dengan perubahan statusnya, dan runner menghapus
permanen folder/file di Drive, memperbarui `DAFTAR_ISI.txt`, serta mencatat audit.

## Prerequisites
- Section(s) yang harus selesai dulu: 08
- Files/modules yang harus sudah tersedia: `jobs.ts` (`enqueueDriveJob`, `deferDriveJob`, `findActiveSinkronJob`), `runner.ts`,
  `tautan-drive-repository.ts`, `daftar-isi.ts`, FakeDrive
- Baca ulang skill `db-fsm-guard` §2 (berkas arsip) dan §3 (append-only).

## Implementation Steps

1. `src/lib/google-drive/penghapusan.ts` (server-only, fungsi menerima `tx`):
   - `tandaiTautanDicabut(tx, { tautanId, akunId, now })`.
   - `tandaiFileDihapusUntukSumber(tx, { dokumenIds?, manualArsipIds?, keterangan, now })` → `{ tautanTerdampak: number }`.
   - Kueri memakai join ke `laporan_tautan` (`akses = 'DRIVE'`, `revoked_at IS NULL`); update bersyarat status lama
     (`TERUNGGAH` → `MENGHAPUS`, `MENUNGGU` → `DILEWATI`), keduanya mengisi `keterangan_hapus`; enqueue `HAPUS_FILE` per tautan
     yang punya baris berubah.
2. **Cabut** — `src/lib/laporan/tautan-repository.ts` `revokeTautanByCreator`: jalankan dalam `db.transaction`; update bersyarat
   yang sama `RETURNING id, akses, drive_akun_id`; bila `DRIVE` → `tandaiTautanDicabut`. Kontrak hasil tidak berubah.
   `src/routes/api/laporan/tautan.$id.revoke.ts`: picu runner bila `revoked`.
3. **Pemusnahan** — `src/lib/archive/berkas-arsip-service.ts`:
   - Tambah `onBerkasDimusnahkan?(input: { berkasId: string; now: Date }): Promise<void>` ke `BerkasArsipRepository`.
   - `transitionBerkasArchiveStatus` membungkus update status + (bila `approve_destruction`) `onBerkasDimusnahkan` + `appendBerkasActivity`
     dalam `runInRepositoryTransaction`. Validasi awal (find, cek CLOSED/statusArsip) boleh di luar atau di dalam; update tetap bersyarat.
   - Implementasi Drizzle `onBerkasDimusnahkan`: ambil `dokumen_id` (`source_type = WORKFLOW`) dan `manual_arsip_id` (`MANUAL`) dari
     `berkas_arsip_item` berkas itu → `tandaiFileDihapusUntukSumber(executor, …, 'DIMUSNAHKAN')`. Executor repository perlu `execute`
     bila kueri memakai SQL mentah; pilih kueri Drizzle biasa agar tipe `Pick<…, 'select' | 'insert' | 'update'>` cukup.
   - `src/routes/api/kasubag/berkas/$id/lifecycle.ts`: picu runner setelah `approve_destruction` sukses (sebelum/terpisah dari
     penghapusan fisik lokal; tidak menunggu).
   - `USUL_MUSNAH`/`cancel_proposal` tidak memanggil hook.
4. **Pembersihan** — `src/lib/dokumen/pembersihan-service.ts` `applyCleanup` default: di dalam `database.transaction` setelah loop
   update+audit, panggil `tandaiFileDihapusUntukSumber(tx, { dokumenIds: entries.map(e => e.dokumenId) }, 'DIBERSIHKAN')`.
   `src/routes/api/pembersihan-dokumen.bersihkan.ts`: picu runner bila `cleaned_count > 0`.
5. **Hapus permanen** — `src/routes/api/dokumen.$id.ts` DELETE: di dalam `db.transaction` yang ada, sebelum menghapus baris dokumen,
   `tandaiFileDihapusUntukSumber(tx, { dokumenIds: [id] }, 'DIHAPUS_PEMILIK')`; picu runner setelah sukses. Respons tidak berubah.
6. `src/lib/google-drive/hapus.ts`: `handleHapusTautan` dan `handleHapusFile` sesuai `claude-plan.md` Step 9, termasuk penundaan 30 dtk (D13)
   via `findActiveSinkronJob` + `deferDriveJob` (handler mengembalikan `{ hasil: 'DITUNDA' }`; runner tidak memanggil `complete`).
   Fungsi repo tambahan di `tautan-drive-repository.ts`: `selesaikanHapusTautan(tx…)` (status `DIHAPUS`, baris `DIHAPUS` `DICABUT`,
   audit `DRIVE_TAUTAN_DIHAPUS` entity `LAPORAN_TAUTAN`), `ambilBarisMenghapusBerikut`, `tandaiBarisDihapus`, audit `DRIVE_FILE_DIHAPUS`.
7. Daftarkan `HAPUS_TAUTAN` dan `HAPUS_FILE` di peta handler runner; hasil `DITUNDA` tidak menghitung sebagai gagal.
8. Tes:
   - Unit: `hapus.test.ts` (FakeDrive), `penghapusan.test.ts` (tx palsu mencatat urutan), perluasan tes arsip
     (`berkas-arsip-service.test.ts`, `berkas-arsip-api.test.ts`): hook dipanggil hanya untuk `approve_destruction` dan di dalam transaksi;
     perluasan `pembersihan-route.test.ts` / tes service pembersihan; `dokumen-delete-audit-log.test.ts`; `tautan-service.test.ts` untuk cabut.
   - Integrasi `tests/integration/google-drive-penghapusan.test.ts`: untuk keempat pemicu, jalankan fungsi pemicu di dalam transaksi
     yang lalu di-rollback → job dan perubahan baris file tidak ada; dan jalur sukses (dalam transaksi uji) membuat job + status baris benar.
9. `tests/TEST-CLASSIFICATION.md`.

## Files to Create/Modify
- `src/lib/google-drive/{penghapusan,hapus}.ts` — baru; `runner.ts`, `tautan-drive-repository.ts`, `jobs.ts` — tambahan.
- `src/lib/laporan/tautan-repository.ts`, `src/routes/api/laporan/tautan.$id.revoke.ts`.
- `src/lib/archive/berkas-arsip-service.ts`, `src/routes/api/kasubag/berkas/$id/lifecycle.ts`.
- `src/lib/dokumen/pembersihan-service.ts`, `src/routes/api/pembersihan-dokumen.bersihkan.ts`.
- `src/routes/api/dokumen.$id.ts`.
- Tes unit/integrasi di atas + `tests/TEST-CLASSIFICATION.md`.

## Test Stubs (dari TDD plan)

### Happy Path
- [ ] Cabut DRIVE → satu transaksi: `revoked_at`, `MENGHAPUS`, sinkron `MENUNGGU` → `DIBATALKAN`, job `HAPUS_TAUTAN`.
- [ ] `handleHapusTautan` → folder terhapus permanen, `DIHAPUS`, baris `DIHAPUS` (`DICABUT`), audit.
- [ ] `approve_destruction` → baris `TERUNGGAH` → `MENGHAPUS` (`DIMUSNAHKAN`), `HAPUS_FILE` per tautan; handler menghapus + memperbarui daftar isi; audit.
- [ ] Pembersihan → keterangan `DIBERSIHKAN`; hapus permanen → `DIHAPUS_PEMILIK`.

### Edge Cases
- [ ] Hapus 404 → berhasil (folder & file).
- [ ] Folder belum pernah dibuat → `DIHAPUS` tanpa panggilan Drive; `drive_folder_dicoba_pada` terisi → dicari dulu.
- [ ] Baris `MENUNGGU` saat pemusnahan → `DILEWATI`.
- [ ] Job hapus saat sinkron `PROSES` → ditunda 30 dtk, `percobaan` tetap.
- [ ] `HAPUS_FILE` pada tautan dicabut → `SELESAI` tanpa panggilan Drive.
- [ ] `USUL_MUSNAH`/`cancel_proposal` tanpa job; tautan dicabut tidak disentuh hook.
- [ ] Bentuk respons API cabut/lifecycle/pembersihan/DELETE tidak berubah.

### Error Cases
- [ ] Akun `DIPUTUS` → `GAGAL AKUN_DIPUTUS`, tampil di daftar perlu hapus manual.
- [ ] `SEMENTARA` saat hapus → dijadwalkan ulang.
- [ ] [I] Empat pemicu: rollback → job & perubahan baris file tidak ada.
- [ ] [I] Update lifecycle gagal bersyarat → tidak ada job hapus.

## Perintah Tes

```bash
pnpm test tests/unit/google-drive tests/unit/laporan tests/unit/arsiparis tests/unit/dokumen
DATABASE_URL=postgresql://kepser:kepser_dev_password@localhost:5432/dms_kepser_test pnpm test:integration
pnpm typecheck
```

## Definition of Done
- [ ] Keempat pemicu transaksional dan teruji (unit + integrasi rollback).
- [ ] Tes arsip, pembersihan, dokumen, dan tautan lama lulus tanpa melemahkan harapan.
- [ ] Riwayat append-only tetap: tidak ada `UPDATE`/`DELETE` pada `audit_log`, `berkas_arsip_activity`, `log_aktivitas`.
- [ ] Semua test stubs di section ini sudah diimplementasi dan passing.
- [ ] `pnpm typecheck` bersih.
