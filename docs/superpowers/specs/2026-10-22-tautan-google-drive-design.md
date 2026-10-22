# Spec: Bagikan Tautan Laporan ke Google Drive

- Tanggal: 2026-10-22
- Status: rancangan disetujui pemilik repo (Bagian 1–6), menunggu review spec
- Repo: `BingoAndBro/aplikasi-web-dms-kepser` (privat, salinan repo skripsi; repo skripsi tidak boleh diubah)
- Tahap berikutnya: `deep-plan` → `deep-implement` (direncanakan di cloud session)

Dokumen ini berdiri sendiri: semua keputusan dari diskusi perancangan dicatat di sini
beserta alasannya, supaya sesi lain (termasuk cloud session) bisa melanjutkan tanpa
membaca percakapan perancangan.

---

## 1. Latar Belakang dan Masalah

DMS Kepser berjalan di server lokal kantor (LAN). Fitur **Tautan Laporan** yang sudah ada
(`src/lib/laporan/tautan.ts`, `src/components/laporan/BagikanTautan.tsx`) membuat satu
tautan permanen berisi snapshot dokumen dari Laporan Saya / Laporan Kegiatan / Laporan
Kinerja, dengan akses `LOGIN` (Terbatas) atau `PUBLIK`. Tautan itu ditempel pegawai ke
aplikasi instansi **KIPAPP**.

Masalah: tautan DMS hanya bisa dibuka dari jaringan yang sama dengan server. Penilai di
KIPAPP sering berada di luar jaringan kantor. Praktik saat ini: pegawai mengunggah file ke
Google Drive secara manual, lalu menempel link Drive ke KIPAPP.

## 2. Tujuan

1. Pembuat tautan bisa memilih tujuan **Google Drive**: server mengunggah salinan dokumen
   snapshot ke akun Google Drive satker dan menghasilkan **link folder Drive** yang bisa
   dibuka dari internet (siapa saja yang memegang link, hanya lihat).
2. Aplikasi tetap berjalan di LAN. Server hanya membuat koneksi **keluar** ke Google;
   tidak ada port yang dibuka ke internet.
3. Akun Google bisa **diganti dari UI ADMIN** (uji dengan Gmail pribadi, lalu pindah ke
   Gmail kantor 1 TB) tanpa mengubah kode/`.env`, dan tautan lama tetap berfungsi.
4. Aturan DMS tetap berlaku pada salinan: cabut tautan, berkas `DIMUSNAHKAN`, dan
   Pembersihan Dokumen ikut **menghapus permanen** salinan di Drive.
5. Unggah dan hapus berjalan di latar belakang, tahan internet putus dan server restart.

## 3. Bukan Tujuan (YAGNI)

- Memindahkan seluruh penyimpanan ke Drive (server lokal tetap sumber kebenaran).
- Hosting aplikasi di cloud / membuka aplikasi ke internet (Cloudflare Tunnel, dll.).
- Sinkron balik dari Drive ke DMS; perubahan manual di Drive diabaikan (kecuali 404 saat hapus).
- Mengaktifkan ulang tautan yang sudah dicabut (sama seperti tautan DMS: buat tautan baru).
- Membatasi berbagi ke domain tertentu (akun Gmail biasa tidak mendukung pembatasan domain).
- E2E Playwright untuk alur Drive (butuh jalur "Drive palsu" di kode produksi); diganti uji terima manual.
- Shared Drive / service account (akun yang dipakai adalah Gmail biasa; service account tidak punya kuota).

## 4. Keputusan Utama dan Alasannya

