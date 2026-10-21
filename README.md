Welcome to your new TanStack Start app!

# Getting Started

To run this application:

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
