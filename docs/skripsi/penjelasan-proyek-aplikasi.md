# Penjelasan Proyek: Repositori Dokumen Kegiatan — Penyimpanan, Persetujuan, dan Pemberkasan

> **Versi final**: disinkronkan dengan kode branch `migration/postgres-local`, commit HEAD `e6ba99c` (filter periode bersama + Bulanan, lampiran dokumen manual KSBU wajib dan bisa dibuka di laporan) ditambah perbaikan teks header Laporan Kinerja (D-27) dan pembersihan kode lama (D-16, D-9), 28 September 2026, serta dokumen tambahan KSBU di Laporan Kegiatan dan aturan "berkas dimusnahkan" yang seragam (D-28, commit `93eeb17`), status arsip dokumen mengikuti berkas + migrasi `0021` (D-29), filter Status Material/Non-Material dan Laporan Kinerja sampai Kegiatan (D-30), serta unduhan ZIP laporan secara bawaan browser (D-31), commit `ae8a698`, 29 September 2026. Seluruh temuan di Bagian D sudah punya keputusan. Versi sebelumnya: `b6c3292` (27 September 2026) dan `penjelasan-proyek-aplikasi-lama.md` (commit `7927ca5`). **Diperbarui 30 September 2026** setelah verifikasi langkah 5 (`laporan-verifikasi-langkah5.md`), *sequence diagram* 15 UC (`Rancangan Sequence Diagram 15 UC (30 Sept 2026).md`), dan commit `4da7ed1` (istilah "final" dan "arsip" pada teks UI diganti; keputusan pemilik di laporan bagian I). Ringkasan: Bagian A no. 43–46, koreksi di B.1–B.5, D-32, keterbatasan K-11 dan K-12, dan tabel istilah H.
>
> Dokumen rancangan diagram yang menyertai dokumen ini: `rancangan-erd.md`, `rancangan-behavioral-state-diagram.md`, dan `Rancangan Sequence Diagram 15 UC (30 Sept 2026).md` (folder yang sama; menggantikan `rancangan-sequence-diagram.md` untuk gambar sequence, yang tetap menjadi bukti verifikasi kode 27 Sept). Bukti verifikasi kode 30 Sept: `laporan-verifikasi-langkah5.md`.
>
> Dokumen ini menjelaskan proyek dari sisi **bisnis lebih dulu**, baru turun ke solusi teknis. Alurnya: *Permasalahan Bisnis Utama* → *masalah spesifik* → *solusi, use case, pengguna, keterkaitan*.
>
> **Pembanding permasalahan = proses kerja manual berbasis kertas yang berjalan di kantor sekarang**, bukan versi kode sebelumnya. Perbandingan dengan versi kode sebelumnya hanya ada di **Bagian A (Changelog)**.
>
> **Otoritas**: satu-satunya otoritas adalah **kode di `src/` + migrasi `drizzle/`**. `AGENTS.md`, `docs/`, dan `docs/planning/` tidak dipakai sebagai sumber fakta. Setiap klaim menunjuk ke `berkas:baris` atau nama fungsi/konstanta. Klaim yang tidak bisa ditunjuk ke kode ditandai **[BELUM TERVERIFIKASI]**. Path relatif terhadap akar repo; `$id` adalah segmen literal di nama berkas rute.

---

## Daftar Isi

1. Gambaran Singkat & kondisi kerja manual sekarang
2. Aktor
3. Peta Permasalahan Bisnis PB-1 s.d. PB-9 (beserta rinciannya)
4. Keterkaitan antar-PB
5. Peta Cepat: Masalah → Lokasi Kode
- **A.** Changelog sejak `7927ca5` (sampai `e6ba99c`)
- **B.** Fakta untuk Bab IV (use case, transisi status, state berkas, ERD, sequence)
- **C.** Fakta untuk Bab V (dependensi, struktur, ukuran kode, tes, deploy, halaman, ISO 25010)
- **D.** Temuan, keputusan, dan daftar keterbatasan sistem (K-1 s.d. K-9, bahan Bab V)
- **Lampiran** teknis (stack, arsitektur, basis data, keamanan, UI, istilah usang)

---

## 1. Gambaran Singkat

Aplikasi ini adalah **aplikasi internal mandiri** milik satuan kerja di lingkungan **BPS**, dengan tiga lapisan yang menyatu:

1. **Repositori dokumen kegiatan.** Pegawai menyimpan semua dokumen kegiatan di satu tempat dan bisa menyaringnya: dokumen bernilai uang (**material**) maupun administratif (**non-material**).
2. **Alur persetujuan berjenjang.** Dokumen material dirutekan **Pegawai → PPK → PPSPM**, lengkap dengan penolakan, revisi, dan pengembalian. Semua perpindahan status dikendalikan satu **modul transisi status terpusat**.
3. **Pemberkasan, unduh, dan pembersihan.** Dokumen yang sudah selesai dikelompokkan Kepala Sub Bagian Umum ke dalam **Berkas**. Satu berkas mewakili satu **Cara Pembayaran** dalam satu **Tahun Anggaran**, dan ditutup dengan satu **Nomor SPM**. Aplikasi menyediakan unduhan ZIP (per berkas, atau banyak dokumen hasil saringan). Karena disk terbatas, soft file berkas lama dan lampiran dokumen non-material yang sudah lewat masa guna bisa dibersihkan, sementara metadatanya tetap tersimpan.

> **Aplikasi ini tidak berintegrasi dengan aplikasi lain** (KipApp, SAKIP, SPIDER, Google Drive, aplikasi arsip nasional, dan lain-lain). Tidak ada kode yang mengirim atau menerima data dari layanan eksternal. `.env.example` hanya memuat `DATABASE_URL`, `DMS_LOCAL_STORAGE_ROOT`, `DMS_FILE_TOKEN_SECRET`, `APP_URL`, dan `DMS_SESSION_COOKIE_SECURE`. Apa yang dilakukan pengguna dengan file unduhan terjadi **manual di luar sistem**.

### Kondisi kerja di kantor sekarang (titik awal permasalahan)

Proses pertanggungjawaban dokumen di satker ini **masih manual dan berbasis kertas**; belum ada sistem informasi yang membantu.

- Pegawai menyusun berkas fisik lalu mengantarnya ke meja PPK. Setelah PPK setuju, berkas diantar lagi ke meja PPSPM.
- Status berkas hanya diketahui dengan bertanya langsung. Berkas bisa "mengendap" di satu meja tanpa ada yang tahu.
- Persetujuan berupa paraf atau tanda tangan basah. Penolakan sering lisan atau berupa coretan, tanpa alasan tertulis.
- Syarat kelengkapan tiap kegiatan hanya diingat staf senior. Nama kegiatan, komponen, dan jenis permintaan ditulis bebas, sehingga tidak seragam.
- Rekap jumlah dokumen selesai dan total realisasi dihitung manual dari banyak orang, lalu dikompilasi ke Excel.
- Dokumen digital pendukung tercecer di PC atau flashdisk masing-masing, dan berkas fisik menumpuk di lemari.
- Tiap akhir tahun, berkas fisik di-scan ulang satu per satu untuk keperluan arsip.

**North Star proyek:** setiap pegawai tahu persis apa yang harus mereka lakukan hari ini, dan setiap dokumen bisa dilacak statusnya secara real-time oleh pihak yang berwenang.

---

## 2. Aktor

| Aktor | Kode internal | Tanggung jawab utama |
|---|---|---|
| **Pegawai** | `PEGAWAI` | Mengajukan dokumen, mengunggah kelengkapan, merevisi dokumen yang ditolak, melihat Laporan Saya. |
| **Ketua Tim** (PJ Kegiatan) | *kapabilitas*, bukan peran login. Sumbernya tabel `master.ketua_tim_assignments`. | Pegawai yang ditunjuk untuk satu atau lebih kegiatan. Mendapat grup menu "PJ Kegiatan": Monitoring Dokumen Tim, Laporan Kegiatan, dan Pembersihan Dokumen. Grup ini disembunyikan bila pegawai tidak punya penugasan (`KETUA_TIM_ONLY_NAV_IDS`, `src/components/layout/AppSidebar.tsx:53`). |
| **PPK** | `PPK` | Validasi tahap pertama: meloloskan atau menolak dokumen. Menindaklanjuti penolakan PPSPM, dengan memperbaiki lalu mengirim ulang, atau mengembalikan ke pegawai. Memantau Nominal Realisasi. |
| **PPSPM** | `PPSPM` | Persetujuan tahap akhir: menyetujui (dokumen selesai) atau menolak kembali ke PPK. Memantau Nominal Realisasi. |
| **Kepala Sub Bagian Umum (KSBU)** | `KEPALA_SUB_BAGIAN_UMUM` (rute `/kasubag`) | Mengklasifikasikan dokumen selesai ke Berkas, menambahkan dokumen tanpa alur persetujuan, menutup berkas dengan Nomor SPM, membersihkan file berkas, dan mengelola Master Klasifikasi Dokumen (Cara Pembayaran). |
| **Penanggung Jawab Kinerja** | `PENANGGUNG_JAWAB_KINERJA` | Melihat Laporan Kinerja (material, non-material, dan dokumen tambahan KSBU) beserta detail dan lampirannya (read-only), serta Log Aktivitas seluruh pengguna. |
| **Admin** | `ADMIN` | Mengelola pengguna dan peran, penugasan Ketua Tim, data master, serta tema dan identitas aplikasi. Melihat Log Aktivitas seluruh pengguna. |

Aturan peran:

| Aturan | Bukti |
|---|---|
| Hak akses di server adalah **gabungan seluruh peran** yang dimiliki pengguna. Peran aktif hanya menentukan ruang kerja UI (menu). | `hasLocalRole` / `hasAnyLocalRole` memeriksa `session.roles` (`src/lib/auth/local-server-auth.ts:58-71`). Cookie `dms_active_role` hanya dipakai untuk mengisi `activeRole` (`:48-51`) dan sidebar (`AppSidebar.tsx:83`). |
| Berpindah peran lewat header, bukan untuk Admin. | `src/components/layout/AppLayout.tsx:332` → `POST /api/auth/role-switch`, yang menolak ADMIN dan peran yang tidak dimiliki (`src/routes/api/auth/role-switch.ts:62-78`). |
| Akun operasional **otomatis juga PEGAWAI**. | `normalizeAdminRolePayload` (`src/lib/users/role-assignment.ts:6-16`) menambahkan PEGAWAI bila belum ada. Dipanggil saat membuat dan mengubah pengguna (`src/routes/api/users/index.ts:107`, `src/routes/api/users/$id.ts:119,128`, `src/lib/users/local-user-mutations.ts:64,138`). |
| **ADMIN eksklusif.** | Masukan campuran diringkas menjadi `[ADMIN]` oleh `normalizeAdminRolePayload`. Saat login dan pemuatan sesi, kombinasi campuran ditolak `validateAssignedRoles` (`src/lib/auth/role-resolution.ts:26-28`). |
| **Minimal satu admin aktif.** | `evaluateAdminRoleMutationPolicy` dan `evaluateAdminDeactivationPolicy` (`role-assignment.ts:47-83`), dengan pesan `LAST_ACTIVE_ADMIN_ERROR` = "Minimal harus ada satu akun ADMIN aktif." |

---

## 3. Peta Permasalahan Bisnis (Ringkasan)

| # | Permasalahan Bisnis Utama | Proses manual sekarang → kelemahannya |
|---|---|---|
| **PB-1** | Alur & status dokumen tidak transparan | Berkas diantar dari meja ke meja; pemilik tidak tahu berkasnya di mana, kurang apa, atau harus berbuat apa. |
| **PB-2** | Persetujuan berjenjang lambat & tidak terstandar | PPK lalu PPSPM memaraf tumpukan kertas; tidak ada antrean; penolakan lisan. |
| **PB-3** | Jejak audit & akuntabilitas lemah | Bukti hanya paraf, mudah hilang, dan tidak mencatat kapan maupun alasannya. |
| **PB-4** | Data referensi & kelengkapan tidak seragam | Nama kegiatan dan komponen ditulis bebas; syarat kelengkapan hanya diingat staf senior. |
| **PB-5** | Realisasi anggaran & pembedaan dokumen tidak tertib | Dokumen bernilai uang dan administratif ditumpuk bersama; nominal dicatat manual. |
| **PB-6** | Dokumen selesai tercecer & penyimpanan terbatas | Berkas menumpuk di lemari, file tercecer di PC, dan tiap akhir tahun di-scan ulang. |
| **PB-7** | Pelaporan kinerja & rekap realisasi manual | Rekap dihitung manual dari banyak orang ke Excel. |
| **PB-8** | Kontrol akses & akuntabilitas identitas lemah | Siapa pun yang memegang map bisa membacanya; paraf bisa dipalsukan. |
| **PB-9** | Dokumen kerja non-material menumpuk tanpa batas | Surat tugas, undangan, dan notulen ikut menumpuk; tidak ada yang berwenang memangkasnya. |

> Tidak ada PB baru. Fitur baru sejak versi lama dipetakan ke PB yang ada:
> - **Monitoring Dokumen Tim** masuk PB-7.3 (baru).
> - **Tahun Anggaran pada berkas** masuk PB-6.1/6.2.
> - **Halaman Bantuan** masuk Lampiran F.
> - **Pembersihan unggahan tertunda** masuk PB-6.5 (baru).
> - **Filter periode bersama (Bulanan/Triwulan/Tahunan/Seluruh/Kustom)** di semua halaman laporan masuk PB-7.1/7.2.
> - **Dokumen tambahan KSBU di Laporan Kinerja & Nominal Realisasi (beserta lampirannya)** masuk PB-7.2 dan PB-8.3.
> - **Dokumen tambahan KSBU di Laporan Kegiatan (D-28), termasuk di ekspor ZIP-nya (D-29)** masuk PB-7.1, PB-6.4, dan PB-8.3.
> - **Status arsip dokumen mengikuti berkas (D-29)** masuk PB-6.3.
> - **Filter Status Material/Non-Material di ketiga halaman laporan (D-30)** masuk PB-7.1/7.2.

---

# PB-1 — Alur & Status Dokumen Tidak Transparan

**Proses sekarang.** Pegawai menyerahkan map ke meja PPK, lalu tidak tahu apakah map itu sudah diterima, sedang ditinjau, ditolak, atau sudah diteruskan ke PPSPM.

## PB-1.1 — Pegawai tidak tahu dokumennya ada di tahap mana

- **Solusi.** Setiap dokumen punya status baku, penanda "sedang di tangan siapa" (PPK/PPSPM), dan penanda "siapa yang harus memperbaiki" (Pegawai/PPK). Semua perpindahan status melewati modul transisi status terpusat (Bagian B.2). Halaman **Dokumen Diajukan** (`/pegawai/dokumen`) menampilkan badge status. Halaman detail (`/pegawai/dokumen/$id`) menampilkan status dan timeline riwayat.
- **Use case.** Pegawai membuka Dokumen Diajukan dan melihat "Sedang Divalidasi PPK" tanpa perlu bertanya.
- **Pengguna.** Pegawai. PPK, PPSPM, dan KSBU melihat status yang sama dari kotak masuk masing-masing.
- **Keterkaitan.** Status mengisi kotak masuk (PB-2), riwayat (PB-3), dan menjadi syarat pemberkasan (PB-6: hanya dokumen "Selesai").
- **Keputusan perancangan.** "Selesai" (`COMPLETED`) adalah status akhir. Dokumen yang sudah masuk berkas **tidak berubah status**; keanggotaannya dibaca dari tabel item berkas.
- **Perubahan dari rancangan lama.** Status "Draf" tidak lagi pernah tersimpan permanen. Pengajuan baru langsung menjadi "Divalidasi PPK" (material) atau "Tersimpan" (non-material) dalam satu transaksi. Lihat PB-5.1.

## PB-1.2 — Tidak jelas dokumen milik pribadi atau atas nama kegiatan

- **Solusi.** Kapabilitas **Ketua Tim** per kegiatan. Satu kegiatan hanya punya satu ketua tim (unique index `ketua_tim_kegiatan_unique` pada `kegiatan_id`, `src/db/schema/master/ketua-tim-assignments.ts:28`). Satu pengguna boleh menjadi ketua di banyak kegiatan. Formulir pengajuan menampilkan penanda Ketua Tim atau Anggota, dan dokumen menyimpan `is_ketua_tim`. Bila pengaju mengaku Ketua Tim, server memeriksa penugasannya (`hasKetuaTimAssignment`, `src/lib/dokumen/local-submit-write-bridge.ts:294-306`).
- **Use case.** Budi memilih kegiatan SAKERNAS dan melihat penanda "Anda Ketua Tim". Dokumennya tampil di Laporan Kegiatan dan Monitoring Dokumen Tim.
- **Pengguna.** Pegawai/Ketua Tim; Admin (menugaskan lewat Master User).
- **Keterkaitan.** Menentukan kelengkapan wajib (PB-4.2), laporan yang tampil (PB-7), dan hak pembersihan non-material (PB-9).

## PB-1.3 — Pegawai tidak tahu "apa yang kurang" dari berkasnya

- **Solusi.** Formulir **Ajukan Dokumen** bertahap (`/pegawai/dokumen/aju`, langkah-langkah di `src/components/dokumen/form/Step*.tsx`) dengan **checklist kelengkapan dinamis** (`KelengkapanChecklist.tsx`). Checklist diambil dari master kelengkapan yang cocok **persis** dengan kombinasi pilihan pengguna (PB-4.2). Server menolak pengajuan bila:
  - tidak ada lampiran sama sekali ("Minimal upload satu lampiran…", `checkLampiranNotEmpty`, `local-submit-write-bridge.ts:515-521`);
  - ada kelengkapan wajib yang belum diunggah (`checkRequiredKelengkapan`, `:537-572`).

  Unggahan yang ditinggalkan di tengah formulir dibuang otomatis (PB-6.5).
- **Use case.** Ada 5 item kelengkapan, 3 di antaranya wajib. Tombol Ajukan terkunci, dan server juga menolak, sampai ketiganya terunggah.
- **Pengguna.** Pegawai.
- **Keterkaitan.** Mengurangi penolakan di PB-2. Bergantung pada master kelengkapan (PB-4.2).
- **Perubahan dari rancangan lama.** Aturan "minimal satu lampiran" dan "kelengkapan wajib" kini dipakai bersama oleh pengajuan pertama, pengajuan ulang oleh pegawai, dan pengiriman ulang oleh PPK (`validateResubmitRequirements`, `src/lib/dokumen/resubmit-validation.ts:31-76`, commit `b6c3292`).

---

# PB-2 — Persetujuan Berjenjang Lambat & Tidak Terstandar

**Proses sekarang.** Setiap pejabat menyortir sendiri tumpukan berkas di mejanya. Tidak ada antrean yang jelas, dan penolakan sering lisan.

## PB-2.1 — Tidak ada kotak masuk kerja per pejabat

- **Solusi.** Kotak masuk per peran yang disaring berdasarkan status:
  - PPK **Validasi Dokumen** (`/ppk/inbox`): dokumen "Divalidasi PPK".
  - PPSPM **Persetujuan Dokumen** (`/ppspm/inbox`): dokumen "Menunggu PPSPM".
  - KSBU **Pengklasifikasian Dokumen** (`/kasubag/inbox`): dokumen "Selesai" yang belum masuk berkas.

  Setiap API memeriksa peran di server.
- **Use case.** PPK login dan langsung melihat 12 dokumen yang menunggu validasi.
- **Pengguna.** PPK, PPSPM, KSBU.
- **Keterkaitan.** Isi kotak masuk ditentukan PB-1.1; setiap aksi tercatat di PB-3.

## PB-2.2 — Alur persetujuan tidak baku dan rawan "loncat tahap"

- **Solusi.** Satu **modul transisi status terpusat** (`src/lib/fsm.ts`) mendefinisikan 8 transisi sah dan aktor yang berhak untuk tiap transisi. Tabel lengkapnya ada di Bagian B.2. Setiap perubahan status dokumen material di rute API memanggil modul ini. Perubahan itu juga memakai **penjaga konflik**: `UPDATE … WHERE status = <status asal>`, dan bila baris tidak berubah, respons konflik dikirim (`DokumenTransitionConflictError`, `src/lib/dokumen/transition-conflict.ts`). Dua pejabat yang menekan tombol bersamaan tidak bisa sama-sama berhasil.
- **Use case.** PPSPM tidak bisa menyetujui dokumen yang belum lolos PPK, karena dokumen itu tidak pernah berstatus "Menunggu PPSPM".
- **Pengguna.** Semua aktor alur kerja.
- **Keterkaitan.** Fondasi PB-1.1 dan PB-6. Perbedaan jalur material dan non-material ada di PB-5.1.
- **Perubahan dari rancangan lama.** Penjaga konflik bersamaan (optimistic guard) ditambahkan di rute approve, reject, kembalikan, dan resubmit (commit `fc59b44`).

## PB-2.3 — Penolakan tanpa alasan yang terekam

- **Solusi.** Penolakan PPK dan PPSPM mewajibkan catatan **10–2000 karakter** (`rejectDokumenSchema`, `src/lib/schemas/dokumen.ts:103-105`). Penolakan menetapkan siapa yang harus memperbaiki:
  - PPK menolak → pegawai yang memperbaiki (`revision_target = USER`).
  - PPSPM menolak → PPK yang memperbaiki (`revision_target = PPK`).
- **Use case.** PPK menolak dengan catatan "Nominal kuitansi tidak sama dengan RAB", dan pegawai membaca catatan itu di halaman revisi.
- **Pengguna.** PPK dan PPSPM menolak; Pegawai dan PPK menindaklanjuti.
- **Keterkaitan.** Catatan masuk riwayat (PB-3) dan memicu revisi (PB-2.4).

## PB-2.4 — Perbaikan dan kirim ulang berbelit

- **Solusi.** Tiga jalur tindak lanjut:
  - **Pegawai merevisi** (`/pegawai/dokumen/$id/revisi` → `POST /api/dokumen/$id/submit`, aksi `RESUBMIT`): dokumen kembali ke "Divalidasi PPK".
  - **PPK memperbaiki lalu mengirim ulang** setelah ditolak PPSPM (`/ppk/dokumen/$id/resubmit` → `POST /api/ppk/resubmit/$id`, aksi `RESUBMIT_PPK`): dokumen **langsung** ke "Menunggu PPSPM" tanpa mengulang antrean PPK.
  - **PPK mengembalikan ke pegawai** (`POST /api/ppk/kembalikan/$id`, aksi `KEMBALIKAN`): status tetap "Perlu Revisi", tetapi penanggung jawab perbaikan pindah dari PPK ke Pegawai. Catatan otomatis berbunyi "Dikembalikan ke pegawai oleh PPK. Alasan penolakan PPSPM: …" (`src/routes/api/ppk/kembalikan/$id.ts:14-23,76,82`).

  Sebelum dikirim ulang, server memeriksa tiga hal (`validateResubmitRequirements`): nominal > 0 untuk material, minimal satu lampiran, dan kelengkapan wajib. Lampiran lama yang diganti baru dihapus **setelah** basis data berhasil diperbarui, dan hanya bila tidak dirujuk baris lain (`cleanupUnreferencedReplacedLocalAttachments`, dipanggil di `src/routes/api/dokumen.$id.ts:627` dan `src/routes/api/ppk/resubmit/$id.ts:376,558`).
- **Use case.** Dokumen ditolak PPSPM karena salah kode akun. PPK membetulkannya sendiri lalu mengirim ulang tanpa membebani pegawai.
- **Pengguna.** Pegawai, PPK.
- **Keterkaitan.** Bergantung pada PB-2.3; tercatat di PB-3.
- **Perubahan dari rancangan lama.** Validasi prasyarat kirim ulang dan penghapusan file lama yang ditunda adalah fitur baru (`fc59b44`, `b6c3292`).

## PB-2.5 — Hasil kerja pejabat tidak terpelihara

- **Solusi.** Halaman turunan per peran:
  - PPK: **Dokumen Tervalidasi** (`/ppk/tervalidasi`), **Dokumen Tidak Valid** (`/ppk/ditolak`), **Revisi Dokumen** (`/ppk/revisi`).
  - PPSPM: **Dokumen Ditolak** (`/ppspm/ditolak`), **Dokumen Selesai** (`/ppspm/selesai`).
- **Pengguna.** PPK, PPSPM.
- **Keterkaitan.** Sumber datanya sama dengan PB-7.

---

# PB-3 — Jejak Audit & Akuntabilitas Lemah

**Proses sekarang.** Bukti hanya paraf, tidak bertanggal jelas, alasan penolakan tidak tertulis, dan tidak bisa ditelusuri.

## PB-3.1 — Tidak ada riwayat aktivitas per dokumen

- **Solusi.** Tabel **riwayat aktivitas dokumen** (`dokumen.log_aktivitas`) yang bersifat append-only berdasarkan kontrak. Setiap pengajuan, validasi, penolakan, pengiriman ulang, dan pengembalian menulis satu baris: aksi, pelaku, waktu, tahap, dan catatan. Contoh nama aksi: `SUBMIT`, `STORE`, `PPK_APPROVE`, `PPK_REJECT`, `PPSPM_APPROVE`, `PPSPM_REJECT`, `RESUBMIT`, `RESUBMIT_PPK`, `PPK_KEMBALIKAN`. Riwayat ditampilkan sebagai timeline di halaman detail. Label berbahasa Indonesia ada di `src/lib/dokumen/aksi-labels.ts`.
- **Pengguna.** Semua aktor membaca; sistem menulis.
- **Keterkaitan.** Menerima kejadian dari PB-2; dilengkapi PB-3.2 dan PB-3.3.

## PB-3.2 — Jejak hilang ketika data dihapus

- **Solusi.** Tabel **audit** terpisah (`audit.audit_log`). Kolom `entity_id` **sengaja tanpa foreign key**, dan isi entitas diawetkan di `metadata_snapshot`. Tiga aksi yang dicatat (`src/db/schema/audit/audit-log.ts:23-27`):

  | Aksi | Penulis |
  |---|---|
  | `DOKUMEN_LAMPIRAN_DIBERSIHKAN` | PB-9 |
  | `DOKUMEN_DIHAPUS_PERMANEN` | Pegawai menghapus dokumen non-material miliknya, `src/routes/api/dokumen.$id.ts:804` |
  | `BERKAS_LAMPIRAN_DIBERSIHKAN` | PB-6.3, `src/lib/archive/berkas-arsip-physical-destruction.ts:713` |

- **Pengguna.** Pemeriksa / pengembang lewat akses basis data. **Tidak ada halaman atau API yang membaca tabel ini**; `auditLog` hanya dipakai oleh tiga penulis di atas.
- **Keterkaitan.** Melengkapi PB-3.1.

## PB-3.3 — Riwayat pemberkasan tidak terlacak

- **Solusi.** Tabel **riwayat berkas** (`arsip.berkas_arsip_activity`). Jenis peristiwanya dibatasi check constraint (`src/db/schema/arsip/berkas-arsip.ts:141-153`):

  | Peristiwa | Keterangan |
  |---|---|
  | Berkas dibuka | |
  | Dokumen persetujuan diklasifikasikan | |
  | Dokumen manual ditambahkan | |
  | Berkas ditutup | |
  | Metadata diperbarui | Juga dipakai untuk "Batalkan Usulan", `berkas-arsip-service.ts:988-999` |
  | Diusulkan dibersihkan | |
  | File dibersihkan | |

  Riwayat ini tampil sebagai timeline di detail berkas.
