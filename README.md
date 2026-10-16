# KEPSER — Sistem Manajemen Dokumen (DMS) Workflow Keuangan & Arsip

Aplikasi web untuk mengelola alur dokumen permintaan/pertanggungjawaban keuangan satuan kerja, mulai dari pengajuan oleh pegawai, validasi PPK, persetujuan PPSPM, hingga pengarsipan berkas secara terstruktur.

> Skripsi — NIM 222212554 (Politeknik Statistika STIS).
>
> _Lengkapi: judul skripsi, nama lengkap, dosen pembimbing, dan tahun._

## Fitur Utama

- **Autentikasi & RBAC** — login berbasis username, sesi cookie, pembatasan percobaan login, dan pembatasan akses halaman per peran.
- **Alur dokumen (FSM)** — status dokumen berpindah hanya lewat mesin status tunggal (`src/lib/fsm.ts`): *Draft → Validasi PPK → Persetujuan PPSPM → Selesai*, dengan jalur *Perlu Revisi* (tolak, kirim ulang, kembalikan).
- **Manajemen dokumen & lampiran** — unggah file ke penyimpanan lokal, akses file lewat token bertanda tangan, pembersihan unggahan tertunda.
- **Arsip folder-first** — berkas arsip, klasifikasi dokumen, retensi, penghancuran fisik, dan ekspor ZIP/CSV.
- **Laporan & tautan bagikan** — Laporan Saya / Kegiatan / Kinerja yang dapat dibagikan lewat tautan.
- **Master data & administrasi** — fungsi, jenis, kategori, kegiatan, komponen, kelengkapan, pengguna, pengaturan tema, dan log aktivitas.

## Peran Pengguna

| Peran | Keterangan |
|---|---|
| `PEGAWAI` | Mengajukan dan merevisi dokumen |
| `PPK` | Pejabat Pembuat Komitmen — memvalidasi dokumen |
| `PPSPM` | Menyetujui dokumen tahap akhir |
| `KEPALA_SUB_BAGIAN_UMUM` | Kepala Sub Bagian Umum |
| `PENANGGUNG_JAWAB_KINERJA` | Memantau laporan kinerja |
| `ADMIN` | Mengelola master data, pengguna, dan pengaturan |

## Teknologi

- [TanStack Start](https://tanstack.com/start) + TanStack Router (React 19, file-based routing)
- TypeScript, Vite, Tailwind CSS v4, Base UI, Framer Motion
- PostgreSQL 16 dengan [Drizzle ORM](https://orm.drizzle.team/) dan drizzle-kit (migrasi)
- Argon2 untuk hash password, Zod untuk validasi
- Vitest (unit/integrasi) dan Playwright (E2E)
- Docker Compose untuk database lokal; ngrok opsional untuk berbagi akses

## Struktur Proyek

```
src/
  routes/        Halaman & endpoint API (file-based routing, per peran)
  components/    Komponen UI per domain (dokumen, arsip, laporan, admin, ...)
  lib/           Logika bisnis: FSM, auth, storage, validasi, ekspor
  db/            Koneksi, skema Drizzle, dan seed
  scripts/       Skrip CLI (hash password, sweep unggahan)
drizzle/         Berkas migrasi SQL
infra/docker/    Docker Compose PostgreSQL
tests/           Unit, integrasi, dan E2E
```

## Prasyarat

- Node.js 22+
- [pnpm](https://pnpm.io/)
- Docker (untuk PostgreSQL lokal) atau PostgreSQL 16 yang sudah ada

## Menjalankan Secara Lokal

1. **Pasang dependensi**
   ```bash
   pnpm install
   ```

2. **Jalankan PostgreSQL**
   ```bash
   docker compose -f infra/docker/postgres/docker-compose.yml up -d
   ```

3. **Siapkan environment**
   ```bash
   cp .env.example .env
   cp .env.migration.example .env.migration
   ```
   Lalu ubah nilai berikut:
   - `DATABASE_URL` — sesuaikan dengan database Anda
   - `DMS_FILE_TOKEN_SECRET` — isi string acak yang panjang
   - `DMS_DEV_SEED_PASSWORD_HASH` (di `.env.migration`) — hash argon2id untuk akun pengembangan:
     ```bash
     pnpm auth:hash-password
     ```

4. **Migrasi dan seed database**
   ```bash
   pnpm db:local:migrate
   pnpm db:local:seed
   ```

5. **Jalankan aplikasi**
   ```bash
   pnpm dev
   ```
   Buka `https://localhost:3000` (dev server memakai HTTPS self-signed, terima peringatan browser).

## Variabel Environment

| Variabel | Fungsi |
|---|---|
| `DATABASE_URL` | Koneksi PostgreSQL |
| `DMS_LOCAL_STORAGE_ROOT` | Folder penyimpanan file unggahan |
| `DMS_FILE_TOKEN_SECRET` | Secret penanda tangan token akses file |
| `APP_URL` | Origin aplikasi (harus sama dengan address bar) |
| `DMS_PUBLIC_BASE_URL` | (Opsional) alamat tetap untuk tautan bagikan |
| `DMS_SESSION_COOKIE_SECURE` | `true` bila dilayani lewat HTTPS |

Jangan pernah meng-commit file `.env`, kunci, atau token.

## Skrip yang Tersedia

| Perintah | Fungsi |
|---|---|
| `pnpm dev` | Dev server di port 3000 |
| `pnpm build` / `pnpm start` | Build dan jalankan produksi |
| `pnpm typecheck` | Pemeriksaan tipe TypeScript |
| `pnpm test` | Unit test (Vitest) |
| `pnpm test:integration` | Integration test (butuh database) |
| `npx playwright test` | Test E2E |
| `pnpm db:generate` | Buat migrasi baru dari skema |
| `pnpm db:local:migrate` | Terapkan migrasi ke database lokal |
| `pnpm db:local:seed` | Isi role, master data, dan akun pengembangan |
| `pnpm db:local:studio` | Drizzle Studio |
| `pnpm storage:sweep-pending` | Bersihkan unggahan yang tidak selesai |

Klasifikasi seluruh file test ada di [`tests/TEST-CLASSIFICATION.md`](tests/TEST-CLASSIFICATION.md).

## Catatan Keamanan

- Password disimpan sebagai hash argon2id; seed tidak menyimpan password plaintext.
- Akun hasil seed hanya untuk pengembangan, jangan dipakai di produksi.
- Isi `ngrok/kepser.yml` hanya placeholder; isi authtoken ngrok Anda sendiri secara lokal dan jangan di-commit.

## Lisensi

_Tentukan lisensi atau tulis "Hak cipta dilindungi — untuk keperluan akademik"._
