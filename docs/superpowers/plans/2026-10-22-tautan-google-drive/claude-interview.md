# Transkrip Interview — Tautan Google Drive

Tanggal: 2026-10-22. Pewawancara: Claude (deep-plan). Narasumber: pemilik repo.

Aturan sesi: keputusan K1–K10 di spec bagian 4 **sudah final** dan tidak dibuka ulang. Interview hanya
untuk detail implementasi yang belum tertulis di spec. Pertanyaan diajukan satu per satu, pilihan ganda.

---

## P1. Versi Node.js di server satker

**Konteks.** `@googleapis/drive` 27.0.0 dan `google-auth-library` 11.3.1 (terbaru) mewajibkan Node ≥ 22.
Jalur Node 20: `@googleapis/drive` 22.0.0 + `google-auth-library` 10.9.1.

**Pilihan:** Node 22+ (disarankan) · Node 20 · Belum tahu.

**Jawaban:** **Node 22+.**

**Dampak:** paket dipasang dengan versi persis `@googleapis/drive@27.0.0` dan `google-auth-library@11.3.1`
(satu salinan `google-auth-library` karena `googleapis-common@9.3.x` juga memakai `^11`). Tambahkan
`"engines": { "node": ">=22" }`? — **tidak**: `package.json` hanya diubah untuk menambah paket (aturan
AGENTS.md §8); kebutuhan Node 22 dicatat di AGENTS.md dan `.env.example`.

## P2. Cara membuat migrasi

**Konteks.** `drizzle/meta` hanya punya snapshot 0000; migrasi 0001–0023 ditulis tangan dan didaftarkan
manual di `_journal.json`. `pnpm db:local:generate` akan menghasilkan diff besar yang salah.

**Pilihan:** Tulis tangan 0024 (disarankan) · Perbaiki snapshot dulu.

**Jawaban:** **Tulis tangan 0024.**

**Dampak:** `drizzle/0024_google_drive_tautan.sql` (idempoten, gaya 0022/0023) + entri journal idx 24;
skema Drizzle di `src/db/schema/**` tetap diperbarui agar tipe dan kueri cocok; static guard tes memastikan
migrasi terdaftar dan CHECK constraint sama dengan konstanta. AGENTS.md §4.8 diberi catatan bahwa
`db:local:generate` belum bisa dipakai sampai snapshot diperbaiki (pekerjaan terpisah).

## P3. Susunan isi folder tautan di Drive

**Konteks.** ZIP memakai subfolder per dokumen; nama ganda di-dedup per subfolder.

**Pilihan:** Rata (disarankan) · Subfolder per dokumen.

**Jawaban:** **Rata.**

**Dampak:** semua lampiran langsung di folder tautan + `DAFTAR_ISI.txt`. Nama formal sama dengan ZIP;
nama ganda **di tingkat folder tautan** diberi akhiran ` (2)`, ` (3)` dengan aturan `nextAvailableFileName`
yang sama (diterapkan berurutan menurut urutan entri ZIP), dan nama final **disimpan** di
`laporan_tautan_drive_file.nama_file` saat baris dibuat (deterministik, tidak dihitung ulang saat retry).
`DAFTAR_ISI.txt` tetap mengelompokkan per dokumen (nama folder logis ZIP sebagai label) dan menyebut nama
file final tiap lampiran.

## P4. Hapus permanen dokumen non-material oleh pemilik

**Konteks.** `DELETE /api/dokumen/$id` menghapus baris dokumen non-material `TERSIMPAN` + audit
`DOKUMEN_DIHAPUS_PERMANEN`. Dokumen ini bisa ada di tautan Drive Laporan Saya. Spec tidak menyebutnya.

**Pilihan:** Ikut dihapus (disarankan) · Biarkan di Drive.

**Jawaban:** **Ikut dihapus.**

**Dampak:** pemicu keempat di tabel penghapusan. Di transaksi DELETE yang sama: baris file `TERUNGGAH`
untuk `dokumen_id` itu pada tautan belum dicabut → `MENGHAPUS` dengan `keterangan_hapus = 'DIHAPUS_PEMILIK'`;
baris `MENUNGGU` → `DILEWATI`; insert `HAPUS_FILE` per tautan. `DAFTAR_ISI.txt` menulis
"telah dihapus pemiliknya". Nilai enum `keterangan_hapus` menjadi
`DICABUT / DIMUSNAHKAN / DIBERSIHKAN / DIHAPUS_PEMILIK`. Kolom `dokumen_id` di tabel file **tanpa FK**
(baris dokumen hilang, jejak `drive_file_id` harus tetap ada).

## P5. Unggahan ganda saat respons hilang

**Konteks.** Multipart upload tidak idempoten: bila Google menerima file tetapi respons tidak sampai,
percobaan ulang membuat salinan kedua.

**Pilihan:** Cek `appProperties` (disarankan) · Terima risiko.

**Jawaban:** **Cek `appProperties`.**

**Dampak:**
- Setiap objek yang dibuat aplikasi diberi `appProperties`:
  - folder akar: `{ dmsJenis: 'AKAR' }`;
  - folder tautan: `{ dmsJenis: 'TAUTAN', dmsTautanId: <uuid> }`;
  - lampiran: `{ dmsJenis: 'LAMPIRAN', dmsKunci: <kunci_lampiran> }`;
  - daftar isi: `{ dmsJenis: 'DAFTAR_ISI' }`.
