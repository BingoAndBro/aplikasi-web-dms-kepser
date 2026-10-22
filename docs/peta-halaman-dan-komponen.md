# Peta Halaman dan Komponen

Disusun 2 Oktober 2026 dari kode di branch `migration/postgres-local` (HEAD `4da7ed1`, 30 Sep 2026) dan `git log`. Daftar halaman mengikuti [docs/screenshots/INDEX.md](screenshots/INDEX.md), yang dihasilkan oleh `scripts/screenshots/capture.mjs`. Semua nama berkas di bawah relatif terhadap `src/` kecuali disebut lain.

Dokumen ini hanya memuat hal yang terbukti dari kode atau git. Hal yang tidak dapat dibuktikan ditulis "tidak dapat dipastikan".

**Konvensi.** "Komponen bersama" berarti satu berkas komponen yang benar-benar di-*import* oleh lebih dari satu route. "Primitif bersama" berarti route memakai kumpulan pembungkus kecil yang sama (header, panel, tabel, kartu), tetapi tata letak halamannya ditulis ulang di tiap berkas route.

---

## 1. Tabel semua route halaman

Route API (`routes/api/**`) tidak dimasukkan. Route layout yang hanya berisi `<Outlet />` atau penjaga peran (`admin.tsx`, `kasubag.tsx`, `ppk.tsx`, `ppspm.tsx`, `penanggung-jawab-kinerja.tsx`, `pegawai/dokumen.tsx`, `pegawai/dokumen/$id.tsx`, `ppk/dokumen/$id.tsx`) juga tidak dimasukkan sebagai halaman. Pengecualiannya `pegawai.tsx`, karena berkas itu juga merender Dashboard Pegawai.

Ketua Tim tidak punya prefiks route sendiri. Halamannya berada di bawah `/pegawai/*` (dijaga peran `PEGAWAI`), lalu tiap halaman memeriksa sendiri status ketua tim melalui `/users/me/ketua-tim`.

