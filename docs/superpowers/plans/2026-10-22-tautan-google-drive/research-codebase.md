# Riset Codebase — Tautan Google Drive

Tanggal: 2026-10-22. Basis: commit `90ca023` (branch `main`).
Spec: `docs/superpowers/specs/2026-10-22-tautan-google-drive-design.md`.

Dokumen ini mencatat fakta dari kode yang memengaruhi rencana. Bila kode berubah sebelum
implementasi, periksa ulang bagian yang ditandai **[RISIKO]**.

---

## 1. Skema dan migrasi

### 1.1 `app.laporan_tautan` (`src/db/schema/app/laporan-tautan.ts`)

- Kolom: `id`, `token` (unique, not null), `sumber`, `akses` (default `LOGIN`), `judul`,
  `keterangan`, `dokumen_ids` (jsonb), `manual_arsip_ids` (jsonb), `created_by`, `created_at`,
  `revoked_at`, `revoked_by`, `last_accessed_at`, `jumlah_akses`.
- Konstanta `LAPORAN_TAUTAN_AKSES_VALUES = ['LOGIN', 'PUBLIK']` di file skema; tipe
  `LaporanTautanAkses` diekspor ulang oleh `tautan-shared.ts` (modul klien-aman).
- Check constraint `laporan_tautan_akses_check` (`akses in ('LOGIN','PUBLIK')`) dan
  `laporan_tautan_sumber_check`. Index `(created_by, created_at)`.
- `src/db/schema/app/index.ts` mengekspor `app-settings` dan `laporan-tautan`; tabel baru perlu
  ditambahkan di sini (dan `src/db/schema/index.ts` sudah mengekspor `app`).

### 1.2 `audit.audit_log` (`src/db/schema/audit/audit-log.ts`)

- `AUDIT_ENTITY_TYPE_VALUES = ['DOKUMEN']`, `AUDIT_LOG_AKSI_VALUES = [3 nilai]`.
- Check constraint `audit_log_entity_type_check` dan `audit_log_aksi_check` ditulis manual
  (string SQL) — perlu di-`DROP`/`ADD` ulang di migrasi.
- `entity_id uuid not null` tanpa FK (sengaja). `actor_user_id` nullable, FK `set null` → cocok
  untuk aksi runner (`null`).
- Konsumen `auditLog` hanya tiga penulis (pembersihan, pemusnahan fisik, hapus permanen); **tidak
  ada halaman pembaca audit_log**. Log Aktivitas ADMIN membaca sumber lain.

### 1.3 Migrasi Drizzle — **[RISIKO]** `db:local:generate` tidak bisa dipakai apa adanya

- `drizzle/meta/` hanya berisi `0000_snapshot.json` dan `_journal.json`. Migrasi 0001–0023
  **ditulis tangan** (SQL idempoten `IF NOT EXISTS` + blok `DO $$ … pg_constraint …`) lalu didaftarkan
  manual di `_journal.json` (`when` bertambah 86 400 000 per entri, `breakpoints: true`).
- Menjalankan `pnpm db:local:generate` sekarang akan menghasilkan diff dari snapshot 0000 (seluruh
  perubahan 0001–0023 ikut), jadi tidak aman. Rencana mengikuti preseden 0022/0023:
  `drizzle/0024_google_drive_tautan.sql` ditulis tangan + entri journal idx 24, lalu
  `pnpm db:local:migrate`. (Dikonfirmasi di interview.)
- `tests/unit/db/username-migration-source.test.ts` adalah contoh static guard yang memastikan
  migrasi terdaftar di journal dan CHECK identik dengan konstanta — pola yang sama dipakai untuk 0024.

## 2. Modul Tautan Laporan

### 2.1 `src/lib/laporan/tautan-shared.ts` (klien + server)
- `TAUTAN_AKSES`, `TAUTAN_AKSES_LABEL` (`Terbatas`, `Publik`), `TAUTAN_MAX_DOKUMEN = 500`.
- Tipe respons: `TautanCreateResponse { id, akses, path, public_base_url, jumlah_dokumen, jumlah_diabaikan }`,
  `TautanListItem { id, sumber, akses, judul, keterangan, path, jumlah_dokumen, jumlah_akses, created_at, last_accessed_at, revoked_at }`.
- `path` selalu `buildTautanPath(token)`; untuk tautan `DRIVE` path DMS **tidak boleh** dipakai
  (tidak bisa dibuka) → field perlu dibuat nullable atau diabaikan klien untuk `DRIVE`.

### 2.2 `src/lib/laporan/tautan.ts` (server)
- `createTautanForSession(session, input)`: dedup id → cek >500 (413) → `scopeSnapshotToCreator`
  (LAPORAN_SAYA / LAPORAN_KEGIATAN / LAPORAN_KINERJA; Kinerja wajib peran PJ Kinerja → 403) →
  `keepInOrder` → 0 dokumen → 400 → `repository.insertTautan(...)` (**bukan transaksi**; satu insert).