- Kolom baru `laporan_tautan_drive_file.dicoba_pada` (timestamptz null) diisi **sebelum** memanggil unggah.
  Bila baris masih `MENUNGGU` tetapi `dicoba_pada` terisi (percobaan sebelumnya terputus), handler mencari
  dulu lewat `files.list` di folder tautan berdasarkan `dmsKunci`; bila ketemu, pakai ID itu.
- Pola yang sama untuk folder tautan (kolom `laporan_tautan.drive_folder_dicoba_pada`) dan
  `DAFTAR_ISI.txt` (cari `dmsJenis='DAFTAR_ISI'` di folder tautan bila ID belum tersimpan).
- Folder akar: **tidak** dicari lewat `appProperties` (spec 7.2: email yang pernah `DIPUTUS` mendapat folder
  akar baru). Untuk akun yang dipakai ulang, `root_folder_id` lama diperiksa dengan `files.get`; 404 → buat baru.
  Risiko folder akar kembar saat respons hilang diterima (hanya terjadi saat ADMIN menghubungkan akun, dan
  folder kosong tidak berbahaya). Properti `dmsJenis='AKAR'` tetap dipasang untuk identifikasi manual.

---

## Keputusan yang diambil sendiri (tanpa pertanyaan; tercatat agar bisa dikoreksi)

| # | Keputusan | Alasan |
|---|---|---|
| D1 | `TautanListItem.path` menjadi `string \| null`; `null` untuk `DRIVE` | Path DMS tautan Drive tidak bisa dibuka (spec 6.2) |
| D2 | `TautanCreateResponse` ditambah `drive_status`; `path` `null` untuk `DRIVE` | Dialog langsung masuk mode "Sedang diunggah" |
| D3 | Endpoint progres: dialog memakai `GET /api/laporan/tautan?sumber=` yang sama (field Drive baru), disaring id di klien | Tanpa endpoint baru; polling 3 dtk (dialog buat) / 5 dtk (riwayat) |
| D4 | Bagian Drive di Pengaturan menjadi komponen `src/components/admin/GoogleDriveSettings.tsx` | Halaman Pengaturan memaksa logout saat simpan; Drive tidak boleh ikut alur itu |
| D5 | `DriveClient` dibuat dengan `retry: false`, `timeout: 60_000` | Antrean yang menentukan jeda; tes deterministik |
| D6 | Klasifikasi galat menerima `unknown` dan membaca `status`, `response.status`, `response.data.error.errors[0].reason`, `response.data.error` (string, mis. `invalid_grant`), `code` jaringan | Bentuk `GaxiosError` |
| D7 | Konstanta API Drive (`GOOGLE_DRIVE_API`) ditaruh di `src/lib/constants/routes.ts` | Spec 7.3 + invariant "tanpa string ajaib" |
| D8 | Snapshot salinan Drive = isi file saat diunggah; penggantian lampiran non-material setelah itu tidak disinkronkan | Spec "tidak ada sinkron"; pembuat bisa cabut lalu buat tautan baru |
| D9 | Folder tautan diberi nama `<judul> (<YYYY-MM-DD>)` dengan tanggal `created_at` tautan (zona server) dan karakter tidak aman disanitasi | Spec 8.2 langkah 3 |
| D10 | Satu putaran runner berhenti setelah anggaran waktu 5 menit; bila masih ada job siap, putaran berikutnya dijadwalkan segera (`setImmediate`) | Mencegah satu putaran memonopoli event loop; `drive:sync` selesai dalam waktu terbatas |
| D11 | `percobaan` = jumlah kegagalan `SEMENTARA`. Kegagalan ke-k (k = 1..8) menjadwalkan jeda ke-k (1 m, 5 m, 15 m, 1 j, 3 j, 6 j, 12 j, 24 j); kegagalan ke-9 → `GAGAL` | Tafsiran tegas "8 percobaan ulang" di spec 11.2 |
| D12 | Unique partial index `drive_job (tautan_id, jenis) WHERE status = 'MENUNGGU'`; enqueue memakai `ON CONFLICT DO UPDATE` yang memajukan `jadwal_berikut` | Pemicu berulang (dua pemusnahan beruntun) tidak membuat job kembar |
| D13 | Job hapus apa pun (`HAPUS_TAUTAN`/`HAPUS_FILE`) untuk tautan yang job `SINKRON_TAUTAN`-nya masih `PROSES` (kunci belum macet) ditunda 30 dtk tanpa menambah `percobaan` | Perluasan spec 8.3 ke `HAPUS_FILE` agar `DAFTAR_ISI.txt` tidak ditulis dua handler sekaligus |
| D14 | Dokumen tanpa lampiran tersedia saat tautan dibuat dicatat di kolom baru `laporan_tautan.drive_dokumen_dilewati` (jsonb `[{ label, alasan }]`) dan tiap baris file menyimpan `label_dokumen` + `urutan` | `DAFTAR_ISI.txt` bisa dibangun ulang hanya dari DB, termasuk setelah dokumen dihapus permanen |
| D15 | Lampiran > 5 MB (data lama) atau file fisik hilang saat akan diunggah → `DILEWATI` ("tidak tersedia") | Multipart dipakai untuk file ≤ 5 MB; batas unggah DMS memang 5 MB |
| D16 | Uji integrasi di cloud memakai database terpisah `dms_kepser_test` lewat variabel lingkungan `DATABASE_URL` di baris perintah (tanpa membuat/mengubah `.env`) | AGENTS.md §8 melarang mengubah `.env`; tes integrasi hanya membaca `.env` bila `DATABASE_URL` kosong |
