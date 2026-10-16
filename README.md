# DMS Kepser

Prototipe aplikasi web untuk pengelolaan dokumentasi kinerja dan pertanggungjawaban kegiatan di BPS Kabupaten Kepulauan Seribu: pengajuan dokumen, pemeriksaan kelengkapan berjenjang, pemberkasan arsip keuangan, dan penyediaan bukti dukung laporan kinerja.

## 1. Pengenalan

DMS Kepser (*Document Management System* BPS Kabupaten Kepulauan Seribu) merupakan prototipe aplikasi web yang dikembangkan sebagai artefak skripsi. Aplikasi ini berfungsi sebagai tempat penyimpanan dokumen elektronik terpusat berbasis metadata untuk mendukung akuntabilitas kinerja satuan kerja.

Satu dokumen kegiatan di satuan kerja dipakai untuk banyak keperluan, yaitu pertanggungjawaban keuangan, bukti dukung laporan kinerja individu di KipApp, laporan kinerja tim dan satuan kerja, arsip digital, serta permintaan dokumen dari pemeriksa. Sebelum aplikasi ini ada, salinan elektroniknya tersimpan tersebar di komputer pegawai. DMS Kepser mengumpulkan salinan tersebut sejak dokumen diajukan, sehingga dokumen dapat dicari, dipantau, dan dipakai ulang. Aplikasi ini juga membantu satuan kerja menindaklanjuti temuan LHE AKIP tahun 2025 pada aspek penyediaan dokumen bukti dukung kinerja.

DMS Kepser menyediakan empat kelompok fitur utama:

- Pengajuan dan pemeriksaan dokumen: pegawai mengajukan dokumen beserta lampirannya, lalu PPK dan PPSPM memeriksa kelengkapannya secara berjenjang.
- Pemberkasan arsip: Kepala Sub Bagian Umum mengelompokkan dokumen ke dalam berkas menurut cara pembayaran dan tahun anggaran, menutup berkas dengan Nomor SPM, dan mengekspornya sebagai ZIP.
- Laporan dan pemantauan: laporan dokumen untuk pegawai, Ketua Tim, dan Penanggung Jawab Kinerja, pemantauan nominal realisasi, serta tautan laporan untuk dicantumkan sebagai bukti dukung di KipApp.
- Administrasi: pengelolaan pengguna, peran, penugasan Ketua Tim, data master, pengaturan aplikasi, dan log aktivitas.

> Status aplikasi: prototipe penelitian dan artefak skripsi, bukan aplikasi resmi BPS. Validasi PPK dan persetujuan PPSPM pada sistem adalah pemeriksaan kelengkapan dokumen secara elektronik yang berjalan paralel dengan alur fisik. Tindakan tersebut tidak mengesahkan dokumen, tidak menggantikan tanda tangan, dan tidak menyetujui pembayaran.

## 2. Identitas Artefak

| Komponen | Keterangan |
|---|---|
| Nama artefak | DMS Kepser (*Document Management System* BPS Kabupaten Kepulauan Seribu) |
| Bentuk artefak | Prototipe aplikasi web |
| Pengembang / peneliti | Daniel Alexander Pedro Silalahi |
| NIM | 222212554 |
| Program studi | Komputasi Statistik Program Diploma IV |
| Peminatan | Sistem Informasi Statistik |
| Perguruan tinggi | Politeknik Statistika STIS |
| Tahun akademik | 2025/2026 |
| Dosen pembimbing | Firdaus, MBA. |
| Judul skripsi | PEMBANGUNAN SISTEM INFORMASI PENGELOLAAN DOKUMENTASI KINERJA DAN PERTANGGUNGJAWABAN KEGIATAN UNTUK MENDUKUNG AKUNTABILITAS KINERJA DI BPS KABUPATEN KEPULAUAN SERIBU |
| Lokasi penelitian | BPS Kabupaten Kepulauan Seribu |
| Lingkungan akses | Jaringan lokal kantor (tidak dipublikasikan di internet) |
|Buku Panduan|[Buku Panduan Pengguna DMS Kepser](/Buku Panduan Pengguna DMS Kepser.pdf).
|