| # | Keputusan | Alasan |
|---|---|---|
| K1 | Google Drive menjadi **pilihan akses ketiga** (`akses = 'DRIVE'`) di dialog Bagikan Tautan yang sama | Satu baris tautan, satu Riwayat Tautan, satu tombol cabut |
| K2 | Isi di Drive: **satu folder per tautan** berisi file lampiran (nama formal sama dengan isi ZIP) + `DAFTAR_ISI.txt`; link yang dibagikan = link folder | Penilai bisa pratinjau langsung di Drive; pemusnahan cukup menghapus file terkait |
| K3 | Yang mengelola koneksi akun: **ADMIN saja** (Admin → Pengaturan) | Sejalan dengan peran ADMIN mengelola pengaturan; ADMIN tetap tidak melihat isi dokumen |
| K4 | Cabut / `DIMUSNAHKAN` / Pembersihan → **hapus permanen otomatis** (bukan Trash, bukan sekadar cabut izin) | Konsisten dengan arti "dimusnahkan" di DMS |
| K5 | Ganti akun: akun lama menjadi **`NONAKTIF`**, tokennya disimpan khusus untuk penghapusan; ADMIN bisa memutus permanen | Tautan lama tetap bisa dicabut/dimusnahkan di Drive lama |
| K6 | Hubungkan akun dengan **salin-tempel alamat** (OAuth client "Desktop app", redirect loopback `http://127.0.0.1:<port>`) | Google tidak menerima IP LAN sebagai redirect; cara ini bisa dari PC mana pun di LAN |
| K7 | Antrean job di DB + **runner di dalam proses server** (bukan sinkron, bukan worker terpisah) | Tahan internet putus & restart tanpa proses tambahan; meniru pola `pending-upload-sweeper` |
| K8 | Scope OAuth minimum: `https://www.googleapis.com/auth/drive.file`, `openid`, `email` | Aplikasi hanya bisa menyentuh file buatannya sendiri |
| K9 | Refresh token disimpan **terenkripsi di DB** (AES-256-GCM, kunci di env) | Supaya ganti akun bisa dari UI; kunci tetap di env (invariant "rahasia hanya di env") |
| K10 | Link Drive baru diberikan setelah **semua file selesai** diunggah | Tidak pernah membagikan folder setengah jadi |

## 5. Persiapan di Luar Kode (dilakukan pemilik, sekali)

1. Google Cloud Console → buat project → aktifkan **Google Drive API**.
2. OAuth consent screen: tipe **External**, status **Testing**, tambahkan email penguji sebagai *test user*.
   - Mode Testing: refresh token kedaluwarsa ±7 hari → cukup klik "Hubungkan ulang". Untuk pemakaian
     nyata dengan Gmail kantor, publikasikan ke *In production* (scope `drive.file` termasuk non-sensitive).
3. Buat **OAuth client ID tipe "Desktop app"** → isi `GOOGLE_OAUTH_CLIENT_ID` dan `GOOGLE_OAUTH_CLIENT_SECRET` di `.env`.
4. Buat kunci: `DMS_DRIVE_TOKEN_KEY` = 32 byte acak dalam base64 (perintah pembuatnya ditulis di `.env.example`).
5. Setelah uji berhasil, tambahkan akun kantor sebagai *Owner* project Google Cloud.

Biaya: Drive API gratis; tidak perlu akun billing. Kapasitas mengikuti kuota akun (Gmail pribadi 15 GB; Gmail kantor 1 TB).

## 6. Data dan Skema (Drizzle, schema `app` dan `audit`)

Semua perubahan lewat `src/db/schema/**` → `pnpm db:local:generate` → baca SQL → `pnpm db:local:migrate`.

### 6.1 Tabel baru `app.google_drive_akun`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `email` | text not null | Ditampilkan di Pengaturan ADMIN |
| `refresh_token_enc` | text null | Ciphertext AES-256-GCM (format `v1:<iv>:<tag>:<data>` base64url). `null` setelah `DIPUTUS` |
| `root_folder_id` | text null | Folder `DMS Kepser` buatan aplikasi di Drive akun ini |
| `status` | text not null | `AKTIF` / `NONAKTIF` / `DIPUTUS` (check constraint) |
| `perlu_hubung_ulang_sejak` | timestamptz null | Diisi saat token ditolak Google / gagal didekripsi; dikosongkan saat dihubungkan ulang |
| `dihubungkan_oleh`, `dihubungkan_pada` | uuid FK users, timestamptz | |
| `dinonaktifkan_pada` | timestamptz null | |
| `diputus_oleh`, `diputus_pada` | uuid FK users null, timestamptz null | |

Constraint:
- **Partial unique index**: hanya satu baris `status = 'AKTIF'`.
- Unique `(email)` untuk baris yang belum `DIPUTUS` (menghubungkan ulang email yang sama memperbarui baris yang ada).

### 6.2 Perubahan `app.laporan_tautan`

- `akses`: tambah nilai `DRIVE` (konstanta di `LAPORAN_TAUTAN_AKSES_VALUES`, check constraint ikut diperbarui, `TAUTAN_AKSES`/`TAUTAN_AKSES_LABEL` di `tautan-shared.ts`).
- Kolom baru (hanya terisi untuk `akses = 'DRIVE'`):