- **Pengguna.** KSBU.

## PB-3.4 — Tidak ada pandangan aktivitas per pengguna

- **Solusi.** Halaman **Log Aktivitas** (label menu dulu "Activity Log", diganti di D-5; path tetap `/…/activity-log`) untuk enam peran, memakai komponen bersama `ActivityLogView.tsx` dan `GET /api/activity-log`, yang menggabungkan riwayat dokumen dan riwayat berkas (maksimal 500 baris).
  - **Admin dan PJ Kinerja** melihat semua pengguna (`GLOBAL_SCOPE_ROLES`, `src/routes/api/activity-log.ts:15`; `scope=all`, ditolak 403 untuk peran lain, `:65-69`).
  - Empat peran lainnya hanya melihat aktivitas sendiri.
  - Filter per pengguna, filter peran, dan pencarian berjalan **di klien** (`ActivityLogView.tsx:97-109`).
- **Pengguna.** Semua peran untuk aktivitas sendiri; Admin dan PJ Kinerja untuk lintas pengguna.
- **Perubahan dari rancangan lama.** Versi lama menyebut Admin melihat riwayat aktivitas di halaman Detail User. Halaman Master User (`src/routes/admin.master-data.user.tsx`) **tidak memuat riwayat aktivitas**; riwayat lintas pengguna kini ada di Log Aktivitas dengan cakupan `all`, yang juga dibuka untuk PJ Kinerja.

---

# PB-4 — Data Referensi & Kelengkapan Tidak Seragam

**Proses sekarang.** Nama kegiatan, komponen, dan jenis permintaan ditulis bebas. Syarat kelengkapan hanya diingat staf senior.

## PB-4.1 — Entitas referensi tidak terpusat dan tidak saling terhubung

- **Solusi.** Modul **Data Master** dengan dua cabang independen:

  ```
  Cabang A — konteks kegiatan              Cabang B — jenis permintaan (GLOBAL)
  Fungsi                                   Jenis Permintaan   (nama unik di antara yang aktif)
   └ Kegiatan                               └ Kategori Permintaan
      └ Komponen                               └ Detail Permintaan

  Keduanya bertemu di Kelengkapan Dokumen, dicocokkan PERSIS pada:
  (kegiatan, status ketua tim, komponen, jenis, kategori, detail)
  ```

  Hubungan induk-anak ditegakkan dengan foreign key `ON DELETE restrict`. Nama unik per induk berlaku **hanya di antara baris aktif** (partial unique index `… WHERE is_active = true`, misalnya `src/db/schema/master/komponen.ts:32-34`). Penghapusan dari UI bersifat soft-delete (`is_active = false`). Jenis Permintaan sempat punya induk Komponen, tetapi dilepas lagi oleh migrasi `0016_decouple_jenis_permintaan_from_komponen.sql`.
- **Pengguna.** Admin mengelola lewat 7 menu data master (Fungsi, Kegiatan, Komponen, Jenis, Kategori, Detail, Kelengkapan) ditambah Master User. Pegawai, KSBU, dan PJ Kinerja memakainya di dropdown dan filter.
- **Keterkaitan.** Fondasi PB-1.2, PB-5, PB-6 (dokumen manual memakai Fungsi → Kegiatan → Komponen), dan PB-7.
- **Perubahan dari rancangan lama.** **Master Jenis Dokumen dihapus total.** Tabel dan kolom `dokumen_transaksi.jenis_dokumen_id` di-drop oleh migrasi `0019_drop_master_jenis_dokumen.sql`. Rute CRUD dan halaman adminnya dihapus di commit `3834a95`. Dokumen non-material memakai "Nama Dokumen" teks bebas (PB-5.1).

## PB-4.2 — Syarat kelengkapan tidak baku

- **Solusi.** Tabel **master kelengkapan dokumen** mendefinisikan daftar dokumen wajib atau opsional per kombinasi (kegiatan × Ketua Tim/Anggota × komponen × jenis × kategori × detail). Pencocokannya **exact-match**: kolom yang kosong di pengajuan hanya cocok dengan baris yang kolomnya juga kosong. Pencocokan dilakukan oleh:
  - **server**: `buildRequiredKelengkapanCondition`, `src/lib/dokumen/local-submit-drizzle-adapter.ts:159-173`, commit `d45bcd9`;
  - **formulir pengajuan**: `matchesCurrentSelection`, `src/components/dokumen/KelengkapanChecklist.tsx:59-72`.

  Penegakan berlapis:
  - **Basis data**: dua check constraint, yaitu kategori butuh jenis dan detail butuh kategori (`src/db/schema/master/kelengkapan-dokumen.ts:51-58`).
  - **Admin**: validasi rantai saat mengelola master kelengkapan.
  - **Formulir**: tombol lanjut terkunci sampai kedua cabang terisi ke daun.
  - **Server**: pengajuan ditolak bila kelengkapan wajib belum diunggah.
  - **Non-material** tanpa jenis permintaan tidak memakai checklist (`shouldReadRequiredKelengkapan`, `local-submit-write-bridge.ts:585-587`).
- **Pengguna.** Admin mengelola; Pegawai dan Ketua Tim mengikuti.
- **Catatan.** ✅ **D-1 selesai** (`69f7fbe`). Halaman revisi Pegawai dan kirim ulang PPK sempat memakai pencocokan bertingkat yang berbeda dari server; kini ketiganya memakai fungsi murni bersama `matchesKelengkapanSelection` (`src/lib/kelengkapan-match.ts`), exact-match 6 kolom yang sama dengan server.

## PB-4.3 — Klasifikasi dokumen (Cara Pembayaran) tidak terstruktur

- **Solusi.** **Master Klasifikasi Dokumen** berbentuk hierarki induk–anak (`arsip.master_klasifikasi_arsip.parent_id`, kode unik bila diisi). Hanya node daun yang bisa dipakai. Daftar pilihan disaring per **Tahun Anggaran** (`src/routes/api/kasubag/klasifikasi/index.ts:130-137,165-172`) oleh `berkas-klasifikasi-eligibility.ts`:
  - Cara Pembayaran yang berkasnya untuk TA tersebut sudah ditutup **tidak bisa dipilih lagi** pada TA yang sama.
  - Induk yang semua anaknya tersaring ikut hilang (`filterKlasifikasiTreeForBerkasSelection`, `:119-166`).
- **Pengguna.** KSBU mengelola dan memakai di `/kasubag/klasifikasi`.
- **Keterkaitan.** Kunci pengelompokan di PB-6.

---

# PB-5 — Realisasi Anggaran & Pembedaan Dokumen Tidak Tertib

## PB-5.1 — Dokumen bernilai uang dan tidak bernilai uang diperlakukan sama

- **Solusi.** Dua jalur pengisian:

  | | **Material** | **Non-Material** |
  |---|---|---|
  | Rantai yang diisi | Fungsi → Kegiatan → **Komponen** → Jenis → Kategori → Detail | Fungsi → Kegiatan → **Nama Dokumen** (teks bebas) |
  | Nominal realisasi | wajib > 0 (`validateNominalForMaterial`) | tidak diisi |
  | Status setelah diajukan | "Divalidasi PPK" → … → "Selesai" | langsung **"Tersimpan"** |
  | Masuk antrean PPK/PPSPM | ya | tidak |
  | Judul otomatis | `{nama daun} {tahun} {nama pengaju}` | `{nama dokumen} {tahun} {nama pengaju}` (`local-submit-write-bridge.ts:413`) |
  | Boleh diubah pemilik | hanya saat "Perlu Revisi" untuk Pegawai | saat "Tersimpan" dan lampiran belum dibersihkan (`src/routes/api/dokumen.$id.ts:504-520`) |
  | Boleh dihapus permanen | tidak | ya, bila "Tersimpan" dan tidak berada di berkas (handler `DELETE`, `dokumen.$id.ts:687`) |

  Nama daun diturunkan berurutan: Detail → Kategori → Jenis → Komponen → Kegiatan (`resolveLocalSubmitLeafName`, `:458-502`).
- **Keputusan perancangan.** Jalur non-material adalah **satu-satunya perpindahan status di luar modul transisi terpusat**. `buildLocalSubmitTransitionPlan` (`local-submit-write-bridge.ts:436-456`) menetapkan "Tersimpan" langsung dengan aksi riwayat `STORE`. Jalur material memanggil transisi `DRAFT --SUBMIT--> IN_PPK_VALIDATION`. Pada kedua jalur, baris dibuat sebagai `DRAFT` lalu status diperbarui **dalam transaksi yang sama** (`executeLocalSubmitWritePlan`, `:363-396`), sehingga status Draf tidak pernah terlihat di luar transaksi.
- **Perubahan dari rancangan lama.** Jalur Draf lama dihapus (commit `8faf1c8`):
  - `POST /api/dokumen` (buat draf) sudah tidak ada; `src/routes/api/dokumen/index.ts` hanya punya GET.
  - Cabang Draf di `POST /api/dokumen/$id/submit` dihapus; rute itu kini hanya menerima revisi pegawai (`src/routes/api/dokumen.$id.submit.ts:98-110`).
  - Endpoint khusus ubah nominal `PATCH /api/dokumen/$id/nominal` dihapus (commit `d1f147e`).
- **Pengguna.** Pegawai menentukan karakteristik; PPK dan PPSPM hanya menangani material.
- **Keterkaitan.** Hanya dokumen material yang bisa diberkaskan (PB-6), nominal dijumlahkan di PB-7, dan hanya non-material yang masuk PB-9.

## PB-5.2 — Rantai permintaan tidak terikat ke dokumen material

- **Solusi.** Kolom `komponen_id` (dengan FK), serta `jenis_permintaan_id`, `kategori_permintaan_id`, dan `detail_permintaan_id` pada dokumen. Sejak migrasi 0020 (D-20) ketiga kolom terakhir juga punya FK ke tabel master masing-masing (`ON DELETE restrict`), sama seperti `komponen_id` (lihat B.4).
- **Keterkaitan.** Menyambungkan PB-4.1 ke PB-7.

---

# PB-6 — Dokumen Selesai Tercecer & Penyimpanan Terbatas

**Peran aplikasi.** Aplikasi ini bukan sistem kearsipan resmi dan tidak berintegrasi dengan aplikasi mana pun. Tugasnya menyimpan dokumen selesai per berkas dan menyediakan unduhan. Istilah kearsipan diganti di tampilan: "berkas", "masa simpan", "pembersihan file". Identifier internal lama (`berkas_arsip`, `USUL_MUSNAH`, `DIMUSNAHKAN`) dipertahankan di basis data.

## Model berkas

```
Pengklasifikasian Dokumen ─┐
                           ├─▶ BERKAS TERBUKA ──(Tutup Berkas: Nomor SPM + Masa Simpan Minimal)──▶ BERKAS TERTUTUP
Penambahan Dokumen ────────┘   (satu per Cara Pembayaran × Tahun Anggaran)                            │ (Usulkan Pembersihan)
                                                                                                      ▼
                                             BERKAS TERTUTUP ◀──(Batalkan Usulan)── USUL PEMBERSIHAN
                                                                                                      │ (Bersihkan File — ketik "BERSIHKAN FILE BERKAS")
                                                                                                      ▼
                                                                                        FILE DIBERSIHKAN (akhir; metadata tetap)
```

## PB-6.1 — Dokumen selesai tidak terkumpul rapi per berkas

- **Solusi.** Dua pintu masuk yang bermuara ke satu struktur:
  - **Pengklasifikasian Dokumen** (`/kasubag/inbox` → detail `/kasubag/dokumen/$id` → `POST /api/kasubag/dokumen/$id/archive`). Hanya untuk dokumen berstatus "Selesai" (`src/routes/api/kasubag/dokumen.$id.archive.ts:103`). Dokumen masuk sebagai item `WORKFLOW`, dan statusnya tidak berubah.
  - **Penambahan Dokumen** (`/kasubag/penambahan-arsip`). Entri manual KSBU tanpa alur persetujuan, berisi Fungsi → Kegiatan → Komponen → Nama Dokumen, tanggal, Cara Pembayaran, TA, nominal, keterangan wajib, dan **minimal 1 lampiran (maksimal 5)**. Dokumen masuk sebagai item `MANUAL`.
    - Aturan "minimal 1 lampiran" sama dengan jalur pengajuan (PB-1.3) dan ditegakkan dua lapis: formulir (`validateAttachmentRows`, `src/routes/kasubag/penambahan-arsip.tsx:2430`, dicek saat "Lanjut" di langkah Berkas Pendukung dan saat Simpan) dan server (`createManualArsipSchema`, `src/lib/schemas/manual-arsip.ts:213-223`, pesan `MANUAL_ARSIP_ATTACHMENT_REQUIRED_MESSAGE` = "Minimal 1 lampiran wajib diunggah"). Pemeriksaan lampiran dijalankan setelah pemeriksaan field lain, sehingga kesalahan field tetap dilaporkan lebih dulu.
    - Kolom unggah memakai sistem **unggahan tertunda** yang sama dengan Ajukan/Revisi (PB-6.5): file langsung naik ke area tertunda saat dipilih (`uploadPendingFile`); file yang diganti atau dihapus langsung dibuang (`requestPendingUploadCleanup`); sisa file tertunda dibuang saat halaman ditinggalkan (`useDiscardPendingUploadsOnLeave`); saat Simpan, server memindahkan file ke lokasi resmi di dalam transaksi pembuatan (`prepareManualArsipPendingAttachments`/`moveManualArsipPendingAttachments`, `src/lib/manual-arsip.ts:244-356`).

  KSBU memilih **Cara Pembayaran dan Tahun Anggaran**. TA dipilih di formulir, **tidak diturunkan dari tanggal dokumen**:
  - skema `tahun_anggaran` 2000–2100 di `dokumen.$id.archive.ts:65`;
  - pilihan UI dari tahun berjalan +2 sampai −5 (`src/lib/utils/tahun.ts:5-11`);
  - bawaan formulir manual adalah tahun berjalan (`src/routes/kasubag/penambahan-arsip.tsx:222`).

  Aturan get-or-create (`getOrCreateOpenBerkasForKlasifikasi`, `src/lib/archive/berkas-arsip-service.ts:249-272`):
  - belum ada berkas untuk (Cara Pembayaran, TA) → berkas terbuka baru dibuat;
  - sudah ada yang terbuka → item masuk ke berkas itu;
  - sudah ada tetapi tertutup → ditolak dengan pesan "Berkas untuk Cara Pembayaran ini TA … sudah ditutup" (`:851-876`).

  Keunikan (Cara Pembayaran, TA) ditegakkan **oleh basis data** dengan unique index `berkas_arsip_klasifikasi_tahun_unique` (`src/db/schema/arsip/berkas-arsip.ts:60-61`). Satu dokumen hanya boleh berada di satu berkas (partial unique index pada `dokumen_id` dan `manual_arsip_id`, `:101-106`).
- **Use case.** Lima honor SAKERNAS yang selesai ditambah satu bukti bayar service AC (manual) masuk ke berkas "Honor — TA 2026" yang masih terbuka.
- **Pengguna.** KSBU.
- **Perubahan dari rancangan lama.** Aturan lama "satu berkas **terbuka** per Cara Pembayaran" (partial unique index `berkas_arsip_open_klasifikasi_unique`) diganti "satu berkas per Cara Pembayaran **per Tahun Anggaran**", terbuka maupun tertutup (migrasi `0018_berkas_tahun_anggaran.sql`, commit `56c6a6d`). Konsekuensinya, setelah ditutup, Cara Pembayaran itu **baru bisa dipakai lagi pada TA berikutnya**. Berkas lama diisi TA dari tahun `created_at` zona Asia/Jakarta.
- **Perubahan dari rancangan lama.** Lampiran dokumen manual dulu opsional; sejak `e6ba99c` minimal 1 lampiran wajib. Dokumen manual lama yang dibuat tanpa lampiran tetap ada dan tampil "Belum ada lampiran" di detailnya.

## PB-6.2 — Berkas tidak pernah "ditutup" dengan Nomor SPM

- **Solusi.** Aksi **Tutup Berkas** (`POST /api/kasubag/berkas/$id/close`). Nomor SPM wajib, dan **Masa Simpan Minimal** dipilih dari 1/3/5/10 Tahun/Permanen (`MANUAL_ARCHIVE_RETENTION_LABELS`, `src/lib/archive/retention.ts:1-7`; skema `.strict()` di `src/lib/schemas/berkas-arsip.ts:46-58`). Basis data mewajibkan waktu dan pelaku penutupan untuk berkas tertutup (`berkas_arsip_closed_metadata_check`). Dialog penutupan adalah konfirmasi biasa **tanpa ketik-persis** (`src/routes/kasubag/berkas/-components/CloseBerkasDialog.tsx:232-242`), dan menjelaskan bahwa Cara Pembayaran itu tidak bisa dipakai lagi untuk TA yang sama.
- **Pengguna.** KSBU.
- **Keterkaitan.** Tanggal penutupan menjadi dasar umur berkas dan jatuh tempo (PB-6.3).

## PB-6.3 — Tidak ada cara membersihkan file lama dari disk terbatas

- **Solusi.** Pembersihan dua tahap setelah berkas ditutup:
  1. **Berkas Tertutup** (`/kasubag/berkas/tertutup`) menampilkan Umur Berkas dan penanda Jatuh Tempo. Keduanya dihitung saat halaman dibuka (`computeBerkasAging`), tanpa penjadwal.
  2. **Usulkan Pembersihan** mengubah status ke "Usul Pembersihan", yang bisa **dibatalkan** kembali ke "Tersimpan".
  3. **Pembersihan Berkas** (`/kasubag/pembersihan`): tombol **Bersihkan File** meminta frasa ketik-persis `BERSIHKAN FILE BERKAS`. Frasa ini **ditegakkan di server** (`z.literal`, `src/routes/api/kasubag/berkas/$id/lifecycle.ts:28`; konstanta di `src/lib/archive/berkas-arsip-page-format.ts:16`).

  File fisik dihapus. Kandidat file diturunkan dari keanggotaan berkas, tidak pernah dari input klien. Metadata, Nomor SPM, daftar item, dan seluruh riwayat tetap ada. Akses file berikutnya dijawab **410** "Data file sudah dimusnahkan".
- **Pengguna.** KSBU.
- **Status arsip dokumen mengikuti berkasnya (D-29, `ae8a698`).** Siklus Tersimpan → Usul Pembersihan → File Dibersihkan hanya dijalankan di tingkat **berkas**. Dokumen alur memang tidak punya kolom status arsip sendiri. Dokumen tambahan KSBU dulu punya (`manual_arsip.status_arsip` dan enam kolom siklus), tetapi tidak pernah diperbarui setelah dibuat, sehingga dokumen di berkas yang sudah dibersihkan masih tercatat "Aktif". Migrasi `0021_manual_arsip_drop_own_lifecycle.sql` menghapus kolom-kolom itu. Status dokumen tambahan KSBU kini dihitung dari berkas penaungnya (`manualArsipEffectiveStatusArsip`, `src/lib/archive/manual-arsip-effective-status.ts`): status arsip berkas, atau AKTIF selama berkas masih terbuka. Aturan ini dipakai di daftar dan detail Penambahan Dokumen, di filter status, di respons 410 lampiran, dan sebagai syarat edit: dokumen tambahan KSBU hanya bisa diubah selama berkasnya aktif (`src/lib/manual-arsip.ts:830`). SQL-nya diuji langsung ke PostgreSQL (`tests/integration/manual-arsip-effective-status.test.ts`).
- **Keterkaitan.** Menjaga PB-3. Nominal dokumen (alur maupun tambahan KSBU) dari berkas yang dibersihkan **tidak lagi dihitung** di PB-7. Nominal Realisasi tidak menampilkannya. Laporan Kegiatan dan Laporan Kinerja tetap menampilkannya dengan penanda "Tidak dihitung · berkas dimusnahkan", karena metadata sengaja disimpan (D-28, D-29). Laporan Saya juga tetap menampilkannya, dengan badge "File Dibersihkan" setelah file dihapus; halaman itu tidak punya total nominal.

## PB-6.4 — Mengunduh file masih satu per satu

- **Solusi.** Ekspor ZIP melalui modul bersama `src/lib/export/document-zip.ts`:

  | Ekspor | Endpoint |
  |---|---|
  | Per berkas | `GET /api/kasubag/berkas/$id/export-zip` |
  | Laporan Saya | `POST /api/laporan/saya/export-zip?mode=ticket` → `GET …/export-zip?ticket=…` |
  | Laporan Kegiatan / Monitoring Dokumen Tim | `POST /api/laporan/kegiatan/export-zip?mode=ticket` → `GET …/export-zip?ticket=…` |

  Aturan ekspor:
  - Maksimal **500 dokumen** per ekspor, ditegakkan di server (413; `DOCUMENT_ZIP_MAX_ENTRIES`, `document-zip.ts:73,138`, dan `EXPORT_MAX_DOCUMENTS` di rute laporan).
  - File di atas 250 MB dilewati (`:74,224`).
  - Setiap ZIP diawali `DAFTAR_ISI.txt`. Dokumen tanpa file dicatat di sana beserta alasannya, misalnya "berkas dimusnahkan, lampiran sudah dihapus" (`skipReason`, `:147`).
  - Tiap dokumen diotorisasi ulang di server.
  - **Ekspor Laporan Kegiatan ikut memuat dokumen tambahan KSBU** (D-29): halaman mengirim `manual_arsip_ids` di samping `dokumen_ids`. Server hanya memakai dokumen dari kegiatan yang dipimpin pemanggil (`loadManualArsipExportRows`, `src/lib/export/laporan-zip-entries.ts:70`). Tiap dokumen menjadi folder `[Manual] …` dengan nama file formal yang sama seperti ekspor berkas (`buildManualArsipZipEntries`, `:102`). Monitoring Dokumen Tim tidak boleh mengirim `manual_arsip_ids` (400).

  **Cara unduh (D-31, `ae8a698`).** Ekspor berkas sejak awal diunduh lewat navigasi biasa (`window.location.href`, `src/routes/kasubag/berkas/$id.tsx:1022`), sehingga browser sendiri yang menyimpan file. Ekspor laporan dulu memakai `fetch()` lalu menyusun file di halaman. Di Edge dengan ekstensi pengelola unduhan, respons ZIP direbut ekstensi sehingga halaman menampilkan "Failed to fetch", padahal server mengirim 200 dengan file utuh (sudah diperiksa terhadap server dev: 10,9 MB, ZIP valid). Kini ketiga ekspor laporan memakai dua langkah, karena daftar sampai 500 UUID terlalu panjang untuk URL:
  1. halaman mengirim `POST …/export-zip?mode=ticket`. Server memvalidasi seperti biasa, sehingga pesan 400/413 tetap tampil di dialog, lalu mengembalikan `download_url` berisi **tiket sekali pakai**. Tiket itu terikat ke pengguna yang login dan berlaku 2 menit (`src/lib/export/download-ticket.ts:20`);
  2. halaman membuka tautan itu (`startZipDownload`, `src/lib/file-helpers.ts:33`), dan browser mengunduh ZIP secara bawaan. GET tanpa sesi dijawab 401; tiket kedaluwarsa, sudah dipakai, atau milik pengguna lain dijawab 410.

  Kedua langkah memakai fungsi pembuat ZIP yang sama (`createKegiatanExportZipResponse`, `createSayaExportZipResponse`), jadi isi ZIP dan otorisasinya tidak berubah. Tiket disimpan di memori proses (aplikasi berjalan sebagai satu proses server); lihat K-10.

  Ekspor CSV metadata juga tersedia di halaman berkas.
- **Pengguna.** Pegawai, Ketua Tim, KSBU.

## PB-6.5 — Unggahan yang ditinggalkan memenuhi disk (baru)

- **Proses sekarang.** Tidak relevan di proses kertas. Masalah ini muncul karena file diunggah **sebelum** formulir disimpan, sehingga formulir yang ditinggalkan meninggalkan file tanpa pemilik.
- **Solusi** (commit `fc59b44`). File hasil unggahan disimpan di area **tertunda** dan baru dipindah ke lokasi resmi saat pengajuan atau penyimpanan berhasil. Pemindahan terjadi di dalam transaksi; bila gagal, file dikembalikan (`moveSubmitFilesOrRollback`, `src/routes/api/dokumen/submit.ts:243-283`). Area tertunda dibersihkan tiga cara:

  | Cara | Mekanisme |
  |---|---|
  | Browser | Hook `useDiscardPendingUploadsOnLeave` mengirim `POST /api/upload?cleanup=pending` saat halaman ditinggalkan. Server hanya menghapus file tertunda milik pengguna itu (`src/routes/api/upload.ts:178-269`). |
  | Server, otomatis | Setelah setiap unggahan, paling sering sejam sekali per proses (`upload.ts:139`), server menghapus file tertunda berumur > 24 jam yang tidak dirujuk (`src/lib/storage/pending-upload-sweeper.ts`). |
  | Manual atau terjadwal | `pnpm storage:sweep-pending` (`src/scripts/sweep-pending-uploads.ts`). |

  Pola ini dipakai di **semua kolom unggah** aplikasi: Ajukan Dokumen (`aju.tsx:200`), komponen `AttachmentEditor` (`AttachmentEditor.tsx:242`) yang dipakai Ubah Dokumen, Revisi Pegawai, dan Kirim Ulang PPK, serta Penambahan Dokumen KSBU (`penambahan-arsip.tsx:820`).
- **Pengguna.** Sistem (otomatis); operator server (skrip).

## Tabel penamaan (label tampilan vs identifier internal)

| Konsep | Label tampilan | Identifier internal |
|---|---|---|
| Berkas menerima dokumen | Terbuka | `status_berkas = OPEN` (`status_arsip` wajib NULL, `berkas_arsip_open_status_arsip_null_check`) |
| Berkas dikunci | Tertutup | `status_berkas = CLOSED` |
| Tertutup, belum diusulkan | Tersimpan | `status_arsip = AKTIF` |
| Dicalonkan pembersihan | Usul Pembersihan | `status_arsip = USUL_MUSNAH` |
| File sudah dihapus | File Dibersihkan | `status_arsip = DIMUSNAHKAN` |
| (tidak dipakai) | — | `status_arsip = INAKTIF` (nilai enum mati, `src/lib/constants/archive-status.ts`) |
| Klasifikasi | Cara Pembayaran | `klasifikasi_id` |
| Tahun | Tahun Anggaran (TA) | `tahun_anggaran` |
| Masa retensi | Masa Simpan Minimal | `retensi_aktif` |
| Bersihkan file | Bersihkan File | aksi `approve_destruction` |

---

# PB-7 — Pelaporan Kinerja & Rekap Realisasi Manual

## PB-7.1 — Pegawai & Ketua Tim tidak bisa memantau dokumen