Repository ini mendokumentasikan implementasi aplikasi, fitur pengguna, alur proses, serta petunjuk menjalankan prototipe. Penjelasan metodologi (DSRM dan *Modified Waterfall*), rancangan sistem, dan hasil evaluasi secara lengkap mengacu pada naskah skripsi.

## 3. Struktur Repository

Struktur berikut berfokus pada kode aplikasi. Berkas konfigurasi di direktori utama tidak ditampilkan seluruhnya.

```text
drizzle/                    Berkas migrasi SQL basis data
infra/
└── docker/
    └── postgres/           Docker Compose dan skrip inisialisasi PostgreSQL
ngrok/                      Contoh konfigurasi ngrok (opsional)
src/
├── components/
│   ├── activity-log/
│   ├── admin/
│   ├── archive/
│   ├── arsip/
│   ├── dashboard/
│   ├── dokumen/
│   ├── kinerja/
│   ├── laporan/
│   ├── layout/
│   ├── pegawai/
│   ├── ui/
│   └── workflow/
├── config/
│   └── navigation.ts
├── db/
│   ├── client.ts
│   ├── schema/
│   │   ├── app/
│   │   ├── arsip/
│   │   ├── audit/
│   │   ├── auth/
│   │   ├── dokumen/
│   │   └── master/
│   └── seed/
├── hooks/
├── lib/
│   ├── auth/
│   ├── archive/
│   ├── constants/
│   ├── dokumen/
│   ├── export/
│   ├── laporan/
│   ├── security/
│   ├── storage/
│   ├── upload/
│   ├── fsm.ts
│   └── ...
├── routes/
│   ├── api/
│   ├── admin.*.tsx
│   ├── kasubag/
│   ├── pegawai/
│   ├── penanggung-jawab-kinerja/
│   ├── ppk/
│   ├── ppspm/
│   ├── login.tsx
│   ├── profile.tsx
│   ├── tautan.$token.tsx
│   └── __root.tsx
├── scripts/
├── router.tsx
└── styles.css
storage/                    Folder lampiran (isi tidak di-commit)
tests/
├── unit/
├── integration/
├── e2e/
└── fsm.test.ts
```

### 3.1. Kode Sumber (`src/`)

Kode sumber disusun mengikuti empat lapisan arsitektur: logika presentasi, logika aplikasi, logika akses data, dan penyimpanan data.

| Folder / berkas | Deskripsi singkat |
|---|---|
| `routes/` | Halaman dan rute API dengan *file-based routing* TanStack Router. |
| `routes/pegawai/` | Halaman Pegawai, termasuk menu Ketua Tim (Monitoring Dokumen Tim, Laporan Kegiatan, Pembersihan Dokumen). |
| `routes/ppk/` | Halaman PPK: Validasi Dokumen, Revisi, Tervalidasi, Ditolak, dan Nominal Realisasi. |
| `routes/ppspm/` | Halaman PPSPM: Persetujuan Dokumen, Ditolak, Selesai, dan Nominal Realisasi. |
| `routes/kasubag/` | Halaman Kepala Sub Bagian Umum: pengklasifikasian, penambahan dokumen, berkas, dan pembersihan berkas. |
| `routes/penanggung-jawab-kinerja/` | Halaman Penanggung Jawab Kinerja: Laporan Kinerja dan Log Aktivitas. |
| `routes/admin.*.tsx` | Halaman Admin: Master User, data master, kelengkapan dokumen, pengaturan, dan log aktivitas. |
| `routes/api/` | Rute API per fitur (dokumen, berkas, laporan, tautan, data master, autentikasi, unggah). |
| `routes/tautan.$token.tsx` | Halaman tautan laporan yang dibuka dari luar sistem, misalnya dari KipApp. |
| `components/` | Komponen antarmuka per domain; `components/ui/` memuat komponen dasar. |
| `lib/fsm.ts` | Modul transisi status dokumen; satu-satunya tempat perubahan status dokumen material. |
| `lib/auth/` | Autentikasi: *hash* kata sandi argon2, sesi, *cookie*, pembatasan percobaan login, dan resolusi peran. |
| `lib/security/` | Pemeriksaan asal permintaan (*same-origin*). |
| `lib/guards.ts` | Penjaga rute di sisi klien (mengarahkan ke login atau halaman terlarang); hak akses tetap diperiksa di server. |
| `lib/storage/`, `lib/upload/` | Penyimpanan file lampiran di *filesystem* lokal dan unggahan tertunda. |
| `lib/archive/`, `lib/export/` | Logika pemberkasan arsip serta ekspor ZIP dan CSV. |
| `lib/laporan/` | Logika laporan dokumen dan tautan laporan. |
| `db/schema/` | Definisi skema Drizzle untuk 23 tabel pada enam skema PostgreSQL. |
| `db/seed/` | Data awal: peran, data master minimal, dan akun pengembangan. |
| `scripts/` | Skrip CLI untuk membuat *hash* kata sandi dan membersihkan unggahan tertunda. |

