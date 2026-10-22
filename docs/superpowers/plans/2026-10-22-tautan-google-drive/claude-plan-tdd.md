# Test Stubs (TDD) — Tautan Google Drive

Stub dalam bahasa natural, satu blok per step `claude-plan.md`. Kode tes ditulis saat implementasi
(tulis tes gagal dulu, lalu implementasi). Lokasi file tes disebut di tiap blok; semua file baru wajib
dicatat di `tests/TEST-CLASSIFICATION.md`.

Konvensi: **[U]** unit (`pnpm test`), **[I]** integrasi PostgreSQL asli (`pnpm test:integration`),
**[S]** static source guard.

---

## Tests for: Step 1 — Skema, migrasi 0024, konstanta

File: `tests/unit/db/google-drive-migration-source.test.ts` [S], `tests/integration/google-drive-schema.test.ts` [I].

### Happy Path
- [ ] [S] `drizzle/meta/_journal.json` memuat entri idx 24 bertag `0024_google_drive_tautan` dan berkas SQL-nya ada.
- [ ] [S] CHECK `laporan_tautan_akses_check` di SQL memuat persis nilai `LAPORAN_TAUTAN_AKSES_VALUES` (`LOGIN`, `PUBLIK`, `DRIVE`).
- [ ] [S] CHECK `audit_log_aksi_check` dan `audit_log_entity_type_check` di SQL 0024 identik dengan konstanta `AUDIT_LOG_AKSI_VALUES` / `AUDIT_ENTITY_TYPE_VALUES`.
- [ ] [S] CHECK status di SQL untuk `google_drive_akun`, `laporan_tautan_drive_file`, `drive_job` identik dengan konstanta skema masing-masing.
- [ ] [I] Ketiga tabel baru dan kolom `drive_*` di `laporan_tautan` ada setelah migrasi.
- [ ] [I] Insert tautan `LOGIN` lama (tanpa kolom drive) tetap berhasil.
- [ ] [I] Insert tautan `DRIVE` dengan `drive_akun_id` + `drive_status` berhasil.

### Edge Cases
- [ ] [I] Dua akun `NONAKTIF` boleh ada bersamaan; email sama boleh ada sekali `DIPUTUS` dan sekali `AKTIF`.
- [ ] [I] Unique `(tautan_id, kunci_lampiran)` menolak baris file kembar.
- [ ] [I] Dua job `MENUNGGU` dengan `(tautan_id, jenis)` sama ditolak; satu `MENUNGGU` + satu `SELESAI` diterima.
- [ ] [I] Baris file dengan `dokumen_id` yang tidak ada di `dokumen_transaksi` diterima (tanpa FK, P4).

### Error Cases
- [ ] [I] Dua akun `AKTIF` → pelanggaran unique (`23505`).
- [ ] [I] Dua akun belum `DIPUTUS` dengan email sama → `23505`.
- [ ] [I] Tautan `DRIVE` tanpa `drive_akun_id` → pelanggaran CHECK (`23514`); tautan `LOGIN` dengan `drive_status` terisi → `23514`.
- [ ] [I] `akses = 'LAINNYA'` → `23514`; `drive_status` di luar daftar → `23514`.
- [ ] [I] Baris file `sumber = 'DOKUMEN'` tanpa `lampiran_index` → `23514`.
- [ ] [U] `createTautanRequestSchema` masih menolak `akses: 'DRIVE'` di akhir Step 1 (dibuka Step 8).

## Tests for: Step 2 — Config, token-crypto, shared

File: `tests/unit/google-drive/config.test.ts`, `token-crypto.test.ts` [U].

### Happy Path
- [ ] `readDriveConfig` dengan tiga env valid (kunci base64 32 byte) → `ok: true`, `tokenKey.length === 32`.
- [ ] `encrypt` lalu `decrypt` mengembalikan token semula; format diawali `v1:` dan terdiri dari 4 bagian base64url.
- [ ] Dua enkripsi token sama menghasilkan ciphertext berbeda (IV acak).