- **Solusi.**
  - **Laporan Saya** (`/pegawai/laporan/saya`): dokumen milik sendiri.
  - **Laporan Kegiatan** (`/pegawai/laporan/kegiatan`, grup PJ Kegiatan): dokumen berstatus **Selesai (Material) atau Tersimpan (Non-Material)** dari semua kegiatan yang dipimpin (halaman tidak mengirim parameter `scope`, `kegiatan.tsx:213`; server memakai cakupan bawaan `final` = {COMPLETED, TERSIMPAN}, `src/lib/laporan/kegiatan-scope.ts:12-19`), **ditambah dokumen tambahan KSBU** (`arsip.manual_arsip`) dari kegiatan yang sama (D-28, `93eeb17`).

  Keduanya punya filter bertingkat, **filter periode**, **filter Status** (D-30), dan ekspor ZIP. Server hanya mengembalikan dokumen dari kegiatan milik penugasan pemanggil (`src/routes/api/laporan/kegiatan.ts:83-93`); untuk dokumen tambahan KSBU penyaringan yang sama dilakukan di server lewat `manual_arsip.kegiatan_id ∈ kegiatan yang dipimpin` (`:153-162`, `listManualRealisasiRows` di `src/lib/laporan/manual-realisasi.ts:77`). `manual_arsip` punya kolom `kegiatan_id` sendiri (FK ke `master_kegiatan`), jadi tidak perlu lewat Komponen.

  **Aturan Laporan Kegiatan sejak D-28** (sama dengan Nominal Realisasi, PB-7.2, lewat helper bersama `src/lib/laporan/manual-realisasi.ts`):
  - dokumen tambahan KSBU dianggap "Selesai" sejak diberkaskan, diberi `sumber = 'MANUAL'`, dan ditandai "· Penambahan Dokumen (KSBU)" di daftar serta kolom "Sumber" di dialog detail (`ManualArsipDetailDialog`);
  - dokumen material tanpa Komponen tidak dimuat (`kegiatan.ts:145`), seperti di Nominal Realisasi. Di basis data pengembangan jumlahnya 0 dari 24 dokumen, jadi tidak ada data yang perlu dihapus;
  - dokumen (alur maupun tambahan KSBU) yang berkasnya **sudah dimusnahkan tetap ditampilkan** dengan penanda `berkas_dimusnahkan` (`kegiatan.ts:211,251`), tetapi **nominalnya tidak dihitung** dalam total: nominal ditampilkan dicoret dengan keterangan "Tidak dihitung · berkas dimusnahkan", dan dialog detail (dokumen alur maupun tambahan KSBU) menampilkan pesan "Berkas dokumen ini sudah dimusnahkan. Nominal realisasinya tidak lagi dihitung…" (`BERKAS_DIMUSNAHKAN_DETAIL_MESSAGE`, `src/lib/laporan/kegiatan-scope.ts:80`). Total memakai `countedNominalRealisasi` (`:63`); dokumen non-material juga tidak dihitung karena tidak bernominal;
  - kartu "Total Nominal Realisasi" dan total per kegiatan di daftar ikut menghitung dokumen tambahan KSBU, dengan filter periode dan filter Status yang sama;
  - header menampilkan catatan cakupan (`LAPORAN_KEGIATAN_SCOPE_NOTE`, `src/routes/pegawai/laporan/kegiatan.tsx:69`): "Dokumen Material berstatus Selesai, Non-Material berstatus Tersimpan, dan dokumen tambahan KSBU dari kegiatan yang Anda pimpin. Dokumen yang berkasnya sudah dimusnahkan tetap ditampilkan, tetapi nominal realisasinya tidak lagi dihitung." (kata "final" diganti di `4da7ed1`);
  - ekspor ZIP memuat dokumen alur **dan** dokumen tambahan KSBU yang sedang ditampilkan (D-29, lihat PB-6.4).

  **Filter Status dan label jenis (D-30, `ae8a698`).** Di ketiga halaman laporan, status akhir (Selesai dan Tersimpan) ditampilkan sebagai jenis dokumen: "Selesai" menjadi **Material** dan "Tersimpan" menjadi **Non-Material** (`LAPORAN_STATUS_LABEL`, `src/lib/laporan/status-laporan.ts:11`). Pemetaannya satu-satu, karena dokumen material berakhir Selesai (termasuk dokumen tambahan KSBU) dan dokumen non-material berakhir Tersimpan. Halaman alur kerja (inbox PPK/PPSPM dan sejenisnya) tetap memakai label status biasa. Filter **Status** (Semua / Material / Non-Material) ada di Laporan Saya (`saya.tsx:84`) serta di daftar dan detail Laporan Kegiatan (`kegiatan.tsx:171`). Di Laporan Kegiatan filter ini berlaku sebelum total dihitung.

  Akibatnya, **untuk satu kegiatan dan satu periode, total di Laporan Kegiatan sama dengan total di Nominal Realisasi**. Yang boleh berbeda hanya jumlah baris: Laporan Kegiatan juga menampilkan dokumen non-material dan dokumen yang berkasnya dimusnahkan, keduanya tanpa nominal yang dihitung. Kesamaan ini diuji di `tests/unit/laporan/kegiatan-route.test.ts`.

  **Filter periode** memakai komponen bersama `PeriodeSelector` (`src/components/laporan/PeriodeSelector.tsx`), yang sama dengan Nominal Realisasi dan Laporan Kinerja (PB-7.2). Kedua halaman memuat semua dokumen sekali, lalu menyaring di browser dengan `isTanggalInPeriode` (`src/lib/laporan/periode.ts:121`, dipanggil di `src/routes/pegawai/laporan/kegiatan.tsx:242`). **Dasar tanggalnya adalah tanggal dokumen**: `dokumen_transaksi.tanggal` (diisi pengaju saat membuat dokumen) dan `manual_arsip.tanggal` untuk dokumen tambahan KSBU, **bukan** tanggal pengajuan, tanggal disetujui, atau `updated_at`. Nominal Realisasi memakai dasar yang sama tetapi menyaring di server (`src/routes/api/laporan/kinerja.ts:240-241` untuk dokumen alur, `listManualRealisasiRows` untuk dokumen manual). Kolom tabel di detail Laporan Kegiatan kini berlabel **"Tanggal Dokumen"** (`kegiatan.tsx:1129`); dulu labelnya "Tanggal Pengajuan", yang tidak sesuai isinya. Periode bawaan:
  - **Laporan Saya: Bulanan**, yaitu bulan berjalan (`defaultPeriode('BULANAN')`, `src/routes/pegawai/laporan/saya.tsx:86`);
  - **Laporan Kegiatan: Triwulan**, yaitu triwulan berjalan (`defaultPeriode('TRIWULAN')`, `src/routes/pegawai/laporan/kegiatan.tsx:172`). Periode berlaku juga saat membuka detail satu kegiatan.

  Input "Mulai/Sampai Tanggal" di Filter Lanjutan daftar kini digantikan filter periode (rentang bebas tetap tersedia lewat mode Kustom). Ekspor ZIP Laporan Saya mengikuti periode yang aktif.
- **Pengguna.** Pegawai; Ketua Tim.

## PB-7.2 — Tidak ada rekap realisasi untuk pihak berwenang

- **Solusi.** Satu tampilan **`MonitoringRealisasiView.tsx`** dipakai tiga halaman dengan drill-down (atau per pegawai), filter periode, dan state filter di URL. Nominal Realisasi menelusuri Fungsi → Kegiatan → Komponen → Dokumen. **Laporan Kinerja cukup sampai Kegiatan**: Fungsi → Kegiatan → Dokumen (D-30, `stopAtKegiatan`, `MonitoringRealisasiView.tsx:275`), supaya dokumen non-material, yang memang tidak punya Komponen, tidak terkumpul di grup "Tanpa Komponen".

  | Halaman | Pengguna | Isi (`GET /api/laporan/kinerja`) |
  |---|---|---|
  | Nominal Realisasi `/ppk/monitoring-realisasi` | PPK | material "Selesai" dengan komponen (`kinerja.ts:188-192`) **+ dokumen tambahan KSBU** (`arsip.manual_arsip`, `:264`, `listManualRealisasiRows`); tanpa dokumen yang berkasnya dimusnahkan |
  | Nominal Realisasi `/ppspm/monitoring-realisasi` | PPSPM | sama |
  | Laporan Kinerja `/penanggung-jawab-kinerja/laporan-kinerja` | PJ Kinerja | di atas **ditambah** semua non-material "Tersimpan", termasuk yang lampirannya sudah dibersihkan (`scope=laporan_kinerja`, `:194-208`, D-29); dokumen yang berkasnya dimusnahkan **ikut ditampilkan dengan penanda**, nominalnya tidak dihitung (`hideDestroyed`, `:172`) |

  **Filter periode** (`PeriodeSelector`, dipakai bersama PB-7.1): **Bulanan**, Triwulan, Tahunan, Seluruh Periode, dan Kustom. Mode Bulanan menghitung hari terakhir bulan dengan benar, termasuk Februari tahun kabisat (`resolvePeriodeRange`, `src/lib/laporan/periode.ts`). Bawaan ketiga halaman ini tetap **Triwulan berjalan** (`normalizePeriodeSearch`, `src/components/kinerja/monitoringRealisasiNavigation.ts:69`). Periode disimpan di URL (`periode`, `tahun`, `triwulan`, `bulan`) dan dikirim ke server sebagai `start_date`/`end_date`.

  Aturan cakupan:
  - `scope=laporan_kinerja` **hanya boleh dipakai PJ Kinerja**; peran lain mendapat 403 (`kinerja.ts:145-147`, commit `c40c469`).
  - Nominal dokumen alur maupun dokumen tambahan KSBU yang berkasnya sudah dimusnahkan **tidak dihitung** (`loadDestroyedArchiveIds`, `src/lib/laporan/manual-realisasi.ts:28`, dipanggil di `kinerja.ts:168`). Otoritasnya join `berkas_arsip_item → berkas_arsip` berstatus `DIMUSNAHKAN`. **Nominal Realisasi** tidak menampilkan dokumen itu sama sekali. **Laporan Kinerja** (D-29) tetap menampilkannya dengan `berkas_dimusnahkan: true`: nominalnya dicoret dengan keterangan "Tidak dihitung · berkas dimusnahkan" (`DocumentNominal`, `MonitoringRealisasiView.tsx:1735`), dan `totalNominal` melewatinya (`src/lib/laporan/monitoring-rows.ts:183`). Alasannya, metadata memang sengaja disimpan; yang dihapus hanya lampirannya. Sejak D-28 (`93eeb17`) join ini berlaku juga untuk dokumen tambahan KSBU. Sebelumnya hanya `manual_arsip.status_arsip` yang diperiksa, padahal kolom itu tidak ikut berubah saat berkasnya dimusnahkan (kolom itu dihapus di D-29).
  - Laporan Kinerja menampilkan badge **"File Dibersihkan"** untuk dokumen yang lampirannya sudah dibersihkan, baik lewat pembersihan non-material maupun pemusnahan berkas (`lampiran_dibersihkan_at/alasan` di respons API, D-30).
  - Status akhir (Selesai/Tersimpan) ditampilkan sebagai **Material / Non-Material**, dan filter Status di detail kegiatan memakai opsi yang sama (`STATUS_FILTER_OPTIONS`, `MonitoringRealisasiView.tsx:147`; lihat PB-7.1).
  - **Dokumen tambahan KSBU ikut dihitung di ketiga halaman ini** (D-26, `37517ff`; diperluas ke Laporan Kinerja di `e6ba99c`), dan sejak D-28 juga di Laporan Kegiatan (PB-7.1). Dokumen manual dianggap "Selesai" sejak diarsipkan, diberi `sumber = 'MANUAL'`, dan di tabel diberi label "· Penambahan Dokumen (KSBU)" supaya tidak dikira melewati persetujuan PPK/PPSPM.
  - Maksimal 2000 baris per permintaan; bila terlampaui, muncul peringatan agar periode dipersempit.
  - Header halaman menampilkan catatan cakupan sesuai halaman (D-27, dipertegas D-28/D-29): Nominal Realisasi "Dokumen material berstatus Selesai dan dokumen tambahan KSBU. Dokumen yang berkasnya sudah dimusnahkan tidak ditampilkan dan nominal realisasinya tidak lagi dihitung." (`MonitoringRealisasiView.tsx:113`), Laporan Kinerja "Dokumen Material berstatus Selesai, Non-Material berstatus Tersimpan, dan dokumen tambahan KSBU. Dokumen yang berkasnya sudah dimusnahkan tetap ditampilkan, tetapi nominal realisasinya tidak lagi dihitung." (`:118-119`; kata "final" diganti di `4da7ed1`, begitu pula judul dan deskripsi lain di halaman itu: "Total Dokumen", "Jumlah Dokumen", "Belum ada dokumen").

  **Detail dan lampiran dokumen** (sejak `e6ba99c`). Mengklik dokumen di ketiga halaman membuka detail beserta lampiran yang bisa di-**Preview** dan di-**Unduh**:
  - dokumen alur pengajuan → `DokumenDetailDialog` + `AttachmentViewer` (sama dengan halaman laporan lain);
  - dokumen tambahan KSBU → `ManualArsipDetailDialog` + `ManualArsipAttachmentViewer` (`src/components/arsip/`), yang meniru tampilan dan perilaku `AttachmentViewer` (kartu lampiran, tombol Preview/Unduh, notifikasi, modal pratinjau PDF). Datanya diambil dari endpoint **read-only** `/api/laporan/manual-arsip/$id` (+ `/attachments/$attachmentId/{preview,download}`); lihat PB-8.3.

  Sebelumnya Nominal Realisasi sengaja hanya menampilkan metadata (tanpa file), dan dokumen manual di Laporan Kinerja hanya menampilkan metadata. Aturan "metadata saja" itu dicabut atas keputusan pemilik proyek.

  **Klaim cakupan Laporan Kinerja untuk skripsi** (diputuskan, klaim terbatas; diperbarui D-29): *"Seluruh dokumen yang telah selesai diproses — dokumen material berstatus Selesai, dokumen non-material berstatus Tersimpan, dan dokumen tambahan KSBU — tercakup dalam Laporan Kinerja, termasuk dokumen yang lampirannya sudah dibersihkan atau berkasnya sudah dimusnahkan. Nominal dokumen yang berkasnya dimusnahkan tidak dihitung dalam total."* Yang **tidak** tercakup, dan harus disebut bila klaim ini dipakai:
  1. dokumen yang belum berstatus Selesai atau Tersimpan (masih di PPK/PPSPM, perlu revisi);
  2. dokumen material tanpa Komponen (data sebelum kolom Komponen wajib; di basis data pengembangan jumlahnya 0);
  3. baris ke-2001 dan seterusnya dalam satu periode (batas 2000 baris, disertai peringatan).
- **Pengguna.** PPK, PPSPM, PJ Kinerja. Admin tidak.
- **Perubahan dari rancangan lama.** Dokumen manual KSBU dulu tidak dihitung sama sekali (hanya dijumlahkan di total berkas, `berkas-arsip-read-model.ts`); filter periode dulu tidak punya mode Bulanan dan hanya ada di tiga halaman ini; Laporan Kinerja dulu sampai tingkat Komponen dan menyembunyikan dokumen yang berkasnya dimusnahkan maupun non-material yang sudah dibersihkan (D-29, D-30).

## PB-7.3 — Ketua Tim tidak tahu dokumen timnya tertahan di mana (baru)

- **Proses sekarang.** Ketua tim menanyai anggota satu per satu apakah SPJ-nya sudah diteken PPK atau PPSPM.
- **Solusi.** Halaman **Monitoring Dokumen Tim** (`/pegawai/monitoring-dokumen-tim`, commit `16f6e1a`). Halaman ini menampilkan dokumen **yang masih dalam proses maupun yang sudah Selesai atau Tersimpan** dari kegiatan yang dipimpin (`scope=monitoring`: Divalidasi PPK, Menunggu PPSPM, Perlu Revisi, Selesai, Tersimpan; `kegiatan-scope.ts:12-15`).
  - Tiap dokumen diberi **posisi**: di PPK, di PPSPM, revisi pengaju, revisi PPK, atau selesai (`getPosisiDokumen`, `:41-55`).
  - Ada kartu ringkasan per posisi.
  - Filter: kegiatan, posisi, pembuat, "tertahan > 3/7/14 hari", dan rentang tanggal.
  - Peringatan muncul bila dokumen tertahan > 7 hari (`monitoring-dokumen-tim.tsx:121`).
  - Tersedia ekspor ZIP (maksimal 500).
- **Pengguna.** Ketua Tim.
- **Keterkaitan.** Memakai kapabilitas PB-1.2 dan status PB-1.1; ekspor memakai PB-6.4.

---

# PB-8 — Kontrol Akses & Akuntabilitas Identitas Lemah

## PB-8.1 — Siapa pun bisa memegang dan memproses berkas

- **Solusi.** Hak akses berbasis peran ditegakkan di server. Handler API mengikuti urutan baku: cek same-origin untuk POST/PUT/PATCH/DELETE (`src/lib/security/same-origin.ts:3`), ambil sesi, cek peran yang dimiliki, validasi Zod, lalu jalankan layanan. Menyembunyikan menu hanya kosmetik. Admin tidak bisa menyetujui atau memberkaskan, karena ADMIN tidak pernah digabung dengan peran lain.
- **Pengguna.** Semua aktor.
- **Catatan.** ✅ **D-3 selesai** (`3a34192`). `GET /api/kasubag/klasifikasi` sempat tidak memeriksa sesi; kini memakai `requireKepalaSubBagianUmum` (401 tanpa sesi, 403 untuk peran lain), sama seperti mutasinya. Audit lanjutan menemukan 11 endpoint data master lain dengan celah serupa, sudah diperbaiki juga (D-23, `b4ee1a8`).

## PB-8.2 — Tidak ada pengelolaan identitas & wewenang

- **Solusi.** **Master User** (`/admin/master-data/user`):
  - membuat pengguna dengan **username** (3–30 karakter `a-z0-9._-`, minimal satu huruf) dan NIP/NRP (unik);
  - menetapkan peran dan penugasan Ketua Tim;
  - menonaktifkan atau mengaktifkan pengguna;
  - mereset kata sandi;
  - melihat foto profil pengguna (`GET /api/users/$id/avatar`).

  Setiap pengguna bisa mengganti kata sandi dan foto profilnya di `/profile`.

  **Login memakai username atau NIP** (`or(eq(users.username, …), eq(users.nipNrp, …))`, `src/lib/auth/local-auth-service.ts:150`). Email kini opsional dan bukan identitas login (migrasi `0017_username_login_identity.sql`).

  Rincian keamanan (Lampiran E):
  - kata sandi di-hash **Argon2id**;
  - sesi berlaku **8 jam**;
  - batas percobaan login **5 gagal per 10 menit**, lalu jeda 15 menit;
  - logout mencabut sesi saat itu;
  - ganti atau reset kata sandi dan penonaktifan akun mencabut **semua** sesi pengguna (`revokeAllUserSessions`, `src/lib/users/local-user-passwords.ts:44,92`, `local-user-mutations.ts:328`).
- **Pengguna.** Admin; semua pengguna untuk profil sendiri.
- **Perubahan dari rancangan lama.** Login dengan email diganti username/NIP (commit `80fb6d3`).

## PB-8.3 — Lampiran bisa dibuka siapa saja

- **Solusi.** File disimpan di luar direktori publik. Lampiran dokumen dibuka dengan meminta **URL bertanda tangan HMAC-SHA256** yang terikat pada pengguna, sesi, dokumen, dan indeks lampiran. Masa berlakunya **15 menit untuk pratinjau** dan **1 jam untuk unduh** (`src/lib/storage/document-file-access.ts:56-57,61-135`).

  Hak baca diperiksa ulang pada setiap permintaan (`canSessionReadDocument`, `:344-383`; aturan yang sama untuk detail dokumen di `canSessionReadDokumen`, `src/routes/api/dokumen.$id.ts:58`). Yang berhak:
  - pemilik dokumen;
  - PPK dan PPSPM untuk status tertentu (termasuk "Selesai");
  - KSBU untuk dokumen "Selesai";
  - **PJ Kinerja untuk dokumen "Selesai" dan "Tersimpan"** (baca saja; sejak `e6ba99c`, `document-file-access.ts:359-365`, `dokumen.$id.ts:89-93`). Sebelumnya akun yang hanya berperan PJ Kinerja ditolak (403) saat membuka detail atau lampiran dokumen di Laporan Kinerja;
  - Ketua Tim untuk dokumen non-Draf di kegiatannya.

  Admin murni ditolak. Respons 410 dikirim bila lampiran sudah dibersihkan ("Data file sudah dibersihkan") atau berkasnya sudah dibersihkan ("Data file sudah dimusnahkan"). Detail dokumen (`GET /api/dokumen/$id`) kini juga mengirim `berkas_dimusnahkan`, dihitung dari status berkas penaungnya (`src/routes/api/dokumen.$id.ts:420`), sehingga dialog detail menampilkan pesan bahwa berkasnya sudah dimusnahkan dan nominalnya tidak lagi dihitung (`DokumenDetailDialog.tsx:109`, D-29). Pesan ini hanya untuk berkas yang dimusnahkan, bukan untuk pembersihan lampiran non-material.

  **File di luar lampiran dokumen alur** dibuka lewat rute yang memeriksa sesi dan peran, **tanpa** token HMAC:
  - file di dalam berkas: rute KSBU (`requireBerkasArsipApiSession`);
  - lampiran dokumen tambahan KSBU, dua pintu:
    - `/api/kasubag/manual-arsip/**`: baca dan tulis, hanya KSBU (`requireManualArsipApiSession`, `src/lib/manual-arsip.ts:198`);
    - `/api/laporan/manual-arsip/$id` (+ `/attachments/$attachmentId/{preview,download}`): **baca saja**, untuk pihak yang melihat dokumen itu di laporan (`requireLaporanManualArsipSession`, `src/lib/manual-arsip.ts:223`):
      - PJ Kinerja, PPK, PPSPM, dan KSBU, untuk semua dokumen tambahan KSBU (tidak berubah);
      - **Ketua Tim** (akun berperan Pegawai), **hanya untuk dokumen yang kegiatannya ia pimpin** (sejak D-28, `93eeb17`). Server mencocokkan `manual_arsip.kegiatan_id` dengan `ketua_tim_assignments` milik pemanggil (`isKetuaTimOfManualArsipKegiatan`, `:250`).

      Urutan pemeriksaan: sesi (401), peran, kepemilikan kegiatan (403), keberadaan (404), dimusnahkan (410). Ketua Tim yang bukan pemimpin kegiatan itu mendapat **403**. Id yang tidak ada juga dijawab 403 untuk Ketua Tim, supaya keberadaan dokumen kegiatan lain tidak bocor. Peran lain, termasuk Admin murni, mendapat 403. Sejak D-28, detail dokumen yang berkasnya dimusnahkan tetap mengembalikan metadata dengan penanda `dimusnahkan: true`, karena laporan tetap menampilkannya. File-nya dijawab **410**. Sejak D-29 keduanya memakai status arsip yang dihitung dari berkas penaung (`manualArsipEffectiveStatusArsip`, dipakai `getManualArsipDetail` dan `createManualArsipAttachmentFileResponse`, `src/lib/manual-arsip.ts:907`); pengecekan berkas tambahan di rute preview/unduh dari D-28 dihapus karena sudah tercakup.
- **Unggahan.** Maksimal **5 MB**. Server memeriksa ekstensi (pdf, doc, docx, xls, xlsx, jpg, jpeg, png), MIME yang dilaporkan, kecocokan ekstensi dengan MIME, dan **tanda tangan isi file** (magic bytes) (`src/lib/storage/local-upload.ts:107-140,229-259`; `src/lib/upload/document-upload-policy.ts`).
- **Pengguna.** Semua aktor yang berhak.

---

# PB-9 — Dokumen Kerja Non-Material Menumpuk Tanpa Batas

## PB-9.1 — Tidak ada yang berwenang & tidak ada mekanisme memangkas

- **Solusi.** Menu **Pembersihan Dokumen** (`/pegawai/pembersihan-dokumen`, grup PJ Kegiatan) untuk Ketua Tim. Halaman ini menampilkan dokumen non-material "Tersimpan" dari kegiatan yang dipimpin, beserta umur dokumen dan penanda "lama" untuk dokumen berumur > **90 hari** (`NON_MATERIAL_STALE_DAYS`, `src/lib/dokumen/pembersihan.ts:10`).

  Eksekusi meminta frasa ketik-persis **`BERSIHKAN`**, maksimal **200 dokumen** per permintaan. Keduanya ditegakkan server (`z.literal`, `.max(PEMBERSIHAN_BATCH_LIMIT)`, `src/routes/api/pembersihan-dokumen.bersihkan.ts:14-19`).

  Server menilai ulang setiap dokumen (`buildPembersihanPlan`, `src/lib/dokumen/pembersihan-service.ts:55-99`). Dokumen ditolak bila:
  - bukan non-material murni;
  - bukan "Tersimpan";
  - bukan kegiatan yang dipimpin;
  - sudah dibersihkan;
  - ada di berkas.
- **Keputusan perancangan.** Yang dibersihkan hanya file fisik:
  - status tidak diubah;
  - daftar lampiran tidak dikosongkan;
  - kondisi dicatat di `lampiran_dibersihkan_at/by/alasan`;
  - jejak ditulis ke tabel audit (PB-3.2).
- **Pengguna.** Ketua Tim.
- **Keterkaitan.** PB-5.1, PB-1.2, PB-6.3, PB-8.3, PB-3.2.

---

## 4. Bagaimana Semua Masalah Saling Terhubung

```
                ┌──────── PB-8 Kontrol Akses & Identitas ────────────────────────┐
                │ gabungan peran di server · username/NIP · URL lampiran HMAC     │
                └───────────────────────────┬────────────────────────────────────┘
                                            │ menegakkan
 PB-4 Data Master ──────► PB-1 Transparansi ──────► PB-2 Persetujuan ──────► PB-3 Jejak Audit
 (A) Fungsi→Kegiatan→     status + posisi,          modul transisi terpusat   riwayat dokumen +
     Komponen             Ketua Tim, checklist      PPK → PPSPM, revisi,      riwayat berkas +
 (B) Jenis→Kategori→      exact-match               kembalikan, konflik       tabel audit
     Detail                     │                         │ Selesai                  │
 Kelengkapan exact-match        │                         │                          │
 Cara Pembayaran (hierarki)     ▼                         ▼                          │
        └────► PB-5 Material vs Non-Material ────► PB-6 Pemberkasan & Unduh ─────────┤
               (nominal │ Nama Dokumen)            (Cara Pembayaran × TA) Terbuka →   │
                    │   │                          Tertutup → Usul → Dibersihkan;     │
                    │   │                          unggahan tertunda dibersihkan      │
                    │   └──────► PB-9 Pembersihan Non-Material (Ketua Tim, >90 hari) ─┘
                    ▼
               PB-7 Pelaporan: Laporan Saya · Laporan Kegiatan · Monitoring Dokumen Tim ·
               Nominal Realisasi (PPK/PPSPM) · Laporan Kinerja (PJ Kinerja)
               — filter periode bersama; termasuk dokumen tambahan KSBU (+ lampirannya);
                 tanpa berkas yang file-nya dibersihkan

 Aplikasi mandiri: TIDAK bertukar data dengan KipApp, SAKIP, SPIDER, Drive, atau aplikasi arsip.
```