| Peran | Halaman | Route | Berkas route | Komponen halaman utama | Tangkapan layar (INDEX.md) |
|---|---|---|---|---|---|
| Umum | Pengalihan awal | `/` | `routes/index.tsx` | — (mengalihkan ke login atau ke route default peran) | tidak dipotret |
| Umum | Login | `/login` | `routes/login.tsx` | — (ditulis langsung di berkas) | `umum/01-login.png` |
| Umum | Profil | `/profile` | `routes/profile.tsx` | `PageLayout`, `ui/AppDialog`, `ui/UserAvatar`, `ui/RoleBadge` | `umum/02-profil.png` |
| Umum | Bantuan | `/bantuan` | `routes/bantuan.tsx` | `PageLayout` | `umum/03-bantuan.png` |
| Umum | Akses ditolak | `/forbidden` | `routes/forbidden.tsx` | — | tidak dipotret |
| Pegawai | Dashboard Pegawai | `/pegawai` | `routes/pegawai.tsx` | `dashboard/DashboardShell`, `dashboard/RoleDashboardPrimitives` | `pegawai/01-dashboard.png` |
| Pegawai | Ajukan Dokumen (wizard) | `/pegawai/dokumen/aju` | `routes/pegawai/dokumen/aju.tsx` | `dokumen/StepIndicator`, `dokumen/form/Step*` (10 langkah), `ui/ConfirmDialog`, `PegawaiPagePrimitives` | `pegawai/02-…` s.d. `16-…` |
| Pegawai | Dokumen Diajukan | `/pegawai/dokumen` | `routes/pegawai/dokumen/index.tsx` | `PegawaiPagePrimitives` + `WorkflowSearchPanel`/`WorkflowStatusSelect` | `pegawai/20-dokumen-diajukan.png` |
| Pegawai, Ketua Tim | Detail Dokumen | `/pegawai/dokumen/:id` | `routes/pegawai/dokumen/$id/index.tsx` | `dokumen/AttachmentViewer`, `dokumen/ActivityLog`, `ui/StatusBadge`, `dokumen/LampiranDibersihkanBadge` | `pegawai/21-…` s.d. `25-…`, `pegawai/35-…`, `ketua-tim/10-…` |
| Pegawai | Edit Dokumen (Non-Material) | `/pegawai/dokumen/:id/edit` | `routes/pegawai/dokumen/$id/edit.tsx` | `dokumen/AttachmentEditor` | tidak dipotret |
| Pegawai | Revisi Dokumen (daftar) | `/pegawai/revisi` | `routes/pegawai/revisi.tsx` | `PegawaiPagePrimitives` + `Workflow*` | `pegawai/30-revisi-dokumen-daftar.png` |
| Pegawai | Halaman Revisi Dokumen | `/pegawai/dokumen/:id/revisi` | `routes/pegawai/dokumen/$id/revisi.tsx` | `dokumen/AttachmentEditor`, `dokumen/ActivityLog`, `ui/ConfirmDialog` | `pegawai/31-…` s.d. `34-…` |
| Pegawai | Laporan Saya | `/pegawai/laporan/saya` | `routes/pegawai/laporan/saya.tsx` | `laporan/PeriodeSelector`, `laporan/HierarchicalFilter`, `laporan/ExportZipDialog`, `dokumen/DokumenDetailDialog` | `pegawai/40-…`, `41-…` |
| Pegawai | Log Aktivitas | `/pegawai/activity-log` | `routes/pegawai/activity-log.tsx` | `activity-log/ActivityLogView` (`scope="self"`) | `pegawai/50-log-aktivitas.png` |
| Ketua Tim | Monitoring Dokumen Tim | `/pegawai/monitoring-dokumen-tim` | `routes/pegawai/monitoring-dokumen-tim.tsx` | `laporan/FilterToolbar`, `laporan/ExportZipDialog`, `dokumen/DokumenDetailDialog`, `SummaryCard` (dari `kinerja/MonitoringRealisasiView`) | `ketua-tim/01-…`, `02-…` |
| Ketua Tim | Laporan Kegiatan | `/pegawai/laporan/kegiatan` | `routes/pegawai/laporan/kegiatan.tsx` | `laporan/PeriodeSelector`, `laporan/FilterToolbar`, `laporan/ExportZipDialog`, `dokumen/DokumenDetailDialog`, `arsip/ManualArsipDetailDialog`, `SummaryCard` | `ketua-tim/03-…` s.d. `05-…`, `11-…` |
| Ketua Tim | Pembersihan Dokumen (Non-Material) | `/pegawai/pembersihan-dokumen` | `routes/pegawai/pembersihan-dokumen.tsx` | `ui/ConfirmDialog` (`requireTyped`), `dokumen/DokumenDetailDialog` | `ketua-tim/06-…` s.d. `09-…` |
| PPK | Dashboard PPK | `/ppk` | `routes/ppk/index.tsx` | `RoleDashboardPrimitives` | `ppk/01-dashboard.png` |
| PPK | Validasi Dokumen | `/ppk/inbox` | `routes/ppk/inbox.tsx` | `workflow/PpkPpspmPagePrimitives` | `ppk/02-validasi-dokumen.png` |
| PPK | Detail Dokumen PPK | `/ppk/dokumen/:id` | `routes/ppk/dokumen/$id/index.tsx` | `AttachmentViewer` (`apiType="ppk"`), `ActivityLog`, `ConfirmDialog` (Validasi; Tolak dengan `withReason`) | `ppk/03-…` s.d. `09-…` |
| PPK | Ajukan Ulang dokumen revisi | `/ppk/dokumen/:id/resubmit` | `routes/ppk/dokumen/$id/resubmit.tsx` | `AttachmentEditor`, `ActivityLog`, `ConfirmDialog` | tidak dipotret |
| PPK | Dokumen Tervalidasi | `/ppk/tervalidasi` | `routes/ppk/tervalidasi.tsx` | `PpkPpspmPagePrimitives` | `ppk/10-dokumen-tervalidasi.png` |
| PPK | Dokumen Tidak Valid | `/ppk/ditolak` | `routes/ppk/ditolak.tsx` | `PpkPpspmPagePrimitives` | `ppk/11-dokumen-tidak-valid.png` |
| PPK | Revisi dari PPSPM | `/ppk/revisi` | `routes/ppk/revisi.tsx` | `PpkPpspmPagePrimitives` | `ppk/12-revisi-dari-ppspm.png` |
| PPK | Nominal Realisasi | `/ppk/monitoring-realisasi` | `routes/ppk/monitoring-realisasi.tsx` | `kinerja/MonitoringRealisasiView` | `ppk/13-…` s.d. `18-…` |
| PPK | Log Aktivitas | `/ppk/activity-log` | `routes/ppk/activity-log.tsx` | `ActivityLogView` (`self`) | `ppk/19-log-aktivitas.png` |
| PPSPM | Dashboard PPSPM | `/ppspm` | `routes/ppspm/index.tsx` | `RoleDashboardPrimitives` | `ppspm/01-dashboard.png` |
| PPSPM | Persetujuan Dokumen | `/ppspm/inbox` | `routes/ppspm/inbox.tsx` | `PpkPpspmPagePrimitives` | `ppspm/02-persetujuan-dokumen.png` |
| PPSPM | Detail Dokumen PPSPM | `/ppspm/dokumen/:id` | `routes/ppspm/dokumen/$id.tsx` | `AttachmentViewer` (`apiType="ppspm"`), `ActivityLog`, `ConfirmDialog` (Setujui; Tolak dengan `withReason`) | `ppspm/03-…` s.d. `09-…` |
| PPSPM | Dokumen Ditolak | `/ppspm/ditolak` | `routes/ppspm/ditolak.tsx` | `PpkPpspmPagePrimitives` | `ppspm/10-dokumen-ditolak.png` |
| PPSPM | Dokumen Selesai | `/ppspm/selesai` | `routes/ppspm/selesai.tsx` | `PpkPpspmPagePrimitives` | `ppspm/11-dokumen-selesai.png` |
| PPSPM | Nominal Realisasi | `/ppspm/monitoring-realisasi` | `routes/ppspm/monitoring-realisasi.tsx` | `MonitoringRealisasiView` | `ppspm/12-…` s.d. `17-…` |
| PPSPM | Log Aktivitas | `/ppspm/activity-log` | `routes/ppspm/activity-log.tsx` | `ActivityLogView` (`self`) | `ppspm/18-log-aktivitas.png` |
| KSBU | Dashboard Kepala Sub Bagian Umum | `/kasubag` | `routes/kasubag/index.tsx` | `RoleDashboardPrimitives` | `kepala-sub-bagian-umum/01-dashboard.png` |
| KSBU | Pengklasifikasian Dokumen (daftar) | `/kasubag/inbox` | `routes/kasubag/inbox.tsx` | `Workflow*` + `ArchiveTableShell`/`ArchiveMobileList` | `kepala-sub-bagian-umum/02-…` |
| KSBU | Pengklasifikasian (halaman dokumen) | `/kasubag/dokumen/:id` | `routes/kasubag/dokumen/$id/index.tsx` | `AttachmentViewer`, `ActivityLog`, `ConfirmDialog`, `ArchivePanel`, `WorkflowPanel` | `kepala-sub-bagian-umum/03-…` s.d. `06-…` |
| KSBU | Penambahan Dokumen (wizard) | `/kasubag/penambahan-arsip` | `routes/kasubag/penambahan-arsip.tsx` | `StepIndicator`, `form/StepFungsiTanggal`, `form/StepKegiatan`, `form/StepKomponen`, `arsip/ManualArsipAttachments`, `ConfirmDialog` | `kepala-sub-bagian-umum/10-…` s.d. `14-…` |
| KSBU | Berkas Terbuka | `/kasubag/berkas` | `routes/kasubag/berkas/index.tsx` | `archive/ArchivePagePrimitives` | `kepala-sub-bagian-umum/20-…`, `27-…` |
| KSBU | Detail Berkas | `/kasubag/berkas/:id` | `routes/kasubag/berkas/$id.tsx` | `ArchivePagePrimitives` (`ArchiveTabs`), `berkas/-components/CloseBerkasDialog`, `ConfirmDialog` (`requireTyped`) | `kepala-sub-bagian-umum/21-…` s.d. `26-…`, `31-…` s.d. `33-…`, `35-…` s.d. `37-…` |
| KSBU | Berkas Tertutup | `/kasubag/berkas/tertutup` | `routes/kasubag/berkas/tertutup.tsx` | `ArchivePagePrimitives`, `ConfirmDialog` | `kepala-sub-bagian-umum/30-berkas-tertutup.png` |
| KSBU | Pembersihan Berkas | `/kasubag/pembersihan` | `routes/kasubag/pembersihan/index.tsx` | `ArchivePagePrimitives`, `ConfirmDialog` (`requireTyped`) | `kepala-sub-bagian-umum/34-…`, `38-…` |
| KSBU | Master Klasifikasi Dokumen | `/kasubag/klasifikasi` | `routes/kasubag/klasifikasi.tsx` | `PageLayout`, `ConfirmDialog` (selebihnya ditulis di berkas) | `kepala-sub-bagian-umum/40-…`, `41-…` |
| KSBU | Log Aktivitas | `/kasubag/activity-log` | `routes/kasubag/activity-log.tsx` | `ActivityLogView` (`self`) | `kepala-sub-bagian-umum/50-log-aktivitas.png` |
| PJ Kinerja | Dashboard Penanggung Jawab Kinerja | `/penanggung-jawab-kinerja` | `routes/penanggung-jawab-kinerja/index.tsx` | `RoleDashboardPrimitives` | `penanggung-jawab-kinerja/01-dashboard.png` |
| PJ Kinerja | Laporan Kinerja | `/penanggung-jawab-kinerja/laporan-kinerja` | `routes/penanggung-jawab-kinerja/laporan-kinerja.tsx` | `MonitoringRealisasiView` (`scope="laporan_kinerja"`) | `penanggung-jawab-kinerja/02-…` s.d. `07-…` |
| PJ Kinerja | Log Aktivitas | `/penanggung-jawab-kinerja/activity-log` | `routes/penanggung-jawab-kinerja/activity-log.tsx` | `ActivityLogView` (`scope="all"`) | `penanggung-jawab-kinerja/10-log-aktivitas.png` |
| Admin | Dashboard Admin | `/admin` | `routes/admin.index.tsx` | `RoleDashboardPrimitives` | `admin/01-dashboard.png` |
| Admin | (pengalihan) | `/admin/master-data` | `routes/admin.master-data.index.tsx` | — (mengalihkan ke `/admin/master-data/fungsi`) | tidak dipotret |
| Admin | Master User | `/admin/master-data/user` | `routes/admin.master-data.user.tsx` | `admin/AdminPagePrimitives`, `ConfirmDialog`, `UserAvatar`, `RoleBadge` | `admin/02-…` s.d. `05-…` |
| Admin | Departemen Fungsi | `/admin/master-data/fungsi` | `routes/admin.master-data.fungsi.tsx` | `AdminPagePrimitives` | `admin/10-…`, `11-…` |
| Admin | Master Kegiatan | `/admin/master-data/kegiatan` | `routes/admin.master-data.kegiatan.tsx` | `AdminPagePrimitives` | `admin/12-…`, `13-…` |
| Admin | Master Komponen | `/admin/master-data/komponen` | `routes/admin.master-data.komponen.tsx` | `AdminPagePrimitives` | `admin/14-…`, `15-…` |
| Admin | Jenis Permintaan | `/admin/master-data/jenis` | `routes/admin.master-data.jenis.tsx` | `AdminPagePrimitives` | `admin/16-…`, `17-…` |
| Admin | Kategori Permintaan | `/admin/master-data/kategori` | `routes/admin.master-data.kategori.tsx` | `AdminPagePrimitives` | `admin/18-…`, `19-…` |
| Admin | Detail Permintaan | `/admin/master-data/detail` | `routes/admin.master-data.detail.tsx` | `AdminPagePrimitives` | `admin/20-…`, `21-…` |
| Admin | Kelengkapan Dokumen | `/admin/master-data/kelengkapan` | `routes/admin.master-data.kelengkapan.tsx` | `AdminPagePrimitives` (tanpa `AdminTableShell`/`AdminSearchPanel`) | `admin/30-…` s.d. `32-…` |
| Admin | Pengaturan Aplikasi | `/admin/settings` | `routes/admin.settings.tsx` | `AdminPagePrimitives` | `admin/40-pengaturan-aplikasi.png` |
| Admin | Log Aktivitas (semua pengguna) | `/admin/activity-log` | `routes/admin.activity-log.tsx` | `ActivityLogView` (`scope="all"`) | `admin/50-log-aktivitas.png` |