| Kolom | Keterangan |
|---|---|
| `drive_akun_id` | FK ke `google_drive_akun` — akun yang dipakai saat tautan dibuat (tidak berubah walau akun aktif diganti) |
| `drive_folder_id` | ID folder tautan di Drive; disimpan **sebelum** file pertama diunggah |
| `drive_folder_url` | `webViewLink` folder; diisi saat `SIAP` |
| `drive_status` | `MENUNGGU` → `MENGUNGGAH` → `SIAP` / `GAGAL`; setelah dicabut `MENGHAPUS` → `DIHAPUS` |
| `drive_daftar_isi_file_id` | ID file `DAFTAR_ISI.txt` di folder tautan (untuk diperbarui saat pemusnahan/pembersihan) |

- Check constraint: `akses = 'DRIVE'` ⇔ `drive_akun_id` dan `drive_status` tidak null.
- Kolom `token` tetap diisi (not null, unique) tetapi tautan `DRIVE` **tidak bisa dibuka** lewat `/tautan/<token>` maupun `/api/tautan/<token>/...` dan `/lampiran/...` (404).

### 6.3 Tabel baru `app.laporan_tautan_drive_file`

Satu baris per lampiran yang disalin ke Drive.

| Kolom | Keterangan |
|---|---|
| `id` | uuid PK |
| `tautan_id` | FK `laporan_tautan` |
| `sumber` | `DOKUMEN` / `MANUAL_ARSIP` |
| `dokumen_id`, `lampiran_index` | untuk sumber `DOKUMEN` |
| `manual_arsip_id`, `attachment_id` | untuk sumber `MANUAL_ARSIP` |
| `kunci_lampiran` | text, mis. `DOKUMEN:<dokumen_id>:<index>` / `MANUAL:<manual_arsip_id>:<attachment_id>` |
| `nama_file` | nama formal (sama dengan entri ZIP) |
| `drive_file_id` | null sampai terunggah |
| `status` | `MENUNGGU` / `TERUNGGAH` / `MENGHAPUS` / `DIHAPUS` / `DILEWATI` (file sudah tidak tersedia saat akan diunggah) |
| `keterangan_hapus` | `DICABUT` / `DIMUSNAHKAN` / `DIBERSIHKAN` (untuk `DAFTAR_ISI.txt`) |
| `diunggah_pada`, `dihapus_pada` | timestamptz null |

Constraint: unique `(tautan_id, kunci_lampiran)` — percobaan ulang tidak membuat unggahan ganda.
Index: `(dokumen_id)`, `(manual_arsip_id)` untuk pencarian saat pemusnahan/pembersihan.

`DAFTAR_ISI.txt` tidak masuk tabel ini; ID-nya disimpan di `laporan_tautan.drive_daftar_isi_file_id` (6.2).

### 6.4 Tabel baru `app.drive_job` (antrean)

| Kolom | Keterangan |
|---|---|
| `id` | uuid PK |
| `jenis` | `SINKRON_TAUTAN` / `HAPUS_TAUTAN` / `HAPUS_FILE` |
| `akun_id` | FK `google_drive_akun` |
| `tautan_id` | FK `laporan_tautan` |
| `prioritas` | int; `HAPUS_*` = 0 (lebih dulu), `SINKRON_TAUTAN` = 10 |
| `status` | `MENUNGGU` / `PROSES` / `SELESAI` / `GAGAL` / `DIBATALKAN` |
| `percobaan` | int default 0 |
| `jadwal_berikut` | timestamptz default now() |
| `dikunci_pada` | timestamptz null |
| `galat_kategori`, `galat_pesan` | kategori (lihat 11.2) + pesan pendek berbahasa Indonesia; **tidak pernah** respons mentah Google |
| `dibuat_pada`, `selesai_pada` | |

Index: `(status, prioritas, jadwal_berikut)`; `(tautan_id)`.

Job `HAPUS_FILE` memproses semua baris `laporan_tautan_drive_file` berstatus `MENGHAPUS` pada `tautan_id`-nya (satu job per tautan, bukan per file).

### 6.5 Audit (`audit.audit_log`, append-only)

Tambah ke check constraint dan konstanta:
- `entity_type`: `GOOGLE_DRIVE_AKUN`, `LAPORAN_TAUTAN`.
- `aksi`: `DRIVE_AKUN_DIHUBUNGKAN`, `DRIVE_AKUN_DINONAKTIFKAN`, `DRIVE_AKUN_DIPUTUS`, `DRIVE_TAUTAN_SIAP`, `DRIVE_TAUTAN_DIHAPUS`, `DRIVE_FILE_DIHAPUS`.
- `actor_user_id` null untuk aksi yang dijalankan runner. `metadata_snapshot` tanpa token, tanpa path fisik.

