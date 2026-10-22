# Lingkungan Implementasi

Dokumen ini hanya memuat fakta yang dapat dibuktikan dari isi repositori dan dari pemeriksaan langsung pada laptop yang saat ini menjadi server. Hal yang tidak dapat dibuktikan ditulis "tidak dapat dipastikan".

Tanggal pemeriksaan: 2 Oktober 2026.

---

## 1. Teknologi dan Versi

Kolom "Versi terpasang" diambil dari `node_modules/<paket>/package.json` sesuai `pnpm-lock.yaml` (lockfileVersion 9.0). Kolom "Rentang di package.json" adalah penentu versi yang ditulis di `package.json`.

| Kategori | Teknologi | Rentang di package.json | Versi terpasang |
|---|---|---|---|
| Runtime | Node.js | tidak dideklarasikan (tidak ada `engines`, `.nvmrc`, atau `.node-version`) | v24.14.0 (hasil `node -v`) |
| Runtime | Bun | tidak dipakai (tidak ada `bun.lock`) | — |
| Manajer paket | pnpm | tidak dideklarasikan (`packageManager` tidak ada) | 10.33.0 (hasil `pnpm -v`) |
| Bahasa | TypeScript | ^5.7.2 | 5.9.3 |
| Kerangka kerja full-stack | TanStack Start (`@tanstack/react-start`) | latest | 1.167.16 |
| Router | TanStack Router (`@tanstack/react-router`) | latest | 1.168.10 |
| Pustaka UI inti | React / React DOM | ^19.2.0 | 19.2.4 |
| Server build/produksi | Nitro (`nitro-nightly`) | npm:nitro-nightly@latest | 3.0.1-20260329-223454-55f30f48 |
| Bundler / dev server | Vite | ^7.3.1 | 7.3.1 |
| ORM | Drizzle ORM | ^0.45.2 | 0.45.2 |
| CLI ORM | drizzle-kit | ^0.31.10 | 0.31.10 |
| Driver basis data | pg (node-postgres) | ^8.20.0 | 8.20.0 |
| Basis data | PostgreSQL | image Docker `postgres:16` (`infra/docker/postgres/docker-compose.yml`) | versi minor tidak dapat dipastikan (lihat bagian 5) |
| Autentikasi | Implementasi sendiri (`src/lib/auth/`): sesi di tabel `auth.sessions`, cookie HttpOnly, hash kata sandi dengan argon2 | argon2 ^0.44.0 | 0.44.0 |
| Validasi skema | Zod | ^4.3.6 | 4.3.6 |
| Styling | Tailwind CSS (+ `@tailwindcss/vite`) | ^4.1.18 | 4.2.2 |
| Komponen UI | Base UI (`@base-ui/react`) | ^1.3.0 | 1.3.0 |
| Ikon | lucide-react | ^0.545.0 | 0.545.0 |
| Animasi | framer-motion | ^12.38.0 | 12.38.0 |
| Ekspor ZIP | archiver | ^8.0.0 | 8.0.0 |
| Uji unit/integrasi | Vitest | ^3.0.5 | 3.2.4 |
| Cakupan uji | @vitest/coverage-v8 | 3.2.4 | 3.2.4 |
| Uji end-to-end | Playwright (`@playwright/test`) | ^1.59.1 | 1.59.1 |
| Eksekusi skrip TS | tsx | ^4.21.0 | 4.21.0 |

Catatan:
- Tidak ada pustaka autentikasi pihak ketiga di `dependencies`; seluruh logika sesi dan login berada di `src/lib/auth/`.
- `@types/node` ditulis `^22.10.2`, sedangkan Node yang terpasang v24.14.0.

---

## 2. Cara Aplikasi Dibangun dan Dijalankan

### Skrip (`package.json`)