Semua halaman dibungkus `components/layout/AppLayout` dan `ui/confirm/ConfirmProvider` dari `routes/__root.tsx`.

**Route yang tidak punya tangkapan layar di INDEX.md:** `/`, `/forbidden`, `/admin/master-data` (keduanya pengalihan atau halaman sistem), `/pegawai/dokumen/:id/edit`, dan `/ppk/dokumen/:id/resubmit`.

---

## 2. Kelompok halaman berdasarkan komponen/templat

### Ringkasan kelompok

Kolom terakhir menjawab pertanyaan apakah anggota kelompok benar-benar merender komponen yang sama, atau hanya mirip.

| # | Kelompok | Dasar kesamaan | Satu komponen? |
|---|---|---|---|
| A | Detail dokumen (Pegawai/Ketua Tim, PPK, PPSPM, KSBU) | `AttachmentViewer` + `ActivityLog` + pola 3 tab | **Tidak.** Empat berkas route terpisah dengan tata letak disalin |
| B | Penyunting revisi (Pegawai Revisi, PPK Ajukan Ulang, Edit Non-Material) | `AttachmentEditor` | **Tidak.** Dua berkas revisi disalin; Edit lebih sederhana |
| C | Daftar dokumen alur kerja | `PpkPpspmPagePrimitives` | **Tidak.** Satu berkas per halaman; primitif bersama |
| D | Monitoring/laporan berbasis `MonitoringRealisasiView` | `kinerja/MonitoringRealisasiView` | **Ya.** Route hanya 32–42 baris |
| E | Laporan halaman Pegawai/Ketua Tim (Saya, Kegiatan, Monitoring Tim) | `laporan/*`, `DokumenDetailDialog`, `ExportZipDialog` | **Tidak.** Tiga berkas besar terpisah |
| F | Arsip/berkas KSBU | `ArchivePagePrimitives` | **Tidak.** Primitif bersama |
| G | Data master Admin | `AdminPagePrimitives` | **Tidak.** Primitif bersama |
| H | Wizard pengajuan/penambahan | `StepIndicator` + `form/Step*` | **Tidak.** Dua berkas; tiga langkah form dipakai bersama |
| I | Log Aktivitas | `activity-log/ActivityLogView` | **Ya.** Route 6 baris |
| J | Dashboard peran | `RoleDashboardPrimitives` | **Tidak.** Primitif bersama |
| K | Dialog (konfirmasi, pop-up detail, ekspor ZIP) | `ui/ConfirmDialog`, `DokumenDetailDialog`, `ExportZipDialog` | Ya untuk tiap komponen dialog; ada beberapa varian lokal |