- `toTautanListItem(tautan)` membangun item riwayat.
- Pintu pembuka tautan: `resolveActiveTautan(token)` (404/410) dipakai `requireTautanViewer`
  (semua `/api/tautan/$token/...`), dan `handleTautanLampiranRequest` memakai `findTautanById`
  (rute `/lampiran/...`). **Dua titik inilah** yang perlu menolak `akses = 'DRIVE'` dengan 404
  (pesan `TAUTAN_NOT_FOUND_MESSAGE`).
- `createTautanZipResponse` memakai `buildLaporanZipEntries` + `buildManualArsipZipEntries`.

### 2.3 `src/lib/laporan/tautan-repository.ts`
- `insertTautan` memakai `db` global (tanpa parameter `tx`) → perlu varian yang menerima executor
  transaksi untuk alur `DRIVE` (insert tautan + baris file + job dalam satu transaksi).
- `revokeTautanByCreator(id, userId)`: satu `UPDATE … WHERE created_by AND revoked_at IS NULL`
  lalu `SELECT` pembeda `already_revoked`/`not_found`. **Tanpa transaksi** — perlu dibungkus
  `db.transaction` agar update `drive_status = MENGHAPUS`, pembatalan job sinkron, dan insert job
  `HAPUS_TAUTAN` atomik.
- `listTautanByCreator(userId, sumber)` limit 100, urut `created_at desc`.
- `loadTautanDokumenRows(ids)` mengembalikan `DokumenRow` lengkap (bentuk sama dengan ekspor ZIP);
  `loadTautanManualRows(ids)` mengembalikan baris manual dengan `status_arsip` efektif.

### 2.4 Rute
| Rute | Catatan |
|---|---|
| `src/routes/api/laporan/tautan.ts` | GET riwayat (tanpa same-origin, GET), POST buat (same-origin → sesi → Zod `createTautanRequestSchema` → `createTautanForSession`); log `console.info` tanpa token |
| `src/routes/api/laporan/tautan.$id.revoke.ts` | POST cabut; `isUuid` → 404; hasil `not_found` → 404 |
| `src/routes/api/tautan.$token*.ts` (6 file) | semua lewat `requireTautanViewer` / `handleTautan*FileRequest` |
| `src/routes/lampiran.$tautanId.$dokumenId.$ref.$sig.ts` | lewat `handleTautanLampiranRequest` |

### 2.5 Zod `src/lib/schemas/tautan.ts`
- `akses: z.enum(['LOGIN','PUBLIK']).default('LOGIN')` → perlu `'DRIVE'`. Skema memakai `.strict()`.

## 3. Ekspor ZIP (sumber nama file dan `DAFTAR_ISI.txt`)

- `buildLaporanZipEntries(rows: DokumenRow[])` (`src/lib/export/laporan-zip-entries.ts`): per dokumen
  memuat `loadDocumentAccessContextForExport(row.id)` lalu `resolveDocumentLampiranReferenceFromContext(context, index)`;
  lampiran yang gagal (dimusnahkan/dibersihkan/indeks salah) **dilewati diam-diam** → folder tanpa file →
  `skipReason` bawaan "tanpa lampiran". Nama file: `buildFormalFilename(row, lampiran)`.
  Entri **tidak membawa `lampiranIndex`**.
- `buildManualArsipZipEntries(rows)`: dimusnahkan → `skipReason: 'berkas dimusnahkan, lampiran sudah dihapus'`;
  selain itu memuat attachment (urut `created_at, id`) dan nama `sanitizeBerkasAttachmentFilename(buildManualArsipAttachmentFilename(...))`.
  Entri **tidak membawa `attachment.id`**.
- `DocumentZipEntry = { folderPath, files: { namaAman, logicalPath }[], skipReason? }`.
  Folder: `buildWorkflowDocumentFolderName` (`YYYY-MM-DD_<judul>_<id8>`), `buildManualDocumentFolderName`
  (`[Manual] <judul>_<id8>`). Duplikat nama hanya di-dedup **per folder** (`nextAvailableFileName`).
- `renderDaftarIsiText` **privat** di `document-zip.ts`; header berbunyi "DAFTAR ISI EKSPOR ZIP",
  "Waktu ekspor", "Diminta oleh", "Sumber", lalu daftar "Dokumen disertakan" / "Dokumen dilewati".
  Tidak memuat path fisik (hanya nama folder logis).
- `streamDocumentZip` mem-`stat` file fisik; file hilang → "file tidak ditemukan"; > 250 MB dilewati.