| Skrip | Perintah | Fungsi |
|---|---|---|
| `pnpm dev` | `vite dev --port 3000` | Server pengembangan |
| `pnpm build` | `vite build` | Membangun aplikasi ke folder `.output/` |
| `pnpm start` | `dotenv -e .env -- node .output/server/index.mjs` | Menjalankan hasil build dengan variabel dari `.env` |
| `pnpm preview` | `vite preview` | Pratinjau hasil build |
| `pnpm test` | `vitest run` | Uji unit (`tests/**/*.test.ts`) |
| `pnpm test:integration` | `vitest run --config vitest.integration.config.ts` | Uji integrasi (`tests/integration/**/*.test.ts`) |
| `pnpm typecheck` | `tsc --noEmit` | Pemeriksaan tipe |
| `pnpm db:seed` | `tsx src/db/seed/index.ts` | Mengisi data awal |
| `pnpm auth:hash-password` | `tsx src/scripts/generate-password-hash.ts` | Membuat hash kata sandi |
| `pnpm storage:sweep-pending` | `tsx src/scripts/sweep-pending-uploads.ts` | Membersihkan unggahan tertunda |

### Port dan protokol

- Mode `dev`: port **3000**. `vite.config.ts` memasang `server.host: true` (dapat diakses dari jaringan, bukan hanya localhost), `allowedHosts: true`, dan plugin `basicSsl()` sehingga dev server berjalan di **HTTPS** dengan sertifikat swa-tanda (self-signed).
- Mode produksi (`pnpm build` lalu `pnpm start`, server Nitro di `.output/server/index.mjs`) adalah mode yang dipakai untuk melayani pegawai:
  - Port dibaca dari `NITRO_PORT` atau `PORT`. Bila keduanya kosong, port bawaannya **3000** (terlihat di `.output/server/index.mjs` hasil build).
  - Host dibaca dari `NITRO_HOST` atau `HOST`. Bila keduanya kosong, server mendengarkan di semua antarmuka jaringan, sehingga bisa diakses dari perangkat lain di jaringan yang sama.
  - Protokolnya **HTTP**. Plugin `basicSsl()` hanya berlaku untuk dev server Vite, dan tidak ada konfigurasi TLS untuk mode produksi di repo.
  - Pada mode produksi, cookie sesi otomatis diberi atribut `Secure` (`src/lib/auth/session-cookies.ts`). Peramban tidak mengirim cookie `Secure` lewat HTTP biasa, jadi `DMS_SESSION_COOKIE_SECURE=false` harus diatur agar login berfungsi. Nilai ini sudah tertulis di `.env` laptop server.
- Playwright memakai `PLAYWRIGHT_BASE_URL` atau bawaan `http://localhost:3000`.

### Variabel lingkungan (nama saja)

| Nama | Dipakai di | Keterangan |
|---|---|---|
| `DATABASE_URL` | `src/db/client.ts`, `drizzle.config.ts` | Koneksi PostgreSQL |
| `DMS_LOCAL_STORAGE_ROOT` | `src/lib/storage/local-storage-paths.ts` | Akar folder lampiran; bila kosong memakai `storage` |
| `DMS_FILE_TOKEN_SECRET` | `.env.example`, modul akses berkas | Rahasia token akses berkas |
| `APP_URL` | `src/lib/security/same-origin.ts` | Origin yang dipercaya untuk pemeriksaan same-origin |
| `DMS_SESSION_COOKIE_SECURE` | `src/lib/auth/session-cookies.ts` | Mengatur atribut `Secure` pada cookie sesi |
| `NODE_ENV` | beberapa modul | Ditentukan otomatis oleh Vite (lihat komentar di `.env.example`) |
| `DMS_DEV_SEED_PASSWORD_HASH`, `DMS_DEV_SEED_PASSWORD` | skrip seed dan `generate-password-hash.ts` | Hanya untuk skrip, bukan saat aplikasi berjalan |
| `PLAYWRIGHT_BASE_URL` | `playwright.config.ts` | Hanya untuk uji end-to-end |

### Lokasi penyimpanan berkas lampiran

