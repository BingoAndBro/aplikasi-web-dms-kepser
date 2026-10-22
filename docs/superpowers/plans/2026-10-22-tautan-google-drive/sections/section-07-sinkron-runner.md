# Section 07: Rencana File, Daftar Isi, Handler Sinkron, dan Runner

## Context

Section 01–06 selesai. Ada antrean, akun, `DriveClient`/FakeDrive, rute admin. Belum ada jalur yang membuat tautan
`DRIVE` (dibuka section 08), jadi section ini menguji handler dan runner langsung dengan data uji.

## Objective

Handler `SINKRON_TAUTAN` yang tahan putus/restart tanpa unggahan ganda (K7, K10, P5) dan runner single-flight yang
mengklaim job, memanggil handler, serta mencatat hasil/galat.

## Prerequisites
- Section(s) yang harus selesai dulu: 03, 04, 05
- Files/modules yang harus sudah tersedia: `jobs.ts`, `akun-repository.ts` (`muatAkunUntukJob`, `tandaiPerluHubungUlang`,
  `perbaruiRootFolder`), `drive-client.ts`, FakeDrive

## Implementation Steps

1. **Helper ZIP** (perilaku ZIP tidak berubah):
   - `src/lib/export/document-zip.ts`: `DocumentZipFileInput.kunci?: string`; ekspor `nextAvailableFileName`
     (atau `dedupeFileName(nama, seen)` publik yang dipakai ulang oleh `buildZipPlan`).
   - `src/lib/export/laporan-zip-entries.ts`: isi `kunci` `DOKUMEN:<row.id>:<lampiranIndex>`; untuk manual tambah `id` di select
     attachment dan isi `MANUAL:<row.id>:<attachment.id>`.
   - `src/lib/storage/internal-file-access.ts`: ekspor `inferContentType`.
2. `src/lib/google-drive/rencana-file.ts` (murni): `rencanakanFileDrive(entries: DocumentZipEntry[])` →
   `{ files: Array<{ sumber, dokumenId, lampiranIndex, manualArsipId, attachmentId, kunci, namaFile, labelDokumen, urutan, contentType }>,
   dilewati: Array<{ label, alasan }> }`. Dedup nama **di tingkat folder tautan** (P3) dengan satu `Map` untuk seluruh tautan,
   mengikuti urutan entri; `contentType = inferContentType(logicalPath)`; entri tanpa `kunci` (tidak mungkin setelah langkah 1)
   dilempar sebagai galat program. Tolak nama `DAFTAR_ISI.txt` bentrok dengan menambah akhiran.
3. `src/lib/google-drive/daftar-isi.ts` (murni): `buildDriveDaftarIsiText(input)` sesuai `claude-plan.md` Step 7.
4. `src/lib/google-drive/tautan-drive-repository.ts` (server-only) — fungsi yang dipakai handler:
   `muatTautanUntukSinkron(id)` (tautan + akun + status), `setDriveStatus(id, { dari: [...], ke, now })` bersyarat,
   `simpanFolderDicoba(id, now)`, `simpanFolderId(id, folderId)`, `ambilBarisMenungguBerikut(tautanId)`,
   `tandaiBarisDicoba(id, now)`, `tandaiBarisTerunggah(id, driveFileId, now)` (bersyarat `MENUNGGU`; mengembalikan boolean),
   `tandaiBarisDilewati(id)`, `pindahkanUnggahanTerbangKeMenghapus(id, driveFileId, now)` (+ enqueue `HAPUS_FILE` dalam transaksi),
   `simpanDaftarIsiFileId(id, fileId)`, `muatDataDaftarIsi(tautanId)` (baris file + `drive_dokumen_dilewati` + nama pembuat),
   `tandaiSiap({ id, url, now })` (transaksi: update bersyarat + audit `DRIVE_TAUTAN_SIAP` actor null), `tandaiGagal(id)` bersyarat
   belum dicabut. Repository dibuat sebagai objek dengan antarmuka `TautanDriveRepository` agar tes memakai implementasi in-memory.
5. `src/lib/google-drive/file-source.ts`: `bukaFileUntukUnggah(baris)` → `{ ok: true, stream, size } | { ok: false }`:
   dokumen → `resolveDocumentLampiranLogicalPathForExport`; manual → cek status arsip efektif + baris attachment milik
   `manual_arsip_id`; lalu `resolvePhysicalStoragePath(getLocalStorageRoot(), logicalPath)`, `stat` (file, ≤ 5 MB),
   `createReadStream`. Diinjeksi ke handler (tes memakai sumber palsu).
6. `src/lib/google-drive/sinkron-tautan.ts`: `handleSinkronTautan({ job, now, deps })` langkah 1–7 `claude-plan.md` Step 7,
   termasuk: cek dicabut + akun diputus tiap iterasi, jalur `dicoba_pada` → `findChildByAppProperty`, buat ulang akar saat 404
   parent (sekali), unggahan terbang → `MENGHAPUS`, 404 folder tautan → lempar `DriveApiError('TIDAK_DITEMUKAN')` dengan pesan
   spesifik. Mengembalikan `{ hasil: 'SELESAI' | 'DIBATALKAN' }`; galat dilempar ke runner.