### Edge Cases
- [ ] Env berisi spasi di sekitar nilai → di-trim dan tetap valid.
- [ ] Kunci base64 yang terdekode 31/33 byte → `ok: false`.
- [ ] Token panjang (≥ 512 karakter) dan berisi karakter `/ + =` roundtrip benar.

### Error Cases
- [ ] Salah satu env kosong → `ok: false`, `isDriveConfigured() === false`, tanpa melempar.
- [ ] Ciphertext diubah satu karakter → `TokenCryptoError` `DEKRIPSI_GAGAL`.
- [ ] Tag diubah → `DEKRIPSI_GAGAL`; kunci berbeda → `DEKRIPSI_GAGAL`.
- [ ] Awalan `v2:` atau jumlah bagian salah → `FORMAT_TIDAK_DIKENAL`.
- [ ] Pesan galat tidak memuat ciphertext, kunci, maupun token.

## Tests for: Step 3 — drive-errors, DriveClient, FakeDrive

File: `tests/unit/google-drive/drive-errors.test.ts`, `drive-client.test.ts` [U].

### Happy Path
- [ ] 403 `storageQuotaExceeded` → `KUOTA_PENUH`, pesan "Kuota Google Drive penuh".
- [ ] 403 `userRateLimitExceeded`, 403 `rateLimitExceeded`, 403 `sharingRateLimitExceeded`, 429, 500, 503 → `SEMENTARA`.
- [ ] 404 → `TIDAK_DITEMUKAN`.
- [ ] 400 dengan `response.data.error === 'invalid_grant'` → `TOKEN_TIDAK_VALID`; 401 → `TOKEN_TIDAK_VALID`.
- [ ] Galat jaringan `code` `ECONNRESET`/`ETIMEDOUT`/`ENOTFOUND`/`EAI_AGAIN` → `SEMENTARA`.
- [ ] `TokenCryptoError` → `TOKEN_TIDAK_VALID`.
- [ ] `createGoogleDriveClient` (dengan `drive()` di-mock) memanggil `files.create` folder dengan `mimeType` folder, `parents`, `appProperties`, dan `fields: 'id'`; membuat instance dengan `retry: false` dan `timeout`.
- [ ] `uploadFile` mengirim `requestBody` + `media { mimeType, body }`.
- [ ] `shareAnyoneReader` mengirim `{ type: 'anyone', role: 'reader' }`.