---

## 5. Peta Cepat: Masalah → Lokasi di Kode

| Area | Berkas/rute kunci |
|---|---|
| Transisi status | `src/lib/fsm.ts`, `src/lib/constants/document-status.ts`, `src/lib/types/fsm.ts`, `src/lib/dokumen/transition-conflict.ts` |
| Pengajuan dokumen | `src/routes/api/dokumen/submit.ts`, `src/lib/dokumen/local-submit-write-bridge.ts`, `local-submit-repository.ts`, `local-submit-drizzle-adapter.ts`, `submit-file-preflight.ts` |
| Validasi kirim ulang | `src/lib/dokumen/resubmit-validation.ts`, `src/routes/api/dokumen.$id.submit.ts`, `src/routes/api/ppk/resubmit/$id.ts` |
| Formulir bertahap | `src/routes/pegawai/dokumen/aju.tsx`, `src/components/dokumen/form/Step*.tsx`, `src/components/dokumen/KelengkapanChecklist.tsx` |
| Ubah/hapus dokumen | `src/routes/api/dokumen.$id.ts` (GET/PATCH/DELETE) |
| Validasi PPK | `src/routes/ppk/*`, `src/routes/api/ppk/dokumen/$id/{approve,reject}.ts`, `src/routes/api/ppk/resubmit/$id.ts`, `src/routes/api/ppk/kembalikan/$id.ts` |
| Persetujuan PPSPM | `src/routes/ppspm/*`, `src/routes/api/ppspm/dokumen/$id/{approve,reject}.ts` |
| Pemberkasan | `src/lib/archive/berkas-arsip-service.ts`, `berkas-arsip-read-model.ts`, `berkas-klasifikasi-eligibility.ts`, `src/routes/api/kasubag/dokumen.$id.archive.ts`, `src/routes/api/kasubag/berkas/**`, `src/routes/kasubag/berkas/**` |
| Siklus & pembersihan berkas | `src/lib/constants/archive-status.ts`, `src/lib/archive/retention.ts`, `berkas-arsip-physical-destruction.ts`, `src/routes/api/kasubag/berkas/$id/lifecycle.ts`, `src/routes/kasubag/pembersihan/index.tsx` |
| Penambahan dokumen manual | `src/lib/manual-arsip.ts`, `src/lib/schemas/manual-arsip.ts`, `src/lib/storage/manual-arsip-pending-attachments.ts`, `src/routes/api/kasubag/manual-arsip/*`, `src/routes/kasubag/penambahan-arsip.tsx`, `src/components/arsip/ManualArsipAttachments.tsx` |
| Dokumen manual di laporan (read-only) | `src/routes/api/laporan/manual-arsip.$id*.ts`, `src/components/arsip/{ManualArsipDetailDialog,ManualArsipAttachmentViewer}.tsx` |
| Tahun anggaran | `drizzle/0018_berkas_tahun_anggaran.sql`, `src/lib/utils/tahun.ts`, `src/routes/api/kasubag/klasifikasi/index.ts` |
| Ekspor ZIP | `src/lib/export/document-zip.ts`, `laporan-zip-entries.ts`, `src/routes/api/kasubag/berkas/$id/export-zip.ts`, `src/routes/api/laporan/{saya,kegiatan}.export-zip.ts`, `src/components/laporan/ExportZipDialog.tsx` |
| Data master | `src/lib/master-data/*`, `src/routes/admin.master-data.*.tsx`, `src/routes/api/master-*.ts` |
| Ketua Tim | `src/db/schema/master/ketua-tim-assignments.ts`, `src/lib/schemas/ketua-tim.ts`, `src/routes/api/ketua-tim/*`, `src/routes/api/users/me/ketua-tim.ts` |
| Pembersihan non-material | `src/lib/dokumen/pembersihan.ts`, `pembersihan-service.ts`, `src/routes/api/pembersihan-dokumen*.ts`, `src/routes/pegawai/pembersihan-dokumen.tsx` |
| Monitoring Realisasi & Laporan Kinerja | `src/components/kinerja/{MonitoringRealisasiView.tsx,monitoringRealisasiNavigation.ts}`, `src/lib/laporan/{monitoring-rows,periode}.ts`, `src/routes/api/laporan/kinerja.ts` |
| Filter periode (bersama) | `src/lib/laporan/periode.ts`, `src/components/laporan/PeriodeSelector.tsx` |
| Laporan pegawai & Monitoring Dokumen Tim | `src/routes/pegawai/laporan/*`, `src/routes/pegawai/monitoring-dokumen-tim.tsx`, `src/lib/laporan/kegiatan-scope.ts`, `src/routes/api/laporan/{saya,kegiatan}.ts`, `src/components/laporan/{HierarchicalFilter,FilterToolbar,PeriodeSelector}.tsx` |
| Auth & sesi | `src/lib/auth/*` (`local-auth-service.ts`, `session-*.ts`, `login-rate-limit.ts`, `password.ts`), `src/routes/api/auth/*`, `src/db/schema/auth/*` |
| Peran & navigasi | `src/lib/auth/local-server-auth.ts`, `src/lib/users/role-assignment.ts`, `src/lib/guards.ts`, `src/config/navigation.ts`, `src/components/layout/AppSidebar.tsx` |
| Same-origin | `src/lib/security/same-origin.ts` |
| Penyimpanan & akses file | `src/lib/storage/*` (hak baca: `document-file-access.ts`), `src/lib/upload/document-upload-policy.ts`, `src/routes/api/upload.ts`, `src/routes/api/files/access.ts`, `src/routes/api/dokumen/{preview,download}-url.ts`, `src/components/dokumen/{AttachmentViewer,DokumenDetailDialog}.tsx` |
| Unggahan tertunda | `src/hooks/useDiscardPendingUploadsOnLeave.ts`, `src/lib/storage/pending-upload-*.ts`, `src/scripts/sweep-pending-uploads.ts` |
| Jejak audit | `src/db/schema/dokumen/log-aktivitas.ts`, `src/db/schema/audit/audit-log.ts`, `src/db/schema/arsip/berkas-arsip.ts`, `src/routes/api/activity-log.ts`, `src/components/activity-log/ActivityLogView.tsx` |
| Tema, identitas, bantuan | `src/db/schema/app/app-settings.ts`, `src/lib/schemas/settings.ts`, `src/routes/api/settings/*`, `src/routes/admin.settings.tsx`, `src/routes/bantuan.tsx` |

---

# A. Changelog sejak `7927ca5`

Sampai `b6c3292`: 41 commit; 182 berkas di `src/` + `drizzle/` berubah (+4.632 / −5.348 baris). Commit `1a09093`–`cf4c5ce` hanya berisi diagram dan dokumen. Perubahan setelahnya ada di tabel lanjutan (baris 20–36).

| # | Dulu (`7927ca5`) | Sekarang (`b6c3292`) | Bukti |
|---|---|---|---|
| 1 | Login dengan **email** | Login dengan **username atau NIP**; email opsional, tidak unik | `drizzle/0017_username_login_identity.sql`; `local-auth-service.ts:150`; commit `80fb6d3` |
| 2 | Satu berkas **terbuka** per Cara Pembayaran (partial unique index) | Satu berkas per **(Cara Pembayaran, Tahun Anggaran)**, terbuka maupun tertutup; TA dipilih KSBU | `drizzle/0018_berkas_tahun_anggaran.sql`; `berkas-arsip.ts:60-63`; commit `56c6a6d` |
| 3 | Master Jenis Dokumen ada (tidak dipakai) | Tabel, kolom `dokumen_transaksi.jenis_dokumen_id`, rute, dan halaman admin dihapus | `drizzle/0019_drop_master_jenis_dokumen.sql`; commit `3834a95` |
| 4 | `PATCH /api/dokumen/$id/nominal` | Dihapus | commit `d1f147e` |
| 5 | `POST /api/dokumen` (buat draf) dan cabang Draf di `/api/dokumen/$id/submit` | Dihapus; pengajuan hanya lewat `POST /api/dokumen/submit` | commit `8faf1c8`; `dokumen.$id.submit.ts:98-110` |
| 6 | Checklist server memakai pencocokan bertingkat | Exact-match 6 kolom, sama dengan formulir pengajuan | `local-submit-drizzle-adapter.ts:159-173`; commit `d45bcd9` |
| 7 | `scope=laporan_kinerja` terbuka untuk PPK/PPSPM | Hanya PJ Kinerja (403 untuk yang lain) | `kinerja.ts:121-127`; commit `c40c469` |
| 8 | Kirim ulang tanpa validasi prasyarat terpadu | Nominal > 0, minimal satu lampiran, dan kelengkapan wajib dicek untuk SUBMIT, RESUBMIT, dan RESUBMIT_PPK | `resubmit-validation.ts`; commit `b6c3292` |
| 9 | Tidak ada penjaga konflik bersamaan | `UPDATE … WHERE status = asal` + `DokumenTransitionConflictError` | `transition-conflict.ts`; commit `fc59b44` |
| 10 | File unggahan yang ditinggalkan menetap | Area tertunda + pembersihan saat halaman ditinggalkan + sweeper 24 jam + skrip `storage:sweep-pending` | `useDiscardPendingUploadsOnLeave.ts`, `pending-upload-sweeper.ts`; commit `fc59b44` |
| 11 | File lampiran lama langsung dihapus saat diganti | Dihapus **setelah** basis data diperbarui, dan hanya bila tidak dirujuk | `local-attachment-reference-cleanup.ts`; commit `fc59b44` |
| 12 | Ketua Tim hanya punya Laporan Kegiatan & Pembersihan | Tambahan **Monitoring Dokumen Tim** (dokumen dalam proses + posisi + peringatan tertahan) dalam grup menu "PJ Kegiatan" | `routes/pegawai/monitoring-dokumen-tim.tsx`, `kegiatan-scope.ts`; commit `16f6e1a` |
| 13 | Tidak ada halaman bantuan | Halaman **Bantuan** `/bantuan` (tautan di sidebar, layout, dan login) | `src/routes/bantuan.tsx`; commit `7ee6307` |
| 14 | Admin tidak melihat foto profil pengguna | `GET /api/users/$id/avatar` + tampilan di Master User | commit `ad79004` |
| 15 | Rute ketua-tim tanpa Zod | Skema `src/lib/schemas/ketua-tim.ts` | commit `8ace388` |
| 16 | Orkestrator submit 777 baris + kompensasi DB/file | Dihapus; diganti pemindahan file di dalam transaksi + rollback | `submit-runtime-orchestrator.ts` & `submit-db-file-compensation.ts` dihapus; commit `fc59b44` |
| 17 | `POST /api/kasubag/manual-arsip/$id/attachments` | Dihapus; lampiran manual ikut alur unggahan tertunda | `manual-arsip-pending-attachments.ts`; commit `fc59b44` |
| 18 | Kode mati: `RoleSwitcher.tsx`, `UserMenu.tsx`, `StatsBento.tsx`, `DokumenFormContext.tsx`, `dokumen-form-reducer.ts`, `KinerjaPagePrimitives.tsx`, `ui/avatar.tsx`, `ui/card.tsx`, `src/db/index.ts`, `src/lib/db/*`, `lib/constants/{env,index,tables}.ts` | Dihapus | commit `6a1b158`, `d067410`, `630f9ae`, `34c8c0a`, `d61214d` |
| 19 | *(koreksi dokumen, bukan perubahan kode)* Versi lama menyebut hanya Admin yang melihat Activity Log lintas pengguna | Admin **dan PJ Kinerja** (`scope=all`); sudah begitu sejak `7927ca5` | `activity-log.ts:15` di `7927ca5` dan HEAD |

**Lanjutan: perubahan sejak `b6c3292` sampai `e6ba99c`** (perbaikan temuan Bagian D dan fitur laporan terakhir)

| # | Dulu | Sekarang | Bukti |
|---|---|---|---|
| 20 | Checklist kelengkapan di revisi Pegawai dan kirim ulang PPK memakai pencocokan bertingkat | Satu fungsi bersama exact-match 6 kolom, sama dengan server (D-1) | `src/lib/kelengkapan-match.ts`; commit `69f7fbe` |
| 21 | Nominal bisa diubah tanpa cek > 0 lewat PATCH | Material harus > 0, Non-Material menolak nominal (D-2) | `validateNominalUpdate`; commit `f26ee7f` |
| 22 | `GET /api/kasubag/klasifikasi` dan 11 GET data master bisa dibaca tanpa login | Wajib sesi (+ peran KSBU untuk klasifikasi) (D-3, D-23) | commit `3a34192`, `b4ee1a8` |
| 23 | Menu "Settings" tanpa tujuan di 5 peran; label "Activity Log" | Menu itu dihapus; Admin: "Pengaturan Aplikasi"; semua peran: "Log Aktivitas" (D-5) | `src/config/navigation.ts`; commit `e4abe5a` |
| 24 | `is_ketua_tim` mengikuti klaim pengaju; PATCH dokumen menerima metadata bebas | `is_ketua_tim` ditentukan server saat submit dan dikunci; PATCH `.strict()` hanya menerima field yang dipakai UI (D-12, D-24) | commit `df8ea51`, `d328ad7`, `38f5900` |
| 25 | Transisi `KEMBALIKAN` tanpa tes unit | Seluruh 8 transisi punya tes unit (D-14) | `tests/fsm.test.ts`; commit `89a93bd` |
| 26 | Label "Jenis Dokumen" untuk karakteristik; pesan berkas tertutup tanpa TA | "Karakteristik"; pesan menyebut TA (D-17, D-18) | commit `ae966d2` |
| 27 | `jenis/kategori/detail_permintaan_id` tanpa FK | FK ke master masing-masing, migrasi `0020` + tes integrasi (D-20) | `drizzle/0020_dokumen_transaksi_permintaan_fk.sql`; commit `8816524` |
| 28 | Dokumen tambahan KSBU tidak masuk Nominal Realisasi | Masuk Nominal Realisasi dengan label "Penambahan Dokumen (KSBU)" (D-26/T-5) | `kinerja.ts`; commit `37517ff` |
| 29 | Kata sandi di halaman login tidak bisa dilihat | Tombol lihat/sembunyikan kata sandi | `src/routes/login.tsx:32,174-191`; commit `19e1b2a` |
| 30 | Filter periode (Triwulan/Tahunan/Semua/Kustom) hanya di Nominal Realisasi & Laporan Kinerja | Komponen bersama `PeriodeSelector` + mode **Bulanan**; dipakai juga Laporan Saya (bawaan Bulanan) dan Laporan Kegiatan (bawaan Triwulan) | `periode.ts`, `PeriodeSelector.tsx`; commit `e6ba99c` |
| 31 | Laporan Kinerja tanpa dokumen tambahan KSBU; Nominal Realisasi hanya metadata; detail dokumen manual tanpa lampiran | Laporan Kinerja memuat dokumen tambahan KSBU; ketiga halaman membuka detail + lampiran (Preview/Unduh) untuk semua dokumen; endpoint read-only `/api/laporan/manual-arsip/**` | `ManualArsipDetailDialog.tsx`, `ManualArsipAttachmentViewer.tsx`; commit `e6ba99c` |
| 32 | Akun yang hanya PJ Kinerja ditolak (403) saat membuka detail/lampiran dokumen alur | PJ Kinerja boleh membaca dokumen "Selesai" dan "Tersimpan" | `document-file-access.ts:359-365`, `dokumen.$id.ts:89-93`; commit `e6ba99c` |
| 33 | Lampiran dokumen manual KSBU opsional | Minimal 1 lampiran, ditegakkan di formulir dan server | `schemas/manual-arsip.ts:213-223`; commit `e6ba99c` |
| 34 | Catatan header Laporan Kinerja "Hanya dokumen material berstatus Selesai…" (tidak sesuai isi) | Catatan cakupan berbeda untuk Nominal Realisasi dan Laporan Kinerja (D-27) | `MonitoringRealisasiView.tsx` (`ScopeNoteContext`); commit setelah `e6ba99c` |
| 35 | Kode mati: rute `rename-pending`, cabang dry-run submit, cabang `MULTIPLE_OPEN_BERKAS`, tipe `AppUser`/`AppSession`, rute pengalih `/dokumen/*` | Dihapus; tombol dashboard Pegawai langsung ke `/pegawai/dokumen/aju` (D-16 Golongan 1) | commit setelah `e6ba99c` |
| 36 | Kode "Ingat saya" 30 hari yang tidak terjangkau dari UI | Dihapus; semua sesi 8 jam; kolom `remember_me` tetap di skema (D-9) | `src/lib/auth/*`; commit setelah `e6ba99c` |
| 37 | Laporan Kegiatan tanpa dokumen tambahan KSBU, sehingga totalnya bisa lebih kecil dari Nominal Realisasi; dokumen manual di berkas dimusnahkan masih terhitung di Nominal Realisasi | Laporan Kegiatan memuat dokumen tambahan KSBU (disaring per kegiatan di server); dokumen yang berkasnya dimusnahkan tampil dengan penanda, tanpa nominal yang dihitung; Ketua Tim bisa membuka lampirannya (hanya kegiatan yang ia pimpin); total sama dengan Nominal Realisasi (D-28) | `kegiatan.ts`, `manual-realisasi.ts`, `manual-arsip.ts`; commit `93eeb17` |
| 38 | Dokumen tambahan KSBU punya status arsip sendiri yang tidak pernah diperbarui (dokumen di berkas yang dibersihkan tetap "Aktif") | Status arsip semua dokumen mengikuti berkasnya; kolom `status_arsip` dan enam kolom siklus `manual_arsip` dihapus lewat migrasi `0021`; edit dokumen tambahan hanya selama berkasnya aktif (D-29) | `manual-arsip-effective-status.ts`, `drizzle/0021_manual_arsip_drop_own_lifecycle.sql`; commit `ae8a698` |
| 39 | Ekspor ZIP Laporan Kegiatan hanya berisi dokumen alur; kolom tanggal berlabel "Tanggal Pengajuan" | ZIP ikut memuat dokumen tambahan KSBU (folder `[Manual] …`); label "Tanggal Dokumen" (D-29) | `laporan-zip-entries.ts`, `kegiatan.export-zip.ts`, `kegiatan.tsx`; commit `ae8a698` |
| 40 | Laporan Kinerja menyembunyikan dokumen yang berkasnya dimusnahkan dan non-material yang sudah dibersihkan; dialog detail dokumen alur tidak memberi tahu bila berkasnya dimusnahkan | Laporan Kinerja menampilkan keduanya (nominal dokumen dari berkas dimusnahkan tidak dihitung) + badge "File Dibersihkan"; pesan "berkas dimusnahkan" di dialog detail dokumen alur dan tambahan KSBU (D-29, D-30) | `kinerja.ts`, `MonitoringRealisasiView.tsx`, `DokumenDetailDialog.tsx`, `dokumen.$id.ts`; commit `ae8a698` |
| 41 | Laporan Kinerja sampai tingkat Komponen, sehingga non-material masuk grup "Tanpa Komponen"; label status Selesai/Tersimpan; tidak ada filter jenis di Laporan Saya dan Laporan Kegiatan | Laporan Kinerja cukup sampai Kegiatan; label Material/Non-Material dan filter Status di ketiga halaman laporan (D-30) | `status-laporan.ts`, `MonitoringRealisasiView.tsx`, `saya.tsx`, `kegiatan.tsx`; commit `ae8a698` |
| 42 | Ekspor ZIP laporan diambil lewat `fetch` + blob; di Edge dengan ekstensi pengelola unduhan gagal ("Failed to fetch") walau server mengirim 200 | Unduhan bawaan browser lewat tiket sekali pakai (POST `?mode=ticket` → GET `?ticket=`), sama seperti ekspor berkas (D-31) | `download-ticket.ts`, `file-helpers.ts` (`startZipDownload`), rute `*/export-zip`; commit `ae8a698` |
| 43 | Teks UI memakai kata "final" untuk dokumen dan berkas ("Dokumen Final", "Belum final", "Metadata final", "finalisasi berkas", "BELUM FINAL" di `DAFTAR_ISI.txt`, pesan galat "belum berada di tahap final") | Diganti: dokumen disebut menurut statusnya (Selesai untuk Material, Tersimpan untuk Non-Material); berkas "ditutup" dan berstatus "Terbuka"/"Tersimpan"; ZIP monitoring memakai "MASIH DIPROSES"; pesan "Dokumen belum berstatus Selesai"; dialog tutup berkas "Berkas akan ditutup dan berstatus Tersimpan."; label "Tutup Berkas" (Q-19, laporan bagian G dan I.3) | `MonitoringRealisasiView.tsx`, `penanggung-jawab-kinerja/index.tsx`, `CloseBerkasDialog.tsx`, `berkas-arsip-page-format.ts`, `kegiatan.export-zip.ts`, `dokumen.$id.archive.ts`; commit `4da7ed1` |
| 44 | Istilah "arsip" pada teks UI dan nama file unduhan ("Diarsipkan", "Lampiran_Arsip_…", "Bukti_Manual_Arsip_…", "arsip telah dimusnahkan") | "Diberkaskan", "Lampiran_Dokumen_…", "Bukti_Manual_Dokumen_…"; pesan 410 "File lampiran tidak tersedia - file berkas telah dibersihkan"; deskripsi peran KSBU "pengklasifikasian dokumen dan pengelolaan berkas"; bantuan menyebut "Cara Pembayaran" (keputusan I.9: yang benar "Tersimpan", bukan "Arsip Aktif") | `ActivityLog.tsx`, `aksi-labels.ts`, `workflow-nama-arsip.ts`, `manual-arsip.ts`, `bantuan.tsx`; commit `4da7ed1` |
| 45 | Pesan validasi metadata berkas "Metadata retensi final harus lengkap atau dikosongkan" | "Metadata masa simpan harus lengkap atau dikosongkan" | `src/lib/schemas/manual-arsip.ts:162`; commit `4da7ed1` |
| 46 | Verifikasi langkah 5 (30 Sept) tidak menemukan perubahan perilaku aplikasi, hanya ketidakcocokan rancangan sequence dengan kode. Koreksi ke dokumen ini: urutan pemeriksaan login; `last_login_at` tidak pernah diisi; kirim ulang memeriksa transisi sebelum syarat; perbaikan Material tanpa keterangan; penugasan Ketua Tim menggantikan yang lama; penonaktifan data master tanpa pemeriksaan rujukan (K-11) dan TA diisi awal dari tahun dokumen tanpa peringatan (K-12) | Lihat B.1–B.5 dan D-32 | `laporan-verifikasi-langkah5.md` |

---

# B. Fakta untuk Bab IV

## B.1 Use case per modul (dicocokkan dengan `src/config/navigation.ts` dan rute nyata)

Penomoran UC mengikuti kerangka Bab IV (24 UC), **+1 UC baru diputuskan (Q1) → total 25 UC**: Memantau Dokumen Tim (UC-25). Kolom "Catatan kode" menandai hal yang **harus disesuaikan** di kerangka.

> **Catatan penomoran (30 Sept).** *Sequence diagram* 30 Sept memakai **15 UC** (UC-01 s.d. UC-15, mengikuti Kerangka Bab IV Revisi 12), yang menggabungkan beberapa UC di tabel ini (mis. Login, Logout, dan Berpindah Peran menjadi satu "Login dan Logout"; Log Aktivitas menjadi UC-13). Nomor UC pada *sequence* **berbeda** dengan nomor di tabel ini; cocokkan lewat nama UC, bukan nomor.