### 3.2. Skema Basis Data

| Skema | Isi |
|---|---|
| `auth` | Pengguna, peran, relasi pengguna–peran, dan sesi. |
| `master` | Fungsi, kegiatan, komponen, jenis, kategori, detail permintaan, kelengkapan dokumen, dan penugasan Ketua Tim. |
| `dokumen` | Dokumen transaksi beserta lampirannya dan riwayat aktivitas dokumen. |
| `arsip` | Klasifikasi cara pembayaran, berkas arsip, dan dokumen tambahan Kepala Sub Bagian Umum. |
| `audit` | Log aktivitas pengguna. |
| `app` | Pengaturan aplikasi dan tautan laporan. |

## 4. Peran Pengguna dan Hak Akses

| Peran | Tugas pada sistem |
|---|---|
| Pegawai | Mengajukan dokumen material dan non-material, memantau dokumennya, merevisi dokumen yang ditolak, melihat Laporan Saya. |
| Ketua Tim | Bukan peran login, melainkan penugasan per kegiatan oleh Admin. Pegawai yang ditugaskan mendapat menu Monitoring Dokumen Tim, Laporan Kegiatan, dan Pembersihan Dokumen. |
| PPK (Pejabat Pembuat Komitmen) | Memvalidasi kelengkapan dokumen material, menolaknya bila belum lengkap, dan memantau nominal realisasi. |
| PPSPM | Menyetujui dokumen material yang telah divalidasi PPK, menolaknya kepada PPK bila belum lengkap, dan memantau nominal realisasi. |
| Kepala Sub Bagian Umum | Memberkaskan dokumen Selesai dan dokumen tambahan, menutup berkas dengan Nomor SPM, mengekspor berkas, mengelola klasifikasi cara pembayaran, dan membersihkan file berkas. |
| Penanggung Jawab Kinerja | Kepala BPS Kabupaten Kepulauan Seribu. Melihat dokumen satuan kerja per fungsi dan kegiatan tanpa dapat mengubahnya, membagikan tautan laporan, dan melihat log aktivitas seluruh pengguna. |
| Admin | Mengelola akun pengguna, peran, penugasan Ketua Tim, data master, dan pengaturan aplikasi, tetapi tidak dapat memproses maupun membaca dokumen. |

Ketentuan hak akses:

- Penyembunyian menu hanya memudahkan tampilan; setiap permintaan data tetap diperiksa di server.
- Hak akses mengikuti gabungan peran yang dimiliki pengguna, dan pengguna dapat berpindah peran aktif melalui *header*.
- Admin tidak mewarisi hak operasional.
- Hak membaca dokumen milik pegawai lain dibatasi menurut jenis dan status dokumen, misalnya PPK dan PPSPM hanya untuk dokumen material pada status yang menjadi bagian tugasnya.

## 5. Fitur Utama

Fitur disusun berdasarkan 16 *use case* pada naskah skripsi.