### Edge Cases
- [ ] 403 tanpa `reason` dikenal → `PERMANEN`.
- [ ] Objek bukan Error / `undefined` → `PERMANEN` dengan pesan umum.
- [ ] `fileExists` mengembalikan `false` untuk 404 dan melempar untuk kategori lain.
- [ ] `findChildByAppProperty` menolak nilai yang mengandung `'` atau `\` sebelum memanggil API.

### Error Cases
- [ ] `classifyDriveError` tidak pernah menyalin `response.data` ataupun header ke `pesan`/`message` (uji dengan respons berisi string token palsu).
- [ ] [U] FakeDrive: `failNext('uploadFile', 'SEMENTARA', { simpanObjek: true })` menyimpan objek namun melempar (simulasi respons hilang).

## Tests for: Step 4 — Antrean job

File: `tests/unit/google-drive/jobs.test.ts` [U], `tests/integration/google-drive-jobs.test.ts` [I].

### Happy Path
- [ ] [U] `computeRetrySchedule`: kegagalan ke-1..8 → jeda 1 m, 5 m, 15 m, 1 j, 3 j, 6 j, 12 j, 24 j dari `now`.
- [ ] [I] `enqueueDriveJob` di dalam transaksi membuat job `MENUNGGU` dengan prioritas sesuai jenis.
- [ ] [I] `claimNextDriveJob` mengambil `HAPUS_*` (prioritas 0) sebelum `SINKRON_TAUTAN` (10), lalu `jadwal_berikut` terlama.
- [ ] [I] `completeDriveJob` → `SELESAI` + `selesai_pada`.

### Edge Cases
- [ ] [U] Kegagalan ke-9 → `GAGAL` (batas D11).
- [ ] [I] Job `jadwal_berikut` di masa depan tidak diklaim; `nextScheduledAt` mengembalikan waktu itu.
- [ ] [I] Job `PROSES` dengan `dikunci_pada` 16 menit lalu diklaim ulang; 14 menit lalu tidak.
- [ ] [I] Job akun `perlu_hubung_ulang_sejak` terisi tidak diklaim; setelah dikosongkan diklaim.
- [ ] [I] Enqueue kedua untuk `(tautan, jenis)` yang masih `MENUNGGU` tidak membuat baris baru dan memajukan `jadwal_berikut`.
- [ ] [I] `TOKEN_TIDAK_VALID` → kembali `MENUNGGU`, `percobaan` tidak bertambah.
- [ ] [I] `deferDriveJob(30 dtk)` → `MENUNGGU`, `percobaan` tetap.

### Error Cases
- [ ] [I] **Dua klaim bersamaan dari dua koneksi** (`pool.connect()` ×2, transaksi terbuka) → hanya satu mendapat job, yang lain `null` (`SKIP LOCKED`). Data uji di-commit dan dibersihkan di `finally`.
- [ ] [I] `failDriveJob`/`completeDriveJob` pada job yang bukan `PROSES` tidak mengubah apa pun.
- [ ] [I] `KUOTA_PENUH` → `GAGAL` langsung dengan `galat_kategori` dan `galat_pesan` ≤ 200 karakter.

## Tests for: Step 5 — OAuth, akun, ketersediaan

File: `tests/unit/google-drive/oauth.test.ts`, `akun-repository.test.ts`, `availability.test.ts` [U],
`tests/integration/google-drive-akun.test.ts` [I].

### Happy Path
- [ ] `mulaiHubung` mengembalikan URL dengan `access_type=offline`, `prompt=consent`, scope K8, `code_challenge_method=S256`, `redirect_uri=http://127.0.0.1:53682/`, dan `state`.
- [ ] `parsePastedAddress('http://127.0.0.1:53682/?state=s&code=c')` → `{ kind: 'code' }`; `localhost` juga diterima.
- [ ] `tukarCode` (client Google di-mock) → `{ refreshToken, email }` dengan email huruf kecil.
- [ ] [I] Hubungkan pertama → satu akun `AKTIF`, audit `DRIVE_AKUN_DIHUBUNGKAN`.
- [ ] [I] **Ganti akun atomik**: akun lama `NONAKTIF` + `dinonaktifkan_pada`, akun baru `AKTIF`, dua audit, dalam satu transaksi.
- [ ] `getDriveAvailability` → `tersedia: true` bila env lengkap + akun aktif sehat.

### Edge Cases
- [ ] `HUBUNGKAN_ULANG` email sama → token diperbarui, status tetap, `perlu_hubung_ulang_sejak` kosong, job akun dijadwalkan `now`.
- [ ] `GANTI` dengan email akun `NONAKTIF` → akun itu `AKTIF`, akun aktif sebelumnya `NONAKTIF`, tanpa baris baru.
- [ ] Email pernah `DIPUTUS` dihubungkan lagi → baris baru; baris lama tetap `DIPUTUS`.
- [ ] Store state membuang entri tertua saat > 20 dan menghapus yang kedaluwarsa.
- [ ] `putuskanAkun` → token null, `DIPUTUS`, job `MENUNGGU` akun itu `GAGAL AKUN_DIPUTUS`, tautan `MENUNGGU/MENGUNGGAH` → `GAGAL`, audit; galat `revoke()` diabaikan.
- [ ] Ketersediaan: tanpa env → `BELUM_DIKONFIGURASI`; tanpa akun aktif → `BELUM_ADA_AKUN`; akun perlu hubung ulang → `PERLU_HUBUNG_ULANG`.

