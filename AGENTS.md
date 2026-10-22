# AGENTS.md — Aturan Kerja Proyek DMS Kepser

DMS Kepser (*Document Management System* BPS Kabupaten Kepulauan Seribu): aplikasi web internal
untuk pengajuan dokumen kegiatan, pemeriksaan kelengkapan berjenjang (PPK → PPSPM), pemberkasan
arsip keuangan, dan penyediaan bukti dukung laporan kinerja.

Otoritas tertinggi adalah **kode di `src/` dan migrasi di `drizzle/`**. Bila file ini atau `docs/`
bertentangan dengan kode, ikuti kode, lalu perbarui dokumennya.

---

## 1. Stack

| Lapisan | Teknologi |
|---|---|
| Framework | TanStack Start + TanStack Router (file-based), React 19, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui gaya `base-nova` di atas Base UI, lucide-react, framer-motion |
| Basis data | PostgreSQL 16 lokal (Docker) + Drizzle ORM + node-postgres |
| Auth | Sesi buatan sendiri: cookie HttpOnly `dms_session`, kata sandi argon2id |
| Penyimpanan file | Filesystem lokal (`DMS_LOCAL_STORAGE_ROOT`), akses lewat token bertanda tangan |
| Validasi | Zod |
| Tes | Vitest (unit, integrasi), Playwright (E2E) |
| Paket | **pnpm saja** — jangan `npm`/`yarn` |

Aplikasi berjalan di jaringan lokal kantor (server lokal satuan kerja). Tidak ada layanan cloud.

---

## 2. Peran

Konstanta: `src/lib/constants/roles.ts`.

| Kode | Label | Ringkasan hak |
|---|---|---|
| `PEGAWAI` | Pegawai | Mengajukan dan merevisi dokumen, Laporan Saya |
| `PPK` | Pejabat Pembuat Komitmen | Validasi dokumen material, Nominal Realisasi |
| `PPSPM` | PPSPM | Persetujuan akhir dokumen material, Nominal Realisasi |
| `KEPALA_SUB_BAGIAN_UMUM` | Kepala Sub Bagian Umum | Pemberkasan, berkas, klasifikasi, penambahan dokumen, pembersihan berkas |
| `PENANGGUNG_JAWAB_KINERJA` | Penanggung Jawab Kinerja | Laporan Kinerja (baca saja, termasuk lampiran dokumen final), tautan laporan, log aktivitas semua pengguna |
| `ADMIN` | Administrator | Pengguna, peran, penugasan Ketua Tim, data master, pengaturan |

Aturan:
- Pengguna boleh punya beberapa peran non-admin dan berpindah peran aktif lewat header.
- `ADMIN` berdiri sendiri: tidak digabung dengan peran lain dan **tidak bisa membaca atau memproses dokumen**.
- **Ketua Tim bukan peran login**, melainkan penugasan per kegiatan (`master.ketua_tim_assignments`). Satu kegiatan hanya punya satu Ketua Tim. Pegawai yang ditugaskan mendapat menu Monitoring Dokumen Tim, Laporan Kegiatan, dan Pembersihan Dokumen.
- Hak baca dokumen orang lain: PPK/PPSPM hanya dokumen material pada status tugasnya; Kepala Sub Bagian Umum dokumen `COMPLETED`; PJ Kinerja dokumen `COMPLETED` dan `TERSIMPAN`; Ketua Tim dokumen non-`DRAFT` di kegiatan yang dipimpinnya. Logika ini ada di `src/lib/storage/document-file-access.ts`.

---

## 3. Status

### Dokumen (`src/lib/constants/document-status.ts`)

`DRAFT`, `IN_PPK_VALIDATION`, `IN_PPSPM_APPROVAL`, `NEED_REVISION`, `COMPLETED`, `TERSIMPAN`.

- **Material** (punya nominal realisasi): seluruh transisi lewat `transition()` di `src/lib/fsm.ts`. Aksi: `SUBMIT`, `APPROVE`, `REJECT`, `RESUBMIT`, `RESUBMIT_PPK`, `KEMBALIKAN`.
- PPK menolak → `NEED_REVISION` dengan `revision_target='USER'`. PPSPM menolak → `NEED_REVISION` dengan `revision_target='PPK'`; PPK lalu mengajukan ulang (`RESUBMIT_PPK`) atau mengembalikan ke pegawai (`KEMBALIKAN`).
- **Non-material** (tanpa nominal): langsung `TERSIMPAN` oleh handler submit, tanpa PPK/PPSPM.
- `nominal_realisasi` khusus material dan terkunci setelah `COMPLETED`.
- Tidak ada status `ARCHIVED`. Setelah `COMPLETED`, dokumen diberkaskan.
- Validasi PPK dan persetujuan PPSPM adalah pemeriksaan kelengkapan elektronik yang **berjalan paralel dengan alur fisik**; tidak mengesahkan dokumen dan tidak menyetujui pembayaran. Jaga istilah ini di UI.