## 7. Koneksi dan Ganti Akun Google (ADMIN)

### 7.1 Alur hubungkan
1. `POST /api/admin/google-drive/mulai-hubung` → server membuat `state` + PKCE `code_verifier`, disimpan **di memori** (TTL 10 menit, terikat ke ID sesi ADMIN), mengembalikan `auth_url` dengan `access_type=offline`, `prompt=consent`, scope K8, `redirect_uri=http://127.0.0.1:53682/` (konstanta).
2. ADMIN membuka `auth_url` di tab baru, login, klik Izinkan; tab berakhir di `http://127.0.0.1:53682/?state=…&code=…` (gagal dimuat — normal).
3. ADMIN menempel alamat tersebut → `POST /api/admin/google-drive/hubungkan` `{ alamat }`.
4. Server: Zod → parse URL (harus host `127.0.0.1`/`localhost`, punya `state` & `code`, atau `error`) → cocokkan `state` dengan sesi → tukar `code` + `code_verifier` → verifikasi `id_token` untuk email → pastikan ada `refresh_token`.
5. Buat folder `DMS Kepser` (atau pakai `root_folder_id` lama bila email sama dan folder masih ada).
6. **Satu transaksi**: akun `AKTIF` lama → `NONAKTIF` (`dinonaktifkan_pada`); simpan/perbarui akun baru sebagai `AKTIF`; audit.
7. Job yang tertunda karena akun ini perlu dihubungkan ulang: `jadwal_berikut = now()`; picu runner.

### 7.2 Kasus khusus
- **Email yang sudah ada (belum `DIPUTUS`) dihubungkan lagi**: tidak membuat baris baru. Perbarui `refresh_token_enc`, kosongkan `perlu_hubung_ulang_sejak`, pertahankan `root_folder_id`. Hasil statusnya mengikuti tombol yang dipakai:
  - **Hubungkan ulang** (pada akun `AKTIF` atau `NONAKTIF`): status tidak berubah.
  - **Ganti akun / Hubungkan akun** dan email yang ditempel ternyata akun `NONAKTIF`: akun itu menjadi `AKTIF`, akun `AKTIF` sebelumnya menjadi `NONAKTIF` (transaksi 7.1 langkah 6).
- **Email yang pernah `DIPUTUS` dihubungkan lagi**: baris baru (folder akar baru); baris lama tetap `DIPUTUS`.
- **Token rusak** (`invalid_grant`, atau dekripsi gagal karena `DMS_DRIVE_TOKEN_KEY` berubah): isi `perlu_hubung_ulang_sejak`; job akun itu dijeda (tetap `MENUNGGU`, dilewati runner); pilihan Drive di dialog dinonaktifkan bila akun aktif terdampak.
- **Folder akar dihapus manual**: saat membuat folder tautan mendapat 404 pada parent → buat ulang `DMS Kepser`, simpan `root_folder_id` baru, lanjutkan.
- **Putuskan / Putuskan permanen** `POST /api/admin/google-drive/$id/putuskan`: konfirmasi menyebut jumlah tautan Drive aktif pada akun itu → cabut token di Google (*best effort*) → `refresh_token_enc = null`, `status = DIPUTUS` → job `MENUNGGU` akun itu menjadi `GAGAL` kategori `AKUN_DIPUTUS` ("hapus manual di Drive") → audit.

### 7.3 Endpoint
| Endpoint | Peran | Keterangan |
|---|---|---|
| `GET /api/google-drive/status` | semua sesi login | `{ tersedia: boolean, alasan: 'BELUM_DIKONFIGURASI' \| 'BELUM_ADA_AKUN' \| 'PERLU_HUBUNG_ULANG' \| null }` — tanpa email/token |
| `GET /api/admin/google-drive` | ADMIN | ringkasan akun (email, status, jumlah tautan aktif, jumlah job gagal), daftar "perlu dihapus manual" (judul tautan + nama folder + email akun) |
| `POST /api/admin/google-drive/mulai-hubung` | ADMIN | `{ auth_url }` |
| `POST /api/admin/google-drive/hubungkan` | ADMIN | `{ alamat }` → ringkasan akun |
| `POST /api/admin/google-drive/$id/putuskan` | ADMIN | |
| `POST /api/admin/google-drive/coba-lagi-penghapusan` | ADMIN | reset job `HAPUS_*` yang `GAGAL` (bukan kategori `AKUN_DIPUTUS`) |

Semua rute: same-origin (metode tidak aman) → sesi → peran → Zod → DB. Path di `src/lib/constants/routes.ts`.