**Implikasi:** untuk Drive, helper ekspor perlu membawa kunci sumber per file
(`DOKUMEN:<dokumen_id>:<index>` / `MANUAL:<manual_arsip_id>:<attachment_id>`) — tambahkan field opsional
pada `DocumentZipFileInput` (tidak memecah pemanggil lama), dan ekspor fungsi pembentuk teks daftar isi
yang bisa diberi judul berbeda ("DAFTAR ISI TAUTAN GOOGLE DRIVE").

## 4. Storage (`src/lib/storage/*`)

- `getLocalStorageRoot()`, `assertSafeLogicalStoragePath`, `resolvePhysicalStoragePath(root, logical)` di
  `local-storage-paths.ts` — jalur aman satu-satunya dari logical path ke file fisik.
- `createLogicalPathFileResponse` (internal-file-access.ts) memakai `inferContentType(logicalPath)` yang
  **privat** → perlu diekspor (atau dipindah ke helper bersama) agar unggahan Drive memakai mimeType yang sama.
- `resolveDocumentLampiranLogicalPathForExport({documentId, lampiranIndex})` memeriksa ulang
  dimusnahkan + dibersihkan + keamanan path → dipakai handler sinkron sebagai "cek file masih tersedia"
  untuk dokumen alur. Untuk manual: status arsip efektif (`manualArsipEffectiveStatusArsip`) + baris attachment.
- `loadDestroyedArchiveIds()` (`src/lib/laporan/manual-realisasi.ts`) memberi daftar id dokumen/manual di
  berkas `DIMUSNAHKAN` (dipakai detail tautan).
- Batas unggah per file 5 MB (`DOCUMENT_UPLOAD_MAX_BYTES`) → semua lampiran ≤ 5 MB, cocok dengan
  multipart upload Drive (lihat riset web).

## 5. Titik hook penghapusan

### 5.1 Cabut — `revokeTautanByCreator` (lihat 2.3).

### 5.2 Pemusnahan berkas — **[RISIKO]** tidak transaksional saat ini
- Rute `POST /api/kasubag/berkas/$id/lifecycle` → `transitionBerkasArchiveStatus({ berkasId, actorUserId, action })`
  lalu, untuk `approve_destruction`, `executeBerkasPhysicalFileDestruction(...)` (terpisah, best effort).
- `transitionBerkasArchiveStatus` memanggil `repository.updateBerkasArchiveStatus` (update bersyarat
  status lama) lalu `repository.appendBerkasActivity` **tanpa** `runInRepositoryTransaction`, padahal
  helper itu sudah ada (`repository.transaction` tersedia pada repository default).
- Repository memakai executor `Pick<db, 'select' | 'insert' | 'update'>` — tx Drizzle memenuhinya.
- Rencana: bungkus transisi lifecycle dalam `runInRepositoryTransaction`, tambah metode repository
  opsional `enqueueDriveDestruction({ berkasId })` yang dipanggil hanya untuk `approve_destruction`,
  di dalam transaksi yang sama. Fake repository di `tests/unit/arsiparis/*` perlu metode no-op.
- Isi berkas: `arsip.berkas_arsip_item (berkas_id, source_type WORKFLOW|MANUAL, dokumen_id, manual_arsip_id)`.

### 5.3 Pembersihan Dokumen — `executePembersihanLampiran` (`src/lib/dokumen/pembersihan-service.ts`)
- File fisik dihapus **dulu**, lalu `repository.applyCleanup({ actorUserId, entries })` membuka
  `database.transaction` (update `lampiran_dibersihkan_at` + insert audit per dokumen). Hook Drive
  ditempatkan di dalam transaksi `applyCleanup` (id dokumen yang bersih).
- Repository diinjeksi (`deps.repository`), default memakai `getDatabase()` lazy.

### 5.4 Celah: hapus permanen dokumen non-material **[TEMUAN]**
- `DELETE /api/dokumen/$id` (pemilik, non-material `TERSIMPAN`) menghapus baris `dokumen_transaksi`
  dalam transaksi + audit `DOKUMEN_DIHAPUS_PERMANEN`, lalu menghapus file. Dokumen ini bisa ada di
  snapshot tautan Laporan Saya. Spec tidak menyebut pemicu Drive untuk kasus ini (dibahas di interview).
- Bila `laporan_tautan_drive_file.dokumen_id` diberi FK ke `dokumen_transaksi`, hapus permanen akan
  gagal (no action) atau menghapus jejak `drive_file_id` (cascade). Jadi kolom itu **tanpa FK**.

## 6. Pola runner: `src/lib/storage/pending-upload-sweeper.ts`
- State modul: `lastSweepStartedAt`, `sweepInFlight` (single-flight per proses); fungsi
  `maybeSweep…({ now, sweep })` fire-and-forget, tidak pernah melempar; `reset…ForTest()`.
