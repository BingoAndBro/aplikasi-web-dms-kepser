# Section 11: UI Pengaturan ADMIN — Bagian Google Drive

## Context

Section 06 selesai (rute admin + status; pemicu runner ditambahkan di 08). Halaman `src/routes/admin.settings.tsx`
memaksa logout setelah menyimpan tema/identitas; bagian Drive **tidak boleh** ikut alur itu (riset R8).

## Objective

ADMIN bisa menghubungkan, mengganti, menghubungkan ulang, dan memutus akun Google, serta menangani "perlu dihapus
manual", dari satu kartu di Pengaturan (SPEC 10.3), tanpa melihat daftar dokumen.

## Prerequisites
- Section(s) yang harus selesai dulu: 06
- Files/modules yang harus sudah tersedia: `GOOGLE_DRIVE_API`, tipe `GoogleDriveAdminResponse` dll. di `shared.ts`,
  `AdminConfirmationDialog` dan kelas di `src/components/admin/AdminPagePrimitives`

## Implementation Steps

1. `src/components/admin/GoogleDriveSettings.tsx` (baru):
   - Muat `apiFetch<GoogleDriveAdminResponse>(GOOGLE_DRIVE_API.ADMIN)`; `LoadingState` saat memuat; galat → kotak merah + tombol muat ulang.
   - `dikonfigurasi = false` → kartu info (nama tiga variabel env, tanpa nilai).
   - Akun aktif: email, badge Terhubung / Perlu dihubungkan ulang, jumlah tautan Drive aktif, jumlah pekerjaan gagal; tombol
     **Ganti akun** (mode `GANTI`), **Putuskan** (konfirmasi menyebut jumlah tautan aktif), **Hubungkan ulang** (bila perlu; mode
     `HUBUNGKAN_ULANG` + `akun_id`).
   - Tanpa akun aktif: tombol **Hubungkan akun Google** (mode `HUBUNGKAN`).
   - Panel hubungkan 2 langkah (muncul setelah tombol mode ditekan): langkah 1 tombol **Buka halaman login Google** →
     `apiMutation(GOOGLE_DRIVE_API.MULAI_HUBUNG, { body: { mode, akun_id } })` lalu `window.open(auth_url, '_blank', 'noopener,noreferrer')`;
     langkah 2 textarea "Tempel alamat dari tab yang gagal dimuat" + **Simpan** (`HUBUNGKAN`) + teks bantu: "Setelah klik Izinkan, tab
     Google akan menampilkan halaman gagal dimuat (alamat diawali http://127.0.0.1:53682). Itu normal — salin seluruh alamatnya ke sini."
     Tombol Batal menutup panel. Sukses → toast + muat ulang.
   - Akun lain (`NONAKTIF`): email, jumlah tautan, **Putuskan permanen** (konfirmasi menyebut jumlah tautan; menjelaskan bahwa tautan
     yang masih ada harus dihapus manual di Drive).
   - "Perlu dihapus manual di Drive": daftar `judul_tautan`, `nama_folder`, `email_akun`, kategori (label); tombol
     **Coba lagi penghapusan yang gagal** (`COBA_LAGI_PENGHAPUSAN`) → toast jumlah.
   - Tidak memanggil `/auth/logout` atau endpoint settings; tidak menampilkan nama file/dokumen.
2. `src/routes/admin.settings.tsx`: render `<GoogleDriveSettings />` sebagai kartu terpisah di bawah pilihan tema (di luar
   `AdminConfirmationDialog` tema). Teks deskripsi header boleh ditambah "dan koneksi Google Drive".
3. Tes source guard `tests/unit/admin/google-drive-settings-source.test.ts` (folder baru `tests/unit/admin/`).
4. `tests/TEST-CLASSIFICATION.md` (bagian baru "admin").

## Files to Create/Modify
- `src/components/admin/GoogleDriveSettings.tsx` — baru.
- `src/routes/admin.settings.tsx` — pasang komponen.
- `tests/unit/admin/google-drive-settings-source.test.ts` — baru.
- `tests/TEST-CLASSIFICATION.md`.

## Test Stubs (dari TDD plan)

### Happy Path
- [ ] `admin.settings.tsx` merender `GoogleDriveSettings`.
- [ ] Komponen memuat delapan teks kunci SPEC 10.3 (Hubungkan akun Google, Ganti akun, Putuskan, Hubungkan ulang, Putuskan permanen,
      Tempel alamat dari tab yang gagal dimuat, Perlu dihapus manual di Drive, Coba lagi penghapusan yang gagal).
- [ ] Langkah 1 membuka tab baru dengan `noopener`.

### Edge Cases
- [ ] Memakai konstanta `GOOGLE_DRIVE_API` (tanpa string path ajaib).

### Error Cases
- [ ] Tidak memanggil `/auth/logout` maupun `/settings/`.
- [ ] Tidak merender `nama_file`/daftar dokumen.

## Perintah Tes

```bash
pnpm test tests/unit/admin tests/unit/styles
pnpm typecheck
```
Uji visual manual lokal (`pnpm dev`, login ADMIN): kartu tanpa env, dengan env tanpa akun, panel 2 langkah.

## Definition of Done
- [ ] Semua aksi SPEC 10.3 tersedia dan memanggil endpoint yang benar.
- [ ] Simpan tema/identitas tetap berperilaku seperti sebelumnya (logout), aksi Drive tidak.
- [ ] Semua test stubs di section ini sudah diimplementasi dan passing.
- [ ] `pnpm typecheck` bersih; tidak ada regresi.