| Kode | *Use Case* | Aktor |
|---|---|---|
| UC-01 | Login dan Logout | Semua pengguna |
| UC-02 | Mengelola Profil dan Kata Sandi | Semua pengguna |
| UC-03 | Mengajukan Dokumen | Pegawai |
| UC-04 | Mengelola Dokumen yang Diajukan | Pegawai |
| UC-05 | Memvalidasi Dokumen | PPK |
| UC-06 | Menyetujui Dokumen | PPSPM |
| UC-07 | Memberkaskan Dokumen | Kepala Sub Bagian Umum |
| UC-08 | Mengelola Berkas | Kepala Sub Bagian Umum |
| UC-09 | Melihat Laporan Dokumen | Pegawai, Ketua Tim, Penanggung Jawab Kinerja |
| UC-10 | Memantau Nominal Realisasi | PPK, PPSPM |
| UC-11 | Memantau Dokumen Tim | Ketua Tim |
| UC-12 | Membersihkan Lampiran Dokumen Non-Material | Ketua Tim |
| UC-13 | Melihat Log Aktivitas | Semua pengguna |
| UC-14 | Mengelola Pengguna dan Penugasan Ketua Tim | Admin |
| UC-15 | Mengelola Data Master dan Pengaturan | Admin, Kepala Sub Bagian Umum |
| UC-16 | Membagikan Tautan Laporan | Pegawai, Ketua Tim, Penanggung Jawab Kinerja |

### 5.1. Login, Dashboard, dan Profil

- Login dengan *username* atau NIP dan kata sandi.
- Setelah login, pengguna diarahkan ke *dashboard* peran aktifnya yang memuat kartu ringkasan jumlah dokumen dan daftar dokumen yang perlu ditindaklanjuti.
- Pengguna dengan lebih dari satu peran dapat berpindah peran melalui *header*.
- Halaman Profil untuk mengubah identitas, foto profil, dan kata sandi.

### 5.2. Pengajuan Dokumen — Pegawai

Formulir Ajukan Dokumen terdiri atas tiga langkah.

Jenis dokumen:

- Dokumen material: dokumen kegiatan yang memiliki nominal realisasi anggaran dan diajukan melalui pemeriksaan PPK dan PPSPM.
- Dokumen non-material: dokumen kegiatan tanpa nominal realisasi, seperti notulen rapat, yang langsung disimpan dengan status Tersimpan tanpa alur persetujuan.

Alur penggunaan:

1. Buka menu Ajukan Dokumen.
2. Langkah Informasi Dasar: pilih fungsi, kegiatan, karakteristik dokumen, komponen, jenis, kategori, detail permintaan, dan tanggal dokumen.
3. Langkah Unggah Dokumen: sistem menampilkan status Ketua Tim atau Anggota yang ditentukan otomatis dan daftar kelengkapan wajib; unggah file untuk setiap butir kelengkapan (paling besar 5 MB per file).
4. Langkah Tinjauan: periksa ringkasan, lalu ajukan.
5. Pantau posisi dokumen pada menu Dokumen Diajukan. Detail dokumen memuat tab Metadata Dokumen, Lampiran, dan Riwayat.
6. Dokumen yang ditolak muncul pada menu Revisi Dokumen beserta catatan penolakan; ubah nominal atau ganti lampiran, lalu pilih Ajukan Ulang.

### 5.3. Validasi dan Persetujuan — PPK dan PPSPM

- PPK memeriksa dokumen pada menu Validasi Dokumen, lalu memvalidasi atau menolaknya.
- PPSPM memeriksa dokumen tervalidasi pada menu Persetujuan Dokumen, lalu menyetujuinya sehingga berstatus Selesai, atau menolaknya kepada PPK.
- Catatan penolakan wajib diisi paling sedikit 10 karakter.
- Setiap tindakan tercatat beserta pelaku, waktu, dan alasannya.

### 5.4. Pemberkasan dan Pengelolaan Berkas — Kepala Sub Bagian Umum

Fitur yang tersedia:

- Pengklasifikasian Dokumen: memilih tahun anggaran dan cara pembayaran untuk dokumen berstatus Selesai.
- Penambahan Dokumen: menambahkan dokumen yang tidak diajukan melalui sistem dalam empat langkah (Informasi Dokumen, Cara Pembayaran, Lampiran, dan Review).
- Berkas Terbuka: satu berkas untuk setiap pasangan cara pembayaran dan tahun anggaran beserta jumlah dokumen dan total nominalnya.
- Detail berkas dengan tab Metadata Berkas, Daftar Dokumen, dan Riwayat Aktivitas Berkas.
- Tutup Berkas dengan mengisi Nomor SPM dan masa simpan.
- Ekspor ZIP per berkas.
- Pembersihan Berkas untuk menghapus file berkas yang telah melewati masa simpan; metadata tetap tersimpan.
- Master Klasifikasi Dokumen yang disusun berjenjang.