| UC | Nama | Aktor | Menu (label → path) | Endpoint utama | Catatan kode |
|---|---|---|---|---|---|
| **M1 Akses dan Akun** |||||
| UC-01 | Login | Semua | `/login` | `POST /api/auth/login` | **Username/NIP**, bukan email; tombol lihat/sembunyikan kata sandi (`19e1b2a`). Urutan di server: same-origin → skema → batas percobaan → cari akun → **status akun aktif (403 "Akun Anda tidak aktif. Hubungi Administrator.", tidak dihitung sebagai percobaan gagal)** → Argon2id (401 bila salah) → peran (403 bila tidak valid). Percobaan gagal ke-5 langsung dijawab 429. `users.last_login_at` **tidak pernah ditulis** |
| UC-02 | Logout | Semua | header | `POST /api/auth/logout` | Rute memanggil `revokeSessionByTokenHash` (`session-repository.ts:119-131`) lalu menghapus cookie `dms_session` dan `dms_active_role` |
| UC-03 | Mengelola Profil dan Kata Sandi | Semua | Profil → `/profile` | `GET /api/users/me`, `POST /api/users/me/change-password`, `POST /api/users/me?avatar=1` (unggah foto), `DELETE /api/users/me?avatar=1` (hapus foto) | Ganti kata sandi: minimal 8 karakter, baru harus beda dari lama (400), lama salah 400; semua sesi pengguna dicabut (termasuk yang sedang dipakai) lalu diarahkan ke `/login?password_changed=1`. Foto: rute memanggil modul `profile-avatar.ts` langsung (jpeg/png/webp, ≤ 2 MB, cek *signature*) |
| UC-04 | Berpindah Peran Aktif | Peran operasional | header (`AppLayout.tsx:332`) | `POST /api/auth/role-switch` | Hanya mengubah ruang kerja UI |
| **M2 Pengajuan Dokumen** |||||
| UC-05 | Mengajukan Dokumen | Pegawai | Ajukan Dokumen → `/pegawai/dokumen/aju` | `GET /api/users/me/is-ketua-tim/$kegiatanId`, `GET /api/master-kelengkapan?kegiatan_id&is_ketua_tim`, `POST /api/upload`, `POST /api/dokumen/submit` | Status Ketua Tim dibaca saat kegiatan dipilih. Daftar kelengkapan **tidak disaring per rantai di server** (hanya per kegiatan dan status Ketua Tim); pencocokan 6 kolom dilakukan di peramban (`kelengkapan-match.ts:31-41`), lalu diperiksa ulang server saat submit |
| UC-06 | Mengelola Dokumen yang Diajukan | Pegawai | Dokumen Diajukan → `/pegawai/dokumen` (+ `/$id`, `/$id/edit`) | `GET/PATCH/DELETE /api/dokumen/$id` | Ubah/hapus hanya non-material Tersimpan |
| UC-07 | Merevisi Dokumen yang Ditolak | Pegawai | Revisi Dokumen → `/pegawai/revisi`, `/pegawai/dokumen/$id/revisi` | `PATCH /api/dokumen/$id`, `POST /api/dokumen/$id/submit` | Satu tombol "Ajukan Ulang" (dengan dialog konfirmasi) menjalankan PATCH `{lampiranUrls, nominalRealisasi}` lalu POST submit; bila PATCH gagal, POST tidak dikirim. Dokumen Material tidak punya kolom keterangan |
| UC-08 | Membersihkan Lampiran Dokumen Non-Material | Ketua Tim | PJ Kegiatan › Pembersihan Dokumen → `/pegawai/pembersihan-dokumen` | `POST /api/pembersihan-dokumen/bersihkan` | |
| **M3 Persetujuan Berjenjang** |||||
| UC-09 | Memvalidasi Dokumen | PPK | Validasi Dokumen → `/ppk/inbox`, `/ppk/dokumen/$id` | `POST /api/ppk/dokumen/$id/{approve,reject}` | |
| UC-10 | Menindaklanjuti Dokumen yang Ditolak PPSPM | PPK | Revisi Dokumen → `/ppk/revisi`, `/ppk/dokumen/$id/resubmit` | `PATCH/POST /api/ppk/resubmit/$id`, `POST /api/ppk/kembalikan/$id` | |
| UC-11 | Menyetujui Dokumen | PPSPM | Persetujuan Dokumen → `/ppspm/inbox`, `/ppspm/dokumen/$id` | `POST /api/ppspm/dokumen/$id/{approve,reject}` | |
| UC-12 | Melihat Dokumen yang Telah Diproses | PPK, PPSPM | Dokumen Tervalidasi `/ppk/tervalidasi`, Dokumen Tidak Valid `/ppk/ditolak`, Dokumen Ditolak `/ppspm/ditolak`, Dokumen Selesai `/ppspm/selesai` | GET per halaman | |
| **M4 Pemberkasan** |||||
| UC-13 | Mengklasifikasikan Dokumen ke Berkas | KSBU | Pengklasifikasian Dokumen → `/kasubag/inbox`, `/kasubag/dokumen/$id` | `POST /api/kasubag/dokumen/$id/archive` | + pilih **Tahun Anggaran**: formulir mengisinya awal dengan tahun dokumen, KSBU bebas memilih TA lain, **tanpa peringatan** bila berbeda (K-12). Rute menyaring Cara Pembayaran layak dengan dua kueri (`master_klasifikasi_arsip` aktif, `berkas_arsip` per TA) lalu fungsi murni `filterKlasifikasiTreeForBerkasSelection` |
| UC-14 | Menambahkan Dokumen tanpa Alur Persetujuan | KSBU | Penambahan Dokumen → `/kasubag/penambahan-arsip` | `POST /api/upload` (tertunda), `POST /api/kasubag/manual-arsip` | + Tahun Anggaran; **minimal 1 lampiran** (maksimal 5), sama dengan UC-05 |
| UC-15 | Mengelola Berkas | KSBU | Berkas Terbuka `/kasubag/berkas`, Berkas Tertutup `/kasubag/berkas/tertutup`, detail `/kasubag/berkas/$id` | `/api/kasubag/berkas/**` (close, export-zip) | |
| UC-16 | Membersihkan File Berkas | KSBU | Pembersihan Berkas → `/kasubag/pembersihan` | `POST /api/kasubag/berkas/$id/lifecycle` | |
| UC-17 | Mengelola Klasifikasi Dokumen | KSBU | Master Klasifikasi Dokumen → `/kasubag/klasifikasi` | `/api/kasubag/klasifikasi(/$id)` | |
| **M5 Pelaporan dan Pemantauan** |||||
| UC-18 | Melihat Laporan Saya | Pegawai | Laporan Saya → `/pegawai/laporan/saya` | `GET /api/laporan/saya`, `POST …/export-zip?mode=ticket` + `GET …/export-zip?ticket=` | Filter periode, bawaan **Bulanan**; filter Status Material/Non-Material (D-30); ZIP diunduh secara bawaan browser (D-31) |
| UC-19 | Melihat Laporan Kegiatan | Ketua Tim | PJ Kegiatan › Laporan Kegiatan → `/pegawai/laporan/kegiatan` | `GET /api/laporan/kegiatan` (tanpa `scope`; bawaan server Selesai dan Tersimpan), `GET /api/dokumen/$id`, `GET /api/laporan/manual-arsip/$id` | Filter periode (dasar: tanggal dokumen), bawaan **Triwulan**; filter Status Material/Non-Material (D-30). Sejak D-28 (`93eeb17`) memuat dokumen tambahan KSBU dari kegiatan yang dipimpin, ditandai "Penambahan Dokumen (KSBU)", dengan detail + Preview/Unduh lampiran. Dokumen yang berkasnya dimusnahkan tetap tampil, tetapi nominalnya tidak dihitung. Total sama dengan Nominal Realisasi. Ekspor ZIP ikut memuat dokumen tambahan KSBU (D-29) dan diunduh secara bawaan browser (D-31) |
| UC-25 | **Memantau Dokumen Tim** | Ketua Tim | PJ Kegiatan › Monitoring Dokumen Tim → `/pegawai/monitoring-dokumen-tim` | `GET /api/laporan/kegiatan?scope=monitoring` | ✅ **Diputuskan (Q1): UC baru**, bukan alur alternatif UC-19. **Belum ada di kerangka Bab IV** — tambahkan sebagai UC-25 di kerangka (lihat D-21). |
| UC-20 | Memantau Nominal Realisasi | PPK, PPSPM | Nominal Realisasi → `/ppk/monitoring-realisasi`, `/ppspm/monitoring-realisasi` | `GET /api/laporan/kinerja`, `GET /api/dokumen/$id`, `GET /api/laporan/manual-arsip/$id` | Turut menghitung dokumen tambahan KSBU (D-26, `37517ff`), ditandai "Penambahan Dokumen (KSBU)". Dokumen yang berkasnya dimusnahkan tidak ditampilkan. Drill-down sampai Komponen. Detail + lampiran bisa di-Preview/Unduh untuk semua dokumen (`e6ba99c`). Periode bawaan Triwulan, ada mode Bulanan |
| UC-21 | Melihat Laporan Kinerja | PJ Kinerja | Laporan Kinerja → `/penanggung-jawab-kinerja/laporan-kinerja` | `GET /api/laporan/kinerja?scope=laporan_kinerja`, `GET /api/dokumen/$id`, `GET /api/laporan/manual-arsip/$id` | Material Selesai + semua non-material Tersimpan (termasuk yang lampirannya dibersihkan) + dokumen tambahan KSBU (`e6ba99c`, D-29). Dokumen yang berkasnya dimusnahkan tampil dengan penanda, nominalnya tidak dihitung. Drill-down cukup sampai Kegiatan; label dan filter Status Material/Non-Material; badge "File Dibersihkan" (D-30). Detail + lampiran Preview/Unduh; periode bawaan Triwulan |
| **M6 Administrasi Sistem** |||||
| UC-22 | Mengelola Pengguna dan Penugasan Ketua Tim | Admin | Master User → `/admin/master-data/user` | `/api/users/**`, `/api/ketua-tim/**` | Kata sandi awal **diisi Admin** (≥ 8 karakter); keunikan username/NIP ditegakkan constraint (409). Penugasan Ketua Tim `POST /api/ketua-tim/` (`{user_id, kegiatan_id}`) bersifat *upsert*: **bila kegiatan sudah punya Ketua Tim, penugasan baru menggantikannya** tanpa peringatan (201, `ketua-tim/index.ts:119-133`); mencabut lewat `DELETE /api/ketua-tim/?id=` |
| UC-23 | Mengelola Data Master | Admin | Departemen Fungsi, Master Kegiatan, Master Komponen, Jenis Permintaan, Kategori Permintaan, Detail Permintaan, Kelengkapan Dokumen → `/admin/master-data/*` | `/api/master-*` | **Hapus "jenis dokumen"** dari deskripsi UC-23. Semua GET `/api/master-*` memakai `requireAnyLocalSession` (tanpa peran). Penonaktifan (`DELETE`, *soft*, `is_active = false`) **tidak memeriksa apakah data masih dirujuk** (K-11); Kelengkapan dihapus fisik |
| UC-24 | Mengatur Tampilan Aplikasi | Admin | **Pengaturan Aplikasi** → `/admin/settings` | `/api/settings/{theme,general,epoch}` | Tema `se`/`sp`/`st` (`src/lib/schemas/settings.ts:3`). Label menu diganti dari "Settings" (D-5, `e4abe5a`); path tidak berubah. |

Fungsi yang ada di menu tetapi di luar 25 UC:
- **Log Aktivitas** (dulu berlabel "Activity Log", D-5) untuk enam peran. Lingkup: sendiri, atau semua untuk Admin dan PJ Kinerja.
- **Dashboard** per peran.
- **Bantuan** (`/bantuan`).

✅ **D-5 selesai** (`e4abe5a`). Menu "Settings" tanpa tujuan sudah dihapus dari 5 peran non-admin; untuk Admin labelnya diganti "Pengaturan Aplikasi" (path tetap `/admin/settings`).

## B.2 Tabel transisi status dokumen (`src/lib/fsm.ts`)

Status (`src/lib/constants/document-status.ts:1-8`): `DRAFT`, `IN_PPK_VALIDATION`, `IN_PPSPM_APPROVAL`, `NEED_REVISION`, `COMPLETED`, `TERSIMPAN`. Aksi (`fsm.ts:35-42`): `SUBMIT`, `APPROVE`, `REJECT`, `RESUBMIT`, `RESUBMIT_PPK`, `KEMBALIKAN`.

| # | Status asal | Aksi | Aktor | Status tujuan | `current_step` | `revision_target` | Tahap | Prasyarat (modul transisi + rute) | Aksi riwayat | Baris |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | DRAFT | SUBMIT | PEGAWAI | IN_PPK_VALIDATION | PPK | null | 1 | material; ≥1 lampiran; kelengkapan wajib; nominal > 0; komponen terisi; bila mengaku Ketua Tim harus ditugaskan | `SUBMIT` | 20-25 |
| 2 | IN_PPK_VALIDATION | APPROVE | PPK | IN_PPSPM_APPROVAL | PPSPM | null | 2 | peran PPK; penjaga konflik | `PPK_APPROVE` | 26-31 |
| 3 | IN_PPK_VALIDATION | REJECT | PPK | NEED_REVISION | PPK | **USER** | 1 | catatan 10–2000 karakter | `PPK_REJECT` | 32-37 |
| 4 | IN_PPSPM_APPROVAL | APPROVE | PPSPM | COMPLETED | null | null | 2 | peran PPSPM; penjaga konflik | `PPSPM_APPROVE` | 38-43 |
| 5 | IN_PPSPM_APPROVAL | REJECT | PPSPM | NEED_REVISION | PPSPM | **PPK** | 1 | catatan 10–2000 karakter | `PPSPM_REJECT` | 44-49 |
| 6 | NEED_REVISION | RESUBMIT | PEGAWAI | IN_PPK_VALIDATION | PPK | null | 1 | `revision_target = USER` (`fsm.ts:104-109`); pemilik; material; `validateResubmitRequirements` (dijalankan di rute **sesudah** `transition`, `dokumen.$id.submit.ts:112-142`) | `RESUBMIT` | 50-55 |
| 7 | NEED_REVISION | RESUBMIT_PPK | PPK | IN_PPSPM_APPROVAL | PPSPM | null | 2 | `revision_target = PPK` (`:110-115`); `validateResubmitRequirements` | `RESUBMIT_PPK` | 56-61 |
| 8 | NEED_REVISION | KEMBALIKAN | PPK | NEED_REVISION | PPK | **USER** | 1 | `revision_target = PPK` (dicek rute, `kembalikan/$id.ts:76`) | `PPK_KEMBALIKAN` | 62-67 |
| — | DRAFT | *(tanpa aksi modul transisi)* | PEGAWAI | **TERSIMPAN** | null | null | 1 | non-material; ≥1 lampiran; Nama Dokumen terisi | `STORE` | `local-submit-write-bridge.ts:436-450` |

Pemeriksaan di `transition()` (`fsm.ts:87-124`), berurutan:
1. Aktor berhak.
2. Pada REJECT, `revisionTarget` harus USER atau PPK.
3. Pada RESUBMIT, target saat ini harus USER.
4. Pada RESUBMIT_PPK, target saat ini harus PPK.
5. Kunci `status:aksi` terdaftar.

**Urutan di rute (diverifikasi 30 Sept).** Approve/reject PPK: asal → sesi → PPK → skema → UUID → baca dokumen → status harus `IN_PPK_VALIDATION` (400) → `transition` → transaksi dengan pembaruan bersyarat (0 baris → 409). PPSPM sama, ditambah pemeriksaan riwayat `PPSPM_APPROVE` (approve: "Dokumen sudah pernah disetujui", 400). Kirim ulang Pegawai: asal → sesi → PEGAWAI → UUID → baca dokumen → pemilik (403) → status `NEED_REVISION` dan target `USER` (400) → material (400) → `transition` → `validateResubmitRequirements` (400) → transaksi bersyarat → `RESUBMIT`. Perbaikan (`PATCH`) memindahkan file lebih dulu, lalu memperbarui basis data, lalu menghapus lampiran lama yang tidak dirujuk.

Status akhir adalah `COMPLETED` dan `TERSIMPAN`. `COMPLETED` tidak berubah saat diberkaskan.

## B.3 State berkas (`status_berkas` × `status_arsip`)

| `status_berkas` | `status_arsip` | Label | Aksi keluar (aktor KSBU) | Tujuan | Peristiwa riwayat |
|---|---|---|---|---|---|
| — | — | (belum ada) | klasifikasi / penambahan dokumen / `POST /api/kasubag/berkas/open` | OPEN, NULL | `BERKAS_DIBUKA` |
| OPEN | NULL (wajib) | Terbuka | Tutup Berkas (Nomor SPM + Masa Simpan) | CLOSED, AKTIF | `BERKAS_DITUTUP` |
| CLOSED | AKTIF | Tersimpan | `propose_destruction` | CLOSED, USUL_MUSNAH | `BERKAS_DIPINDAHKAN_KE_USUL_MUSNAH` |
| CLOSED | USUL_MUSNAH | Usul Pembersihan | `cancel_proposal` | CLOSED, AKTIF | `METADATA_ARSIP_AKTIF_DIPERBARUI` |
| CLOSED | USUL_MUSNAH | Usul Pembersihan | `approve_destruction` + frasa `BERSIHKAN FILE BERKAS` | CLOSED, DIMUSNAHKAN | `BERKAS_DIMUSNAHKAN` |
| CLOSED | DIMUSNAHKAN | File Dibersihkan | — (akhir) | — | — |
| CLOSED | INAKTIF | — | nilai enum mati; tidak pernah dituju | — | — |

Constraint yang menjaga state ini (`berkas-arsip.ts:62-76`):
- `status_berkas ∈ {OPEN, CLOSED}`;
- `status_arsip ∈ {AKTIF, INAKTIF, USUL_MUSNAH, DIMUSNAHKAN}` atau NULL;
- OPEN ⇒ `status_arsip` NULL;
- OPEN ⇔ `closed_at`/`closed_by` NULL, CLOSED ⇔ keduanya terisi.

Pemetaan aksi ke peristiwa ada di `berkas-arsip-service.ts:988-999`.

**Dokumen tambahan KSBU tidak punya status sendiri** (migrasi `0021`). Status arsipnya diturunkan dari `berkas_arsip.status_arsip` lewat `berkas_arsip_item` (`manualArsipEffectiveStatusArsip`, `src/lib/archive/manual-arsip-effective-status.ts:18-24`): AKTIF selama berkas masih Terbuka atau dokumen belum diberkaskan. Karena itu tabel di atas berlaku juga untuk dokumen tambahan. Rute `POST /api/kasubag/berkas/open` tidak dipanggil halaman mana pun; berkas dibuat otomatis saat dokumen pertama diklasifikasikan atau ditambahkan.

## B.4 Tabel untuk ERD

Konvensi: PK `id uuid` kecuali disebut lain. **FK** = foreign key fisik. **Logis** = relasi tanpa FK. `R` = `ON DELETE restrict`, `C` = cascade, `SN` = set null, `NA` = no action.

**Skema `auth`**

| Tabel | Kolom kunci | Constraint / index | FK |
|---|---|---|---|
| `users` | `username`, `email` (nullable), `password_hash`, `password_hash_algorithm` (default `argon2id`), `nama_lengkap`, `display_name`, `nip_nrp`, `departemen` (teks), `avatar_*`, `is_active`, `deactivated_at/by`, `last_login_at` (tersedia, **tidak pernah diisi aplikasi**) | UNIQUE `username`, UNIQUE `nip_nrp`; CHECK format username (migrasi 0017) | `deactivated_by` → users: **logis** |
| `roles` | `nama` | UNIQUE `nama` | — |
| `user_roles` | PK komposit (`user_id`, `role_id`) | — | `user_id` → users (C); `role_id` → roles (C) |
| `sessions` | `token_hash`, `expires_at` (selalu 8 jam), `revoked_at`, `remember_me` (sisa rancangan lama; selalu `false`), `user_agent`, `ip_address` | UNIQUE `token_hash` | `user_id` → users (C) |

**Skema `master`**

| Tabel | Kolom kunci | Constraint / index | FK |
|---|---|---|---|
| `master_fungsi` | `nama`, `is_active` | UNIQUE `nama` | — |
| `master_kegiatan` | `fungsi_id`, `nama` | UNIQUE (`fungsi_id`, `nama`) WHERE aktif | `fungsi_id` → fungsi (R) |
| `master_komponen` | `kegiatan_id`, `nama` | UNIQUE (`kegiatan_id`, `nama`) WHERE aktif | `kegiatan_id` → kegiatan (R) |
| `master_jenis_permintaan` | `nama` | UNIQUE `nama` WHERE aktif | — (global) |
| `master_kategori_permintaan` | `jenis_permintaan_id`, `nama` | UNIQUE (`jenis`, `nama`) WHERE aktif | → jenis (R) |
| `master_detail_permintaan` | `kategori_permintaan_id`, `nama` | UNIQUE (`kategori`, `nama`) WHERE aktif | → kategori (R) |
| `master_kelengkapan_dokumen` | `kegiatan_id`, `is_ketua_tim`, `nama_dokumen`, `required`, `komponen_id`, `jenis/kategori/detail_permintaan_id` | CHECK kategori⇒jenis, detail⇒kategori; INDEX rantai 6 kolom | kegiatan (C); komponen, jenis, kategori, detail (R) |
| `ketua_tim_assignments` | `user_id`, `kegiatan_id`, `created_by` | UNIQUE `kegiatan_id` | user (C); kegiatan (C); `created_by` → users (SN) |

**Skema `dokumen`**

| Tabel | Kolom kunci | Constraint / index | FK |
|---|---|---|---|
| `dokumen_transaksi` | `judul`, `status` (default DRAFT), `current_step`, `revision_target`, `revision_notes`, `lampiran_urls` (jsonb: `kelengkapan_id`, `nama`, `url`, `uploaded_at`), `tahun`, `tanggal` (teks), `is_ketua_tim`, `is_non_material`, `nama_dokumen`, `keterangan_detail`, `nominal_realisasi` NUMERIC(15,2), `lampiran_dibersihkan_at/by/alasan` | CHECK nominal NULL atau ≥ 0; CHECK alasan ∈ {`BERKAS_DIMUSNAHKAN`, `PEMBERSIHAN_NON_MATERIAL`}; 17 index | `fungsi_id` (R), `kegiatan_jenis_id` → kegiatan (R), `komponen_id` (R), `created_by` → users (NA), `lampiran_dibersihkan_by` → users (SN), `jenis_permintaan_id` → master_jenis_permintaan (R), `kategori_permintaan_id` → master_kategori_permintaan (R), `detail_permintaan_id` → master_detail_permintaan (R) (FK sejak migrasi 0020, D-20) |
| `log_aktivitas` | `aksi`, `catatan`, `step_urutan`, `timestamp` | INDEX (`dokumen_id`, `timestamp`) | `dokumen_id` (C), `user_id` (NA) |

Lampiran dokumen **bukan tabel**: disimpan sebagai array JSON di `lampiran_urls`, dan indeks array menjadi identitas lampiran.

**Skema `arsip`**

| Tabel | Kolom kunci | Constraint / index | FK |
|---|---|---|---|
| `master_klasifikasi_arsip` | `nama`, `kode`, `parent_id`, `is_active` | UNIQUE `nama`; UNIQUE `kode` WHERE not null | `parent_id` → dirinya (SN) |
| `berkas_arsip` | `klasifikasi_id`, **`tahun_anggaran`**, snapshot kode/nama klasifikasi, `status_berkas`, `status_arsip`, `nomor_spm`, `retensi_aktif`, `masa_aktif_berakhir`, `closed_at/by` | **UNIQUE (`klasifikasi_id`, `tahun_anggaran`)**; CHECK TA 2000–2100 + 4 CHECK state (B.3) | klasifikasi (R), `closed_by`/`created_by` → users (NA) |
| `berkas_arsip_item` | `berkas_id`, `source_type` (WORKFLOW/MANUAL), `dokumen_id`, `manual_arsip_id`, `added_by` | UNIQUE `dokumen_id` WHERE not null; UNIQUE `manual_arsip_id` WHERE not null; CHECK tepat satu referensi sesuai tipe | berkas, dokumen, manual_arsip, users (NA) |
| `berkas_arsip_activity` | `event_type`, `actor_user_id`, `source_type`, `workflow_document_id`, `manual_document_id`, `metadata_snapshot` | CHECK 8 jenis peristiwa; CHECK referensi sesuai tipe | berkas, users, dokumen, manual_arsip (NA) |
| `manual_arsip` | `nama`, `tanggal`, `keterangan` (wajib), `nominal_realisasi`, `fungsi/kegiatan/komponen_id` (wajib), `klasifikasi_id`. **Tanpa kolom status arsip**: statusnya mengikuti berkas penaung lewat `berkas_arsip_item` (D-29; `status_arsip` dan kolom siklus `inactivated_*`, `proposed_destroy_*`, `destroyed_*` dihapus di migrasi `0021`) | CHECK nominal ≥ 0 | fungsi, kegiatan, komponen (R); klasifikasi (SN); users (NA) |
| `manual_arsip_attachment` | `logical_path`, `original_filename`, `judul_lampiran`, `content_type`, `size_bytes` | CHECK ukuran ≥ 0; CHECK judul tidak kosong | manual_arsip, users (NA) |

**Skema `audit` dan `app`**

| Tabel | Kolom kunci | Constraint | FK |
|---|---|---|---|
| `audit.audit_log` | `entity_type` (hanya `DOKUMEN`), **`entity_id`**, `aksi` (3 nilai), `metadata_snapshot` | CHECK entity_type & aksi | `actor_user_id` → users (SN); **`entity_id`: logis, sengaja tanpa FK** |
| `app.app_settings` | PK `key` (teks), `value` jsonb | — | **`updated_by`: logis** |

Catatan ERD:
- **Kolom tahun berbeda.** Dokumen punya `tahun`, dari tahun pengajuan. Berkas punya `tahun_anggaran`, yang dipilih KSBU. Keduanya tidak dihubungkan oleh constraint.
- **Tabel migrasi Drizzle.** Tabel `drizzle.__drizzle_migrations` dibuat oleh drizzle-kit, bukan bagian domain.
- **Kardinalitas lampiran manual.** Relasi `manual_arsip` 1 — N `manual_arsip_attachment`. Aturan "minimal 1, maksimal 5 lampiran" ditegakkan **aplikasi** saat pembuatan (`createManualArsipSchema`), bukan constraint basis data, sehingga dokumen manual lama tanpa lampiran tetap sah secara skema. Di ERD tetap gambarkan **0..N** (`||--o{`, sesuai skema dan `rancangan-erd.md` R-44), lalu beri catatan "minimal 1 lampiran untuk dokumen baru ditegakkan aplikasi sejak `e6ba99c`".
- **Perubahan skema terakhir: migrasi `0021_manual_arsip_drop_own_lifecycle.sql`** (D-29, `ae8a698`), yang menghapus `manual_arsip.status_arsip` (beserta CHECK dan index-nya) serta enam kolom siklus (beserta tiga FK ke `users`). Sebelum dihapus sudah diperiksa bahwa 5 dari 5 baris berstatus AKTIF, tidak ada yang mengisi kolom siklus, dan tidak ada view yang memakainya. Di ERD, status arsip dokumen tambahan KSBU digambarkan sebagai atribut turunan dari `berkas_arsip.status_arsip`, bukan kolom. Pekerjaan filter periode, laporan, dan lampiran manual sebelumnya (`e6ba99c`, D-28) tidak mengubah skema.

## B.5 Urutan pemanggilan untuk 6 diagram sequence (bahan 27 Sept)

> **Diganti (30 Sept).** Gambar *sequence* kini 15 UC, lifeline seragam, dan mengikuti `Rancangan Sequence Diagram 15 UC (30 Sept 2026).md`, yang sudah diverifikasi ulang terhadap kode. Bagian ini dipertahankan sebagai bahan; koreksi sesudah verifikasi ditandai **[30 Sept]** dan dirangkum di blok "Koreksi dan tambahan" di akhir B.5.

**(1) Submit dokumen**: `POST /api/dokumen/submit` (`src/routes/api/dokumen/submit.ts`)
1. `requireSameOrigin` (`:325`) → JSON → `createAndSubmitDokumenSchema.safeParse` (`:334`).
2. `validateNominalForMaterial` (`:343`) → `validateWorkflowChainForCharacteristic` (`:353`).
3. `handleLocalDbSubmit` (`:38`): `getLocalServerSession` → `createLocalSubmitActorFromSession` (harus PEGAWAI) (`:42-51`).
4. `buildSubmitMovePlan` → `preflightSubmitFiles` (file tertunda ada dan milik pengguna) (`:53-70`).
5. `prepareLocalSubmitWriteBridge` (`local-submit-write-bridge.ts:262-352`):
   - `checkLampiranNotEmpty`
   - `getKegiatanById`
   - `checkRequiredKelengkapan` (query exact-match)
   - `hasKetuaTimAssignment` (bila mengaku Ketua Tim)
   - `resolveLocalSubmitLeafName`
   - `buildLocalSubmitTransitionPlan` (`transition(DRAFT, SUBMIT, PEGAWAI)` atau TERSIMPAN langsung)
6. `executeLocalSubmitWritePlan` dalam satu transaksi (`:363-396`):
   - `createDokumen` (DRAFT)
   - `updateDokumenStatus`
   - `appendLog` (SUBMIT/STORE)
   - `afterWrites`: `moveSubmitFilesOrRollback` (tertunda → resmi)
7. Bila transaksi gagal setelah file dipindah: `rollbackLocalAttachmentMovements`. Respons 201 atau 500.

**(2) Unggah lampiran**: `POST /api/upload` (`src/routes/api/upload.ts`)
1. `requireSameOrigin` → `getLocalServerSession` (tanpa cek peran khusus) (`:61-67`).
2. `?cleanup=pending` → cabang pembersihan (`:70`, `:178-269`).
3. `request.formData()` → `file`, `kelengkapan_id`, `nama_dokumen` (`:74-95`).
4. `validateLocalUploadFileMetadata`: ekstensi, MIME, pasangan, ukuran > 0 dan ≤ 5 MB, sanitasi nama (`local-upload.ts:107-140`).
5. `writeLocalUploadContent`: cek ulang ukuran dan **magic bytes**, lalu tulis ke path tertunda `<user>/<kelengkapan>_<ts>_<nama>` (`local-upload.ts:180-197,229-259`).
6. `maybeSweepStalePendingUploads` (fire-and-forget, maksimal sejam sekali) → 201 `{ url, … }`.