- Lampiran disimpan di **sistem berkas lokal**, bukan layanan penyimpanan objek. Akar folder = nilai `DMS_LOCAL_STORAGE_ROOT`; bila kosong, memakai folder `storage` (di-*resolve* relatif terhadap direktori kerja). `resolveStorageRoot()` menolak nilai berupa URL.
- Pada laptop server saat ini, `.env` mengarahkan ke `storage`, yaitu folder `storage/` di akar proyek. Subfolder yang ada saat pemeriksaan: `documents/`, `manual-arsip/`, `profile-avatars/`, `temp/`, dan beberapa folder bernama UUID. Dari subfolder ini, hanya `profile-avatars` yang terlihat langsung sebagai konstanta di kode (`src/lib/storage/profile-avatar.ts`).

---

## 3. Struktur `src/` dan Lapisan Arsitektur

| Folder / berkas | Isi | Lapisan |
|---|---|---|
| `src/routes/` (selain `api/`) | Route halaman berbasis berkas (TanStack Router), termasuk `__root.tsx` dan tata letak per peran (`admin`, `kasubag`, `pegawai`, `penanggung-jawab-kinerja`, `ppk`, `ppspm`) | Presentasi |
| `src/components/` | Komponen React per domain (`activity-log`, `admin`, `archive`, `arsip`, `dashboard`, `dokumen`, `kinerja`, `laporan`, `layout`, `pegawai`, `ui`, `workflow`) | Presentasi |
| `src/hooks/` | Hook React (konfirmasi, penjaga perubahan belum tersimpan, pembuangan unggahan tertunda) | Presentasi |
| `src/config/navigation.ts` | Konfigurasi menu navigasi | Presentasi |
| `src/router.tsx`, `src/routeTree.gen.ts`, `src/styles.css` | Inisialisasi router, pohon route hasil generate, gaya global | Presentasi |
| `src/routes/api/` | Handler HTTP server (route API) | Aplikasi |
| `src/lib/` | Logika aplikasi: `auth/`, `security/`, `fsm.ts` (mesin status dokumen), `guards.ts`, `dokumen/`, `archive/`, `laporan/`, `export/`, `master-data/`, `users/`, `schemas/` (Zod), dll. | Aplikasi |
| `src/db/` | `client.ts` (koneksi `pg` + Drizzle), `schema/` (definisi tabel per skema), `seed/` | Akses data |
| `src/lib/storage/`, `src/lib/upload/` | Jalur penyimpanan lokal, unggah, pemindahan berkas tertunda, token akses berkas, pembersihan berkas | Penyimpanan berkas |
| `src/scripts/` | Skrip CLI (`generate-password-hash.ts`, `sweep-pending-uploads.ts`) | Utilitas (di luar alur permintaan) |

Catatan: beberapa modul di `src/lib/` juga melakukan kueri basis data secara langsung (misalnya `src/lib/auth/session-repository.ts`), sehingga batas antara lapisan aplikasi dan akses data tidak sepenuhnya dipisahkan per folder.

---

## 4. Jumlah Route dan Tabel

| Item | Jumlah | Cara menghitung |
|---|---|---|
| Route halaman | **66** | Entri `FileRoutesById` di `src/routeTree.gen.ts` di luar `/api` dan di luar `__root__`. Angka ini sudah termasuk route tata letak/induk (misalnya `/admin` dan `/admin/`). |
| Route API | **97** | Entri `FileRoutesById` yang diawali `/api` (sama dengan 97 berkas di `src/routes/api/`) |
| Tabel basis data | **22** | Pemanggilan `<schema>.table('…')` di `src/db/schema/`, tersebar di 6 skema PostgreSQL |

Rincian tabel per skema:

| Skema | Tabel |
|---|---|
| `app` (1) | `app_settings` |
| `arsip` (6) | `berkas_arsip`, `berkas_arsip_activity`, `berkas_arsip_item`, `manual_arsip`, `manual_arsip_attachment`, `master_klasifikasi_arsip` |
| `audit` (1) | `audit_log` |
| `auth` (4) | `roles`, `sessions`, `user_roles`, `users` |
| `dokumen` (2) | `dokumen_transaksi`, `log_aktivitas` |
| `master` (8) | `ketua_tim_assignments`, `master_detail_permintaan`, `master_fungsi`, `master_jenis_permintaan`, `master_kategori_permintaan`, `master_kegiatan`, `master_kelengkapan_dokumen`, `master_komponen` |