---

### A. Detail dokumen

**Komponen bersama:** `components/dokumen/AttachmentViewer.tsx`, `components/dokumen/ActivityLog.tsx`, `components/ui/StatusBadge.tsx`, `components/ui/ConfirmDialog.tsx`, `components/dokumen/LampiranDibersihkanBadge.tsx` (tidak dipakai oleh halaman KSBU).

**Anggota:**
- `routes/pegawai/dokumen/$id/index.tsx`: Pegawai, dan juga Ketua Tim (`ketua-tim/10-…`)
- `routes/ppk/dokumen/$id/index.tsx`: PPK
- `routes/ppspm/dokumen/$id.tsx`: PPSPM
- `routes/kasubag/dokumen/$id/index.tsx`: KSBU

**Yang sama, tetapi disalin per berkas.** Keempat berkas mendefinisikan sendiri `DETAIL_TABS` dengan isi identik: Metadata Dokumen, Lampiran, Riwayat. Masing-masing juga punya `MetadataDetailCard` lokal, kecuali KSBU. Panel status di sisi kanan juga lokal per berkas: di Pegawai bernama fungsi `WorkflowPanel` (bukan impor dari `PpkPpspmPagePrimitives`), di PPK/PPSPM bernama `RoleStatusPanel`. Fungsi `RevisionNoteCard`, `getStatusTone`, dan `getStatusDescription` juga disalin. Jadi tampilannya sama, tetapi **kodenya terpisah**.

**Yang berbeda antaranggota:**

| Aspek | Pegawai/Ketua Tim | PPK | PPSPM | KSBU |
|---|---|---|---|---|
| Panel aksi kanan | "Edit Dokumen" (hanya Non-Material, ke `/pegawai/dokumen/:id/edit`) dan Kembali | "Validasi ke PPSPM" dan "Tolak" bila status `IN_PPK_VALIDATION`, lalu Kembali | "Setujui Dokumen" dan "Tolak" bila status `IN_PPSPM_APPROVAL`, lalu Kembali | Form "Klasifikasi Dokumen" (pohon Cara Pembayaran/Klasifikasi dan Catatan Klasifikasi opsional), dengan draf disimpan lokal |
| Dialog | — | `ConfirmDialog` Validasi; Tolak dengan `withReason` | `ConfirmDialog` Setujui; Tolak dengan `withReason` | `ConfirmDialog` konfirmasi klasifikasi dan peringatan keluar halaman |
| Catatan revisi | dari PPK atau PPSPM (`revision_target`) | "Catatan Revisi dari PPK/PPSPM" | "Catatan Revisi dari PPSPM" | — |
| `AttachmentViewer apiType` | bawaan | `"ppk"` | `"ppspm"` | bawaan |
| Badge status | `dok.status` | `dokumen.status` | `dokumen.status` | tetap `COMPLETED` |

### B. Penyunting revisi / ajukan ulang

**Komponen bersama:** `components/dokumen/AttachmentEditor.tsx`, ditambah `ActivityLog` dan `ConfirmDialog`.

**Anggota:** `routes/pegawai/dokumen/$id/revisi.tsx`, `routes/ppk/dokumen/$id/resubmit.tsx` (tidak dipotret), dan `routes/pegawai/dokumen/$id/edit.tsx` (tidak dipotret).

**Yang sama, tetapi disalin.** Halaman Revisi Pegawai dan Ajukan Ulang PPK sama-sama mendefinisikan tahapan Draft → PPK → PPSPM → Selesai serta tab "Metadata & Ringkasan Revisi / Metadata & Lampiran / Riwayat". Isinya identik, tetapi ditulis di dua berkas.

**Yang berbeda:**
- **Tombol kirim.** Pegawai: "Ajukan Ulang ke PPK", atau "Ajukan Ulang ke Ketua Tim" untuk Non-Material. PPK: "Ajukan Ulang ke PPSPM". Edit: "Simpan Perubahan".
- **Aksi tambahan PPK.** Ada dialog "Kembalikan ke Pegawai?".
- **Halaman Edit** tidak punya tab maupun riwayat; isinya hanya `AttachmentEditor`.

### C. Daftar dokumen alur kerja

**Komponen bersama:** `components/workflow/PpkPpspmPagePrimitives.tsx`, yaitu `WorkflowPageHeader`, `WorkflowSearchPanel`, `WorkflowStatusSelect`, `WorkflowTableShell`, `WorkflowMobileList/Card`, `DocumentListStatusBadge`, `WorkflowDateCell`, `WorkflowActionButton`, dan `WorkflowPagination`.

**Anggota dan perbedaannya:**

| Halaman | Berkas | Kolom tabel | Filter/penomoran halaman |
|---|---|---|---|
| PPK Validasi Dokumen | `ppk/inbox.tsx` | No, Judul Dokumen, Kegiatan, Status, Tanggal Ajuan, Aksi | pencarian, `WorkflowPagination` |
| PPK Dokumen Tervalidasi | `ppk/tervalidasi.tsx` | sama | pencarian, `WorkflowStatusSelect` |
| PPK Dokumen Tidak Valid | `ppk/ditolak.tsx` | sama | pencarian |
| PPK Revisi dari PPSPM | `ppk/revisi.tsx` | sama | pencarian, `WorkflowPagination`; aksi menuju `/ppk/dokumen/:id/resubmit` |
| PPSPM Persetujuan Dokumen | `ppspm/inbox.tsx` | sama | pencarian |
| PPSPM Dokumen Ditolak | `ppspm/ditolak.tsx` | No, Judul Dokumen, Kegiatan, Status, **Tanggal**, Aksi | pencarian |
| PPSPM Dokumen Selesai | `ppspm/selesai.tsx` | sama dengan Ditolak | pencarian |
| Pegawai Dokumen Diajukan | `pegawai/dokumen/index.tsx` | No, Judul Dokumen, Kegiatan, Status, Tanggal Ajuan, Aksi | `WorkflowSearchPanel`, `WorkflowStatusSelect`, `PegawaiPagination`; header memakai `PegawaiPagePrimitives` |
| Pegawai Revisi Dokumen | `pegawai/revisi.tsx` | sama | `WorkflowSearchPanel`, `PegawaiPagination` |
| KSBU Pengklasifikasian | `kasubag/inbox.tsx` | No, Judul Dokumen, Kegiatan, **Nominal Realisasi**, **Tanggal Selesai**, Aksi | `WorkflowSearchPanel`, `WorkflowStatusSelect`; tabel memakai `ArchiveTableShell` (campuran primitif) |