### Error Cases
- [ ] `state` tidak dikenal / kedaluwarsa (>10 menit, `now` diinjeksi) → `STATE_KEDALUWARSA`.
- [ ] `state` milik `sessionId` lain → `STATE_SESI_BERBEDA`; state terpakai tidak bisa dipakai kedua kali.
- [ ] `error=access_denied` → pesan "Izin ditolak di halaman Google".
- [ ] Host `evil.com`, `https://127.0.0.1`, `javascript:`, teks acak, URL tanpa `state` → `ALAMAT_TIDAK_VALID`.
- [ ] Tanpa `refresh_token` → `TANPA_REFRESH_TOKEN`; `scope` tanpa `drive.file` → `IZIN_DRIVE_TIDAK_DIBERIKAN`; `email_verified` false → galat.
- [ ] `HUBUNGKAN_ULANG` dengan email berbeda → `EMAIL_BERBEDA`.
- [ ] Pesan galat OAuth tidak memuat `code`, token, atau respons Google.

## Tests for: Step 6 — Rute ADMIN dan status

File: `tests/unit/google-drive/admin-routes.test.ts`, `status-route.test.ts` [U] (dependency di-mock).

### Happy Path
- [ ] `GET /api/google-drive/status` dengan sesi PEGAWAI → 200 `{ tersedia, alasan }`.
- [ ] `GET /api/admin/google-drive` ADMIN → ringkasan akun + daftar perlu hapus manual.
- [ ] `POST mulai-hubung` ADMIN → `{ auth_url }`; `POST hubungkan` → ringkasan akun; `POST putuskan` → 200; `POST coba-lagi-penghapusan` → `{ jumlah }`.

### Edge Cases
- [ ] Respons status **tidak** memuat `email`, `akunId`, atau token (periksa JSON mentah).
- [ ] `coba-lagi-penghapusan` tidak mereset job `AKUN_DIPUTUS`.
- [ ] Env tidak lengkap → POST admin 409 `BELUM_DIKONFIGURASI`; GET admin tetap 200 `dikonfigurasi: false`.

### Error Cases
- [ ] Setiap endpoint admin: tanpa sesi → 401; sesi non-ADMIN (PEGAWAI, KEPALA_SUB_BAGIAN_UMUM) → 403.
- [ ] Setiap POST: `Origin` beda → 403 sebelum sesi dibaca.
- [ ] Body tidak valid (field asing, `alamat` kosong, `mode` salah, `akun_id` bukan uuid) → 400.
- [ ] `$id` bukan uuid → 404.
- [ ] `GET /api/google-drive/status` tanpa sesi → 401.
- [ ] Galat tak terduga → 500 dengan pesan umum; `console.error` tidak menerima objek galat mentah.

## Tests for: Step 7 — Daftar isi, handler sinkron, runner

File: `tests/unit/google-drive/daftar-isi.test.ts`, `rencana-file.test.ts`, `sinkron-tautan.test.ts`, `runner.test.ts` [U]
(FakeDrive + repo palsu in-memory), `tests/unit/export/document-zip.test.ts` (regresi).

