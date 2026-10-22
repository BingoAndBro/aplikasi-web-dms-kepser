# Section Index: Bagikan Tautan Laporan ke Google Drive

Rujukan: `../claude-plan.md` (rencana), `../claude-plan-tdd.md` (stub tes), `../claude-spec.md`,
`../claude-interview.md` (keputusan P1–P5, D1–D16), spec asli
`docs/superpowers/specs/2026-10-22-tautan-google-drive-design.md` (**SPEC**).

## Execution Order

Urutan mengikuti usulan pemilik dengan dua penyesuaian:

1. **Akun/OAuth dipisah dari rute admin** (section 05 dan 06). Alasan: gabungan keduanya terlalu besar untuk
   satu sesi, dan logika OAuth/akun bisa diuji tuntas tanpa rute.
2. **Handler sinkron + runner dipisah dari rute buat tautan** (section 07 dan 08). Alasan: runner diuji
   murni dengan FakeDrive dan repo palsu dulu; rute baru membuka akses `DRIVE` ke pengguna setelah runner
   terbukti. Handler hapus ikut section 09 bersama hook-nya, karena tidak ada job hapus sebelum hook ada.

Rantai ketergantungan: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09; 10 butuh 08; 11 butuh 06; 12 terakhir.
Section 10 dan 11 bisa dikerjakan paralel setelah 09 (atau 11 setelah 06 bila ingin lebih awal).

Setiap section **wajib** diakhiri: tes section lulus + `pnpm typecheck` bersih + tes lama yang disebut lulus.
Bila dijalankan dengan `deep-implement`, commit per section.

## Sections

| # | File | Deskripsi | Depends On | Parallelizable? | Ukuran |
|---|------|-----------|------------|-----------------|--------|
| 01 | section-01-skema-migrasi.md | Skema 3 tabel baru + kolom `laporan_tautan` + audit; migrasi 0024 tulis tangan; label `DRIVE` | - | No | M (~450 baris: skema ~200, SQL ~180, tes ~150) |
| 02 | section-02-config-token-crypto.md | `config.ts`, `token-crypto.ts`, `shared.ts` | 01 | No | S (~300 baris) |
| 03 | section-03-drive-client.md | Pasang paket; `drive-errors.ts`, `drive-client.ts`, FakeDrive | 02 | No | M (~550 baris) |
| 04 | section-04-jobs.md | Antrean: enqueue/klaim/selesai/gagal/tunda + integrasi `SKIP LOCKED` | 01 | Yes (dengan 02–03) | M (~400 baris) |
| 05 | section-05-oauth-akun.md | `oauth.ts`, `akun-repository.ts`, `availability.ts` | 02, 03, 04 | No | L (~750 baris) |
| 06 | section-06-rute-admin.md | Rute `/api/google-drive/status` + 5 rute admin; konstanta API; Zod | 05 | No | M (~550 baris) |
| 07 | section-07-sinkron-runner.md | Perluasan helper ZIP, rencana file, daftar isi, handler sinkron, runner | 03, 04, 05 | No | L (~900 baris) |
| 08 | section-08-rute-tautan.md | Buat tautan DRIVE, riwayat, coba lagi, 404 pembuka, pemicu runner | 06, 07 | No | M (~600 baris) |
| 09 | section-09-penghapusan.md | Handler hapus + hook cabut / pemusnahan / pembersihan / hapus permanen | 08 | No | L (~800 baris) |
| 10 | section-10-ui-bagikan-riwayat.md | Dialog 3 pilihan, progres, Riwayat Tautan status Drive | 08 (09 untuk teks hapus) | Yes (dengan 11) | M (~450 baris) |
| 11 | section-11-ui-pengaturan-admin.md | Komponen `GoogleDriveSettings` di Pengaturan | 06 | Yes (dengan 10) | M (~500 baris) |
| 12 | section-12-dokumentasi-sync.md | `.env.example`, AGENTS.md, ERD, `drive:sync`, checklist uji terima | 01–11 | No | S (~300 baris, mayoritas dokumen) |

Ukuran = perkiraan baris kode + tes yang ditulis/diubah. S ≈ setengah sesi, M ≈ satu sesi, L ≈ satu sesi penuh.

## Persiapan lingkungan tes (sekali per mesin/VM)

Dipakai semua section yang menjalankan tes integrasi. Jangan membuat atau mengubah `.env`/`.env.migration`
(AGENTS.md §8); `DATABASE_URL` diberikan lewat baris perintah (D16). Database tes **terpisah**: `dms_kepser_test`.

```bash
pnpm install
# Cloud VM (PostgreSQL 16 terpasang, mati secara bawaan):
service postgresql start
sudo -u postgres psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='kepser') THEN CREATE ROLE kepser LOGIN PASSWORD 'kepser_dev_password'; END IF; END \$\$;"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='dms_kepser_test'" | grep -q 1 \
  || sudo -u postgres createdb -O kepser dms_kepser_test
export DATABASE_URL=postgresql://kepser:kepser_dev_password@localhost:5432/dms_kepser_test
psql "$DATABASE_URL" -f infra/docker/postgres/init/001-create-schemas.sql
pnpm exec drizzle-kit migrate                     # menerapkan 0000..0024 ke DB tes
export DMS_DEV_SEED_PASSWORD='uji-lokal-saja'
export DMS_DEV_SEED_PASSWORD_HASH="$(pnpm -s auth:hash-password)"
pnpm exec tsx src/db/seed/index.ts                # tes integrasi butuh minimal 1 user/komponen/klasifikasi
```

Menjalankan tes integrasi: `DATABASE_URL=postgresql://kepser:kepser_dev_password@localhost:5432/dms_kepser_test pnpm test:integration`
(atau setelah `export` di atas, cukup `pnpm test:integration`). Di mesin lokal Windows: pakai Postgres Docker
(`infra/docker/postgres/docker-compose.yml`) dan buat database `dms_kepser_test` di dalamnya.

Catatan: perintah `pnpm db:local:migrate` dari AGENTS.md membaca `.env.migration`; di VM berkas itu tidak ada,
sehingga `pnpm exec drizzle-kit migrate` dengan `DATABASE_URL` dari shell dipakai sebagai padanannya.

## Gerbang global sebelum fitur dinyatakan selesai (setelah section 12)

```bash
pnpm typecheck
pnpm test
pnpm test:integration          # dengan DATABASE_URL DB tes
pnpm build                     # memastikan bundling Nitro paket Google dan routeTree
```
Ditambah uji terima manual SPEC 12.3 di mesin lokal (`../uji-terima-manual.md`, dibuat di section 12).