Setiap halaman adalah berkas terpisah, dengan sumber data (`/ppk/inbox`, `/ppk/tervalidasi`, dan seterusnya) dan teks kosong masing-masing.

### D. Monitoring/laporan berbasis `MonitoringRealisasiView` (satu komponen)

**Komponen bersama:** `components/kinerja/MonitoringRealisasiView.tsx` (1.953 baris) dan `components/kinerja/monitoringRealisasiNavigation.ts`. Di dalamnya dipakai `laporan/PeriodeSelector`, `laporan/FilterToolbar`, `dokumen/DokumenDetailDialog`, dan `arsip/ManualArsipDetailDialog`.

**Anggota:** `routes/ppk/monitoring-realisasi.tsx`, `routes/ppspm/monitoring-realisasi.tsx`, dan `routes/penanggung-jawab-kinerja/laporan-kinerja.tsx`. Ketiganya mendeklarasikan parameter URL yang sama (`fungsiId`, `kegiatanId`, `komponenId`, `groupBy`, `pegawaiId`, `periode`, `tahun`, `triwulan`, `bulan`, `dari`, `sampai`). `diff` route PPK dengan PPSPM hanya menunjukkan perbedaan path dan nama fungsi.

**Yang berbeda (hanya lewat props):**

| Aspek | Nominal Realisasi (PPK, PPSPM) | Laporan Kinerja (PJ Kinerja) |
|---|---|---|
| Judul | "Monitoring Nominal Realisasi" | bawaan "Laporan Kinerja" |
| `scope` | tidak diisi | `"laporan_kinerja"` (dikirim ke `/laporan/kinerja?scope=`) |
| Kedalaman drill-down | Fungsi → Kegiatan → **Komponen** → Dokumen | Fungsi → Kegiatan → Dokumen (`stopAtKegiatan`, D-30) |
| Catatan cakupan | Material Selesai + dokumen tambahan KSBU; dokumen dari berkas dimusnahkan **tidak ditampilkan** | Material Selesai + Non-Material Tersimpan + tambahan KSBU; dokumen dari berkas dimusnahkan **tetap ditampilkan**, tetapi nominalnya tidak dihitung |

Mode "per pegawai" (`groupBy=pegawai`) tersedia di ketiga route, karena ketiganya meneruskan `onSelectPegawai`/`onSelectGroupBy` dari `createMonitoringRealisasiHandlers`. Kode komponen ini tidak memuat tombol Ekspor ZIP.

### E. Laporan halaman Pegawai/Ketua Tim (mirip, kode terpisah)

**Komponen bersama:** `components/laporan/ExportZipDialog.tsx`, `components/laporan/FilterToolbar.tsx`, `components/laporan/PeriodeSelector.tsx`, `components/dokumen/DokumenDetailDialog.tsx`, `components/dokumen/LampiranDibersihkanBadge.tsx`, `PegawaiPanel`, dan `SummaryCard` (diimpor dari `kinerja/MonitoringRealisasiView.tsx`).

**Anggota:** `routes/pegawai/laporan/saya.tsx` (592 baris), `routes/pegawai/laporan/kegiatan.tsx` (1.440 baris), `routes/pegawai/monitoring-dokumen-tim.tsx` (770 baris).

**Yang berbeda:**

| Aspek | Laporan Saya | Laporan Kegiatan | Monitoring Dokumen Tim |
|---|---|---|---|
| Filter periode | `PeriodeSelector`, bawaan **BULANAN** | `PeriodeSelector`, bawaan **TRIWULAN** | **tidak ada** `PeriodeSelector`; hanya rentang "Tanggal Dokumen Dari/Sampai" (`DatePicker`) |
| Filter lain | `HierarchicalFilter` (Fungsi, Kegiatan; rentang tanggal disembunyikan dengan `showDateRange={false}`), Status | `FilterToolbar`: Fungsi, Komponen, Jenis, Kategori, Detail Permintaan, Pembuat, Status, rentang tanggal, Urutkan | `FilterToolbar`: Kegiatan, Pembuat, Posisi Dokumen, "Tertahan (belum selesai)", rentang tanggal, Urutkan |
| Kolom | Judul Dokumen, Kegiatan, Status, Tanggal, Aksi | Tingkat kegiatan: Kegiatan, Fungsi, Jumlah Dokumen, Nominal Realisasi, Tanggal Terakhir, Aksi. Tingkat dokumen: Judul, Jenis Scope, Status, Tanggal Dokumen, Nominal Realisasi, Aksi | Judul Dokumen, Kegiatan, Posisi Saat Ini, Aktivitas Terakhir, Aksi |
| Kartu ringkasan | — | 4 `SummaryCard` (mis. Total Nominal Realisasi, Dokumen Material/Non-Material) | 4 `SummaryCard` posisi (Validasi PPK, Persetujuan PPSPM, Perlu Revisi, Selesai) |
| Pop-up detail | `DokumenDetailDialog` | `DokumenDetailDialog` + `ManualArsipDetailDialog` (dokumen tambahan KSBU) | `DokumenDetailDialog` |
| Periode di URL | tidak dibaca (tanpa `validateSearch`) | tidak dibaca (`validateSearch` hanya `kegiatanId`) | — |

**Tampak mirip, kode terpisah:**
- **Laporan Kegiatan vs Laporan Kinerja.** Keduanya punya catatan cakupan yang hampir sama, tetapi Laporan Kegiatan ditulis di berkas sendiri. Laporan Kegiatan tidak memakai `MonitoringRealisasiView`; ia hanya mengimpor `SummaryCard` dari sana.
- **Pembersihan Dokumen Ketua Tim** (`pegawai/pembersihan-dokumen.tsx`) memakai `DokumenDetailDialog` dan `DatePicker` seperti kelompok ini, tetapi bukan halaman laporan.