- Pemicu: dipanggil dari `src/routes/api/upload.ts` (`void maybeSweepStalePendingUploads()`).
- Skrip `src/scripts/sweep-pending-uploads.ts` + `package.json` `storage:sweep-pending`
  (`dotenv -e .env -- tsx …`), menutup `pool` di `finally`.
- **Tidak ada hook startup server** (tidak ada plugin Nitro); runner hanya hidup bila dipicu request
  atau skrip. Ini konsisten dengan spec 8.3 (pemicu dari GET Riwayat Tautan, GET admin, dsb.).

## 7. Auth, same-origin, rute admin

- `getLocalServerSession(request)` → `{ user, userId, roles, activeRole, sessionId }`;
  `hasLocalRole(session, 'ADMIN')`. `sessionId` tersedia untuk mengikat `state` OAuth.
- `requireSameOrigin(request)` hanya untuk metode tidak aman; menerima `APP_URL`, host, forwarded.
- Contoh rute admin: `src/routes/api/admin/analyze-storage.ts` (`createFileRoute('/api/admin/...')`,
  `server.handlers.GET`, cek sesi → `hasLocalRole('ADMIN')` → 403 "Akses ditolak - hanya admin").
- `src/lib/constants/routes.ts` hanya berisi path halaman; endpoint API ditulis inline di komponen
  (`apiFetch('/laporan/tautan')`). Spec meminta path di `routes.ts` → tambah blok konstanta API Drive.

## 8. UI

### 8.1 `src/components/laporan/BagikanTautan.tsx`
- `BagikanTautanDialog`: state `akses` (reset ke `LOGIN` tiap dibuka), radiogroup `grid gap-2 sm:grid-cols-2`
  dengan `AksesOption`, peringatan kuning untuk Publik, hasil `created` menampilkan `TautanUrlField`.
- `RiwayatTautanDialog`: memuat `GET /laporan/tautan?sumber=` saat dibuka, badge akses + Aktif/Dicabut,
  `TautanUrlField` + Cabut (`useConfirm`).
- `TautanUrlField` (Salin/Buka) dapat dipakai ulang untuk link Drive.
- Static guard terkait: `tests/unit/laporan/tautan-wiring-source.test.ts`.

### 8.2 `src/routes/admin.settings.tsx`
- Kartu berpola `rounded-[18px] border border-border-default bg-white p-5`, `AdminConfirmationDialog`,
  `useAppToast`, `apiFetch`/`apiMutation`.
- **[RISIKO]** Setiap perubahan setelan di halaman ini memaksa logout (settings-epoch). Bagian Google
  Drive **tidak boleh** memakai alur itu — tindakan Drive tidak menyentuh `app_settings`/epoch.
- Disarankan memisahkan bagian Drive ke komponen sendiri (`src/components/admin/GoogleDriveSettings.tsx`)
  supaya halaman tidak membengkak dan bisa diuji source-guard.

## 9. Tes

- `vitest.config.ts`: `tests/**/*.test.ts`, env node, `maxWorkers: 4`, mengecualikan `tests/integration/**`.
- `vitest.integration.config.ts`: `tests/integration/**/*.test.ts`; tes memuat `.env` bila `DATABASE_URL`
  kosong, import modul DB dinamis, data uji dalam transaksi yang di-rollback.
- Uji `SKIP LOCKED` butuh **dua koneksi** dan data ter-commit → tidak bisa di satu transaksi rollback;
  perlu `pool.connect()` dua klien + pembersihan eksplisit di `afterAll`/`finally`.
- Pola rute: `vi.hoisted` + `vi.mock('#/lib/auth/local-server-auth')`, `Route.options.server.handlers.POST`,
  header `Origin` (contoh: `tests/unit/laporan/tautan-route.test.ts`).
- `tests/unit/laporan/helpers/fake-laporan-db.ts` tersedia untuk DB palsu laporan.
- `tests/TEST-CLASSIFICATION.md` harus diperbarui untuk setiap file tes baru.

## 10. Lingkungan cloud VM (diamati di sesi ini)

- Node `v22.22.0`, pnpm tersedia, `node_modules` **belum** terpasang (`pnpm install` perlu dijalankan).
- PostgreSQL 16 terpasang tetapi mati (`service postgresql start`). `.env`/`.env.migration` tidak ada;
  hanya `*.example`.
- Akses jaringan ke `developers.google.com` diblokir kebijakan jaringan sandbox (WebFetch/curl gagal);
  registry npm dapat dijangkau.

## 11. Dokumen

- `docs/skripsi/rancangan-erd.md` menginventaris 22 tabel; `laporan_tautan` **belum** tercatat. Pembaruan
  ERD perlu menambah `laporan_tautan` (bila belum) beserta tiga tabel baru di bagian 4.5/4.47.
- `.env.example` berkomentar per variabel (lihat `DMS_PUBLIC_BASE_URL`) — pola yang sama untuk variabel Google.
