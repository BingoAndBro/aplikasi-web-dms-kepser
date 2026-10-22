# SOP Routing dan Autentikasi API

## Rute API (`src/routes/api/**`)

Pola tetap setiap handler, mengikuti `src/routes/api/ppk/kembalikan/$id.ts`:

1. Metode tidak aman (`POST`, `PUT`, `PATCH`, `DELETE`): panggil `requireSameOrigin(request)` dari `#/lib/security/same-origin` paling awal dan kembalikan responsnya bila tidak `null`.
2. Ambil sesi dengan `getLocalServerSession(request)` dari `#/lib/auth/local-server-auth`. Tanpa sesi → `401`.
3. Periksa peran dengan `hasLocalRole(session, '<ROLE>')`. Peran tidak sesuai → `403`. Cookie `dms_active_role` bukan bukti otorisasi; yang dipakai adalah peran yang ditugaskan pada sesi.
4. Validasi parameter dan body (UUID, Zod) sebelum menyentuh basis data. Data tidak ditemukan → `404`.
5. Handler API mengembalikan JSON (`Response.json`) dan tidak pernah melakukan redirect.
6. Pesan galat ke klien singkat dan aman; detail galat hanya ke `console.error` dengan prefiks rute, tanpa path fisik, token, atau isi env.

## Akses File

- Pratinjau dan unduhan selalu lewat rute API yang memeriksa sesi, peran, dan status dokumen/berkas terkini (`/api/files/access`, rute `preview`/`download` per dokumen, dan rute tautan laporan).
- Token akses file ditandatangani dengan `DMS_FILE_TOKEN_SECRET` (`src/lib/storage/file-access-token.ts`, `internal-file-access.ts`). Token tidak boleh dicetak atau mengandung path fisik.
- File tidak pernah dilayani dari folder publik/statis.
- Berkas berstatus `DIMUSNAHKAN` memblokir pratinjau, unduhan, dan ekspor ZIP.

## Tautan Laporan (`/tautan/$token`)

- Token tautan diperiksa lebih dulu karena jenis akses (`LOGIN`, tampil sebagai "Terbatas", atau `PUBLIK`) menentukan perlu tidaknya sesi.
- Tautan `LOGIN` mewajibkan login; tautan `PUBLIK` dapat dibuka tanpa akun.
- Isi tautan dibatasi pada dokumen yang boleh dibaca pembuatnya, paling banyak `TAUTAN_MAX_DOKUMEN` (500).

## Rute Halaman

- Rute induk per peran (`/pegawai`, `/ppk`, `/ppspm`, `/kasubag`, `/penanggung-jawab-kinerja`, `/admin`) memakai `beforeLoad` sinkron dengan `guardRole(role)` dari `src/lib/guards.ts`.
- Guard membaca snapshot auth klien dari `AppLayout`. Bila `authState.isReady` masih `false`, guard tidak me-redirect dan menyerahkan ke alur loading/login `AppLayout`.
- Guard klien hanya untuk kenyamanan tampilan; keamanan tetap ditegakkan di rute API.
- Path rute memakai konstanta `ROUTES` di `src/lib/constants/routes.ts`; menu per peran di `src/config/navigation.ts`.