### F. Arsip/berkas KSBU

**Komponen bersama:** `components/archive/ArchivePagePrimitives.tsx` (`ArchivePageHeader`, `ArchiveSearchPanel`, `ArchiveExportButton`, `ArchiveTableShell`, `ArchiveMobileList/Card`, `ArchiveTabs`, kelas `ARCHIVE_*`), serta `lib/archive/berkas-arsip-page-format.ts` dan `lib/archive/berkas-arsip-csv.ts`.

**Anggota dan perbedaannya:**

| Halaman | Berkas | Kolom | Pembeda |
|---|---|---|---|
| Berkas Terbuka | `kasubag/berkas/index.tsx` | No, Cara Pembayaran, Jumlah Dokumen, Nominal Realisasi, Status Berkas, Terakhir Diperbarui, Aksi | `WorkflowStatusSelect` (Manual/Persetujuan), urutan |
| Berkas Tertutup | `kasubag/berkas/tertutup.tsx` | Cara Pembayaran, Nomor SPM, Jumlah Dokumen, Nominal Realisasi, Tgl Tutup, Umur Berkas, Aksi | dialog "Usulkan Pembersihan?" dan "Usulkan Semua yang Jatuh Tempo?" |
| Pembersihan Berkas | `kasubag/pembersihan/index.tsx` | Cara Pembayaran, Nomor SPM, Jumlah Dokumen, Nominal Realisasi, Status, Umur Berkas, Tanggal Ditutup, Aksi | tab Usulan Pembersihan / Sudah Dibersihkan; "Batalkan Usulan?"; "Bersihkan File Berkas" (ketik `BERSIHKAN FILE BERKAS`) |
| Detail Berkas | `kasubag/berkas/$id.tsx` (2.211 baris) | Daftar Dokumen: Judul Dokumen, Sumber, Tanggal Dokumen, Pengaju / Pembuat, Nominal Realisasi, Aksi | `ArchiveTabs` (Metadata Berkas / Daftar Dokumen / Riwayat Aktivitas), `CloseBerkasDialog`, ekspor ZIP, usul/bersihkan |

Halaman lain yang memakai sebagian primitif ini: `kasubag/inbox.tsx`, `kasubag/dokumen/$id/index.tsx` (`ArchivePanel`), dan `kasubag/penambahan-arsip.tsx`.

### G. Data master Admin

**Komponen bersama:** `components/admin/AdminPagePrimitives.tsx` (`AdminPageHeader`, `AdminSearchPanel`, `AdminTableShell`, `AdminActionButtons`, `AdminFilterSelect`, `AdminFormSelect`, `AdminRelationPill`, `AdminCountPill`, `AdminConfirmationDialog`, `useAdminFormLeaveGuard`, kelas `admin*ClassName`), dengan `PageLayout`. Dialog Tambah/Ubah memakai `ui/dialog` dengan kelas `adminDialog*`.

**Anggota dan perbedaannya:**
- **Fungsi, Jenis** (`adminContentCompactClassName`). Tabel sederhana tanpa filter induk; Fungsi menampilkan `AdminCountPill`.
- **Kegiatan, Komponen, Kategori, Detail** (`adminContentStandardClassName`). Ada `AdminFilterSelect` (filter induk) dan `AdminRelationPill`; Kategori juga memakai `AdminCountPill`.
- **Kelengkapan** (`adminContentWideClassName`, 826 baris). Tanpa `AdminSearchPanel`/`AdminTableShell`/`AdminActionButtons`; pengguna harus memilih konteks dulu (`admin/30-…`), lalu memakai validasi `lib/kelengkapan-validation`.
- **User** (1.738 baris). Formulir bersekat (`adminFormSection*`, `adminRoleCardClassName`), `ConfirmDialog`, `UserAvatar`, `RoleBadge`.
- **Pengaturan Aplikasi**. Hanya header, form, dan `AdminConfirmationDialog`; bukan tabel.

**Tampak mirip, kode terpisah.** Master Klasifikasi KSBU (`kasubag/klasifikasi.tsx`, 1.103 baris) juga berbentuk "data master + dialog Tambah", tetapi tidak memakai `AdminPagePrimitives`. Berkas ini hanya mengimpor `PageLayout` dan `ConfirmDialog`.

### H. Wizard pengajuan / penambahan dokumen

**Komponen bersama:** `components/dokumen/StepIndicator.tsx`, `components/dokumen/form/StepFungsiTanggal.tsx`, `StepKegiatan.tsx`, dan `StepKomponen.tsx`.

**Anggota:** `routes/pegawai/dokumen/aju.tsx` dan `routes/kasubag/penambahan-arsip.tsx`.

**Yang berbeda:**

| Aspek | Ajukan Dokumen (Pegawai) | Penambahan Dokumen (KSBU) |
|---|---|---|
| Label langkah | Informasi Dasar, Unggah Dokumen, Tinjauan | Informasi Dokumen, Cara Pembayaran, Lampiran, Review |
| Langkah form tambahan | `StepKarakteristik`, `StepNamaDokumen`, `StepJenisPermintaan`, `StepKategoriPermintaan`, `StepDetailPermintaan`, `StepUploadLampiran`, `StepReview` | form lokal + `arsip/ManualArsipAttachments` |
| Klik langkah | `onStepClick` aktif | tidak ada `onStepClick` |
| Pembungkus | `PegawaiPagePrimitives` | `ArchivePanel` |

### I. Log Aktivitas (satu komponen)

**Komponen bersama:** `components/activity-log/ActivityLogView.tsx`. Keenam route hanya merender komponen ini.

**Yang berbeda (prop `scope`):**
- `"self"` dipakai Pegawai, PPK, PPSPM, dan KSBU.
- `"all"` dipakai Admin dan PJ Kinerja. Mode ini menambahkan filter pengguna dan kolom pengguna (`showUser`).

### J. Dashboard peran

**Komponen bersama:** `components/dashboard/RoleDashboardPrimitives.tsx` (`RoleDashboardPage`, `RoleDashboardHeader`, `DashboardMetricCard`, `DashboardSection`, `DashboardActionRow`, `DashboardQuickActions`, `DashboardEmptyState`).

**Anggota:** `pegawai.tsx` (dibungkus pula oleh `DashboardShell role="PEGAWAI" showHero={false}`), `ppk/index.tsx`, `ppspm/index.tsx`, `kasubag/index.tsx`, `penanggung-jawab-kinerja/index.tsx`, dan `admin.index.tsx`.