### 5.5. Laporan, Nominal Realisasi, dan Monitoring Tim

- Laporan Saya (Pegawai): dokumen milik sendiri berstatus Selesai atau Tersimpan pada periode terpilih, dengan tombol Ekspor Semua File (ZIP).
- Laporan Kegiatan (Ketua Tim): dokumen pada kegiatan yang dipimpin.
- Laporan Kinerja (Penanggung Jawab Kinerja): dokumen satuan kerja per fungsi dan kegiatan beserta pratinjau lampirannya.
- Nominal Realisasi (PPK dan PPSPM): total nominal realisasi per periode yang dapat ditelusuri sampai fungsi, kegiatan, komponen, dokumen, dan pegawai. Dokumen tambahan Kepala Sub Bagian Umum ikut dihitung dengan tanda Penambahan Dokumen (KSBU).
- Monitoring Dokumen Tim (Ketua Tim): kartu jumlah dokumen pada setiap posisi, daftar dokumen anggota, penanda dokumen yang tertahan, dan ekspor ZIP.

### 5.6. Tautan Laporan

Bukti dukung pada KipApp hanya dapat dicantumkan dalam bentuk tautan, sehingga dokumen pada laporan dapat dibagikan sebagai satu tautan.

Alur penggunaan:

1. Buka Laporan Saya, Laporan Kegiatan, atau Laporan Kinerja dan pilih periode.
2. Pilih Bagikan Tautan, isi judul dan keterangan, lalu pilih akses Terbatas (perlu login) atau Publik.
3. Salin tautan dan cantumkan pada aplikasi lain, misalnya KipApp.
4. Pantau jumlah dan waktu akses terakhir, atau cabut tautan, melalui Riwayat Tautan.

> Tautan hanya dapat dibuka dari jaringan yang dapat menjangkau server. Kerahasiaan tautan berjenis Publik bergantung pada kehati-hatian pembaginya.

### 5.7. Pembersihan Lampiran Non-Material — Ketua Tim

Halaman Pembersihan Dokumen memuat dokumen non-material pada kegiatan yang dipimpin beserta umur dan jumlah lampirannya. Lampiran dibersihkan per dokumen atau sekaligus setelah Ketua Tim mengetik frasa `BERSIHKAN` pada dialog konfirmasi. Metadata dokumen tetap tersimpan.

### 5.8. Log Aktivitas

Admin dan Penanggung Jawab Kinerja melihat aktivitas seluruh pengguna beserta peran, aksi, dan catatannya, dengan pencarian dan penyaringan. Peran lain hanya melihat aktivitasnya sendiri.

### 5.9. Administrasi — Admin

- Master User: menambah dan mengubah pengguna, menetapkan peran dan penugasan Ketua Tim, mereset kata sandi, serta menonaktifkan pengguna.
- Data master: fungsi, kegiatan, komponen, jenis, kategori, dan detail permintaan.
- Kelengkapan Dokumen: menetapkan dokumen wajib atau opsional untuk Ketua Tim dan Anggota per rantai permintaan. Daftar ini tampil pada langkah Unggah Dokumen.
- Pengaturan Aplikasi: pengaturan tampilan aplikasi.

### 5.10. Panduan Penggunaan

Panduan penggunaan tersedia melalui:

- Menu Bantuan pada aplikasi.
- [Buku Panduan Pengguna DMS Kepser](/Buku Panduan Pengguna DMS Kepser.pdf).

## 6. Alur Proses Sistem

### 6.1. Status Dokumen Material

Seluruh perpindahan status dokumen material ditangani oleh modul transisi status `src/lib/fsm.ts`.

| Status awal | Aksi | Aktor | Status akhir |
|---|---|---|---|
| Draft | Ajukan | Pegawai | Validasi PPK |
| Validasi PPK | Validasi | PPK | Persetujuan PPSPM |
| Validasi PPK | Tolak | PPK | Perlu Revisi (diperbaiki Pegawai) |
| Persetujuan PPSPM | Setujui | PPSPM | Selesai |
| Persetujuan PPSPM | Tolak | PPSPM | Perlu Revisi (diperbaiki PPK) |
| Perlu Revisi (Pegawai) | Ajukan ulang | Pegawai | Validasi PPK |
| Perlu Revisi (PPK) | Ajukan ulang | PPK | Persetujuan PPSPM |
| Perlu Revisi (PPK) | Kembalikan | PPK | Perlu Revisi (diperbaiki Pegawai) |