### Happy Path
- [ ] Rencana file: nama formal sama dengan ZIP; `kunci` `DOKUMEN:<id>:<i>` / `MANUAL:<id>:<attachmentId>`; nama ganda antar-dokumen → ` (2)`.
- [ ] Tautan 3 dokumen → folder dibuat di akar dengan `appProperties` tautan, 3 file + `DAFTAR_ISI.txt`, izin anyone/reader, `drive_status = SIAP`, `drive_folder_url` terisi, audit `DRIVE_TAUTAN_SIAP`, job `SELESAI`.
- [ ] **`drive_folder_id` tersimpan sebelum file pertama diunggah** (urutan panggilan repo vs FakeDrive).
- [ ] **`SIAP` hanya setelah semua file + izin** (tidak ada `SIAP` bila `shareAnyoneReader` gagal).
- [ ] `DAFTAR_ISI.txt` mengelompokkan per dokumen, menandai "(tidak tersedia)", "(telah dimusnahkan)", "(telah dibersihkan)", "(telah dihapus pemiliknya)", dan "Dokumen tanpa lampiran tersedia".
- [ ] Runner: `triggerDriveRunner()` dua kali saat loop berjalan → satu loop + satu putaran ulang (single-flight).

### Edge Cases
- [ ] **Lanjut setelah gagal di tengah tanpa unggahan ganda**: gagal `SEMENTARA` di file ke-2 → job dijadwalkan ulang; putaran berikutnya hanya mengunggah file 2–3 (FakeDrive menghitung 3 unggahan total).
- [ ] **Respons hilang**: FakeDrive menyimpan file ke-2 lalu melempar → percobaan ulang menemukan via `appProperties` dan tidak mengunggah ulang.
- [ ] **Dicabut di tengah** → berhenti, job `DIBATALKAN`, tidak `SIAP`.
- [ ] File fisik hilang / > 5 MB / dokumen sudah dimusnahkan → baris `DILEWATI`, tautan tetap `SIAP`.
- [ ] Baris ditandai `DILEWATI` oleh pemicu saat unggah sedang terbang → baris `MENGHAPUS` dengan `drive_file_id` + job `HAPUS_FILE` dibuat.
- [ ] **Parent akar hilang** (404 saat membuat folder tautan) → akar dibuat ulang, `root_folder_id` diperbarui, lanjut.
- [ ] Semua lampiran tidak tersedia → folder berisi `DAFTAR_ISI.txt` saja, `SIAP`.
- [ ] Runner menjadwalkan timer ke `jadwal_berikut` terdekat (fake timers), maksimal 1 jam; berhenti setelah anggaran waktu dan melanjutkan.
- [ ] Runner no-op bila env tidak lengkap.

### Error Cases
- [ ] **`KUOTA_PENUH` → job `GAGAL`, `drive_status = GAGAL`.**
- [ ] **`TOKEN_TIDAK_VALID` → job dijeda (`MENUNGGU`), akun ditandai perlu hubung ulang.**
- [ ] Folder tautan hilang saat unggah (404) → `GAGAL TIDAK_DITEMUKAN` dengan pesan "Folder di Drive tidak ditemukan — cabut lalu buat tautan baru".
- [ ] Akun `DIPUTUS` → `GAGAL AKUN_DIPUTUS`.
- [ ] Galat non-Drive di handler → `PERMANEN`, runner tetap lanjut ke job berikutnya dan tidak melempar.
- [ ] `DAFTAR_ISI.txt` tidak memuat logical path, path fisik, id dokumen, atau token.
- [ ] Regresi: tes ekspor ZIP lama lulus tanpa perubahan harapan.

## Tests for: Step 8 — Rute tautan dan pemicu runner

File: `tests/unit/laporan/tautan-route.test.ts` (diperluas), `tautan-service.test.ts` (diperluas),
`tests/unit/laporan/tautan-drive-route.test.ts` [U].

### Happy Path
- [ ] `POST /api/laporan/tautan` `akses: 'DRIVE'` dengan Drive tersedia → 201, `drive_status: 'MENUNGGU'`, `path: null`, runner dipicu.
- [ ] Insert tautan + baris file + job terjadi dalam satu transaksi (repo palsu mencatat urutan dalam `tx`).
- [ ] `GET /api/laporan/tautan` mengembalikan `drive_status`, `drive_progres`, `drive_url` (hanya `SIAP` & belum dicabut), `drive_galat`, `drive_tertunda_akun`; memicu runner.
- [ ] `POST /api/laporan/tautan/$id/coba-lagi` oleh pembuat pada tautan `GAGAL` → 200; job `MENUNGGU`, `percobaan = 0`.