**Kartu metrik yang berbeda:**
- **Pegawai:** Dokumen Diajukan / Perlu Revisi / Dokumen Selesai / Dokumen Tersimpan
- **PPK:** Menunggu Validasi / Sudah Divalidasi / Dikembalikan untuk Revisi / Total Nominal Menunggu
- **PPSPM:** Menunggu Persetujuan / Disetujui / Dikembalikan / Total Nominal Menunggu
- **KSBU:** Berkas Terbuka / Berkas Tertutup / Usul Pembersihan, ditambah daftar "Perlu Diklasifikasikan (Terlama)"
- **PJ Kinerja:** Total Dokumen / Total Nominal Realisasi / Dokumen Selesai / Dokumen Diberkaskan
- **Admin:** Total User / User Aktif / Role Terpakai / Total Kegiatan

### K. Dialog

**K1. Dialog konfirmasi.** Komponen dasarnya `components/ui/ConfirmDialog.tsx`. Varian ditentukan lewat props:
- **Biasa.** Contoh: Validasi PPK, Setujui PPSPM, ajukan dokumen, klasifikasi, ajukan ulang, "Keluar tanpa menyimpan?".
- **`withReason`** (wajib isi catatan). Dipakai dialog Tolak di `ppk/dokumen/$id/index.tsx` dan `ppspm/dokumen/$id.tsx`.
- **`requireTyped`** (wajib mengetik frasa). Dipakai di:
  - `pegawai/pembersihan-dokumen.tsx`: frasa `BERSIHKAN`
  - `kasubag/berkas/$id.tsx` dan `kasubag/pembersihan/index.tsx`: frasa `BERSIHKAN FILE BERKAS`
- **Pembungkus:**
  - `AdminConfirmationDialog` di `AdminPagePrimitives.tsx` meneruskan props ke `ConfirmDialog`.
  - `CloseBerkasDialog` di `routes/kasubag/berkas/-components/` memakai `ConfirmDialog` + `DatePicker`.
  - `ConfirmProvider`/`useConfirm()` adalah versi imperatif, dipakai di `AttachmentViewer`.
- **Tampak mirip, kode terpisah.** Profil memakai `ui/AppDialog`, bukan `ConfirmDialog`.

**K2. Pop-up detail dokumen.** Komponennya `components/dokumen/DokumenDetailDialog.tsx`, yang merender `AttachmentViewer` dan `ActivityLog`. Dipakai oleh Laporan Saya, Laporan Kegiatan, Monitoring Dokumen Tim, Pembersihan Dokumen, dan `MonitoringRealisasiView` (Nominal Realisasi, Laporan Kinerja). Untuk dokumen tambahan KSBU dipakai `components/arsip/ManualArsipDetailDialog.tsx` (Laporan Kegiatan, `MonitoringRealisasiView`).

Tampak mirip, kode terpisah: pop-up detail dokumen di Detail Berkas (`kasubag-…/22b-…`) adalah fungsi lokal `DocumentMetadataDialog` di `kasubag/berkas/$id.tsx`, bukan `DokumenDetailDialog`.

**K3. Dialog Ekspor ZIP.** Komponennya `components/laporan/ExportZipDialog.tsx` ("Ekspor ZIP Dokumen"), dipakai Laporan Saya, Laporan Kegiatan, dan Monitoring Dokumen Tim.

Tampak mirip, kode terpisah: "Ekspor ZIP Berkas" di Detail Berkas adalah fungsi lokal `ExportBerkasZipDialog` yang dibangun di atas `ConfirmDialog`.

### Halaman tunggal (tanpa kelompok)

Login, Profil, Bantuan, Forbidden, Pengklasifikasian KSBU (secara struktur termasuk kelompok A), dan Pembersihan Dokumen Ketua Tim. Pembersihan Dokumen Ketua Tim (`pegawai/pembersihan-dokumen.tsx`) dan Pembersihan Berkas KSBU (`kasubag/pembersihan/index.tsx`) bernama mirip, tetapi kodenya terpisah dan memakai primitif berbeda (`PegawaiPanel` vs `ArchivePagePrimitives`).

---

## 3. Halaman wakil per kelompok

| Kelompok | Halaman wakil | Berkas tangkapan layar (INDEX.md) | Alasan |
|---|---|---|---|
| A. Detail dokumen | Detail Dokumen PPK — tab Metadata | `ppk/03-detail-dokumen-metadata.png` | Memperlihatkan tab, panel status, catatan revisi, dan panel aksi (Validasi/Tolak) sekaligus |
| B. Penyunting revisi | Halaman Revisi — tab Metadata & Lampiran | `pegawai/32-revisi-dokumen-tab-lampiran.png` | Menampilkan `AttachmentEditor`; Ajukan Ulang PPK dan Edit tidak dipotret |
| C. Daftar alur kerja | Validasi Dokumen (PPK) | `ppk/02-validasi-dokumen.png` | Memakai semua primitif termasuk `WorkflowPagination` |
| D. `MonitoringRealisasiView` | Nominal Realisasi — per fungsi (PPK) | `ppk/13-nominal-realisasi-per-fungsi.png` | Tampilan awal komponen; drill-down ke Komponen hanya ada di varian ini |
| E. Laporan Pegawai/Ketua Tim | Laporan Kegiatan | `ketua-tim/03-laporan-kegiatan.png` | Memuat `PeriodeSelector`, `FilterToolbar`, dan tabel. **Lihat catatan di bawah:** gambar ini menampilkan mode Triwulan, bukan Tahunan |
| F. Arsip KSBU | Berkas Terbuka | `kepala-sub-bagian-umum/20-berkas-terbuka.png` | Pola daftar berkas paling dasar |
| G. Data master Admin | Master Kegiatan | `admin/12-master-kegiatan.png` | Varian "standar" (filter induk + relasi) yang dipakai 4 dari 8 halaman master |
| H. Wizard | Ajukan Dokumen (Material) — Informasi Dasar (terisi) | `pegawai/03-ajukan-dokumen-material-langkah-1-terisi.png` | Memperlihatkan `StepIndicator` dan langkah form bersama |
| I. Log Aktivitas | Log Aktivitas (semua pengguna) | `admin/50-log-aktivitas.png` | Varian `scope="all"` memuat semua kolom/filter dari varian `self` ditambah kolom pengguna |
| J. Dashboard | Dashboard PPK | `ppk/01-dashboard.png` | Memakai semua primitif dashboard |
| K1. Dialog konfirmasi | Detail Dokumen PPK — dialog Tolak | `ppk/08-detail-dokumen-dialog-tolak.png` | `ConfirmDialog` dengan kolom alasan; varian frasa ketik terlihat di `kepala-sub-bagian-umum/36-bersihkan-file-dialog-terisi.png` |
| K2. Pop-up detail dokumen | Laporan Kinerja — pop-up detail dokumen | `penanggung-jawab-kinerja/07-laporan-kinerja-popup-detail-dokumen.png` | `DokumenDetailDialog` |
| K3. Dialog Ekspor ZIP | Laporan Saya — dialog Ekspor ZIP | `pegawai/41-laporan-saya-dialog-ekspor-zip.png` | `ExportZipDialog` |