---

## 5. Perangkat Server (Laptop Pengembang)

Aplikasi saat ini **belum dihosting di server satker**; seluruh layanan berjalan di laptop pengembang. Data di bawah diambil dari Windows (CIM/WMI) dan perintah langsung pada laptop tersebut.

### Perangkat keras

| Item | Nilai |
|---|---|
| Merek / jenis | Lenovo IdeaPad 3 15ALC6 (model 82KU) |
| Prosesor | AMD Ryzen 5 5500U with Radeon Graphics (6 core / 12 thread) |
| RAM | 12 GB terpasang (8 GB + 4 GB, 3200 MHz); 9,8 GB terbaca oleh sistem (sebagian dipakai grafis terintegrasi) |
| Penyimpanan | SSD Samsung MZALQ256HBJD 256 GB (238 GB terbaca), dibagi menjadi C: 138 GB dan D: 99 GB. Proyek dan folder lampiran berada di D: |

### Sistem operasi

| Item | Nilai |
|---|---|
| Sistem operasi | Microsoft Windows 11 Home, 64-bit |
| Versi | 25H2 (10.0.26200, build 26200) |

### Versi yang benar-benar terpasang

| Perintah | Hasil |
|---|---|
| `node -v` | v24.14.0 |
| `pnpm -v` | 10.33.0 |
| `psql --version` | tidak dapat dipastikan: `psql` tidak ada di PATH Windows, dan tidak ada instalasi PostgreSQL di `C:\Program Files\PostgreSQL` |
| `docker --version` | Docker 29.7.2 (build a7dcaa6) |
| Versi PostgreSQL di container | tidak dapat dipastikan: saat pemeriksaan, Docker Engine sedang tidak berjalan. Yang dapat dipastikan dari repo hanya image `postgres:16` (versi mayor 16) |

PostgreSQL dijalankan sebagai container Docker `kepser-postgres` (`infra/docker/postgres/docker-compose.yml`). Port 5432 hanya dibuka ke `127.0.0.1`, sehingga basis data tidak dapat diakses langsung dari perangkat lain di jaringan. `DATABASE_URL` di `.env` menunjuk ke `localhost:5432`.

### Cara aplikasi dijalankan

- **Basis data:** container Docker. Di `docker-compose.yml` tidak ada kebijakan `restart:`, dan tidak ditemukan layanan Windows bernama postgres. Jadi container tidak dijalankan sebagai layanan otomatis, melainkan dinyalakan secara manual (Docker Desktop harus aktif).
- **Aplikasi web:** dijalankan dalam **mode produksi**, secara manual lewat terminal: sekali `pnpm build`, lalu `pnpm start` setiap kali server dinyalakan. Tidak ada konfigurasi layanan otomatis (tidak ada layanan Windows node/pm2/nssm dan tidak ada berkas konfigurasi layanan di repo), sehingga aplikasi berhenti bila terminal ditutup atau laptop dimatikan.

### Cara pegawai mengakses

- Pegawai membuka aplikasi lewat peramban (di HP atau laptop) yang tersambung ke jaringan yang sama dengan laptop server.
- Saat pemeriksaan, laptop server terhubung lewat **Wi-Fi** dengan alamat IPv4 **10.72.214.55/24**, sehingga alamat aplikasinya **`http://10.72.214.55:3000`** (HTTP, port bawaan 3000). Di laptop server sendiri, aplikasi juga bisa dibuka lewat `http://localhost:3000`.
- Apakah alamat IP ini tetap (statis) atau berubah-ubah (DHCP): tidak dapat dipastikan. Bila berubah, alamat yang dibagikan ke pegawai juga ikut berubah.
- Lalu lintas dikirim tanpa enkripsi (HTTP), sehingga aplikasi hanya layak dipakai di jaringan internal.