### Edge Cases
- [ ] Tautan `LOGIN`/`PUBLIK` tetap berperilaku sama (tes lama lulus); `path` tetap terisi.
- [ ] Penyaringan snapshot DRIVE sama persis dengan tautan biasa (id di luar cakupan dibuang, `jumlah_diabaikan`).
- [ ] Coba lagi pada tautan `SIAP` → 409.

### Error Cases
- [ ] **Buat tautan `DRIVE` tanpa akun aktif → 409** dengan pesan alasan; juga `BELUM_DIKONFIGURASI` dan `PERLU_HUBUNG_ULANG`.
- [ ] **Coba lagi oleh bukan pembuat → 404**; tautan dicabut → 404; id bukan uuid → 404; tanpa sesi → 401; beda origin → 403.
- [ ] **`GET /api/tautan/<token>` untuk tautan `DRIVE` → 404**, juga rute preview/download/export-zip.
- [ ] **`/lampiran/<tautanId>/...` untuk tautan `DRIVE` → 404** (halaman galat, bukan berkas).
- [ ] >500 dokumen → 413 sebelum menyentuh Drive.

## Tests for: Step 9 — Handler hapus dan hook pemicu

File: `tests/unit/google-drive/hapus.test.ts`, `penghapusan.test.ts` [U];
`tests/unit/arsiparis/*`, `tests/unit/dokumen/pembersihan-route.test.ts`, `dokumen-delete-audit-log.test.ts` (diperluas);
`tests/integration/google-drive-penghapusan.test.ts` [I].

### Happy Path
- [ ] Cabut tautan DRIVE → dalam satu transaksi: `revoked_at`, `drive_status = MENGHAPUS`, job sinkron `MENUNGGU` → `DIBATALKAN`, job `HAPUS_TAUTAN`.
- [ ] `handleHapusTautan` → folder dihapus permanen di FakeDrive, `drive_status = DIHAPUS`, baris file `DIHAPUS` (`DICABUT`), audit `DRIVE_TAUTAN_DIHAPUS`.
- [ ] `approve_destruction` → baris `TERUNGGAH` dokumen/manual di berkas itu → `MENGHAPUS` (`DIMUSNAHKAN`), job `HAPUS_FILE` per tautan; handler menghapus file dan memperbarui `DAFTAR_ISI.txt` ("telah dimusnahkan"); audit `DRIVE_FILE_DIHAPUS`.
- [ ] Pembersihan → sama dengan keterangan `DIBERSIHKAN`.
- [ ] Hapus permanen dokumen non-material → sama dengan keterangan `DIHAPUS_PEMILIK`.

### Edge Cases
- [ ] **Hapus 404 → dianggap berhasil** (folder dan file).
- [ ] Folder belum pernah dibuat → langsung `DIHAPUS` tanpa panggilan Drive; `drive_folder_dicoba_pada` terisi → dicari dulu lewat `appProperties`.
- [ ] Baris `MENUNGGU` saat pemusnahan → langsung `DILEWATI` (tidak pernah diunggah).
- [ ] Job hapus saat `SINKRON_TAUTAN` masih `PROSES` → ditunda 30 dtk tanpa menambah `percobaan` (D13).
- [ ] `HAPUS_FILE` untuk tautan yang sudah dicabut → `SELESAI` tanpa panggilan Drive.
- [ ] `USUL_MUSNAH` dan `cancel_proposal` tidak membuat job apa pun.
- [ ] Tautan yang sudah dicabut tidak disentuh hook pemusnahan/pembersihan/hapus permanen.
- [ ] Respons API cabut, lifecycle, pembersihan, dan DELETE dokumen tidak berubah bentuk.