## 8. Alur Buat Tautan → Unggah → Status

### 8.1 Membuat tautan (`POST /api/laporan/tautan`, `akses: 'DRIVE'`)
1. Server menghitung ketersediaan dengan logika yang sama dengan `GET /api/google-drive/status`; bila tidak tersedia → 409 dengan pesan yang sama dengan alasan di UI.
2. Penyaringan snapshot **sama persis** dengan tautan sekarang (`createTautanForSession`): id di luar hak pembuat dibuang, batas `TAUTAN_MAX_DOKUMEN = 500`.
3. Daftar file + nama file diambil dari helper ekspor ZIP yang sama (`buildLaporanZipEntries`, `buildManualArsipZipEntries`, `resolveDocumentLampiranLogicalPathForExport`). Lampiran yang sudah `DIMUSNAHKAN`/dibersihkan tidak dibuatkan baris unggah; dicatat "tidak tersedia" di `DAFTAR_ISI.txt`.
4. **Satu transaksi**: insert `laporan_tautan` (`akses = DRIVE`, `drive_akun_id` = akun aktif, `drive_status = MENUNGGU`) + baris `laporan_tautan_drive_file` + job `SINKRON_TAUTAN`.
5. Setelah commit: picu runner tanpa menunggu. Respons berisi item tautan dengan `drive_status = MENUNGGU`, tanpa link.

### 8.2 Handler `SINKRON_TAUTAN`
1. Tautan sudah dicabut → job `DIBATALKAN`.
2. Akun `perlu_hubung_ulang` → job tetap `MENUNGGU` (dijeda).
3. `drive_status = MENGUNGGAH`. Bila `drive_folder_id` null: buat folder `<judul> (<YYYY-MM-DD>)` di `root_folder_id`, **simpan `drive_folder_id` segera**.
4. Untuk tiap baris `MENUNGGU` (urut `kunci_lampiran`): cek tautan belum dicabut; cek file masih tersedia (belum dimusnahkan/dibersihkan; bila tidak → `DILEWATI`); unggah (multipart, file ≤ 5 MB) dengan stream dari `src/lib/storage/*`; simpan `drive_file_id`, `TERUNGGAH`, `diunggah_pada` **per file**.
5. Unggah/perbarui `DAFTAR_ISI.txt` (format seperti ZIP, tanpa path; baris `DILEWATI` ditandai "tidak tersedia").
6. Pasang izin `{ type: 'anyone', role: 'reader' }` pada folder, ambil `webViewLink`.
7. Satu transaksi kecil: `drive_folder_url`, `drive_status = SIAP` (hanya bila belum dicabut) + audit `DRIVE_TAUTAN_SIAP`; job `SELESAI`.

### 8.3 Runner
- **Klaim**: `UPDATE drive_job SET status='PROSES', dikunci_pada=now() WHERE id = (SELECT id ... WHERE status='MENUNGGU' AND jadwal_berikut <= now() AND akun tidak perlu_hubung_ulang ORDER BY prioritas, jadwal_berikut FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`.
- Job `PROSES` dengan `dikunci_pada` > 15 menit lalu dianggap macet → boleh diklaim ulang.
- `HAPUS_TAUTAN` untuk tautan yang masih punya `SINKRON_TAUTAN` berstatus `PROSES` ditunda sebentar (`jadwal_berikut + 30 dtk`).
- **Single-flight** per proses: satu loop aktif; pemicu saat loop berjalan hanya menandai "jalankan lagi".
- File diproses berurutan (tanpa paralel) untuk menghindari rate limit.
- Setelah loop habis: bila masih ada job `MENUNGGU` di masa depan → `setTimeout` ke `jadwal_berikut` terdekat (maks 1 jam).
- **Pemicu**: tautan dibuat / dicabut / coba lagi; `approve_destruction`; Pembersihan; `GET` Riwayat Tautan; `GET /api/admin/google-drive`; hubungkan ulang akun.
- Skrip `pnpm drive:sync` (pola `storage:sweep-pending`) menjalankan satu putaran runner untuk Windows Task Scheduler.
- `now` diinjeksikan (tes deterministik).

### 8.4 Coba lagi oleh pembuat
`POST /api/laporan/tautan/$id/coba-lagi` (hanya pembuat, tautan belum dicabut, `drive_status = GAGAL`): job `SINKRON_TAUTAN` → `MENUNGGU`, `percobaan = 0`, `jadwal_berikut = now()`; `drive_status = MENUNGGU`.

## 9. Penghapusan

