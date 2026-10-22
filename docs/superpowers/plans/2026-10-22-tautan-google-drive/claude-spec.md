# Synthesized Spec: Bagikan Tautan Laporan ke Google Drive

Sumber: spec asli `docs/superpowers/specs/2026-10-22-tautan-google-drive-design.md` (otoritas utama untuk
semua hal yang tidak diubah di sini), `claude-research.md`, `claude-interview.md`.
Dokumen ini **tidak mengulang** seluruh spec asli; ia merangkum dan menambahkan keputusan baru.
Bila ada pertentangan, urutan otoritas: kode `src/` + `drizzle/` → keputusan interview (P1–P5, D1–D16)
→ spec asli → dokumen ini.

## Problem Statement

Tautan Laporan DMS hanya bisa dibuka dari jaringan kantor, sementara penilai KIPAPP sering berada di luar
jaringan. Pegawai saat ini mengunggah salinan ke Google Drive secara manual, sehingga aturan DMS (cabut,
pemusnahan, pembersihan) tidak berlaku pada salinan itu. Fitur ini membuat server DMS sendiri yang
mengunggah salinan snapshot ke Google Drive satker dan menghapusnya otomatis saat aturan DMS menuntut.

## Goals

1. Pilihan akses ketiga `DRIVE` di dialog Bagikan Tautan menghasilkan **link folder Google Drive**
   (siapa saja yang memegang link, hanya lihat) setelah **semua** file selesai diunggah (K1, K2, K10).
2. Server hanya membuat koneksi keluar ke Google; aplikasi tetap di LAN.
3. ADMIN menghubungkan, mengganti, menghubungkan ulang, dan memutus akun Google dari UI tanpa mengubah
   kode/`.env`; tautan lama tetap bisa dicabut lewat akun lamanya (K3, K5, K6).
4. Cabut, berkas `DIMUSNAHKAN`, Pembersihan Dokumen, dan **hapus permanen dokumen non-material** (P4)
   menghapus permanen salinan di Drive lewat antrean (K4).
5. Unggah/hapus tahan internet putus dan server restart (K7), tanpa unggahan ganda (P5).
6. Tanpa env Google, aplikasi berjalan seperti sekarang dan pilihan Drive tampil nonaktif dengan alasan.
7. Tidak ada token, respons mentah Google, atau path fisik di log, respons API, audit, maupun `galat_pesan`.

Terukur: tes unit + integrasi (spec 12.1–12.2 + tambahan rencana) lulus, `pnpm typecheck` bersih, uji
terima manual spec 12.3 lulus di mesin lokal dengan Gmail pribadi.

## Non-Goals

Semua butir spec bagian 3, ditambah:
- Memperbaiki snapshot `drizzle/meta` agar `db:local:generate` bisa dipakai lagi (pekerjaan terpisah).
- Sinkronisasi ulang isi Drive saat lampiran dokumen non-material diganti setelah tautan dibuat (D8).
- Subfolder per dokumen di Drive (P3: folder rata).
- Resumable upload (semua lampiran ≤ 5 MB; D15).
- Halaman pembaca `audit.audit_log` (belum ada di aplikasi; audit hanya ditulis).
- Hook startup server; runner hidup lewat pemicu request dan `pnpm drive:sync`.

## Context & Constraints

- Stack dan invariant di `AGENTS.md` (pnpm saja; same-origin → sesi → peran → Zod → DB; FSM tidak
  tersentuh; riwayat append-only; file tidak dilayani statis; rahasia hanya di env).
- Migrasi ditulis tangan (`drizzle/0024_google_drive_tautan.sql` + journal) — P2.
- `transitionBerkasArchiveStatus` dan `revokeTautanByCreator` belum transaksional; keduanya harus dibuat
  transaksional tanpa mengubah perilaku yang teramati untuk alur lama.