**(3) Approve PPK**: `POST /api/ppk/dokumen/$id/approve`
1. `requireSameOrigin` → `getLocalServerSession` → `hasLocalRole(session, 'PPK')` (403) (`:27-36`).
2. `approveDokumenSchema.safeParse` (`:46`) → SELECT dokumen (`:60-66`).
3. Status harus `IN_PPK_VALIDATION`, bila tidak 400 (`:79-83`) **[30 Sept]**; lalu `transition(status, 'APPROVE', 'PPK')` (`:86`).
4. Transaksi (`:94-116`):
   - `UPDATE dokumen_transaksi SET status=IN_PPSPM_APPROVAL, current_step=PPSPM … WHERE id=$id AND status='IN_PPK_VALIDATION'`; bila 0 baris → konflik;
   - `INSERT log_aktivitas (aksi 'PPK_APPROVE')`.
5. 200.

**(4) Klasifikasi dokumen ke berkas**: `POST /api/kasubag/dokumen/$id/archive`
1. `requireSameOrigin` → sesi → `hasLocalRole(KEPALA_SUB_BAGIAN_UMUM)` (`:52-57`).
2. Zod (`klasifikasi_id`, `tahun_anggaran` 2000–2100) (`:65-76`).
3. SELECT dokumen; tolak bila bukan COMPLETED (`:102-103`).
4. `db.transaction` (`:106-117`):
   - `getOrCreateOpenBerkasForKlasifikasi`: validasi daun, lalu `resolveExistingBerkasForKlasifikasi` (tolak bila tertutup), lalu `insertOpenBerkas … ON CONFLICT DO NOTHING` dan baca ulang bila kalah balapan (`berkas-arsip-service.ts:249-272,630,851-876`);
   - `addWorkflowDocumentToOpenBerkas`: INSERT `berkas_arsip_item` (WORKFLOW), dengan unique `dokumen_id` mencegah duplikasi;
   - INSERT `berkas_arsip_activity` (BERKAS_DIBUKA bila baru, lalu DOKUMEN_PERSETUJUAN_DIKLASIFIKASIKAN).
5. 200.

**(5) Akses lampiran**: dua langkah
1. Klien memanggil `GET /api/dokumen/$id/preview/$lampiranIndex` (atau `/download/`, atau `/api/ppk|ppspm/dokumen/$id/...`). Rute ini menjalankan `createDocumentLampiranAccessUrlResponse` (`document-file-access.ts:61-135`):
   - sesi (401);
   - validasi UUID dan indeks (404);
   - `loadDocumentAccessContext`;
   - `canRouteAccessDocument` / `canSessionReadDocument` (403);
   - `resolveDocumentLampiranReference`: 410 bila lampiran dibersihkan atau berkas dibersihkan (`:266-300`);
   - `createInternalFileAccessUrl`: token HMAC `v1.<payload>.<sig>` dengan `expiresAt` +15 menit atau +1 jam;
   - respons `{ signedUrl }`.
2. Browser membuka `GET /api/files/access?token=…`. Rute ini menjalankan `handleInternalFileAccessRequest` (`internal-file-access.ts:82-`):
   - verifikasi tanda tangan (`timingSafeEqual`) dan kedaluwarsa;
   - sesi masih sah serta cocok dengan `subjectUserId`/`sessionId` (`:100`);
   - status diperiksa ulang: 410 bila sudah dibersihkan (`:175-189`);
   - `readLocalLogicalPathFile` (normalisasi path, anti traversal);
   - stream file dengan `secureHeaders` dan `Content-Disposition`.

   Varian untuk **lampiran dokumen tambahan KSBU** di laporan (satu langkah, tanpa token HMAC): `ManualArsipAttachmentViewer` memanggil `GET /api/laporan/manual-arsip/$id/attachments/$attachmentId/preview` (atau `/download`) → `requireLaporanManualArsipSession` (401 tanpa sesi, 403 bila bukan PJ Kinerja/PPK/PPSPM/KSBU atau Ketua Tim dari kegiatan dokumen itu; pemeriksaan ini ada di modul `src/lib/manual-arsip.ts:223-262`, bukan di rute) → validasi UUID (404) → `createManualArsipAttachmentFileResponse` (`src/lib/manual-arsip.ts:890-957` **[30 Sept]**: 404 bila lampiran tidak ada, 410 bila `DIMUSNAHKAN`, cek tipe konten dan path aman) → isi file dikirim langsung. Browser mengubahnya menjadi blob untuk pratinjau PDF atau unduhan.

**(6) Pembersihan non-material**: `POST /api/pembersihan-dokumen/bersihkan`
1. `requireSameOrigin` → sesi → `hasLocalRole('PEGAWAI')` (`:32-39`).
2. `bodySchema.strict()`: `dokumen_ids` 1–200 UUID, `confirmation` = `'BERSIHKAN'` (`:14-19,42-45`).
3. SELECT `ketua_tim_assignments` milik pengguna; 403 bila kosong (`:47-62`).
4. `executePembersihanLampiran` (`pembersihan-service.ts:130-239`):
   - `listCandidatesByIds` + `listDokumenIdsInBerkasArsip`;
   - `buildPembersihanPlan` (5 alasan tolak);
   - `loadProtectedLogicalPaths` (path yang dirujuk baris lain);
   - `deleteLogicalFilesSafely` (hapus file, idempoten untuk file hilang);
   - `applyCleanup` dalam transaksi: UPDATE `lampiran_dibersihkan_at/by/alasan='PEMBERSIHAN_NON_MATERIAL'` + INSERT `audit_log (DOKUMEN_LAMPIRAN_DIBERSIHKAN)` (`:345-360`).
5. 200 `{ report: requested / cleaned / skipped / failed }`.

**Koreksi dan tambahan urutan (30 Sept, dari verifikasi langkah 5).**

- **Login** (`POST /api/auth/login`): same-origin (`login.ts:23-24`) → skema → batas percobaan (`:41-50`) → cari akun (username atau NIP) → status akun aktif (403) → Argon2id → peran (403) → sesi 8 jam + cookie. Hanya 401 yang dihitung; ke-5 → 429. `last_login_at` tidak ditulis.
- **Logout**: `revokeSessionByTokenHash` lalu hapus cookie sesi dan peran. **Berpindah peran** (`role-switch.ts`): asal → skema (400) → sesi (401) → peran valid (403) → bukan ADMIN (403) → peran dimiliki (403) → 200 + cookie.
- **Ganti kata sandi** (`local-user-passwords.ts:48-94`): baca hash → verifikasi lama (400) → baru ≠ lama (400) → hash Argon2id → simpan → `revokeAllUserSessions` (sesi saat ini ikut dicabut) → rute hapus cookie.
- **Pengajuan**: status Ketua Tim `GET /api/users/me/is-ketua-tim/$kegiatanId` (sesi 401 → UUID 400 → ORM); kelengkapan `GET /api/master-kelengkapan` (sesi saja; per kegiatan dan status Ketua Tim, tanpa rantai).
- **Detail dokumen**: PPK `GET /api/ppk/dokumen/$id` (sesi → PPK → UUID → baca dokumen + `log_aktivitas`; status harus IN_PPK_VALIDATION/IN_PPSPM_APPROVAL/NEED_REVISION/COMPLETED). PPSPM `GET /api/ppspm/dokumen/$id` (juga membaca `PPK_APPROVE` untuk tanggal validasi). Pegawai `GET /api/dokumen/$id` membaca dokumen lebih dulu, baru `canSessionReadDokumen`; **riwayat dimuat terpisah** lewat `GET /api/dokumen/$id/log`.
- **Pemberkasan** (`GET /api/kasubag/klasifikasi`): rute membaca sendiri klasifikasi aktif dan berkas per TA, lalu memanggil fungsi murni penyaring; TA diisi awal dari tahun dokumen dan dapat diganti KSBU.
- **Ekspor ZIP laporan**: POST (asal → sesi → skema → > 500 dokumen 413 → tiket) lalu GET (`consumeDownloadTicket`, 410 bila tidak berlaku). Otorisasi ulang dokumen dilakukan **di rute**; modul `document-zip.ts` membaca file sendiri (`createReadStream`), melewati file > 250 MB, dan menulis `DAFTAR_ISI.txt`.
- **Admin**: `GET /api/users/` (sesi 401 → ADMIN 403 → `getLocalUsersWithRoles`); tambah pengguna: kata sandi awal dari Admin, satu transaksi (baca peran, `INSERT users`, ganti `user_roles`), pelanggaran unik → 409. Penugasan Ketua Tim `POST /api/ketua-tim/`: *upsert*, 201. Master data: rute memakai ORM langsung (asal → skema → sesi/peran → induk aktif 400 → nama aktif ganda 409 → simpan); tidak ada modul layanan dan tidak ada pemeriksaan rujukan saat menonaktifkan.
- **Log Aktivitas**: rute membaca `log_aktivitas` dan riwayat berkas langsung dari basis data lalu menggabung dan membatasi 500 baris (`activity-log.ts:12, 76-141`); tidak ada modul layanan.

---

# C. Fakta untuk Bab V

## C.1 Versi dependensi utama

Versi terpasang dibaca dari `node_modules/<pkg>/package.json` pada 27-09-2026. Beberapa paket dideklarasikan `latest` di `package.json`, sehingga versi pasti bergantung pada `pnpm-lock.yaml`.

| Paket | Deklarasi | Terpasang |
|---|---|---|
| react / react-dom | ^19.2.0 | 19.2.4 |
| @tanstack/react-start | latest | 1.167.16 |
| @tanstack/react-router | latest | 1.168.10 |
| nitro | npm:nitro-nightly@latest | 3.0.1-20260329-223454-55f30f48 |
| vite | ^7.3.1 | 7.3.1 |
| typescript | ^5.7.2 | 5.9.3 |
| drizzle-orm | ^0.45.2 | 0.45.2 |
| drizzle-kit | ^0.31.10 | 0.31.10 |
| pg (driver PostgreSQL) | ^8.20.0 | 8.20.0 |
| zod | ^4.3.6 | 4.3.6 |
| argon2 | ^0.44.0 | 0.44.0 |
| archiver (ZIP) | ^8.0.0 | 8.0.0 |
| tailwindcss | ^4.1.18 | 4.2.2 |
| @base-ui/react | ^1.3.0 | 1.3.0 |
| vitest | ^3.0.5 | 3.2.4 |
| @playwright/test | ^1.59.1 | 1.59.1 |
| PostgreSQL (Docker) | `postgres:16` | `infra/docker/postgres/docker-compose.yml` |

## C.2 Struktur direktori

```
src/
├── routes/            file-based routing (TanStack Start)
│   ├── api/           97 berkas handler HTTP (same-origin → sesi → peran → Zod → layanan)
│   ├── pegawai/ ppk/ ppspm/ kasubag/ penanggung-jawab-kinerja/   halaman per peran
│   ├── admin.*.tsx    halaman admin (flat route)
│   └── login.tsx, bantuan.tsx, profile.tsx, forbidden.tsx
├── components/        65 komponen (ui/, layout/, dokumen/, laporan/, kinerja/, arsip/, activity-log/, …)
├── lib/               113 modul domain: fsm.ts, auth/, users/, dokumen/, archive/, storage/,
│                      export/, laporan/, master-data/, schemas/ (Zod), security/, upload/, constants/
├── db/                client, schema/{auth,master,dokumen,arsip,audit,app}, seed/
├── hooks/  config/navigation.ts  scripts/ (generate-password-hash, sweep-pending-uploads)
drizzle/               0000–0021 migrasi SQL + meta/_journal.json
tests/                 fsm.test.ts, unit/** (Vitest), integration/** (Vitest + Postgres asli), e2e/** (Playwright)
infra/docker/postgres/ docker-compose + init/001-create-schemas.sql
```

## C.3 Jumlah berkas dan baris per lapisan

Dihitung dari `.ts`/`.tsx` non-tes pada 29-09-2026 (setelah `ae8a698`, D-29 s.d. D-31). Baris = semua baris termasuk baris kosong.

| Lapisan | Lokasi | Berkas | Baris |
|---|---|---|---|
| Presentasi: halaman | `src/routes/**` selain `api/` (`.tsx`, termasuk `-components/`) | 68 | 27.246 |
| Presentasi: komponen | `src/components/` | 65 | 13.995 |
| Endpoint | `src/routes/api/` | 97 | 13.229 |
| Domain / layanan | `src/lib/` | 113 | 20.147 |
| Data | `src/db/` | 32 | 1.582 |
| Lainnya | `src/hooks/` 4 (207), `src/config/` 1 (223), `src/scripts/` 2 (74) | 7 | 504 |
| Migrasi | `drizzle/*.sql` | 22 | — |

Halaman per peran (berkas `.tsx`, termasuk layout dan `-components/`): pegawai 13, ppk 10, ppspm 7, kasubag 11, PJ Kinerja 3, admin 13.

## C.4 Pengujian

**Hasil run Vitest** (`pnpm test` = `vitest run`, 02-10-2026, setelah 3 kasus white-box FSM ditambahkan, `maxWorkers: 4` di `vitest.config.ts`):
- **115 berkas tes lulus dari 115**;
- **1.224 kasus lulus, 1 dilewati, 0 gagal** (1.225 total);
- `tsc --noEmit` bersih;
- riwayat:
  - `043449d` (sebelum perbaikan Bagian D): 108 berkas, 1.060 lulus + 1 dilewati;
  - setelah perbaikan Bagian D dan D-26: 112 berkas, 1.160 lulus + 1 dilewati;
  - `e6ba99c` + D-27: 113 berkas, 1.191 lulus + 1 dilewati (+`tests/unit/laporan/manual-arsip-route.test.ts`; mode Bulanan, akses PJ Kinerja, rute baca dokumen manual, lampiran manual wajib, guard tampilan);
  - setelah D-16: 112 berkas, 1.179 lulus + 1 dilewati. Tes rute `rename-pending` yang dihapus ikut dihapus, begitu pula tes cabang `MULTIPLE_OPEN_BERKAS`, dan dua tes dry-run diganti tes "parameter diabaikan";
  - D-28 (`93eeb17`): 113 berkas, 1.200 lulus + 1 dilewati (+`tests/unit/laporan/kegiatan-route.test.ts`: dokumen tambahan KSBU per kegiatan, penanda dimusnahkan, tanpa Komponen, kesamaan total dengan Nominal Realisasi; `manual-arsip-route.test.ts` diperluas untuk akses Ketua Tim dan respons 410);
  - D-29 s.d. D-31 (`ae8a698`): 115 berkas, 1.221 lulus + 1 dilewati (+`tests/unit/laporan/status-laporan.test.ts`: label dan filter Status, Laporan Kinerja sampai Kegiatan, badge File Dibersihkan; +`tests/unit/laporan/download-ticket.test.ts`: tiket sekali pakai, kedaluwarsa, terikat pengguna; `kegiatan-route.test.ts` diperluas: status arsip mengikuti berkas, Laporan Kinerja menampilkan dokumen dimusnahkan dan non-material yang dibersihkan dengan total tetap sama, ekspor ZIP dokumen tambahan KSBU, alur tiket POST → GET; `dokumen-get-ketua-tim-access.test.ts`: `berkas_dimusnahkan` di detail dokumen). Pada satu run, tes lama `master-data-read-requires-session.test.ts` sempat gagal sekali, tetapi lulus saat dijalankan ulang tanpa perubahan kode (kemungkinan soal waktu saat seluruh suite berjalan);
  - unit testing white-box FSM (02-10-2026): 115 berkas, 1.224 lulus + 1 dilewati (+3 kasus `tests/fsm.test.ts`: REJECT dengan `revisionTarget` tak dikenal, REJECT oleh PPK di IN_PPSPM_APPROVAL, aksi di luar `FSMAction` ke cabang `default`; asersi semua kasus galat diperketat menjadi pencocokan pesan persis). Branch coverage `src/lib/fsm.ts` dari `tests/fsm.test.ts` 36/36 (penyedia V8, pemetaan AST); rincian di `hasil-unit-whitebox-fsm.md`. Angka resmi berasal dari run dengan Postgres Docker menyala (`docker compose -f infra/docker/postgres/docker-compose.yml up -d`). Dua run sebelumnya tanpa Postgres: run pertama gagal 1 kasus karena timeout `master-data-read-requires-session.test.ts` (5.553 ms > 5.000 ms), run kedua lulus semua;
  - tes baru di `kegiatan-route.test.ts` menjalankan **handler asli** terhadap basis data tiruan in-memory (`tests/unit/laporan/helpers/fake-laporan-db.ts`) yang mengevaluasi join dan filter. Kemampuannya menangkap kesalahan sudah dibuktikan: saat filter kegiatan, penanda dimusnahkan, atau aturan Laporan Kinerja sengaja dirusak, tes yang bersangkutan gagal;
  - proyek belum punya skrip lint (tidak ada ESLint/Biome di `package.json`), jadi pemeriksaan statis hanya `tsc --noEmit`;
- satu-satunya kasus yang dilewati ada di `tests/unit/arsiparis/berkas-arsip-folder-pages.test.ts`;
- baris `stderr` yang muncul saat run berasal dari tes skenario gagal yang sengaja memicu log error, bukan kegagalan.

**Tes integrasi** (`pnpm test:integration` = `vitest run --config vitest.integration.config.ts`, 29-09-2026, setelah migrasi `0021`): **2 berkas, 9 kasus lulus**. Keduanya menyambung ke PostgreSQL asli (bukan `db` yang di-mock), dan setiap kasus berjalan di dalam transaksi yang di-ROLLBACK:
- `tests/integration/dokumen-transaksi-permintaan-fk.test.ts` (3 kasus, D-20): FK menolak UUID yang tidak ada di master (kode `23503`);
- `tests/integration/manual-arsip-effective-status.test.ts` (6 kasus, D-29): status arsip dokumen tambahan KSBU mengikuti berkas CLOSED berstatus AKTIF, INAKTIF, USUL_MUSNAH, dan DIMUSNAHKAN; bernilai AKTIF selama berkas OPEN; dan bisa dipakai di WHERE serta sebagai syarat UPDATE (dokumen di berkas yang dimusnahkan tidak bisa diedit). Setelah run sudah diperiksa bahwa tidak ada data uji yang tertinggal.

Folder `tests/integration/**` dikecualikan dari `pnpm test`, jadi angka Vitest di atas **tidak** memuat tes ini. Butuh Postgres lokal jalan dengan migrasi terbaru (lihat C.5).

Sebaran per modul (folder `tests/unit/*`, dihitung ulang 29-09-2026). Jumlah kasus per modul adalah **perkiraan** dari hitungan teks `it(`/`test(`; kasus `it.each` dihitung satu walau dijalankan berkali-kali, sehingga jumlahnya lebih kecil dari total hasil run. Angka resmi adalah total hasil run di atas.

| Modul | Berkas | ± Kasus |
|---|---|---|
| Modul transisi status (`tests/fsm.test.ts`) | 1 | **52** (hasil run) |
| arsiparis (pemberkasan, manual, ekspor berkas, klasifikasi) | 22 | ~312 |
| storage (unggah, tertunda, akses file, pembersihan) | 25 | ~221 |
| dokumen (submit, revisi, guard transisi, PATCH, akses baca, checklist kelengkapan, pembersihan, master data) | 27 | ~206 |
| laporan (kinerja, periode + Bulanan, filter, dokumen manual KSBU, rute baca manual, Laporan Kegiatan + kesamaan total, status Material/Non-Material, tiket unduhan ZIP) | 11 | ~147 |
| auth (sesi, login, rate-limit, peran, navigasi) | 10 | ~66 |
| export | 1 | ~19 |
| utils | 3 | ~19 |
| components | 3 | ~16 |
| security (same-origin) | 1 | ~9 |
| users | 3 | ~7 |
| dashboard / db / profile / hooks / pegawai / styles | 7 | ~28 |

Rincian 52 kasus `tests/fsm.test.ts`:

| Kelompok | Kasus |
|---|---|
| Transisi valid (8 transisi, termasuk `NEED_REVISION --KEMBALIKAN--> NEED_REVISION`) | 8 |
| Validasi aktor (termasuk KEMBALIKAN: PPK valid; PEGAWAI, PPSPM, KSBU, ADMIN ditolak) | 21 |
| `revisionTarget` pada REJECT | 3 |
| Validasi RESUBMIT | 4 |
| Validasi KEMBALIKAN (status sumber salah ditolak; hasil `revision_target` = USER) | 4 |
| Kombinasi tidak valid | 7 |
| Bentuk error | 2 |
| Hasil keputusan tambahan (white-box: target REJECT tak dikenal, REJECT oleh PPK di IN_PPSPM_APPROVAL, cabang `default`) | 3 |

Seluruh 8 transisi kini punya tes unit (D-14 selesai). Tes rute `POST /api/ppk/kembalikan/$id` ada di `tests/unit/dokumen/dokumen-transition-guards-route.test.ts`: 400 bila `revision_target` ≠ PPK atau status bukan NEED_REVISION, 403 untuk peran non-PPK, catatan otomatis memuat "Alasan penolakan PPSPM", 409 saat balapan.

**Playwright (e2e)**, 67 kasus di `tests/e2e/`:

| Spec | Kasus |
|---|---|
| `approval-flow.spec.ts` | 27 |
| `spec-06-user-management.spec.ts` | 21 |
| `submit-flow.spec.ts` | 19 (TC-01 "redirect /dokumen" dihapus bersama rute lama, D-16; URL `/dokumen/saya` diganti `/pegawai/dokumen`) |

**Tidak dijalankan** di pembaruan ini karena butuh aplikasi dan basis data hidup, dan **tidak ada skrip e2e di `package.json`**. Jalankan manual dengan `pnpm exec playwright test` [BELUM TERVERIFIKASI konfigurasi baseURL/seed].

## C.5 Menjalankan dan deploy di LAN

1. **Basis data:** `docker compose -f infra/docker/postgres/docker-compose.yml up -d`. Image `postgres:16`, port **hanya `127.0.0.1:5432`**, TZ Asia/Jakarta; `init/001-create-schemas.sql` membuat skema.
2. **Konfigurasi `.env`** (dari `.env.example`):
   - `DATABASE_URL`
   - `DMS_LOCAL_STORAGE_ROOT` (folder file)
   - `DMS_FILE_TOKEN_SECRET` (wajib; tanpa ini akses file melempar error, `internal-file-access.ts:72-80`)
   - `APP_URL` (dipakai cek same-origin)
   - `DMS_SESSION_COOKIE_SECURE`
3. **Migrasi dan seed:**
   - `pnpm db:migrate` (atau `db:local:migrate` dengan `.env.migration`);
   - `pnpm db:seed`. Seed pengguna dev butuh `DMS_DEV_SEED_PASSWORD_HASH`; hash dibuat dengan `pnpm auth:hash-password`.
   - **Tes:** `pnpm test` (unit, tanpa basis data). Tambahan `pnpm test:integration` menguji constraint langsung ke Postgres; butuh langkah 1–3 di atas (container jalan, `DATABASE_URL` di `.env` benar, migrasi sudah diterapkan).
4. **Pengembangan:** `pnpm dev` (Vite, port 3000). `host: true` membuat server bisa diakses dari LAN. `allowedHosts: true` dan plugin `basicSsl()` menjalankan **HTTPS sertifikat self-signed** (`vite.config.ts:11-24`).
5. **Produksi LAN:** `pnpm build`, lalu `pnpm start` (`node .output/server/index.mjs` dengan `.env`). Port default server Nitro [BELUM TERVERIFIKASI]. Cookie sesi `Secure` aktif di production atau bila `DMS_SESSION_COOKIE_SECURE` diset.
6. **Perawatan:** jadwalkan `pnpm storage:sweep-pending` (misalnya harian) bila perlu; sweeper otomatis juga berjalan setelah unggahan.

## C.6 Halaman per peran untuk tangkapan layar

| Peran | Halaman (path) |
|---|---|
| Umum | Login `/login` (username/NIP, tombol lihat kata sandi), Bantuan `/bantuan`, Profil `/profile`, Forbidden `/forbidden` |
| Pegawai | Dashboard `/pegawai`; Ajukan Dokumen `/pegawai/dokumen/aju` (tiap langkah: karakteristik, komponen, jenis/kategori/detail, nominal, unggah, review); Dokumen Diajukan `/pegawai/dokumen`; Detail `/pegawai/dokumen/$id` (timeline); Ubah `/pegawai/dokumen/$id/edit`; Revisi `/pegawai/revisi`, `/pegawai/dokumen/$id/revisi`; Laporan Saya `/pegawai/laporan/saya` (filter periode bawaan Bulanan, filter Status Material/Non-Material, + dialog ekspor ZIP); Log Aktivitas `/pegawai/activity-log` |
| Ketua Tim | Monitoring Dokumen Tim `/pegawai/monitoring-dokumen-tim`; Laporan Kegiatan `/pegawai/laporan/kegiatan` (filter periode bawaan Triwulan, filter Status; detail kegiatan dengan dokumen tambahan KSBU, nominal dicoret untuk berkas dimusnahkan, dialog ekspor ZIP); Pembersihan Dokumen `/pegawai/pembersihan-dokumen` (+ dialog ketik `BERSIHKAN`) |
| PPK | Dashboard `/ppk`; Validasi Dokumen `/ppk/inbox`; Detail `/ppk/dokumen/$id` (dialog tolak); Tervalidasi `/ppk/tervalidasi`; Tidak Valid `/ppk/ditolak`; Revisi `/ppk/revisi`; Kirim Ulang `/ppk/dokumen/$id/resubmit`; Nominal Realisasi `/ppk/monitoring-realisasi` (filter periode; dialog detail dokumen alur dan dokumen tambahan KSBU dengan Preview/Unduh lampiran); Log Aktivitas |
| PPSPM | Dashboard `/ppspm`; Persetujuan `/ppspm/inbox`; Detail `/ppspm/dokumen/$id`; Ditolak `/ppspm/ditolak`; Selesai `/ppspm/selesai`; Nominal Realisasi `/ppspm/monitoring-realisasi` (sama dengan PPK); Log Aktivitas |
| KSBU | Dashboard `/kasubag`; Pengklasifikasian `/kasubag/inbox` + `/kasubag/dokumen/$id` (pilih Cara Pembayaran + TA); Penambahan Dokumen `/kasubag/penambahan-arsip` (4 langkah; langkah Berkas Pendukung dengan pesan "Minimal 1 lampiran wajib diunggah"); Berkas Terbuka `/kasubag/berkas`; Detail Berkas `/kasubag/berkas/$id` (timeline, dialog Tutup Berkas); Berkas Tertutup `/kasubag/berkas/tertutup` (umur, Jatuh Tempo); Pembersihan Berkas `/kasubag/pembersihan` (toggle Usulan/Sudah Dibersihkan, dialog ketik frasa); Master Klasifikasi `/kasubag/klasifikasi`; Log Aktivitas |
| PJ Kinerja | Dashboard `/penanggung-jawab-kinerja`; Laporan Kinerja `/penanggung-jawab-kinerja/laporan-kinerja` (drill-down Fungsi → Kegiatan → Dokumen, filter periode, filter Status, badge File Dibersihkan, dialog detail + Preview/Unduh lampiran untuk dokumen alur dan dokumen tambahan KSBU); Log Aktivitas (semua pengguna) |
| Admin | Dashboard `/admin`; Master User `/admin/master-data/user` (peran, Ketua Tim, reset sandi, nonaktif, foto); Fungsi, Kegiatan, Komponen, Jenis, Kategori, Detail, Kelengkapan `/admin/master-data/*`; Pengaturan Aplikasi `/admin/settings` (tema se/sp/st, sub-judul); Log Aktivitas `/admin/activity-log` (semua pengguna) |