Prinsip: DMS memblokir akses seketika; Drive menyusul lewat antrean. Job hapus dibuat
**dalam transaksi yang sama** dengan perubahan status pemicunya.

| Pemicu (lokasi kode) | Dalam transaksi yang sama | Handler |
|---|---|---|
| Cabut tautan (`revokeTautanByCreator`, `tautan-repository.ts`) | `revoked_at`, `drive_status = MENGHAPUS`, job `SINKRON_TAUTAN` `MENUNGGU` → `DIBATALKAN`, insert `HAPUS_TAUTAN` | Hapus permanen folder (semua isi ikut). 404 = berhasil. Folder belum pernah dibuat → langsung `DIHAPUS`. Lalu `drive_status = DIHAPUS`, baris file → `DIHAPUS` (`DICABUT`), audit |
| Berkas `USUL_MUSNAH → DIMUSNAHKAN` (aksi `approve_destruction`, `berkas-arsip-service.ts`) | Baris `TERUNGGAH` untuk dokumen workflow + arsip manual di berkas itu, pada tautan belum dicabut → `MENGHAPUS` (`DIMUSNAHKAN`); insert `HAPUS_FILE` per tautan | Hapus permanen tiap file; perbarui `DAFTAR_ISI.txt` ("telah dimusnahkan"); audit |
| Pembersihan Dokumen (`executePembersihanLampiran`, `pembersihan-service.ts`) | Sama, keterangan `DIBERSIHKAN` | Sama ("telah dibersihkan") |

Catatan:
- Pemicu pemusnahan adalah perubahan status ke `DIMUSNAHKAN` (saat akses DMS ditutup), **bukan** pemusnahan fisik file lokal (`berkas-arsip-physical-destruction.ts`) yang berjalan terpisah.
- `USUL_MUSNAH` dan pembatalan usulan tidak memicu apa pun.
- Baris yang masih `MENUNGGU` (belum terunggah) saat pemusnahan/pembersihan → langsung `DILEWATI`.
- Akun `DIPUTUS` → job `GAGAL` kategori `AKUN_DIPUTUS`; tampil di daftar "perlu dihapus manual" ADMIN.
- Selama internet putus, link Drive masih bisa dibuka sampai job hapus berhasil. Batasan ini ditampilkan jujur di UI.

## 10. UI

### 10.1 Dialog "Bagikan sebagai Tautan" (`BagikanTautan.tsx`)
- Radiogroup akses menjadi 3 kartu (`sm:grid-cols-3`, bertumpuk di HP): Terbatas · Publik · **Google Drive** ("Bisa dibuka dari internet lewat link Google Drive").
- Ketersediaan dari `GET /api/google-drive/status`. Tidak tersedia → kartu nonaktif + alasan: "Fitur Google Drive belum dikonfigurasi", "Belum ada akun Google Drive terhubung — hubungi Admin", "Akun Google Drive perlu dihubungkan ulang — hubungi Admin".
- Pilih Google Drive → peringatan kuning: *"Siapa saja yang memegang link Google Drive dapat melihat dan mengunduh dokumen tanpa login. Salinan dihapus dari Drive saat tautan dicabut atau berkas dimusnahkan."*
- Setelah dibuat: "Sedang diunggah ke Google Drive (x/y)…", polling tiap 3 detik selama dialog terbuka. `SIAP` → tombol **Salin link Drive** + **Buka di Drive**. Dialog boleh ditutup; unggahan tetap berjalan.
- Akses kembali ke Terbatas setiap dialog dibuka (perilaku sekarang untuk Publik dipertahankan untuk Drive).

### 10.2 Riwayat Tautan
API daftar tautan menambah field: `drive_status`, `drive_progres: { selesai, total } | null`, `drive_url` (hanya bila `SIAP` dan belum dicabut), `drive_galat` (pesan pendek), `drive_tertunda_akun: boolean`.

| Status | Tampilan | Aksi |
|---|---|---|
| `MENUNGGU`/`MENGUNGGAH` | "Mengunggah 12/40" + spinner | Cabut |
| `SIAP` | "Google Drive · Siap" | Salin link Drive, Buka di Drive, Cabut |
| `GAGAL` | "Gagal: <pesan>" | Coba lagi, Cabut |
| tertunda akun | "Tertunda: akun Drive perlu dihubungkan ulang" | Cabut |
| `MENGHAPUS`/`DIHAPUS` | "Dicabut · menghapus dari Drive…" / "Dicabut · terhapus dari Drive" | — |

Polling tiap 5 detik selama dialog terbuka dan ada baris yang masih berproses.