### Berkas arsip (`src/lib/constants/archive-status.ts`)

- `status_berkas`: `OPEN` → `CLOSED`. Tutup berkas wajib Nomor SPM dan masa simpan.
- `status_arsip` (setelah `CLOSED`): `AKTIF` → `USUL_MUSNAH` → `DIMUSNAHKAN`; usulan bisa dibatalkan ke `AKTIF`. `INAKTIF` ada di enum hanya demi kompatibilitas.
- Satu berkas per pasangan klasifikasi (cara pembayaran) dan tahun anggaran.
- `DIMUSNAHKAN` memblokir pratinjau, unduhan, ekspor ZIP, dan tautan untuk seluruh isi berkas. Metadata tetap ada.
- Sumber isi berkas: `WORKFLOW` (dokumen dari alur pengajuan) dan `MANUAL` (Penambahan Dokumen oleh Kepala Sub Bagian Umum, tabel `arsip.manual_arsip`).

---

## 4. Invariant Arsitektur

1. **FSM satu-satunya jalan perubahan status dokumen material.** Update status selalu bersyarat pada status lama dan dalam satu transaksi dengan insert log (lihat skill `db-fsm-guard`).
2. **Riwayat aktivitas append-only.** `dokumen.log_aktivitas`, `arsip.berkas_arsip_activity`, `audit.audit_log`: hanya `INSERT`. Pengecualian sempit: hapus permanen dokumen non-material `TERSIMPAN` ikut menghapus log-nya lewat cascade.
3. **Server yang menentukan hak akses.** Menyembunyikan menu hanya kenyamanan. Setiap rute API memeriksa same-origin (metode tidak aman), sesi, dan peran. `dms_active_role` bukan bukti otorisasi.
4. **Zod di setiap batas.** Body, parameter, dan payload divalidasi sebelum menyentuh DB (`src/lib/schemas/`).
5. **Tanpa string ajaib.** Path rute di `src/lib/constants/routes.ts`, peran di `roles.ts`, status di `document-status.ts` dan `archive-status.ts`.
6. **Rahasia hanya di env.** Jangan menulis atau mencetak isi `.env`, `DATABASE_URL`, hash kata sandi, token sesi, token file, token tautan, atau path fisik penyimpanan.
7. **File tidak pernah dilayani statis.** Semua pratinjau/unduhan lewat rute API yang memeriksa ulang hak akses dan status terkini; cegah path traversal.
8. **Perubahan skema lewat Drizzle.** Ubah `src/db/schema/**` → `pnpm db:local:generate` → baca SQL → `pnpm db:local:migrate`. Jangan `drizzle-kit push`, jangan mengedit migrasi lama.

---

## 5. Batas Beban (KNF-03)

| Batas | Nilai | Lokasi |
|---|---|---|
| Ukuran unggahan per file | 5 MB | `src/lib/upload/document-upload-policy.ts` |
| Ekspor ZIP | 500 dokumen | `src/lib/export/document-zip.ts` |
| Tautan laporan | 500 dokumen | `src/lib/laporan/tautan-shared.ts` |
| Pembersihan per batch | 200 dokumen | `src/lib/dokumen/pembersihan.ts` |
| Catatan penolakan | ≥ 10 karakter | `src/lib/schemas/dokumen.ts` |

Ekspor ZIP hanya membungkus file yang sudah boleh dibuka peminta satu per satu, dan `DAFTAR_ISI.txt` tidak memuat path.

---

## 6. Peta Kode