## C.7 Pemetaan fitur → karakteristik ISO/IEC 25010 (bahan butir kuesioner)

| Karakteristik | Sub-karakteristik | Fitur yang bisa ditanyakan | Bukti kode |
|---|---|---|---|
| **Functional suitability** | Kelengkapan, kebenaran, kesesuaian | Pengajuan dua jalur; persetujuan PPK→PPSPM; revisi/kembalikan; pemberkasan per Cara Pembayaran × TA; laporan & realisasi dengan filter periode (Bulanan/Triwulan/Tahunan/Kustom) yang mencakup dokumen tambahan KSBU; preview/unduh lampiran dari laporan; pembersihan | B.1, B.2, B.3, PB-7 |
| **Performance efficiency** | Perilaku waktu, kapasitas | Batas ZIP 500 dokumen, batas pembersihan 200, laporan kinerja maksimal 2000 baris, Log Aktivitas maksimal 500 baris, unggah 5 MB | `document-zip.ts:73`, `pembersihan.ts:21`, `kinerja.ts`, `activity-log.ts` |
| **Compatibility** | Ko-eksistensi / interoperabilitas | Berdiri sendiri; hasil ekspor ZIP/CSV bisa dipakai di aplikasi lain secara manual | §1 |
| **Interaction capability (usability)** | Kemudahan dipelajari, operabilitas, perlindungan dari kesalahan, estetika | Formulir bertahap + checklist; halaman Bantuan; menu per peran; konfirmasi ketik-persis; guard perubahan belum disimpan; toast; tiga tema; peringatan dokumen tertahan | `aju.tsx`, `bantuan.tsx`, `navigation.ts`, `ConfirmDialog` |
| **Reliability** | Kematangan, toleransi kesalahan, pemulihan | Transaksi submit + rollback file; penjaga konflik bersamaan; penghapusan file idempoten; hapus file lama setelah commit; sweeper file tertunda; 1.221 kasus tes unit + 9 kasus tes integrasi lulus | §PB-2.2, PB-6.5, C.4 |
| **Security** | Kerahasiaan, integritas, non-repudiasi, akuntabilitas, autentisitas | Argon2id; sesi 8 jam dengan token hash; rate-limit login; peran dicek server; same-origin; URL lampiran HMAC; cek magic bytes; riwayat dokumen/berkas/audit | Lampiran E |
| **Maintainability** | Modularitas, dapat diuji, dapat dimodifikasi | Lapisan route/lib/db; modul transisi terpusat; injeksi repository; Zod di setiap batas; komponen bersama (`PeriodeSelector`, penampil lampiran); kode mati dibersihkan (D-16); 115 berkas tes unit + 2 berkas tes integrasi | Lampiran B, C.4 |
| **Flexibility (portability)** | Kemampuan instal, adaptabilitas | Docker PostgreSQL; berjalan di LAN tanpa internet; konfigurasi via `.env` | C.5 |

---

# D. Ketidakkonsistenan & Pertanyaan Terbuka

Dampak: **T** = Tinggi (bisa salah data/akses atau salah ditulis di skripsi), **S** = Sedang, **R** = Rendah.

| # | Temuan | Bukti | Dampak |
|---|---|---|---|
| D-1 | **✅ SELESAI `69f7fbe`.** Fungsi murni bersama `matchesKelengkapanSelection` (`src/lib/kelengkapan-match.ts`, exact-match 6 kolom) dipakai `KelengkapanChecklist`, halaman revisi Pegawai, dan kirim ulang PPK; `GET /api/ppk/resubmit/$id` kini mengirim `komponen_id`. *Temuan asli:* **Checklist di halaman revisi ≠ server.** Halaman revisi Pegawai dan kirim ulang PPK memakai `matchesCurrentChain` yang **bertingkat**: bila ada detail, hanya detail yang dicocokkan; bila rantai kosong, semua item kegiatan tampil. Halaman PPK **tidak punya cabang komponen**. Server memakai exact-match 6 kolom. Checklist yang dilihat pengguna bisa berbeda dari yang ditegakkan server. | `src/routes/pegawai/dokumen/$id/revisi.tsx:97-121`, `src/routes/ppk/dokumen/$id/resubmit.tsx:96-113` vs `local-submit-drizzle-adapter.ts:159-173` | **T** |
| D-2 | **✅ SELESAI `f26ee7f`.** `validateNominalUpdate` di kedua PATCH: Material > 0, Non-Material menolak nominal; dicek sebelum file dipindah. *Temuan asli:* **Nominal masih bisa diubah tanpa cek > 0.** `PATCH /api/dokumen/$id` menerima `nominalRealisasi` `min(0)`/nullable, termasuk untuk dokumen **non-material**. `PATCH /api/ppk/resubmit/$id` (simpan tanpa kirim) juga tanpa cek > 0. Pengecekan > 0 baru terjadi saat kirim ulang. | `src/routes/api/dokumen.$id.ts:560-565`, `src/lib/schemas/dokumen.ts:54`, `src/routes/api/ppk/resubmit/$id.ts:328-331` | **S** |
| D-3 | **✅ SELESAI `3a34192`.** GET memakai `requireKepalaSubBagianUmum` (401/403). Pemanggilnya hanya halaman `/kasubag/*`. Audit endpoint lain: lihat D-23. *Temuan asli:* **`GET /api/kasubag/klasifikasi` tanpa cek sesi/peran.** Siapa pun di jaringan bisa membaca pohon klasifikasi dan kelayakan berkas per TA. Rute tulis di berkas yang sama tetap memakai `requireKepalaSubBagianUmum`. | `src/routes/api/kasubag/klasifikasi/index.ts:130-` | **S** |
| D-4 | ✅ **Diputuskan (Q2), bukan bug.** Setelah ditutup, (Cara Pembayaran, TA) terkunci permanen **secara sengaja**: 1 Cara Pembayaran = 1 SPM per TA. Tulis sebagai keputusan perancangan di Bab IV, bukan keterbatasan. Tidak ada perubahan kode. *Temuan asli:* Bila KSBU salah menutup berkas atau butuh SPM kedua pada TA yang sama, tidak ada jalan keluar di aplikasi. | `0018`, `berkas-arsip-service.ts:851-876`, `CloseBerkasDialog.tsx` | R (keputusan diambil) |
| D-5 | **✅ SELESAI `e4abe5a`.** Item dihapus dari 5 peran; ADMIN: "Pengaturan Aplikasi" (path `/admin/settings` tetap); "Activity Log" → "Log Aktivitas" di semua peran. *Temuan asli:* Menu **"Settings" tanpa tujuan** di 5 peran non-admin. | `src/config/navigation.ts` (item tanpa `to`) | R |
| D-6 | **🔒 Diputuskan: keterbatasan (K-1).** **Pencampuran ADMIN diringkas diam-diam**, bukan ditolak. Pesan "ADMIN tidak boleh digabung…" tidak pernah muncul karena `normalizeAdminRolePayload` sudah membuang peran lain. Admin bisa mengira PPK tersimpan padahal tidak. | `role-assignment.ts:6-16`, `users/index.ts:107-108` | S |
| D-7 | **🔒 Diputuskan: keterbatasan (K-2).** **Pemeriksaan "admin aktif terakhir" tanpa kunci baris.** Dua permintaan bersamaan secara teori bisa menonaktifkan dua admin terakhir. | `local-user-mutations.ts:437-449` | R |
| D-8 | **🔒 Diputuskan: keterbatasan (K-3).** **Rate-limit login di memori proses**, dengan kunci IP dari `x-forwarded-for`/`x-real-ip` yang bisa dipalsukan klien. Hilang saat restart dan tidak berbagi antarproses. | `login-rate-limit.ts:28`, `login.ts:41-50, 105-115` | S |
| D-9 | **✅ SELESAI (bagian kode).** Fitur "Ingat saya" memang tidak dipakai, jadi kodenya dihapus: konstanta `REMEMBER_ME_DURATION_SECONDS`, opsi `rememberMe` di `loginWithLocalCredentials`, dan field `rememberMe` saat membuat sesi. Setiap sesi kini selalu 8 jam (`SESSION_DURATION_SECONDS`). Kolom `sessions.remember_me` **dipertahankan di skema** (selalu `false`) karena menghapusnya butuh migrasi; tercatat sebagai sisa skema (lihat D-16 Golongan 3). *Temuan asli:* **"Ingat saya" 30 hari tidak terjangkau.** Konstanta dan kolom `sessions.remember_me` ada, tetapi `loginSchema` tidak punya field-nya. | `src/lib/auth/{session-constants,local-auth-service,session-repository}.ts` | R |
| D-10 | **🔒 Diputuskan: keterbatasan (K-4).** **Validasi MIME memakai tipe yang dilaporkan browser.** Untuk DOCX/XLSX, magic bytes hanya membuktikan "berkas ZIP". | `document-upload-policy.ts:166-193` | R |
| D-11 | **📝 Catatan penulisan (bukan bug).** **Token HMAC hanya untuk lampiran dokumen alur.** File berkas cukup dengan cek sesi + peran KSBU. Lampiran dokumen manual cukup dengan cek sesi + peran: KSBU lewat `/api/kasubag/manual-arsip/**`, serta PJ Kinerja/PPK/PPSPM/KSBU (baca saja) lewat `/api/laporan/manual-arsip/**` (sejak `e6ba99c`), ditambah Ketua Tim untuk kegiatan yang ia pimpin (D-28). Tautan unduhan ZIP laporan memakai tiket acak sekali pakai yang terikat ke pengguna, juga tanpa HMAC (D-31). Sebutkan dengan tepat di skripsi. | `berkas-arsip-file-access.ts`, `manual-arsip.ts:198,223`, `download-ticket.ts` | R (dokumentasi) |
| D-12 | **✅ SELESAI `df8ea51`, `d328ad7`, dikuatkan `38f5900`.** Submit: `is_ketua_tim` = hasil penugasan di server (klaim Ketua Tim palsu tetap ditolak; Ketua Tim yang mengirim `false` dicatat & dicek sebagai Ketua Tim). **Keputusan produk yang disengaja:** nilai `is_ketua_tim` dikunci sejak SUBMIT untuk seluruh umur dokumen dan **tidak pernah** diverifikasi ulang ke penugasan terkini — bila admin mencabut penugasan Ketua Tim setelah dokumen diajukan, dokumen itu tetap memakai checklist Ketua Tim. Sejak D-24 (`38f5900`), `kegiatanId` tidak lagi diterima `PATCH /api/dokumen/$id` sama sekali, sehingga tidak ada jalan apa pun untuk mengubah `is_ketua_tim` setelah submit — lebih ketat dari rencana semula (menghitung ulang saat kegiatan berubah). Ditegaskan komentar kebijakan di `resubmit-validation.ts` dan tes yang menguncinya. Baris lama sebelum `df8ea51` tidak dikoreksi. *Temuan asli:* **Pengaju bisa mengaku "Anggota" meski ia Ketua Tim.** Server hanya memverifikasi klaim Ketua Tim, bukan klaim Anggota, sehingga checklist Anggota yang lebih ringan bisa dipakai lewat manipulasi permintaan. | `local-submit-write-bridge.ts:294-306` | S |
| D-13 | **🔒 Diputuskan: keterbatasan (K-5).** **Pembersihan non-material menghapus file sebelum menandai basis data.** Bila `applyCleanup` gagal setelah file terhapus, dokumen tidak berlabel "dibersihkan" padahal file hilang. Aksi idempoten bisa diulang, tetapi tidak atomik. | `pembersihan-service.ts:187-236` | R |
| D-14 | **✅ SELESAI `89a93bd`.** +10 kasus di `tests/fsm.test.ts` (39 → 49) dan +6 kasus rute. *Temuan asli:* **Tes modul transisi tidak mencakup `KEMBALIKAN`.** Kerangka Bab IV menargetkan "seluruh transisi lolos unit testing", jadi target ini **belum terpenuhi** untuk transisi #8. | `tests/fsm.test.ts` (39 kasus, 0 untuk KEMBALIKAN) | **T** (klaim skripsi) |
| D-15 | **🔒 Diputuskan: keterbatasan (K-6).** **Tidak ada skrip e2e** di `package.json`; Playwright harus dipanggil manual (`pnpm exec playwright test`). | `package.json:8-24` | R |
| D-16 | **✅ SELESAI (Golongan 1), sisanya diputuskan dipertahankan.** Kode peninggalan dipilah tiga golongan: | | R |
| | **Golongan 1: kode mati, DIHAPUS.** | | |
| | • rute `POST /api/dokumen/rename-pending` (tidak dipanggil klien mana pun) beserta tesnya; helper yang dipakainya tetap ada karena dipakai modul lain | dulu `src/routes/api/dokumen/rename-pending.ts` | |
| | • parameter dry-run `useLocalAuthDryRun`/`useLocalPreflightDryRun` di rute submit; kini diabaikan (ada tes yang menguncinya) | `src/routes/api/dokumen/submit.ts` | |
| | • cabang `MULTIPLE_OPEN_BERKAS` dan field `anomaly` (mustahil sejak unique index `berkas_arsip_klasifikasi_tahun_unique`) | `berkas-klasifikasi-eligibility.ts` (`getKlasifikasiBerkasEligibility`) | |
| | • tipe `AppUser`/`AppSession` peninggalan versi lama (tidak dipakai di mana pun) | `src/lib/types/auth.ts` | |
| | • rute lama `/dokumen`, `/dokumen/$id`, `/dokumen/$id/edit`, `/dokumen/aju`, `/dokumen/aji`, `/dokumen/saya` (semuanya hanya pengalih) dan konstanta `ROUTES.LEGACY_DOKUMEN`. Tombol "Ajukan Dokumen" di dashboard Pegawai kini langsung ke `/pegawai/dokumen/aju`; spec e2e diarahkan ke `/pegawai/dokumen` | dulu `src/routes/dokumen*`; `DashboardShell.tsx`, `routes.ts`, `tests/e2e/*` | |
| | • kode "Ingat saya" (D-9) | lihat D-9 | |
| | **Golongan 2: tampak lama, tetapi DIPERTAHANKAN untuk riwayat lama.** Label `UPDATE_NOMINAL`, `BENDAHARA_APPROVE/REJECT`, dan peristiwa `BERKAS_DIPINDAHKAN_KE_INAKTIF` dipakai untuk menampilkan baris riwayat lama (tabel riwayat bersifat append-only). Menghapusnya membuat riwayat lama tampil sebagai kode mentah. | `aksi-labels.ts:18-21,57-73`, `berkas-arsip-activity.ts:9,23` | |
| | **Golongan 3: sisa di skema basis data, DIPERTAHANKAN (tanpa migrasi).** Kolom `sessions.remember_me`; nilai `INAKTIF` di constraint `berkas_arsip.status_arsip` dan peristiwa `BERKAS_DIPINDAHKAN_KE_INAKTIF` di constraint riwayat berkas; `retensi_inaktif`/`masa_inaktif_berakhir` (masih terhubung ke layanan berkas, selalu kosong). Menghapusnya butuh migrasi yang bisa gagal bila ada data lama; dicatat sebagai K-7. **Kecuali** kolom `status_arsip` dan kolom siklus `inactivated_*`, `proposed_destroy_*`, `destroyed_*` di `manual_arsip`: kolom-kolom ini **sudah dihapus** di migrasi `0021` (D-29), karena tidak pernah diperbarui dan menyesatkan. | `src/db/schema/{auth/sessions,arsip/berkas-arsip,arsip/manual-arsip}.ts` | |
| D-17 | **✅ SELESAI `ae966d2`.** Label → "Karakteristik". *Temuan asli:* **Label UI "Jenis Dokumen"** di ringkasan sukses halaman revisi dan kirim ulang (dan teks konfirmasi pengajuan) sebenarnya menampilkan **karakteristik** (Material/Non-Material), bukan master yang sudah dihapus. Istilahnya membingungkan; sebaiknya "Karakteristik". | `revisi.tsx:402-405`, `resubmit.tsx:418`, `aju.tsx:1184` | R |
| D-18 | **✅ SELESAI `ae966d2`.** Pesan: "Berkas untuk Cara Pembayaran ini pada TA {tahun} sudah ditutup." *Temuan asli:* **`CLOSED_UNAVAILABLE_REASON` tidak menyebut TA.** Pesan kelayakan tidak menjelaskan bahwa kuncinya per tahun. | `berkas-klasifikasi-eligibility.ts:42` | R |
| D-19 | **🔒 Diputuskan: keterbatasan (K-8).** **Tabel `audit.audit_log` tidak punya tampilan UI.** Klaim "pemeriksa bisa menelusuri dokumen yang dihapus" hanya berlaku lewat akses basis data langsung. | tidak ditemukan pembaca di halaman | S (klaim skripsi) |
| D-20 | **✅ SELESAI `8816524`.** Ketiga kolom kini `.references()` ke `master_jenis_permintaan` / `master_kategori_permintaan` / `master_detail_permintaan` (`ON DELETE restrict`, `ON UPDATE no action`, sama dengan `komponen_id`); migrasi `drizzle/0020_dokumen_transaksi_permintaan_fk.sql` (ditulis manual, idempoten). Sebelum migrasi dicek: 0 baris yatim dari 24 dokumen. Dibuktikan oleh tes integrasi pertama, `tests/integration/dokumen-transaksi-permintaan-fk.test.ts` (Postgres asli, transaksi di-ROLLBACK, harus gagal `23503`), dijalankan lewat `pnpm test:integration`. *Temuan asli:* **`dokumen_transaksi.jenis/kategori/detail_permintaan_id` tanpa FK.** Integritasnya hanya dijaga aplikasi. Gambarkan sebagai relasi logis di ERD, atau tambahkan FK. | skema `dokumen-transaksi.ts:58-60`; migrasi 0000 | S |
| D-21 | **📝 Diputuskan: tugas penulisan pemilik** (kerangka diperbarui sendiri oleh pemilik; acuannya tabel B.1). **Kerangka Bab IV tertinggal dari kode:** UC-01 masih "email"; UC-23 masih "jenis dokumen"; UC-13/UC-14 belum menyebut Tahun Anggaran; Monitoring Dokumen Tim (UC-25) belum ada; Log Aktivitas PJ Kinerja lintas pengguna belum disebut; UC-14 belum menyebut lampiran wajib; UC-18–UC-21 belum menyebut filter periode (Bulanan) serta preview/unduh lampiran dan dokumen tambahan KSBU di UC-20/UC-21. | `docs/planning/ubah-alur-v1/kerangka-bab-iv.md` (commit `171fc5d`) vs B.1 | **T** (dokumen) |
| D-22 | **✅ Diputuskan: sesuai proses bisnis** (asumsi satu satker, tulis di Bab IV). Hak baca lintas pegawai **tidak dibatasi per unit/kegiatan**, tetapi **dibatasi per jenis dan status dokumen** sesuai peran: **PPK** hanya dokumen **material** berstatus Divalidasi PPK, Menunggu PPSPM, Perlu Revisi, atau Selesai; **PPSPM** hanya dokumen **material** berstatus Menunggu PPSPM, Selesai, atau Perlu Revisi yang harus diperbaiki PPK; **KSBU** dokumen Selesai; **PJ Kinerja** satu-satunya peran yang membaca **semua dokumen berstatus Selesai atau Tersimpan**, yaitu material Selesai **dan non-material Tersimpan** (sejak `e6ba99c`). Dokumen non-material tidak pernah terbuka untuk PPK/PPSPM karena statusnya selalu Tersimpan. | `document-file-access.ts:344-402` (`canSessionReadDocument`, `canPpkReadDocument`, `canPpspmReadDocument`), `dokumen.$id.ts:58-93` | R |
| D-23 | **✅ SELESAI `b4ee1a8`** (baru, dari audit D-3). 11 handler GET master data (`master-fungsi`, `master-kegiatan`, `master-komponen` +`$id`, `master-jenis` +`$id`, `master-kategori` +`$id`, `master-detail` +`$id`, `master-kelengkapan`) sebelumnya bertanda "Public read endpoint" dan bisa dibaca siapa pun di LAN tanpa login. Kini memakai `requireAnyLocalSession` (401 tanpa sesi; peran apa pun boleh, karena semua pemanggilnya sudah di halaman yang dijaga peran). Mutasi tetap ADMIN-only. Endpoint lain tanpa `getLocalServerSession` langsung memakai pembungkus yang memeriksa sesi + peran (`requireBerkasArsipApiSession`, `requireManualArsipApiSession`, `createDocumentLampiranAccessUrlResponse`, `authorizeCleanupRequest`) atau memang publik (`auth/login`, `auth/logout`, `auth/session`; `auth/role-switch` memeriksa token sesi sendiri). | `src/routes/api/master-*.ts` | S (klaim keamanan) |
| D-24 | **✅ SELESAI `38f5900`.** `updateDokumenSchema` kini `.strict()` dan hanya berisi `lampiranUrls`, `nominalRealisasi`, `keteranganDetail`, `namaDokumen` — persis yang dikirim `edit.tsx` (Non-Material) dan `revisi.tsx` (Material, sebelum resubmit). `kegiatanId`, `fungsiId`, `komponenId`, `jenisPermintaanId`, `kategoriPermintaanId`, `detailPermintaanId`, `tahun`, `tanggal`, `judul` ditolak 400 sebelum dokumen dibaca. *Temuan asli:* **`PATCH /api/dokumen/$id` menerima perubahan metadata yang tidak dikirim UI mana pun** (`kegiatanId`, `fungsiId`, `komponenId`, `tahun`, `tanggal`, `judul`) untuk dokumen Material saat revisi, tanpa menyelaraskan jenis/kategori/detail. Permintaan manual bisa membuat rantai tidak konsisten (mis. komponen baru dengan jenis lama). | `src/routes/api/dokumen.$id.ts`, `updateDokumenSchema` | S |
| D-25 | **🔒 Diputuskan: keterbatasan (K-9), cukup kalimat yang tepat di skripsi.** **(baru, dari T-13) `updated_at` = "kapan baris terakhir ditulis", bukan murni "kapan status terakhir berubah".** Monitoring Dokumen Tim menghitung "lama tertahan" dari `updated_at` (`monitoring-dokumen-tim.tsx:84-85`, `daysSinceUpdate`) — ini benar untuk menunjukkan lama di PPK/PPSPM/revisi-belum-dikirim-ulang, TAPI kolom itu juga ter-update saat Pegawai mengedit lampiran/nominal di masa revisi tanpa mengubah status. Klaim "sejak perubahan status terakhir" perlu kalimat yang lebih presisi: "sejak dokumen terakhir ditulis (submit, aksi persetujuan, atau edit saat revisi)". | `src/routes/pegawai/monitoring-dokumen-tim.tsx:84-85,759-762` | R (dokumentasi) |
| D-26 | **✅ SELESAI `37517ff`.** `GET /api/laporan/kinerja` kini juga membaca `arsip.manual_arsip`, digabung dan diurutkan bersama `dokumen_transaksi` berdasarkan `updated_at`. Baris manual: `status='COMPLETED'` (dianggap terealisasi sejak diarsipkan), `sumber='MANUAL'`, `tahun` dari `tanggal` dokumen sendiri (bukan tahun anggaran berkas — konsisten dengan Q5), baris `DIMUSNAHKAN` dikecualikan. Awalnya dibatasi hanya untuk Monitoring Nominal Realisasi (PPK/PPSPM), karena Laporan Kinerja membuka detail lewat endpoint yang tidak ada untuk `manual_arsip`. **Sejak `e6ba99c` diperluas ke Laporan Kinerja**, dengan endpoint read-only `/api/laporan/manual-arsip/**` dan dialog `ManualArsipDetailDialog` (lihat PB-7.2, PB-8.3). UI menandai baris manual "Penambahan Dokumen (KSBU)" di daftar dan di dialog detail (kolom "Sumber"), supaya tidak dikira melalui persetujuan PPK/PPSPM. *Temuan asli:* Nominal dokumen manual KSBU tidak masuk Monitoring Nominal Realisasi, walau `manual_arsip` sudah punya `nominal_realisasi` dan chain fungsi/kegiatan/komponen yang sama. | `src/routes/api/laporan/kinerja.ts`, `src/db/schema/arsip/manual-arsip.ts:33` | R (selesai) |
| D-27 | **✅ SELESAI** (commit setelah `e6ba99c`). Catatan cakupan di header kini mengikuti halaman: Nominal Realisasi "Dokumen material berstatus Selesai dan dokumen tambahan KSBU, kecuali yang berkasnya sudah dimusnahkan" (kalimat ini dipertegas di D-28 menjadi "…Dokumen yang berkasnya sudah dimusnahkan tidak ditampilkan dan nominal realisasinya tidak lagi dihitung."); Laporan Kinerja "Dokumen final: material Selesai, non-material Tersimpan, dan dokumen tambahan KSBU. Tidak termasuk berkas yang sudah dimusnahkan atau lampiran yang sudah dibersihkan" (`ScopeNoteContext`; diganti di D-29 karena Laporan Kinerja kini menampilkan keduanya, dan kata "final" diganti di `4da7ed1`). *Temuan asli:* kotak catatan di header ketiga halaman berbunyi "Hanya dokumen material berstatus Selesai, dan berkas belum dimusnahkan", padahal Laporan Kinerja juga memuat non-material dan kedua halaman memuat dokumen tambahan KSBU. | `src/components/kinerja/MonitoringRealisasiView.tsx` (`KinerjaHeader`, `ReportBackHeader`) | R (teks UI) |
| D-28 | **✅ SELESAI `93eeb17`** (29 September 2026). **Alasan: konsistensi total realisasi antarhalaman.** Laporan Kegiatan (UC-19) kini memuat dokumen tambahan KSBU dari kegiatan yang dipimpin pemanggil. Penyaringannya di server (`manual_arsip.kegiatan_id` ↔ `ketua_tim_assignments`) lewat helper yang sama dengan Nominal Realisasi (`src/lib/laporan/manual-realisasi.ts`). Keputusan pemilik tentang dokumen yang berkasnya dimusnahkan: **tetap ditampilkan di Laporan Saya dan Laporan Kegiatan dengan penanda, tetapi nominalnya tidak lagi dihitung**. Di Nominal Realisasi dan Laporan Kinerja dokumen itu tetap tidak ditampilkan (untuk Laporan Kinerja diubah di D-29: kini ditampilkan dengan penanda, nominal tidak dihitung). Pesan "nominal tidak lagi dihitung" ditampilkan di header Laporan Kegiatan dan Nominal Realisasi, di sel nominal, dan di dialog detail dokumen tambahan KSBU. "Dimusnahkan" untuk dokumen tambahan KSBU kini juga dilihat dari berkas penaungnya: sebelumnya hanya `manual_arsip.status_arsip`, yang tidak pernah berubah saat berkas dimusnahkan, sehingga dokumen manual di berkas yang dimusnahkan masih dihitung di Nominal Realisasi dan Laporan Kinerja. Dokumen material tanpa Komponen dikeluarkan dari Laporan Kegiatan (di DB pengembangan jumlahnya 0 dari 24, jadi tidak ada data yang dihapus). Rute baca `/api/laporan/manual-arsip/**` menerima Ketua Tim, **hanya** untuk kegiatan yang ia pimpin (lainnya 403; lihat PB-8.3). Tanpa perubahan skema atau migrasi. Diuji di `tests/unit/laporan/kegiatan-route.test.ts` (handler asli dijalankan terhadap fixture in-memory, termasuk uji kesamaan total) dan `manual-arsip-route.test.ts`. *Temuan asli:* Laporan Kegiatan tidak memuat `manual_arsip`, sehingga total realisasi satu kegiatan bisa lebih kecil daripada di Nominal Realisasi. Selain itu, dokumen alur dari berkas yang dimusnahkan dan dokumen material tanpa Komponen masih dijumlahkan di Laporan Kegiatan. | `src/routes/api/laporan/kegiatan.ts`, `src/lib/laporan/manual-realisasi.ts`, `src/lib/manual-arsip.ts:223`, `src/routes/pegawai/laporan/kegiatan.tsx` | R (selesai) |
| D-29 | **✅ SELESAI `ae8a698`** (29 September 2026). **Alasan: seluruh dokumen mengikuti status arsip berkasnya, dan metadata dokumen yang dimusnahkan sengaja disimpan.** (1) Status arsip dokumen tambahan KSBU kini dihitung dari berkas penaungnya (`manualArsipEffectiveStatusArsip`), sama seperti dokumen alur. Kolom `manual_arsip.status_arsip` (yang tidak pernah diperbarui, sehingga dokumen "WWW" di berkas yang dimusnahkan masih tercatat Aktif) dan enam kolom siklus dihapus lewat migrasi `0021`, setelah dipastikan tidak ada data yang hilang. Dokumen tambahan KSBU hanya bisa diedit selama berkasnya aktif. (2) **Laporan Kinerja** kini juga menampilkan dokumen yang berkasnya dimusnahkan (nominal tidak dihitung) dan dokumen non-material yang lampirannya sudah dibersihkan. **Nominal Realisasi tetap tidak menampilkan** dokumen dari berkas yang dimusnahkan. (3) Dialog detail dokumen alur dan tambahan KSBU menampilkan pesan "Berkas dokumen ini sudah dimusnahkan. Nominal realisasinya tidak lagi dihitung…", hanya untuk berkas yang dimusnahkan. (4) Ekspor ZIP Laporan Kegiatan ikut memuat dokumen tambahan KSBU. (5) Label kolom "Tanggal Pengajuan" di detail Laporan Kegiatan diganti "Tanggal Dokumen", sesuai isinya. Diuji di `kegiatan-route.test.ts` (unit) dan `tests/integration/manual-arsip-effective-status.test.ts` (PostgreSQL). *Temuan asli:* dari D-28 — status arsip dokumen manual tidak mengikuti berkas; Laporan Kinerja menyembunyikan metadata yang sengaja disimpan; ekspor ZIP Laporan Kegiatan tidak memuat dokumen tambahan KSBU; label tanggal menyesatkan. | `src/lib/archive/manual-arsip-effective-status.ts`, `drizzle/0021_manual_arsip_drop_own_lifecycle.sql`, `src/routes/api/laporan/kinerja.ts:172`, `src/routes/api/dokumen.$id.ts:420`, `src/lib/export/laporan-zip-entries.ts:70-102` | S (skema + data laporan) |
| D-30 | **✅ SELESAI `ae8a698`** (29 September 2026). **Alasan: dokumen non-material tidak punya Komponen, sehingga di Laporan Kinerja semuanya menumpuk di grup "Tanpa Komponen".** Laporan Kinerja kini cukup sampai Kegiatan (Fungsi → Kegiatan → Dokumen); Nominal Realisasi tetap sampai Komponen. Di ketiga halaman laporan, status akhir ditampilkan sebagai jenis: Selesai = **Material**, Tersimpan = **Non-Material** (`src/lib/laporan/status-laporan.ts`). Filter **Status** (Semua / Material / Non-Material) tersedia di Laporan Saya, Laporan Kegiatan (daftar dan detail; total ikut filter), dan Laporan Kinerja. Laporan Kinerja menampilkan badge "File Dibersihkan". Diuji di `tests/unit/laporan/status-laporan.test.ts`. | `src/components/kinerja/MonitoringRealisasiView.tsx:147,275`, `src/routes/pegawai/laporan/{saya,kegiatan}.tsx` | R (tampilan) |
| D-31 | **✅ SELESAI `ae8a698`** (29 September 2026). **Alasan: ekspor ZIP Laporan Kegiatan gagal di Edge ("Failed to fetch") walau server mengirim 200.** Pemeriksaan: server dev mengirim ZIP utuh (10,9 MB, valid, termasuk dokumen tambahan KSBU) ke curl dengan header persis seperti Chrome; di Chrome Incognito (tanpa ekstensi) ekspor berhasil; ekspor berkas KSBU, yang diunduh lewat navigasi biasa, berhasil di Edge. Jadi penyebabnya ekstensi/penanganan unduhan di browser yang merebut respons `fetch` berbentuk ZIP. Ketiga ekspor laporan kini diunduh secara bawaan browser lewat tiket sekali pakai (lihat PB-6.4). Diuji di `download-ticket.test.ts` dan `kegiatan-route.test.ts`. Tombol "Unduh" satu lampiran dokumen tambahan KSBU (`ManualArsipAttachmentViewer.tsx`) masih memakai `fetch` + blob; belum ada laporan masalah untuknya. | `src/lib/export/download-ticket.ts`, `src/lib/file-helpers.ts:33`, `src/routes/api/laporan/{kegiatan,saya}.export-zip.ts` | S (fungsi ekspor) |
| D-32 | **✅ SELESAI `4da7ed1`** (30 September 2026, verifikasi langkah 5). **Verifikasi seluruh rancangan *sequence* 15 UC, ERD (Q-17), dan teks UI (Q-19) terhadap kode; keputusan pemilik atas sembilan pertanyaan.** Hasil untuk dokumen ini: (1) akun nonaktif ditolak 403 sebagai *alur alternatif* login, tidak dihitung sebagai percobaan gagal; (2) mengganti Ketua Tim adalah alur normal Admin (bukan keterbatasan); (3) bagian rancangan yang tidak ada di kode dihapus dari diagram (mis. `catatWaktuLogin`, pemeriksaan keunikan sebelum simpan, pemeriksaan "masih dipakai" saat menonaktifkan data master); (4) data master dijelaskan **sesuai kode** dan dicatat sebagai keterbatasan K-11; (5) TA diisi awal dari tahun dokumen dan bebas diganti KSBU, dicatat sebagai K-12; (6) kata "final" dan "finalisasi" pada teks UI diganti (dokumen disebut menurut statusnya Selesai/Tersimpan; berkas "ditutup"), dan "arsip" diganti "berkas"/"dokumen"; (7) perbaikan dokumen Material tanpa kolom keterangan; (8) yang benar "Tersimpan", bukan "Arsip Aktif" (tes `berkas-arsip-folder-pages.test.ts` disesuaikan di `4da7ed1`). Tidak ada perubahan perilaku fungsional dan tidak ada migrasi. Belum dijalankan: `pnpm test` dan pemeriksaan tampilan di aplikasi (tugas pemilik). *Temuan asli:* rancangan *sequence* (30 Sept sore) berbeda dari kode pada 29 dari 56 butir [cek]; ERD masih menuliskan relasi dan kolom siklus lama `manual_arsip`. | `laporan-verifikasi-langkah5.md`; `Rancangan Sequence Diagram 15 UC (30 Sept 2026).md` bagian 20; `rancangan-erd.md` temuan 31–38 | S (dokumen dan teks UI) |