### 10.3 Admin → Pengaturan → bagian "Google Drive" (`admin.settings.tsx`)
- Akun aktif: email, badge (Terhubung / Perlu dihubungkan ulang), jumlah tautan Drive aktif, jumlah pekerjaan gagal; tombol **Ganti akun**, **Putuskan**, **Hubungkan ulang** (bila perlu).
- Belum ada akun: tombol **Hubungkan akun Google**.
- Panel hubungkan 2 langkah: (1) **Buka halaman login Google** (tab baru); (2) kotak "Tempel alamat dari tab yang gagal dimuat" + **Simpan**; teks bantu bahwa halaman gagal dimuat itu normal.
- Akun tidak aktif: email, jumlah tautan, **Putuskan permanen** (konfirmasi).
- "Perlu dihapus manual di Drive": judul tautan, nama folder, email akun. Tombol **Coba lagi penghapusan yang gagal**.
- ADMIN tidak melihat daftar dokumen.

## 11. Struktur Modul dan Penanganan Galat

### 11.1 Modul (`src/lib/google-drive/`)
| Modul | Tugas | Bergantung pada |
|---|---|---|
| `config.ts` | Baca/validasi env; `isDriveConfigured()` | env |
| `token-crypto.ts` | Enkripsi/dekripsi refresh token | `DMS_DRIVE_TOKEN_KEY` |
| `oauth.ts` | URL login (state+PKCE, store memori TTL), parse alamat tempel, tukar code, verifikasi email | `google-auth-library` |
| `drive-client.ts` | **Satu-satunya** pemanggil Google. Interface `DriveClient`: `createFolder`, `uploadFile`, `updateFileContent`, `shareAnyoneReader`, `getWebViewLink`, `deleteFile`, `revokeToken` | `@googleapis/drive` |
| `drive-errors.ts` | Klasifikasi galat | — |
| `akun-repository.ts` | Hubungkan/ganti/putus/tandai perlu hubung ulang (transaksi + audit) | DB |
| `jobs.ts` | enqueue (menerima `tx`), klaim, selesai, gagal + backoff | DB |
| `sinkron-tautan.ts`, `hapus.ts` | Handler job | `DriveClient`, `jobs`, storage, helper ZIP |
| `daftar-isi.ts` | Bangun teks `DAFTAR_ISI.txt` | helper ZIP |
| `runner.ts` | Loop single-flight + timer | `jobs`, handler |

Tes memakai **FakeDrive** in-memory yang mengimplementasikan `DriveClient`.

Paket baru (disetujui pemilik): `@googleapis/drive`, `google-auth-library`.

### 11.2 Kategori galat
| Kategori | Contoh | Tindakan |
|---|---|---|
| `SEMENTARA` | jaringan putus, timeout, 429, 5xx | coba ulang dengan jeda |
| `TOKEN_TIDAK_VALID` | `invalid_grant`, 401 setelah refresh, dekripsi gagal | tandai akun perlu hubung ulang; job dijeda |
| `KUOTA_PENUH` | 403 `storageQuotaExceeded` | `GAGAL` langsung: "Kuota Google Drive penuh" |
| `TIDAK_DITEMUKAN` | 404 | hapus: dianggap berhasil; unggah ke folder tautan yang hilang: `GAGAL` "Folder di Drive tidak ditemukan — cabut lalu buat tautan baru"; parent akar hilang: buat ulang akar |
| `PERMANEN` | 400/403 lain | `GAGAL` dengan pesan umum |
| `AKUN_DIPUTUS` | job untuk akun tanpa token | `GAGAL`, hapus manual |

Jeda coba ulang (`SEMENTARA`): 1 m, 5 m, 15 m, 1 j, 3 j, 6 j, 12 j, 24 j → setelah 8 percobaan `GAGAL`.

### 11.3 Aturan galat lain
- Env Google tidak lengkap → fitur mati rapi (`BELUM_DIKONFIGURASI`); bagian lain aplikasi tidak terpengaruh.
- `galat_pesan` dan log server hanya berisi kategori + pesan pendek; tidak pernah token, respons mentah, atau path fisik.
- Rute API mengembalikan pesan berbahasa Indonesia yang konsisten dengan UI.

## 12. Tes