**Catatan keterangan INDEX.md (terbukti dari kode dan gambar).** Dua gambar diberi keterangan "(Tahunan)", tetapi isinya bukan mode Tahunan:

| Gambar | Keterangan INDEX.md | Yang tampil di gambar |
|---|---|---|
| `pegawai/40-laporan-saya.png` | Laporan Saya (Tahunan) | **Bulanan · Oktober 2026** |
| `ketua-tim/03-laporan-kegiatan.png` | Laporan Kegiatan (Tahunan) | **Triwulan · TW4 Okt–Des 2026** |

Penyebabnya: `capture.mjs` (baris 392 dan 411) membuka halaman dengan `?periode=TAHUNAN&tahun=2026`. Namun `routes/pegawai/laporan/saya.tsx` tidak punya `validateSearch`, dan `routes/pegawai/laporan/kegiatan.tsx` hanya membaca `kegiatanId`. Periode disimpan di state lokal (`defaultPeriode('BULANAN')` dan `defaultPeriode('TRIWULAN')`), jadi halaman selalu dibuka dengan mode bawaannya. Gambar Nominal Realisasi dan Laporan Kinerja tidak terkena masalah ini, karena route-nya membaca `periode` dari URL.

---

## 4. Tanggal commit pertama (git log)

Metode:
- `git log --follow --diff-filter=A` untuk kemunculan berkas halaman.
- `git log -S'periode'` dan `-S'PeriodeSelector'` untuk filter periode.

Semua commit di bawah merupakan leluhur HEAD. Tanggal penulis sama dengan tanggal committer, dalam zona +0700. Batas pembanding: **23 September 2026**.

| Fitur | Hash | Tanggal | Pesan commit | Terhadap 23 Sep 2026 |
|---|---|---|---|---|
| Halaman Monitoring Dokumen Tim (`routes/pegawai/monitoring-dokumen-tim.tsx` dibuat) | `16f6e1a` | 2026-09-27 00:10:45 | Add monitoring dokumen tim dan penyempurnaan laporan | **Sesudah** |
| Filter periode — Laporan Saya | `e6ba99c` | 2026-09-28 14:21:49 | Laporan saya dan kegiatan juga pakai filter periode. Laporan kinerja sudah mencakup semua dokumen final. PJ Kinerja juga sudah bisa preview maupun unduh lampiran. Monitoring realisasi juga bisa preview dan unduh | **Sesudah** |
| Filter periode — Laporan Kegiatan | `e6ba99c` | 2026-09-28 14:21:49 | (sama dengan di atas) | **Sesudah** |
| Filter periode — Laporan Kinerja | `a960fad` | 2026-09-12 21:25:45 | Add fitur periode di menu Pembersihan Dokumen | **Sebelum** |
| Filter periode — Nominal Realisasi (PPK dan PPSPM) | `a960fad` | 2026-09-12 21:25:45 | Add fitur periode di menu Pembersihan Dokumen | **Sebelum** |

**Catatan pendukung (semuanya dari git):**

1. **Pesan `a960fad` tidak cocok dengan isinya.** Pesannya menyebut "Pembersihan Dokumen", tetapi commit ini sama sekali tidak menyentuh berkas pembersihan. Yang diubah adalah:
   - `components/kinerja/MonitoringRealisasiView.tsx`: menambahkan fungsi lokal `PeriodeSelector` dan `onSelectPeriode`
   - `lib/laporan/periode.ts` (berkas baru)
   - `routes/api/laporan/kinerja.ts`
   - parameter `periode/tahun/triwulan/dari/sampai` di `routes/ppk/monitoring-realisasi.tsx`, `routes/penanggung-jawab-kinerja/laporan-kinerja.tsx`, dan `routes/bendahara/monitoring-realisasi.tsx`
2. **Nominal Realisasi PPSPM** menerima filter periode di `a960fad` saat route-nya masih bernama `routes/bendahara/monitoring-realisasi.tsx`. Berkas itu baru berganti nama menjadi `routes/ppspm/monitoring-realisasi.tsx` di `e358b9f` (2026-09-13 20:30:37, "Relabel 'bendahara' menjadi 'PPSPM'"). Karena itu, `git log --follow -S'periode'` pada path baru tidak menampilkan apa-apa.
3. **Pilihan mode pada `a960fad`** baru Triwulan, Tahunan, Seluruh Periode, dan Kustom. Mode Bulanan dan komponen terpisah `components/laporan/PeriodeSelector.tsx` (hasil ekstraksi dari `MonitoringRealisasiView`) baru muncul di `e6ba99c` (2026-09-28).
4. **Sebelum ada filter periode**, Laporan Saya dan Laporan Kegiatan sudah punya filter rentang tanggal (Tanggal Mulai/Akhir, `tanggalMulai`/`tanggalAkhir`) sejak berkasnya dibuat di `d3299d8` (2026-04-27). `MonitoringRealisasiView` juga sudah punya `tanggalMulai` sejak `06765e7` (2026-09-08). Di `e6ba99c`, rentang tanggal Laporan Saya diganti oleh `PeriodeSelector`. Apakah filter rentang tanggal lama ini dihitung sebagai "filter periode" adalah soal definisi; tabel di atas memakai definisi pemilih periode (`periode`/`PeriodeSelector`).
5. **Monitoring Dokumen Tim** sampai HEAD tidak memakai `PeriodeSelector`; halaman ini hanya punya rentang tanggal dokumen.
