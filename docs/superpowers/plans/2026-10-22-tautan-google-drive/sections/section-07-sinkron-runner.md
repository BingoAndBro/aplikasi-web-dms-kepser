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

## Catatan Implementasi (deep-implement)

Status: **selesai**.

- Helper ZIP: `DocumentZipFileInput.kunci?`, `nextAvailableFileName` diekspor, `laporan-zip-entries.ts` mengisi kunci
  (`DOKUMEN:<id>:<index>`, `MANUAL:<id>:<attachment_id>`; select attachment ditambah `id`), `inferContentType` diekspor dari
  `internal-file-access.ts`. Isi/nama ZIP tidak berubah (tes ekspor/laporan/storage lama lulus tanpa mengubah harapan).
- Modul baru sesuai rencana: `rencana-file.ts`, `daftar-isi.ts`, `tautan-drive-repository.ts`, `file-source.ts`,
  `sinkron-tautan.ts`, `runner.ts`; helper tes `helpers/memory-tautan-repo.ts` (`MemoryTautanRepo`, `MemoryAkun`).
- Signature aktual:
  - `rencanakanFileDrive(entries)` → `{ files: RencanaFileDrive[], dilewati }`; konstanta `DRIVE_DAFTAR_ISI_NAMA`.
  - `buildDriveDaftarIsiText({ judul, sumberLabel, dibagikanOleh, diperbaruiPada, files, dilewati })`.
  - `createTautanDriveRepository(executor?)` → `TautanDriveRepository` (nama fungsi sesuai plan; `tandaiSiap` menerima `jobId`).
  - `bukaFileUntukUnggah(baris, deps?)` → `{ ok: true, size, buka } | { ok: false }`.
  - `createSinkronTautanHandler({ repo, akun, driveClientFor, bukaFile })` → `DriveJobHandler`
    (`({ job, now: () => Date }) => { hasil: 'SELESAI' | 'DIBATALKAN' }`).
  - `runDriveRunnerOnce({ now?, deps?, anggaranMs? })` → `{ diproses, selesai, dibatalkan, gagal, dijeda, anggaranHabis }`;
    `triggerDriveRunner()`, `resetDriveRunnerForTest(deps?)`, `createDefaultDriveRunnerDeps()`, `defaultDriveClientFor(akun)`.
- **Penyimpangan / tambahan (dicatat juga di `code-reviews/section-07-review.md`):**
  1. `file-source` mengembalikan `buka()` (stream dibuka malas) alih-alih `stream`, supaya tidak ada stream yang dibuka lalu
     ditinggal saat salinan ditemukan lewat `appProperties`.
  2. `tandaiSiap({ id, jobId, url, now })` sekaligus menandai job `SELESAI` di transaksi yang sama (plan Step 7 langkah 7);
     `completeDriveJob` dari runner sesudahnya no-op (job sudah bukan `PROSES`).
  3. Handler mengembalikan `DIBATALKAN` juga bila `drive_status` sudah bukan `MENUNGGU`/`MENGUNGGAH` (mis. sudah `SIAP` oleh
     job lain) atau tautan tidak ada.
  4. `DAFTAR_ISI.txt`: bila ID belum tersimpan selalu dicari dulu lewat `dmsJenis='DAFTAR_ISI'` (folder pasti sudah pernah
     dicoba saat langkah ini); yang ditemukan diperbarui isinya. `updateFileContent` 404 → unggah baru.
  5. **Salinan yatim:** baris yang `dicoba_pada`-nya terisi tetapi file lokalnya kini tidak tersedia → salinan yang ditemukan
     lewat `dmsKunci` dihapus (404 dianggap berhasil) lalu baris `DILEWATI`. Ditemukan saat code review.
  6. Pesan galat non-Drive: "Gagal memproses salinan Google Drive"; jenis tanpa handler: "Pemroses belum tersedia".
     Log `console.error('[google-drive/runner] job gagal', { jenis, kategori })` untuk setiap kegagalan job dan
     `[google-drive/runner] putaran gagal` `{ kategori: 'TAK_TERDUGA' }` bila putaran gagal (mis. DB mati). Putaran yang gagal
     tidak menjadwalkan timer ulang sendiri; pemicu berikutnya (rute/`drive:sync`) menjalankannya lagi.
  7. `tandaiPerluHubungUlang` dipanggil untuk setiap `TOKEN_TIDAK_VALID` (idempoten). `defaultDriveClientFor` memetakan
     galat dekripsi → `TOKEN_TIDAK_VALID`, token kosong → `AKUN_DIPUTUS`.
- **`failDriveJob` = 'MENUNGGU'** (permintaan sesi ini): runner memperlakukannya sebagai "masih akan dicoba", termasuk job yang
  `DIBATALKAN` karena sudah ada job `MENUNGGU` kembar; tautan **tidak** ditandai `GAGAL`. Diuji di unit (`runner.test.ts`) dan
  integrasi dengan antrean asli (`google-drive-sinkron.test.ts`, kasus `SEMENTARA` dan `TOKEN_TIDAK_VALID`). Uji mutasi
  (tandai GAGAL untuk nasib apa pun selain null) membuat 2 tes unit + 2 tes integrasi merah.
- Hasil tes: `tests/unit/google-drive` 248 lulus; perintah tes section (google-drive + export + export-zip + storage) lulus;
  seluruh `pnpm test` 1575 lulus / 1 skip (sebelum section 1523 / 1 skip); integrasi 79 lulus (sebelum 71), tanpa data uji
  tertinggal; `pnpm typecheck` bersih.