### Error Cases
- [ ] Akun `DIPUTUS` → job hapus `GAGAL AKUN_DIPUTUS` dan muncul di daftar "perlu dihapus manual".
- [ ] `SEMENTARA` saat hapus → dijadwalkan ulang; link Drive tetap ada sampai berhasil (batasan diterima).
- [ ] [I] **Cabut, `approve_destruction`, Pembersihan, hapus permanen: job dibuat di transaksi yang sama; rollback (lempar di akhir transaksi) → job dan perubahan status baris file tidak ada.**
- [ ] [I] Update status lifecycle gagal bersyarat (status sudah berubah) → tidak ada job hapus.

## Tests for: Step 10 — UI dialog dan Riwayat

File: `tests/unit/laporan/tautan-drive-ui-source.test.ts` [S] (+ `tautan-wiring-source.test.ts` tetap lulus).

### Happy Path
- [ ] Dialog memuat tiga pilihan akses (`Terbatas`, `Publik`, `Google Drive`) dalam `sm:grid-cols-3`.
- [ ] Teks peringatan Drive persis SPEC 10.1 ada di source.
- [ ] Dialog memanggil `GOOGLE_DRIVE_API.STATUS` dan memakai tiga pesan alasan dari `shared.ts`.
- [ ] Riwayat memuat tombol "Coba lagi", teks "Salin link Drive", "Buka di Drive", "Tertunda: akun Drive perlu dihubungkan ulang", "terhapus dari Drive".

### Edge Cases
- [ ] Akses direset ke `TAUTAN_AKSES.LOGIN` di efek pembukaan dialog (tetap ada).
- [ ] Interval polling 3000 ms (dialog) dan 5000 ms (riwayat) dibersihkan saat dialog tertutup (`clearInterval`/`clearTimeout` ada).

### Error Cases
- [ ] Kartu Drive memakai `aria-disabled`/`disabled` bila tidak tersedia (source guard).
- [ ] Source tidak menampilkan `item.path` untuk akses `DRIVE`.

## Tests for: Step 11 — UI Pengaturan ADMIN

File: `tests/unit/admin/google-drive-settings-source.test.ts` [S].

### Happy Path
- [ ] `admin.settings.tsx` merender `GoogleDriveSettings`.
- [ ] Komponen memuat teks: "Hubungkan akun Google", "Ganti akun", "Putuskan", "Hubungkan ulang", "Putuskan permanen",
      "Tempel alamat dari tab yang gagal dimuat", "Perlu dihapus manual di Drive", "Coba lagi penghapusan yang gagal".
- [ ] Langkah 1 membuka tab baru dengan `noopener`.

### Edge Cases
- [ ] Komponen memakai konstanta `GOOGLE_DRIVE_API` (tanpa string path ajaib).

### Error Cases
- [ ] Komponen **tidak** memanggil `/auth/logout` maupun endpoint settings/epoch.
- [ ] Komponen tidak merender daftar dokumen/nama file (tidak memuat field `nama_file`).

## Tests for: Step 12 — Dokumentasi, env, `drive:sync`

File: `tests/unit/google-drive/drive-sync-script-source.test.ts` [S] (opsional, ringan).

### Happy Path
- [ ] `package.json` memuat script `drive:sync` yang menjalankan `src/scripts/drive-sync.ts` lewat `dotenv -e .env -- tsx`.
- [ ] `.env.example` memuat `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `DMS_DRIVE_TOKEN_KEY` tanpa nilai rahasia.

### Edge Cases
- [ ] Skrip menutup `pool` di `finally` dan `exitCode = 1` bila ada galat sistem.

### Error Cases
- [ ] Skrip tidak mencetak token/email (source guard: tidak ada `console.log` dengan objek akun).
- [ ] Seluruh suite: `pnpm test`, `pnpm test:integration`, `pnpm typecheck` hijau; uji terima manual SPEC 12.3 dicatat di `uji-terima-manual.md`.