**Pertanyaan yang butuh keputusan Anda**

| # | Pertanyaan | Status |
|---|---|---|
| Q1 | Monitoring Dokumen Tim dijadikan **UC baru** (menjadi 25 UC) atau **alur alternatif UC-19**? | ✅ **Diputuskan: UC baru (UC-25).** Total kerangka jadi 25 UC (lihat B.1). |
| Q2 | D-4: kunci permanen (Cara Pembayaran, TA) setelah ditutup, apakah memang aturan bisnis? Bila ya, tulis sebagai keputusan perancangan di Bab IV. | ✅ **Diputuskan: aturan bisnis disengaja** (1 Cara Pembayaran = 1 SPM per TA). Tidak perlu fitur "buka kembali". |
| Q3 | D-1 dan D-2 diperbaiki sebelum pengujian sistem, atau dicatat sebagai keterbatasan? | ✅ **Diputuskan: diperbaiki.** D-1 (`69f7fbe`), D-2 (`f26ee7f`). |
| Q4 | D-14: tambah kasus uji `KEMBALIKAN` di `tests/fsm.test.ts` sebelum Bab V, supaya klaim "seluruh transisi lolos unit testing" benar? | ✅ **Diputuskan: ditambahkan.** `89a93bd` — seluruh 8 transisi kini punya tes unit. |
| Q5 | Kolom "tahun" dokumen dan "tahun anggaran" berkas dibiarkan independen (dokumen TA 2025 bisa masuk berkas TA 2026)? | ✅ **Diputuskan: dibiarkan independen.** Sesuai desain saat ini (dokumen bisa realistis diajukan di TA berbeda dari saat diberkaskan). Tulis sebagai catatan desain di Bab IV, bukan keterbatasan; tidak ada perubahan kode. |
| Q6 | Filter periode dipakai bersama semua halaman laporan? Bawaan per halaman? | ✅ **Diputuskan:** satu `PeriodeSelector` + mode Bulanan; bawaan Triwulan untuk Nominal Realisasi, Laporan Kinerja, Laporan Kegiatan; bawaan Bulanan untuk Laporan Saya (`e6ba99c`). |
| Q7 | Dokumen tambahan KSBU masuk Laporan Kinerja? Lampirannya bisa dibuka dari laporan? Nominal Realisasi tetap "metadata saja"? | ✅ **Diputuskan:** masuk Laporan Kinerja; lampiran wajib minimal 1 dan bisa di-Preview/Unduh; aturan "metadata saja" di Nominal Realisasi **dicabut** untuk semua dokumen; PJ Kinerja diberi hak baca dokumen final (`e6ba99c`). |
| Q8 | Klaim cakupan Laporan Kinerja untuk skripsi? | ✅ **Diputuskan: klaim terbatas** (lihat PB-7.2). Sejak D-29 pengecualiannya tinggal tiga: dokumen belum berstatus Selesai atau Tersimpan, material tanpa Komponen, dan baris di atas 2000. Dokumen yang berkasnya dimusnahkan dan non-material yang dibersihkan kini tercakup (nominal dokumen dari berkas dimusnahkan tidak dihitung). |
| Q9 | Sisa kode lama (D-16) dan "Ingat saya" (D-9) dihapus sampai mana? | ✅ **Diputuskan: Golongan 1 saja** (kode mati dihapus; label riwayat lama dan sisa skema database dipertahankan, tanpa migrasi). |
| Q10 | Temuan terbuka D-6, D-7, D-8, D-10, D-13, D-15, D-19, D-25? | ✅ **Diputuskan: dicatat sebagai keterbatasan sistem** (K-1 s.d. K-9 di bawah). D-22: sesuai proses bisnis. D-21: tugas penulisan pemilik. |

**Status akhir Bagian D:** tidak ada lagi temuan tanpa keputusan. Semua sudah **selesai diperbaiki**, **diputuskan sebagai desain/proses bisnis**, **dicatat sebagai keterbatasan**, atau **catatan penulisan**.

### Daftar keterbatasan sistem (bahan Bab V, subbab keterbatasan / saran pengembangan)

| # | Keterbatasan | Asal | Dampak | Saran pengembangan |
|---|---|---|---|---|
| K-1 | Bila Admin memberi akun peran ADMIN bersama peran lain, sistem diam-diam hanya menyimpan ADMIN, tanpa pesan peringatan. | D-6 | Admin bisa mengira akun itu juga punya peran lain. | Tolak kombinasi tersebut dengan pesan yang jelas di formulir Master User. |
| K-2 | Aturan "minimal satu Admin aktif" diperiksa tanpa kunci baris, sehingga dua permintaan yang benar-benar bersamaan secara teori bisa menonaktifkan dua Admin terakhir. | D-7 | Sangat kecil di lingkungan satu satker. | Periksa dan ubah di dalam satu transaksi dengan kunci baris (`SELECT … FOR UPDATE`). |
| K-3 | Batas percobaan login (5 kali gagal per 10 menit) disimpan di memori proses: ter-reset saat server dimulai ulang, tidak berbagi antarproses, dan kuncinya memakai IP dari header yang bisa dipalsukan bila tanpa proxy tepercaya. | D-8 | Perlindungan brute-force lebih lemah dari seharusnya, meski aplikasi hanya di LAN. | Simpan hitungan di basis data atau Redis; percayai header IP hanya dari proxy yang dikenal. |
| K-4 | Untuk DOCX/XLSX, pemeriksaan isi file hanya membuktikan file itu berformat ZIP; jenis Office-nya mengikuti tipe yang dilaporkan browser. | D-10 | File ZIP lain yang diganti ekstensinya bisa lolos (pengunggah tetap pengguna internal yang login). | Periksa struktur internal paket Office (mis. `[Content_Types].xml`). |
| K-5 | Pembersihan lampiran non-material menghapus file lebih dulu, baru menandai basis data; tidak atomik. | D-13 | Bila penandaan gagal, file sudah hilang tetapi dokumen belum berlabel "dibersihkan" (aksi bisa diulang). | Tandai lebih dulu dalam transaksi, lalu hapus file dengan mekanisme antrean/retry. |
| K-6 | Tes end-to-end (Playwright, 67 kasus) tidak punya skrip `pnpm` dan tidak dijalankan rutin. | D-15 | Regresi tampilan tidak tertangkap otomatis. | Tambah skrip `test:e2e` dan jalankan di pipeline dengan basis data uji. |
| K-7 | Skema basis data masih menyimpan sisa desain lama: kolom `sessions.remember_me`, nilai `INAKTIF` dan peristiwa `BERKAS_DIPINDAHKAN_KE_INAKTIF` di constraint berkas, dan kolom `retensi_inaktif`/`masa_inaktif_berakhir`. (Kolom status dan siklus lama `manual_arsip` sudah dihapus di migrasi `0021`, D-29.) | D-16 (Golongan 3), D-9 | Tidak memengaruhi fungsi; hanya menambah kolom yang tidak bermakna. | Migrasi pembersihan skema setelah memastikan tidak ada data lama yang memakainya. |
| K-8 | Tabel audit (`audit.audit_log`: dokumen dihapus, lampiran/berkas dibersihkan) tidak punya halaman di aplikasi; hanya bisa dibaca langsung dari basis data. | D-19 | Pemeriksa tidak bisa menelusuri jejak itu dari aplikasi. | Tambah halaman baca-saja Log Audit untuk Admin/PJ Kinerja. |
| K-9 | "Lama tertahan" di Monitoring Dokumen Tim dihitung dari waktu terakhir dokumen ditulis (`updated_at`), bukan murni waktu perubahan status. | D-25 | Mengedit lampiran saat revisi ikut mereset hitungan. | Simpan kolom khusus `status_changed_at`, atau hitung dari riwayat `log_aktivitas`. |
| K-10 | Tiket unduhan ZIP laporan disimpan di memori proses server: hilang bila server dimulai ulang dalam 2 menit antara klik dan unduh, dan tidak berbagi antarproses. | D-31 | Pengguna harus mengklik Ekspor lagi (pesan 410 yang jelas); tidak berpengaruh selama aplikasi berjalan sebagai satu proses. | Simpan tiket di basis data, atau pakai token bertanda tangan seperti URL lampiran bila server dijalankan lebih dari satu proses. |
| K-11 | Penonaktifan data master (Fungsi, Kegiatan, Komponen, Jenis, Kategori, Detail) tidak memeriksa apakah data masih dirujuk dokumen, kelengkapan, atau data turunannya; Kelengkapan dihapus permanen tanpa pemeriksaan rujukan. Data nonaktif hanya tidak muncul lagi sebagai pilihan. | D-32 | Admin dapat menonaktifkan data yang masih dipakai; dokumen lama tetap utuh karena baris tidak dihapus. | Periksa rujukan sebelum menonaktifkan dan tampilkan peringatan (mis. jumlah dokumen dan anak yang terdampak). |
| K-12 | Tidak ada peringatan bila Tahun Anggaran berkas yang dipilih KSBU berbeda dari tahun dokumen (TA diisi awal dari tahun dokumen tetapi dapat diganti bebas). | D-32, Q5 | Dokumen dapat masuk berkas TA yang tidak sesuai tanpa disadari; keputusan akhir sepenuhnya pada KSBU. | Tampilkan peringatan atau konfirmasi tambahan bila TA ≠ tahun dokumen. |

Selain keterbatasan di atas, **asumsi desain** yang perlu ditulis di Bab IV: aplikasi untuk **satu satker** (D-22); satu Cara Pembayaran = satu SPM per TA (D-4/Q2); tahun dokumen independen dari TA berkas, dengan TA diisi awal dari tahun dokumen dan dapat diganti KSBU (Q5, K-12); aplikasi mandiri tanpa integrasi (§1).

---

## Lampiran — Catatan Teknis

> Bukan bagian dari permasalahan bisnis.

### A. Tumpukan teknologi

- **Framework:** TanStack Start (React 19 + TypeScript, file-based routing, server Nitro, Vite 7).
- **Basis data:** PostgreSQL 16 lokal + Drizzle ORM (driver `pg`).
- **Autentikasi:** lokal dengan cookie sesi `dms_session`.
- **Penyimpanan file:** filesystem lokal (`DMS_LOCAL_STORAGE_ROOT`).
- **Validasi:** Zod 4 di setiap batas.
- **ZIP:** archiver.
- **UI:** Tailwind CSS 4 + Base UI.
- **Pengujian:** Vitest + Playwright.
- **Manajer paket:** pnpm.

### B. Arsitektur kode

Berlapis dan diiris per fitur. Urutan standar handler: `requireSameOrigin` → `getLocalServerSession` → `hasLocalRole` → Zod → layanan `src/lib/*`. Menurut laporan graf graphify, node paling terhubung setelah `cn()` adalah `getLocalServerSession()` (230 sisi), `db` (185), `hasLocalRole()` (182), dan `requireSameOrigin()` (151). Layanan menerima repository lewat injeksi (`{ repository }`, `{ deps }`), sehingga logika submit, pemberkasan, pembersihan, dan ZIP diuji tanpa basis data.

### C. Basis data: enam skema

`auth`, `master`, `dokumen`, `arsip`, `audit`, `app`. Rinciannya ada di B.4. Aturan bisnis yang ditegakkan constraint:
- satu berkas per (Cara Pembayaran, TA);
- satu ketua tim per kegiatan;
- satu dokumen di satu berkas;
- item berkas punya tepat satu referensi sesuai tipe;
- berkas tertutup wajib punya waktu dan pelaku penutupan;
- berkas terbuka tidak punya status arsip;
- kategori kelengkapan butuh jenis, detail butuh kategori;
- nominal ≥ 0;
- username unik dan berformat;
- NIP unik.

### D. Berjalan mandiri di LAN

Seluruh komponen (DB, auth, file) lokal; tidak perlu internet. Postur: handoff internal/LAN terkontrol, bukan kesiapan produksi publik. PostgreSQL hanya mendengar di `127.0.0.1`.

### E. Keamanan tingkat implementasi

| Aspek | Nilai | Bukti |
|---|---|---|
| Hash kata sandi | Argon2id, memori 64 MiB, time cost 3, parallelism 1; hanya menerima hash `$argon2id$` | `src/lib/auth/password.ts:4,9-14,37-39` |
| Token sesi | 32 byte acak (base64url); disimpan sebagai SHA-256; lookup via hash | `session-constants.ts:6-7`, `session-token.ts:13-25` |
| Masa sesi | 8 jam (`SESSION_DURATION_SECONDS`) untuk semua sesi; tidak ada opsi "Ingat saya" (dihapus, D-9) | `session-constants.ts:9`, `local-auth-service.ts` |
| Cookie | `dms_session` HttpOnly, SameSite=Lax, Secure di production atau bila `DMS_SESSION_COOKIE_SECURE`; `dms_active_role` tidak HttpOnly (hanya UI) | `session-cookies.ts` |
| Rate-limit login | 5 gagal / 10 menit → jeda 15 menit, 429 + `Retry-After`; kunci `identifier + IP`; hanya 401 yang dihitung | `login-rate-limit.ts:3-5, 91-96`, `login.ts:59-65` (percobaan gagal ke-5 langsung dijawab 429, `:61-64`); akun nonaktif atau peran tidak valid dijawab 403 dan tidak dihitung |
| Pencabutan sesi | logout (satu sesi); ganti/reset sandi & nonaktif (semua sesi) | `logout.ts:24`, `local-user-passwords.ts:44,92`, `local-user-mutations.ts:328` |
| CSRF | same-origin untuk POST/PUT/PATCH/DELETE (Origin → Referer; host, `APP_URL`, `X-Forwarded-*`) | `same-origin.ts:3` |
| URL lampiran | HMAC-SHA256 `v1.<payload>.<sig>`, `timingSafeEqual`; pratinjau 15 menit, unduh 1 jam; terikat pengguna + sesi | `file-access-token.ts:27,210-216`, `document-file-access.ts:56-57` |
| Lampiran manual & berkas | tanpa token; sesi + peran dicek tiap permintaan; jalur baca untuk laporan terpisah dari jalur tulis KSBU; Ketua Tim hanya untuk kegiatan yang ia pimpin | `requireManualArsipApiSession`, `requireLaporanManualArsipSession` (`manual-arsip.ts:198,223`) |
| Unduhan ZIP laporan | tiket acak 32 byte, sekali pakai, 2 menit, terikat pengguna; POST pembuat tiket tetap melalui same-origin | `download-ticket.ts`, rute `*/export-zip` |
| Unggah | 5 MB; 8 ekstensi; 7 MIME; pasangan ekstensi↔MIME; magic bytes; sanitasi nama | `document-upload-policy.ts`, `local-upload.ts` |
| Aksi destruktif | frasa ketik-persis ditegakkan server (`BERSIHKAN`, `BERSIHKAN FILE BERKAS`); kandidat file dari data, bukan input klien; idempoten | §PB-6.3, PB-9 |
| Batas | ZIP 500 dokumen (413), file ZIP > 250 MB dilewati, pembersihan 200/permintaan | `document-zip.ts:73-74`, `pembersihan.ts:21` |

### F. Tampilan & pengalaman pengguna

- **Tema:** tiga tema (`se`, `sp`, `st`), dipilih Admin, berlaku global (`app.app_settings`), dengan sinkronisasi antartab lewat `epoch`.
- **Identitas aplikasi:** sub-judul bisa diatur.
- **Profil:** foto profil pengguna.
- **Umpan balik:** toast global dan dialog konfirmasi terpusat, dengan mode ketik-persis.
- **Formulir:** guard "perubahan belum disimpan"; unggahan tertunda dibuang saat halaman ditinggalkan.
- **Konsistensi komponen:** satu `PeriodeSelector` dan satu filter Status (Material/Non-Material) untuk semua halaman laporan; satu cara unduh ZIP (bawaan browser) untuk ekspor berkas dan ekspor laporan; satu gaya daftar lampiran (kartu + tombol Preview/Unduh + modal pratinjau PDF) untuk dokumen alur (`AttachmentViewer`) dan dokumen tambahan KSBU (`ManualArsipAttachmentViewer`); dialog detail yang sama di Laporan Saya, Laporan Kegiatan, Nominal Realisasi, dan Laporan Kinerja.
- **Login:** tombol lihat/sembunyikan kata sandi.
- **Bantuan** (`/bantuan`, 354 baris): tautan di footer sidebar (`AppSidebar.tsx:271`), layout (`AppLayout.tsx:464`), dan halaman login.

### G. Catatan istilah "DMS"

Aplikasi ini bukan Document Management System klasik: tidak ada versioning, pencarian isi, atau editing kolaboratif. Yang dikelola adalah **record transaksi** (`dokumen_transaksi`) beserta status dan lampirannya. Prefiks `dms_`/`DMS_` di cookie dan env hanyalah peninggalan nama.

### H. Istilah yang sudah tidak dipakai

| Istilah usang | Pengganti / status |
|---|---|
| `BENDAHARA`, `IN_BENDAHARA_APPROVAL`, `/bendahara` | `PPSPM`, `IN_PPSPM_APPROVAL`, `/ppspm` |
| Status `ARCHIVED`; aksi `ARCHIVE`, `SKIP` | dihapus |
| `/arsiparis` | `/kasubag` |
| Tahap "Arsip Inaktif" | dibuang |
| Kategori manual Pemeliharaan/Pengadaan/Lain-lain | diganti Komponen |
| "Laporan Klasifikasi", "Pencarian Arsip global" | dihapus |
| Master Jenis Dokumen, `jenis_dokumen_id` | dihapus (0019) |
| Login email | username/NIP (0017) |
| "1 berkas terbuka per Cara Pembayaran" | 1 berkas per Cara Pembayaran × TA (0018) |
| `PATCH /api/dokumen/$id/nominal`, `POST /api/dokumen`, jalur Draf | dihapus |
| `RoleSwitcher.tsx` | perpindahan peran di `AppLayout.tsx` |
| Orkestrator submit runtime | dihapus (`fc59b44`) |
| Rute `/dokumen`, `/dokumen/aju`, `/dokumen/saya`, `/dokumen/$id(/edit)` | dihapus (D-16); pakai `/pegawai/dokumen/**` |
| `POST /api/dokumen/rename-pending`, parameter `useLocal*DryRun` | dihapus (D-16) |
| "Ingat saya" (`REMEMBER_ME_DURATION_SECONDS`) | dihapus (D-9); sesi selalu 8 jam |
| "Activity Log", "Settings" (label menu) | "Log Aktivitas", "Pengaturan Aplikasi" (D-5) |
| Nominal Realisasi "metadata saja" | dicabut; detail + lampiran bisa dibuka (`e6ba99c`) |
| "Dokumen final", "Dokumen Final", "Metadata final", "Belum final", "finalisasi berkas" | Sebut menurut status: dokumen **Selesai** (Material) atau **Tersimpan** (Non-Material); berkas **ditutup**, berstatus **Terbuka** atau **Tersimpan**; "Nomor SPM dan masa simpan" (`4da7ed1`, D-32). Identifier `scope: 'final'` dan `final_statuses` di kode tetap ada (bukan teks UI) |
| "Arsip Aktif", "Diarsipkan" (teks UI) | **Tersimpan**; **Diberkaskan** (`4da7ed1`) |

---

*Dokumen ini bahan penulisan Bab IV dan Bab V. Bila perilaku aplikasi berubah, kode di `src/` dan `drizzle/` adalah otoritas: perbarui dokumen ini mengikuti kode.*