- Halaman Pengaturan ADMIN memaksa logout saat menyimpan setelan; bagian Drive tidak boleh ikut alur itu.
- Node ≥ 22 (P1); paket `@googleapis/drive@27.0.0`, `google-auth-library@11.3.1` (disetujui pemilik).
- Sandbox cloud tidak bisa menjangkau Google → semua tes otomatis memakai `FakeDrive`/mock; uji terima
  manual di mesin lokal.
- Batas beban yang ada tetap berlaku: 500 dokumen per tautan, 5 MB per file.

## Key Decisions Made

Keputusan final pemilik (tidak dibuka ulang): **K1–K10** di spec asli bagian 4.

Keputusan interview:
| # | Keputusan |
|---|---|
| P1 | Node 22+: `@googleapis/drive@27.0.0` + `google-auth-library@11.3.1` |
| P2 | Migrasi 0024 ditulis tangan + entri journal; skema Drizzle tetap diperbarui; static guard |
| P3 | Folder tautan rata; nama ganda di-dedup di tingkat folder dan nama final disimpan saat tautan dibuat |
| P4 | Hapus permanen dokumen non-material ikut menghapus salinan Drive (`keterangan_hapus = DIHAPUS_PEMILIK`) |
| P5 | Anti-ganda dengan `appProperties` + kolom `dicoba_pada`; berlaku untuk lampiran, folder tautan, dan `DAFTAR_ISI.txt` |

Keputusan teknis turunan D1–D16 tercatat di `claude-interview.md`. Yang mengubah skema dari spec asli:
- `laporan_tautan`: tambah `drive_folder_dicoba_pada timestamptz null` (P5) dan
  `drive_dokumen_dilewati jsonb not null default '[]'` (D14).
- `laporan_tautan_drive_file`: tambah `label_dokumen text not null`, `urutan integer not null`,
  `content_type text not null` (mimeType saat diunggah), `dicoba_pada timestamptz null` (P5);
  `keterangan_hapus` menerima `DIHAPUS_PEMILIK` (P4); `dokumen_id`/`manual_arsip_id` **tanpa FK**.
- `drive_job`: unique partial index `(tautan_id, jenis) WHERE status = 'MENUNGGU'` (D12).
- `audit_log`: daftar `aksi` dan `entity_type` mengikuti spec 6.5 (tanpa tambahan).

## Assumptions

1. Server satker menjalankan satu proses Node aplikasi (state OAuth dan single-flight runner di memori
   proses). Bila kelak lebih dari satu proses, `SKIP LOCKED` tetap menjaga job tidak diproses ganda, tetapi
   state OAuth harus dipindah ke DB.
2. `email` dari `id_token` dinormalisasi huruf kecil dan dipakai sebagai kunci akun (spec 6.1).
3. Folder akar bernama tetap `DMS Kepser`; nama folder tautan `<judul> (<YYYY-MM-DD>)` memakai tanggal
   `created_at` tautan dalam zona `Asia/Jakarta`.
4. Kegagalan `SEMENTARA` dihitung per job (bukan per file); file yang sudah `TERUNGGAH` tidak diunggah ulang.
5. "8 percobaan" = 8 percobaan ulang setelah percobaan pertama (D11).
6. Pembuat tautan melihat pesan galat pendek dari `drive_job.galat_pesan` job `SINKRON_TAUTAN` terakhir.
7. ADMIN boleh melihat **judul tautan** dan nama folder di daftar "perlu dihapus manual" (spec 7.3), tetapi
   tidak pernah daftar dokumen atau nama file.
8. Tautan `DRIVE` tetap memiliki `token` (not null, unique) yang tidak pernah ditampilkan dan tidak bisa dipakai.

## Open Questions

Tidak ada yang memblokir. Butir yang harus diverifikasi saat implementasi (bukan keputusan):
- Sintaks kueri `appProperties has { key='…' and value='…' }` di `files.list` (riset web 2.3).
- Isi `tokens.scope` saat pengguna tidak mencentang izin Drive pada consent granular (riset web 1.4).
- Bundling Nitro untuk paket CJS Google (riset web 3).