| Status | Keterangan |
|---|---|
| Draft | Dokumen belum diajukan. |
| Validasi PPK | Menunggu pemeriksaan kelengkapan oleh PPK. |
| Persetujuan PPSPM | Telah divalidasi PPK, menunggu persetujuan PPSPM. |
| Perlu Revisi | Ditolak PPK atau PPSPM; dikembalikan kepada pihak yang harus memperbaiki. |
| Selesai | Disetujui PPSPM; siap diberkaskan dan terhitung pada nominal realisasi. |
| Tersimpan | Dokumen non-material yang disimpan tanpa alur persetujuan. |

Dokumen yang ditolak PPSPM kembali kepada PPK. PPK dapat memperbaikinya lalu mengajukan ulang ke PPSPM, atau mengembalikannya kepada Pegawai.

### 6.2. Alur Pemberkasan Arsip

1. Dokumen material berstatus Selesai masuk ke daftar Pengklasifikasian Dokumen.
2. Kepala Sub Bagian Umum memilih tahun anggaran dan cara pembayaran.
3. Dokumen masuk ke berkas terbuka untuk pasangan cara pembayaran dan tahun anggaran tersebut.
4. Dokumen yang tidak diajukan melalui sistem ditambahkan melalui Penambahan Dokumen.
5. Berkas ditutup dengan Nomor SPM dan masa simpan.
6. Berkas diekspor sebagai ZIP untuk kebutuhan arsip digital atau permintaan dokumen dari pemeriksa.
7. Setelah masa simpan berakhir, file berkas dapat dibersihkan dengan metadata tetap tersimpan.

### 6.3. Alur Unggah dan Akses File

1. File diperiksa format, ukuran, dan isinya, lalu disimpan di area unggahan tertunda.
2. Saat dokumen diajukan, file dipindahkan ke folder lampiran permanen.
3. Unggahan yang tidak jadi diajukan dibersihkan melalui `pnpm storage:sweep-pending`.
4. Pratinjau dan unduhan file memakai token bertanda tangan (`DMS_FILE_TOKEN_SECRET`).

## 7. Tech Stack

| Lapisan | Teknologi |
|---|---|
| Logika presentasi | React 19, TanStack Router, Tailwind CSS 4, Base UI, Framer Motion |
| Logika aplikasi | TanStack Start pada Node.js, Zod, argon2, archiver |
| Logika akses data | Drizzle ORM, node-postgres |
| Penyimpanan data | PostgreSQL 16 (Docker), *filesystem* lokal untuk lampiran |
| Pembangunan | TypeScript, Vite, pnpm |
| Pengujian | Vitest (unit dan integrasi), Playwright (E2E) |

Versi yang dipakai pada implementasi skripsi: React 19.2.4, TanStack Router 1.168.10, TanStack Start 1.167.16, Tailwind CSS 4.2.2, Base UI 1.3.0, Node.js 24.14.0, Zod 4.3.6, argon2 0.44.0, archiver 8.0.0, Drizzle ORM 0.45.2, node-postgres 8.20.0, TypeScript 5.9.3, Vite 7.3.1, pnpm 10.33.0, dan Vitest 3.2.4.

Autentikasi diimplementasikan sendiri tanpa pustaka pihak ketiga. Sesi disimpan pada basis data dan dikirim sebagai *cookie* HttpOnly, sedangkan kata sandi disimpan sebagai *hash* argon2id.

## 8. Arsitektur Ringkas

```text
Peramban (laptop / telepon genggam di jaringan kantor)
    |
    | HTTP
    v
Aplikasi monolitik TanStack Start (Node.js)
    |-- Logika presentasi : halaman per peran (client-side rendering)
    |-- Logika aplikasi   : rute API, pemeriksaan sesi, peran, dan skema
    |                       modul transisi status, layanan dokumen,
    |                       pemberkasan, laporan, tautan, ekspor ZIP/CSV
    `-- Logika akses data : Drizzle ORM, modul penyimpanan file
    |
    v
Penyimpanan data
    |-- PostgreSQL 16 (23 tabel, enam skema)
    `-- Filesystem lokal (folder lampiran)
```