7. `src/lib/google-drive/runner.ts`:
   - `runDriveRunnerOnce({ now, deps, anggaranMs })` dan `triggerDriveRunner()` / `resetDriveRunnerForTest()` sesuai
     `claude-plan.md` Step 7 (peta handler `Partial<Record<…>>`).
   - Penanganan galat per job: `DriveApiError` → `failDriveJob`; bila hasilnya `GAGAL` dan jenis `SINKRON_TAUTAN` →
     `tandaiGagal(tautanId)`; `TOKEN_TIDAK_VALID` → `tandaiPerluHubungUlang(akunId)`; galat lain → `PERMANEN` pesan umum,
     log `console.error('[google-drive/runner] job gagal', { jenis, kategori })` saja.
   - `deps` bawaan: `driveClientFor(akun)` = dekripsi token (`readDriveConfig`) → `createGoogleDriveClient`.
   - Timer `setTimeout(...).unref()`; batas 1 jam.
8. Tes unit dengan FakeDrive + repo in-memory (`tests/unit/google-drive/helpers/memory-tautan-repo.ts`) + `vi.useFakeTimers()` untuk runner.
9. `tests/TEST-CLASSIFICATION.md`.

## Files to Create/Modify
- `src/lib/export/document-zip.ts`, `src/lib/export/laporan-zip-entries.ts`, `src/lib/storage/internal-file-access.ts` — ekspor/field opsional.
- `src/lib/google-drive/{rencana-file,daftar-isi,tautan-drive-repository,file-source,sinkron-tautan,runner}.ts` — baru.
- `tests/unit/google-drive/{rencana-file,daftar-isi,sinkron-tautan,runner}.test.ts`, `helpers/memory-tautan-repo.ts` — baru.
- `tests/TEST-CLASSIFICATION.md`.

## Test Stubs (dari TDD plan)

### Happy Path
- [ ] Rencana file: nama = ZIP; `kunci` benar; nama ganda antar-dokumen → ` (2)`.
- [ ] Tautan 3 dokumen → folder + 3 file + `DAFTAR_ISI.txt` + izin; `SIAP`, URL, audit, job `SELESAI`.
- [ ] `drive_folder_id` tersimpan sebelum file pertama.
- [ ] `SIAP` hanya setelah semua file + izin.
- [ ] `DAFTAR_ISI.txt` mengelompokkan per dokumen dan menandai empat jenis keterangan + "Dokumen tanpa lampiran tersedia".
- [ ] Runner single-flight: dua pemicu saat berjalan → satu loop + satu putaran ulang.

### Edge Cases
- [ ] Gagal `SEMENTARA` di file ke-2 → putaran berikutnya hanya mengunggah file 2–3.
- [ ] Respons hilang → ditemukan via `appProperties`, tidak diunggah ulang.
- [ ] Dicabut di tengah → `DIBATALKAN`, tidak `SIAP`.
- [ ] File hilang / > 5 MB / dimusnahkan → `DILEWATI`, tautan tetap `SIAP`.
- [ ] Baris jadi `DILEWATI` saat unggah terbang → `MENGHAPUS` + job `HAPUS_FILE`.
- [ ] Akar hilang → dibuat ulang + `root_folder_id` diperbarui.
- [ ] Semua lampiran tidak tersedia → hanya `DAFTAR_ISI.txt`, `SIAP`.
- [ ] Timer ke jadwal terdekat (maks 1 jam); anggaran waktu habis → putaran lanjut.
- [ ] Runner no-op tanpa env.

### Error Cases
- [ ] `KUOTA_PENUH` → job `GAGAL`, `drive_status GAGAL`.
- [ ] `TOKEN_TIDAK_VALID` → job dijeda, akun ditandai.
- [ ] Folder tautan 404 saat unggah → `GAGAL TIDAK_DITEMUKAN` + pesan SPEC.
- [ ] Akun `DIPUTUS` → `GAGAL AKUN_DIPUTUS`.
- [ ] Galat non-Drive → `PERMANEN`, runner lanjut, tidak melempar.
- [ ] `DAFTAR_ISI.txt` tanpa path/id/token.
- [ ] Regresi ekspor ZIP lulus.

## Perintah Tes

```bash
pnpm test tests/unit/google-drive tests/unit/export tests/unit/laporan/export-zip.test.ts tests/unit/storage
pnpm typecheck
```

## Definition of Done
- [ ] Handler dan runner lulus semua skenario FakeDrive di atas.
- [ ] Ekspor ZIP berperilaku sama (tes lama lulus tanpa mengubah harapan).
- [ ] Semua test stubs di section ini sudah diimplementasi dan passing.
- [ ] `pnpm typecheck` bersih; tidak ada regresi.