```text
src/routes/<peran>/...            halaman per peran (pegawai, ppk, ppspm, kasubag, penanggung-jawab-kinerja, admin.*)
src/routes/api/...                rute API (pola: same-origin -> sesi -> peran -> Zod -> DB)
src/routes/tautan.$token.tsx      halaman tautan laporan
src/lib/fsm.ts                    transisi status dokumen
src/lib/auth/                     sesi, kata sandi, rate limit login, resolusi peran
src/lib/security/same-origin.ts   pemeriksaan Origin/Referer
src/lib/guards.ts                 guard rute klien (kenyamanan, bukan keamanan)
src/lib/storage/                  unggah, pindah, hapus, akses file bertoken
src/lib/archive/                  berkas arsip, klasifikasi, pemusnahan fisik
src/lib/laporan/                  laporan, periode, tautan laporan
src/lib/export/document-zip.ts    satu-satunya perakit ZIP
src/lib/dokumen/                  submit, revisi, pembersihan, konflik transisi
src/db/schema/                    skema Drizzle: auth, master, dokumen, arsip, audit, app
src/config/navigation.ts          menu per peran
src/components/layout/AppLayout.tsx  bootstrap auth klien
```

Dokumen pendukung: `docs/peta-halaman-dan-komponen.md`, `docs/routing-sop.md`,
`docs/skripsi/penjelasan-proyek-aplikasi.md`, `docs/skripsi/rancangan-erd.md`,
`docs/skripsi/rancangan-behavioral-state-diagram.md`, `docs/best-practices/`.

---

## 7. Saat Mengubah Sesuatu

- **Skema DB** → Drizzle + migrasi baru + Zod + helper/API + `docs/skripsi/rancangan-erd.md`.
- **Status atau aksi** → constants, types, `fsm.ts`, `tests/fsm.test.ts`, badge/filter, file ini.
- **Rute** → `routes.ts`, `navigation.ts`; `src/routeTree.gen.ts` dibuat ulang otomatis oleh `pnpm dev`/`pnpm build`, jangan diedit manual.
- **Hak akses** → periksa rute API terkait dan `document-file-access.ts`, lalu tambah tes negatif (`401`/`403`).
- **File/penyimpanan** → tetap lewat `src/lib/storage/*`, cek `DIMUSNAHKAN`, jangan bocorkan path/token.

---

## 8. Berkas dan Perintah yang Dilindungi

- Jangan mengubah `.env`, `.env.migration`, `src/routeTree.gen.ts`.
- Jangan mengubah `package.json`/`pnpm-lock.yaml` kecuali memang menambah atau menghapus paket atas permintaan.
- Jangan menjalankan backup/restore, pembersihan penyimpanan destruktif, atau reset DB tanpa diminta.
- Di PowerShell, kutip path yang memuat `$`, misalnya `'src/routes/api/dokumen/$id/submit.ts'`.

---

## 9. Tes

- Mulai dari tes terkecil yang relevan; sebutkan bila tes tidak dijalankan.
- FSM: `pnpm test tests/fsm.test.ts`. Unit: `pnpm test`. Integrasi (butuh DB): `pnpm test:integration`. E2E: `npx playwright test`. Tipe: `pnpm typecheck`.
- Detail pola tes: skill `webapp-testing` dan `tests/TEST-CLASSIFICATION.md`.

---

## 10. Commit dan Repository

- Jangan commit kecuali diminta pemilik repo, atau rencana `deep-implement` yang sedang dijalankan memerintahkan commit per section.
- Repo ini privat untuk pengembangan lanjutan (salinan repo skripsi `skripsi-222212554`, yang sudah dikumpulkan dan tidak boleh diubah). Kontribusi Claude dan atribusinya diperbolehkan.
- `CLAUDE.md`, `AGENTS.md`, `.claude/`, dan `docs/` di-commit. `graphify-out/`, `storage/`, `.env*` (kecuali `*.example`), dan `ngrok/*.yml` tidak.
- Hindari `git add -A`; tambahkan file yang memang berubah. Sebelum push periksa `git status --short` dan `git diff --stat`.

---

## 11. Batasan yang Diketahui (bahan pengembangan berikutnya)

- Komunikasi masih HTTP di jaringan lokal; HTTPS + cookie `Secure` adalah target pemasangan di server satuan kerja.
- Rate limit login hanya di memori proses.
- Tautan laporan tanpa masa berlaku, token tidak di-hash, pembuka tautan `PUBLIK` tidak tercatat identitasnya.
- Saran pengembangan dari skripsi: penambahan dokumen tanpa alur persetujuan oleh Ketua Tim (F-1), integrasi BackOffice BPS dan SINERGI, pengaitan dokumen dengan indikator kinerja dan rencana tindak lanjut, peluncur (batch/shortcut) untuk menyalakan DB dan aplikasi.