Aplikasi berjalan pada server lokal satuan kerja dan diakses melalui peramban dari jaringan lokal kantor. Aplikasi lain seperti KipApp, SINERGI, SEKAR, dan BackOffice BPS tidak terintegrasi dengan sistem. Hasil ekspor diunggah dan tautan laporan dicantumkan ke aplikasi tersebut secara manual.

Pada penelitian ini, sistem dijalankan pada laptop peneliti (Windows 11, Node.js 24.14.0, PostgreSQL 16 dalam kontainer Docker) yang tersambung ke jaringan lokal kantor melalui HTTP pada *port* 3000.

## 9. Menjalankan Prototipe

### 9.1. Prasyarat

- Node.js 22 atau lebih baru (implementasi skripsi memakai Node.js 24.14.0).
- pnpm 10.
- Docker dan Docker Compose untuk PostgreSQL, atau PostgreSQL 16 yang sudah terpasang.
- Git.

### 9.2. Clone Repository

```bash
git clone https://github.com/BingoAndBro/skripsi-222212554.git
cd skripsi-222212554
pnpm install
```

### 9.3. Menjalankan Basis Data

```bash
docker compose -f infra/docker/postgres/docker-compose.yml up -d
```

Perintah ini menjalankan PostgreSQL 16 pada `127.0.0.1:5432` dengan basis data `kepser`.

### 9.4. Konfigurasi Lingkungan

Salin contoh konfigurasi:

```bash
cp .env.example .env
cp .env.migration.example .env.migration
```

Pada Windows PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item .env.migration.example .env.migration
```

Variabel utama:

| Variabel | Fungsi |
|---|---|
| `DATABASE_URL` | Koneksi PostgreSQL. |
| `DMS_LOCAL_STORAGE_ROOT` | Folder penyimpanan file lampiran. |
| `DMS_FILE_TOKEN_SECRET` | *Secret* penanda tangan token akses file; isi dengan string acak yang panjang. |
| `APP_URL` | Origin aplikasi; harus sama dengan alamat di *address bar* peramban. |
| `DMS_PUBLIC_BASE_URL` | (Opsional) alamat tetap server untuk tautan laporan. |
| `DMS_SESSION_COOKIE_SECURE` | Isi `true` bila aplikasi dilayani melalui HTTPS. |
| `DMS_DEV_SEED_PASSWORD_HASH` | (`.env.migration`) *hash* argon2id untuk akun pengembangan hasil *seed*. |

Buat *hash* kata sandi untuk akun pengembangan:

```bash
pnpm auth:hash-password
```

> Jangan memasukkan berkas `.env`, kata sandi, *secret*, atau token ke repository.

### 9.5. Migrasi dan Data Awal

```bash
pnpm db:local:migrate
pnpm db:local:seed
```

*Seed* mengisi peran, data master minimal, satu klasifikasi arsip, dan akun pengembangan bila `DMS_DEV_SEED_PASSWORD_HASH` diisi. Akun pengembangan tidak boleh dipakai di lingkungan produksi.

### 9.6. Mode Development

```bash
pnpm dev
```

Buka `https://localhost:3000`. Server development memakai sertifikat HTTPS *self-signed*, sehingga peramban menampilkan peringatan yang perlu diterima.

### 9.7. Mode Produksi

```bash
pnpm build
pnpm start
```

Aplikasi berjalan pada *port* 3000. Agar dapat diakses dari perangkat lain di jaringan kantor, atur `HOST=0.0.0.0` dan sesuaikan `APP_URL` serta `DMS_PUBLIC_BASE_URL` dengan alamat server.

### 9.8. Skrip yang Tersedia

| Perintah | Fungsi |
|---|---|
| `pnpm dev` | Menjalankan server development pada *port* 3000. |
| `pnpm build` | Membangun aplikasi untuk produksi. |
| `pnpm start` | Menjalankan hasil *build* dengan konfigurasi `.env`. |
| `pnpm typecheck` | Pemeriksaan tipe TypeScript. |
| `pnpm test` | Menjalankan *unit test* (Vitest). |
| `pnpm test:integration` | Menjalankan *integration test* (memerlukan basis data). |
| `npx playwright test` | Menjalankan *test* E2E. |
| `pnpm db:generate` | Membuat migrasi baru dari perubahan skema. |
| `pnpm db:local:migrate` | Menerapkan migrasi ke basis data lokal. |
| `pnpm db:local:seed` | Mengisi data awal. |
| `pnpm db:local:studio` | Membuka Drizzle Studio. |
| `pnpm auth:hash-password` | Membuat *hash* argon2id dari kata sandi. |
| `pnpm storage:sweep-pending` | Membersihkan unggahan tertunda yang tidak jadi diajukan. |