### 12.1 Unit (Vitest, `tests/unit/google-drive/`, `tests/unit/laporan/`)
- `token-crypto`: roundtrip; ciphertext/tag diubah → ditolak; kunci salah → galat terklasifikasi.
- `oauth`: parse alamat valid; `state` salah/kedaluwarsa/milik sesi lain; `error=access_denied`; host bukan loopback; teks acak; tanpa `refresh_token` → galat.
- `drive-errors`: pemetaan contoh respons → kategori.
- `jobs`: jadwal jeda; batas 8 percobaan.
- Runner + FakeDrive:
  - lanjut setelah gagal di tengah tanpa unggahan ganda;
  - `drive_folder_id` tersimpan sebelum file pertama;
  - `SIAP` hanya setelah semua file + izin;
  - dicabut di tengah → berhenti, tidak `SIAP`;
  - `KUOTA_PENUH` → `GAGAL`; `TOKEN_TIDAK_VALID` → dijeda, akun ditandai;
  - hapus 404 → berhasil; parent akar hilang → akar dibuat ulang;
  - `DAFTAR_ISI.txt` tanpa path, menandai dilewati/dimusnahkan/dibersihkan.
- Rute:
  - endpoint admin: 401 tanpa sesi, 403 non-ADMIN, 403 beda origin, 400 body tidak valid;
  - `GET /api/google-drive/status` tidak memuat email;
  - buat tautan `DRIVE` tanpa akun aktif → 409;
  - coba lagi oleh bukan pembuat → 404;
  - `/tautan/<token>` dan rute file untuk tautan `DRIVE` → 404.
- Static source guard (pola repo): dialog memuat 3 pilihan akses dan teks peringatan Drive; halaman Pengaturan memuat bagian Google Drive.

### 12.2 Integrasi (PostgreSQL asli, `pnpm test:integration`)
- Migrasi terpasang; partial unique index menolak dua akun `AKTIF`.
- Dua klaim bersamaan → hanya satu yang mendapat job (`SKIP LOCKED`).
- Cabut, `approve_destruction`, Pembersihan: job dibuat di transaksi yang sama; rollback → job tidak ada.
- Ganti akun atomik.

### 12.3 Uji terima manual (lokal, Gmail pribadi, data dummy)
1. Hubungkan akun; buat tautan 3 dokumen → `SIAP`; buka link dari HP dengan data seluler.
2. Matikan WiFi saat mengunggah → nyalakan → lanjut tanpa file ganda.
3. Cabut → folder hilang dari Drive.
4. Musnahkan berkas → file terkait hilang; `DAFTAR_ISI.txt` diperbarui.
5. Ganti ke akun lain → tautan lama tetap terbuka; cabut tautan lama → terhapus di akun lama.
6. Putuskan permanen akun lama yang masih punya tautan → muncul di "perlu dihapus manual".

## 13. Lingkungan Pengembangan dan Dokumentasi

- Repo ini memakai **database terpisah** (mis. `dms_kepser_dev`) dan `DMS_LOCAL_STORAGE_ROOT` terpisah dari instalasi skripsi.
- `.env.example`: tambah `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `DMS_DRIVE_TOKEN_KEY` (dengan perintah pembuatan kunci) — nilai asli hanya di `.env`.
- `AGENTS.md`: tambah bagian singkat fitur Google Drive (tabel, status, pemicu hapus, batasan).
- `docs/skripsi/rancangan-erd.md`: tambah tiga tabel baru dan kolom baru `laporan_tautan`.
- `package.json` scripts: `drive:sync`.

## 14. Kriteria Selesai

- Semua tes 12.1–12.2 lulus; `pnpm typecheck` bersih; tes lama tetap lulus.
- Uji terima manual 12.3 lulus dengan Gmail pribadi.
- Tanpa env Google, aplikasi berjalan seperti sebelumnya dan pilihan Drive tampil nonaktif dengan alasan.
- Tidak ada token/respons mentah Google/path fisik di log, respons API, atau audit.

## 15. Risiko dan Batasan yang Diterima

- Salinan di Drive di luar kendali DMS setelah diunduh pembaca (sama dengan praktik manual sekarang).
- Link Drive masih bisa dibuka sampai job hapus berhasil (mis. saat internet putus).
- Keamanan akun Gmail satker menjadi kunci: aktifkan 2FA; lebih dari satu orang memegang akses pemulihan.
- Mode Testing OAuth: token kedaluwarsa ±7 hari (hubungkan ulang); publikasikan ke *In production* untuk pemakaian nyata.
- Bila langganan penyimpanan akun dihentikan dan isi melebihi kuota gratis dalam waktu lama, Google dapat menghapus isi akun.
- State OAuth disimpan di memori: server restart di tengah proses hubungkan → ADMIN mengulang dari langkah 1.
