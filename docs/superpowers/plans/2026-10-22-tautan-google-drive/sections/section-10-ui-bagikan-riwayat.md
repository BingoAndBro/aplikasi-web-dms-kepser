# Section 10: UI Dialog Bagikan dan Riwayat Tautan

## Context

Section 08 (dan sebaiknya 09) selesai: API membuat tautan DRIVE, riwayat mengembalikan field Drive, coba lagi tersedia,
cabut menghapus salinan. `BagikanTautan.tsx` baru disesuaikan minimal agar typecheck lulus.

## Objective

Dialog "Bagikan sebagai Tautan" punya tiga pilihan akses dengan kartu Google Drive yang sadar ketersediaan, tampilan
progres unggah, dan Riwayat Tautan menampilkan status Drive beserta aksinya (SPEC 10.1–10.2).

## Prerequisites
- Section(s) yang harus selesai dulu: 08 (09 untuk teks status hapus)
- Files/modules yang harus sudah tersedia: `GOOGLE_DRIVE_API`, `TAUTAN_API`, `src/lib/google-drive/shared.ts`, tipe tautan baru
- Baca skill `designing-frontend` / `ui-ux-pro-max` untuk pola shadcn/Tailwind proyek.

## Implementation Steps

1. `BagikanTautanDialog`:
   - Saat dialog dibuka: `apiFetch<GoogleDriveStatusResponse>(GOOGLE_DRIVE_API.STATUS)`; simpan `{ tersedia, alasan }`;
     galat → anggap tidak tersedia tanpa alasan khusus ("Status Google Drive tidak dapat dimuat").
   - Radiogroup `grid gap-2 sm:grid-cols-3`; `AksesOption` menerima `disabled` + `hint` (alasan) dan memakai `aria-disabled`.
     Kartu: "Google Drive" / "Bisa dibuka dari internet lewat link Google Drive".
   - Pilih DRIVE → peringatan kuning `DRIVE_PERINGATAN_PUBLIK` (gaya sama dengan peringatan Publik).
   - Akses tetap direset ke `TAUTAN_AKSES.LOGIN` setiap dibuka.
   - Setelah dibuat DRIVE: state `createdDrive { id, total }`; polling `GET /api/laporan/tautan?sumber=` tiap 3000 ms selama dialog
     terbuka dan status ∈ {MENUNGGU, MENGUNGGAH}; teks "Sedang diunggah ke Google Drive (x/y)…" + spinner; `SIAP` → `TautanUrlField`
     dengan label tombol "Salin link Drive" / "Buka di Drive"; `GAGAL` → kotak merah `drive_galat` + petunjuk Riwayat; `drive_tertunda_akun`
     → teks tertunda. Deskripsi: unggahan tetap berjalan bila dialog ditutup.
   - `TautanUrlField`: prop opsional `copyLabel`, `openLabel`, `ariaLabel`.
2. `RiwayatTautanDialog`:
   - Badge akses `Google Drive` (warna netral-biru dari token tema; hindari warna arbitrary baru — lihat `tests/unit/styles/color-budget.test.ts`).
   - Baris DRIVE mengikuti tabel SPEC 10.2: progres (`drive_progres`) + spinner; `SIAP` → URL Drive + Cabut; `GAGAL` → "Gagal: <pesan>" +
     tombol **Coba lagi** (`apiMutation(TAUTAN_API.cobaLagi(id))`, lalu muat ulang) + Cabut; tertunda akun; dicabut → "Dicabut · menghapus dari Drive…"
     (`MENGHAPUS`) / "Dicabut · terhapus dari Drive" (`DIHAPUS`).
   - Sembunyikan "dibuka N×" untuk DRIVE.
   - Konfirmasi cabut untuk DRIVE menambah: "Salinan di Google Drive akan dihapus permanen."
   - Polling 5000 ms selama dialog terbuka dan ada baris `MENUNGGU`/`MENGUNGGAH`/`MENGHAPUS`; bersihkan timer saat tertutup/unmount.
   - Muat ulang daftar dibuat fungsi `reload()` yang dipakai polling, coba lagi, dan cabut.
3. Jangan pernah menampilkan `path` untuk DRIVE.
4. Tes source guard `tests/unit/laporan/tautan-drive-ui-source.test.ts`; pastikan `tautan-wiring-source.test.ts` dan
   `tests/unit/styles/color-budget.test.ts` tetap lulus.
5. `tests/TEST-CLASSIFICATION.md`.

## Files to Create/Modify
- `src/components/laporan/BagikanTautan.tsx`.
- `tests/unit/laporan/tautan-drive-ui-source.test.ts` — baru.
- `tests/TEST-CLASSIFICATION.md`.

## Test Stubs (dari TDD plan)

### Happy Path
- [ ] Tiga pilihan akses dalam `sm:grid-cols-3`.
- [ ] Teks peringatan Drive persis SPEC 10.1 (lewat konstanta `DRIVE_PERINGATAN_PUBLIK`).
- [ ] Dialog memanggil `GOOGLE_DRIVE_API.STATUS` dan memakai tiga pesan alasan.
- [ ] Riwayat memuat "Coba lagi", "Salin link Drive", "Buka di Drive", "Tertunda: akun Drive perlu dihubungkan ulang", "terhapus dari Drive".

### Edge Cases
- [ ] Reset akses ke `TAUTAN_AKSES.LOGIN` tetap ada.
- [ ] Interval 3000 ms dan 5000 ms ada dan dibersihkan.

### Error Cases
- [ ] Kartu Drive memakai `aria-disabled`/`disabled` bila tidak tersedia.
- [ ] `item.path` tidak dirender untuk DRIVE.

## Perintah Tes

```bash
pnpm test tests/unit/laporan tests/unit/styles
pnpm typecheck
```
Uji visual manual (lokal, `pnpm dev`): dialog di lebar HP (kartu bertumpuk) dan desktop; kartu Drive nonaktif tanpa env.

## Definition of Done
- [ ] Alur UI SPEC 10.1–10.2 lengkap; tanpa env Google kartu Drive nonaktif dengan alasan.
- [ ] Tidak ada kebocoran timer (polling berhenti saat dialog tertutup).
- [ ] Semua test stubs di section ini sudah diimplementasi dan passing.
- [ ] `pnpm typecheck` bersih; tes UI lama lulus.