## 10. Pengujian dan Evaluasi

Pengujian dijalankan pada versi akhir aplikasi.

| Pengujian | Teknik | Cakupan | Hasil |
|---|---|---|---|
| *Unit testing* | *White-box* (*basis path testing*) | Modul transisi status `src/lib/fsm.ts`; 18 jalur independen | 52/52 kasus uji lulus; seluruh pernyataan dan cabang terjalankan |
| *Integration testing* | *Black-box* | Sambungan antarmodul, misalnya dokumen yang diajukan muncul pada kotak masuk PPK | 11/11 kasus uji lulus |
| *System testing* | *Black-box* (*equivalence partitioning* dan *boundary value analysis*) | 16 *use case* dan 14 kebutuhan fungsional | 41/41 kasus uji lulus |
| *Acceptance testing* | Kuesioner ISO/IEC 25010:2011 | 12 pegawai BPS Kabupaten Kepulauan Seribu | Rerata 3,92 (*non-IT expert*, n = 9) dan 3,75 (*IT expert*, n = 3), kategori Sangat Diterima |

Selain kasus uji pada naskah skripsi, repository memuat *test* otomatis tambahan pada folder `tests/`. Klasifikasi seluruh file *test* tercantum pada [`tests/TEST-CLASSIFICATION.md`](tests/TEST-CLASSIFICATION.md).

Catatan:

- Pengujian dilakukan oleh peneliti sendiri, bukan oleh penguji independen.
- Alur yang memerlukan dua pengguna bersamaan atau data dalam jumlah besar tidak diuji.
- Kuesioner menilai versi yang didemonstrasikan pada 23 September 2026. Fitur yang ditambahkan setelahnya, termasuk tautan laporan, belum dinilai melalui kuesioner.

## 11. Batasan dan Keamanan

- DMS Kepser merupakan prototipe penelitian, bukan aplikasi resmi BPS.
- Sistem dirancang sebagai aplikasi internal pada jaringan lokal kantor. Hosting BPS, VPN, dan *single sign-on* berada di luar cakupan.
- Pada penelitian ini, komunikasi peramban–server memakai HTTP tanpa enkripsi. Gunakan HTTPS ketika sistem dipasang pada server satuan kerja, terutama karena token tautan laporan ikut terkirim.
- Pemeriksaan kelengkapan pada sistem berjalan paralel dengan alur fisik dan tidak menggantikan tanda tangan maupun persetujuan pembayaran.
- Batas beban setiap permintaan: unggahan paling besar 5 MB per file, ekspor ZIP dan tautan laporan paling banyak 500 dokumen, dan pembersihan paling banyak 200 dokumen.
- Tautan laporan tidak memiliki masa berlaku, token tidak disimpan dalam bentuk *hash*, dan pembuka tautan Publik tidak tercatat identitasnya.
- Pengaitan dokumen dengan indikator kinerja sasaran dan rencana tindak lanjut masih dilakukan di luar sistem.
- Lakukan pencadangan basis data dan folder lampiran secara berkala.
- Kredensial harus disimpan melalui konfigurasi lingkungan, bukan dalam kode sumber. Isi `ngrok/kepser.yml` hanya *placeholder*.
- Jangan mengunggah data pribadi atau dokumen rahasia ke repository.

## 12. Lisensi

Kode aplikasi dikembangkan untuk keperluan akademik sebagai artefak skripsi di Politeknik Statistika STIS. Hak cipta dilindungi. Penggunaan ulang kode di luar keperluan akademik perlu mendapat izin pengembang.

Dokumen kegiatan dan data BPS Kabupaten Kepulauan Seribu tidak termasuk dalam repository ini dan tetap mengikuti ketentuan pemiliknya.
