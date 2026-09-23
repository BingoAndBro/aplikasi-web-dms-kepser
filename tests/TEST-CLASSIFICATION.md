# Klasifikasi File Test (`pnpm test`)

`pnpm test` menjalankan Vitest dengan config `vitest.config.ts` (`include: ['tests/**/*.test.ts']`, `environment: 'node'`). Daftar di bawah mencakup **seluruh 90 file** yang tercakup pola tersebut.

Catatan umum:
- Semua file adalah **White-box**: setiap test mengimpor modul `src/` secara langsung, mem-mock (`vi.mock`) dependency internal (auth/DB/storage), dan/atau membaca source code komponen React lewat `readFileSync` untuk mengecek isinya. Tidak ada yang murni memanggil sistem dari luar tanpa pengetahuan struktur internal.
- Tidak ada **Integration/System/Acceptance test** sungguhan di sini menurut definisi ISTQB — test yang menyentuh alur end-to-end lewat browser (Playwright, `tests/e2e/*.spec.ts`) **tidak** dijalankan oleh `pnpm test` (dijalankan terpisah lewat `npx playwright test`), sehingga tidak dimasukkan ke tabel ini.
- Beberapa file bertanda **"static source guard"**: bukan menjalankan behavior, melainkan `readFileSync` source component lalu `.toContain(...)` string tertentu — dipakai untuk menjaga konsistensi teks/struktur UI antar role, bukan test fungsional klasik.
- Beberapa file bertanda **"dependency di-mock"**: menguji orkestrasi satu route/handler dengan seluruh dependency eksternalnya (DB, auth, storage) diganti mock — tetap level unit/component (bukan integration nyata) karena tidak ada I/O sungguhan ke sistem lain.

---

## Root (`tests/fsm.test.ts`)

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/fsm.test.ts | Unit test | White-box | Menguji fungsi `transition()` FSM alur dokumen: transisi status valid/invalid, validasi aktor, dan bentuk error, langsung dari `src/lib/fsm`. |

## arsiparis

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/arsiparis/berkas-activity-dev-reset.test.ts | Unit test | White-box | Menguji helper reset arsip development untuk log aktivitas berkas. |
| tests/unit/arsiparis/berkas-arsip-api.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji handler route API berkas arsip dengan auth/db di-mock. |
| tests/unit/arsiparis/berkas-arsip-attachment-names.test.ts | Unit test | White-box | Menguji resolver nama lampiran berkas arsip. |
| tests/unit/arsiparis/berkas-arsip-csv.test.ts | Unit test | White-box | Menguji helper pembuatan CSV untuk arsip folder-first. |
| tests/unit/arsiparis/berkas-arsip-file-access.test.ts | Unit test | White-box | Menguji helper akses file item berkas arsip. |
| tests/unit/arsiparis/berkas-arsip-file-access-export.test.ts | Unit test | White-box | Menguji resolver lampiran non-HTTP untuk ekspor ZIP (RP-02). |
| tests/unit/arsiparis/berkas-arsip-file-access-route.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji route API akses file item berkas dengan dependency di-mock. |
| tests/unit/arsiparis/berkas-arsip-folder-pages.test.ts | Unit/Component test + static source guard (gabungan) | White-box | Menguji route API arsip folder-first (mocked) sekaligus memverifikasi format halaman via pembacaan source. |
| tests/unit/arsiparis/berkas-arsip-physical-destruction.test.ts | Unit test | White-box | Menguji helper penghancuran fisik file berkas folder-first, termasuk bookkeeping lampiran yang dibersihkan. |
| tests/unit/arsiparis/berkas-arsip-read-model.test.ts | Unit test | White-box | Menguji read model/transformasi data berkas arsip. |
| tests/unit/arsiparis/berkas-arsip-schema.test.ts | Unit test | White-box | Menguji schema/validasi dasar data berkas arsip. |
| tests/unit/arsiparis/berkas-arsip-service.test.ts | Unit test | White-box | Menguji fondasi service berkas arsip. |
| tests/unit/arsiparis/berkas-export-zip.test.ts | Unit/Component test + static source guard (gabungan) | White-box | Menguji route ekspor ZIP berkas arsip (mocked) sekaligus keberadaan tombol/dialog ekspor di source komponen. |
| tests/unit/arsiparis/berkas-klasifikasi-eligibility.test.ts | Unit test | White-box | Menguji helper kelayakan klasifikasi berkas. |
| tests/unit/arsiparis/klasifikasi-create-route.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji route pembuatan klasifikasi dokumen dengan dependency di-mock. |
| tests/unit/arsiparis/klasifikasi-ui-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi struktur/teks UI halaman Master Klasifikasi Dokumen langsung dari source component. |
| tests/unit/arsiparis/klasifikasi-update-route.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji route update klasifikasi dokumen dengan dependency di-mock. |
| tests/unit/arsiparis/manual-arsip-route.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji helper retensi arsip manual dan route API dasar pengarsipan manual. |
| tests/unit/arsiparis/rp01-de-arsip-constants.test.ts | Unit test | White-box | Menguji konstanta dan tipe dasar modul RP-01 de-arsip. |
| tests/unit/arsiparis/workflow-archive-route.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji pemetaan klasifikasi alur kerja ke route pengarsipan berkas. |
| tests/unit/arsiparis/workflow-nama-arsip.test.ts | Unit test | White-box | Menguji fungsi penurunan nama arsip dari data alur kerja. |

## auth

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/auth/login-form-identifier.test.ts | Unit test (static source guard) | White-box | Memastikan form login tidak lagi memakai input `type="email"` dan menampilkan label "Username atau NIP". |
| tests/unit/auth/login-identifier-resolution.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji `loginWithLocalCredentials`: resolusi identifier via username atau NIP, akun nonaktif, dan kesamaan pesan error generik. |
| tests/unit/auth/login-rate-limit.test.ts | Unit test | White-box | Menguji helper pembatasan rate percobaan login. |
| tests/unit/auth/login-route-rate-limit.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji perilaku pembatasan rate pada route login dengan dependency di-mock. |
| tests/unit/auth/role-assignment.test.ts | Unit test | White-box | Menguji normalisasi penetapan role user oleh admin. |
| tests/unit/auth/role-resolution.test.ts | Unit test | White-box | Menguji resolusi role dari sesi auth lokal. |
| tests/unit/auth/roles-navigation.test.ts | Unit test | White-box | Menguji fondasi navigasi/akses untuk role Penanggung Jawab Kinerja. |
| tests/unit/auth/same-origin-route-protection.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji proteksi same-origin pada route mutasi auth/akun. |
| tests/unit/auth/session-cookies.test.ts | Unit test | White-box | Menguji helper pembuatan/parsing cookie sesi. |
| tests/unit/auth/session-token.test.ts | Unit test | White-box | Menguji utilitas token sesi. |

## components

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/components/attachment-viewer-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi wiring UX file-terhapus pada komponen AttachmentViewer via source guard. |
| tests/unit/components/confirm-dialog-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi struktur ConfirmDialog terpadu, provider `useConfirm`, dan dukungan reduced-motion via source guard. |
| tests/unit/components/ui-foundation.test.ts | Unit test | White-box | Menguji pemetaan fondasi UI bersama (Phase 15E). |

## dashboard

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/dashboard/role-dashboard-visual-parity-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi paritas visual dashboard antar role langsung dari source komponen. |

## db

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/db/seed-users.test.ts | Unit test | White-box | Menguji fungsi seeding user development. |
| tests/unit/db/username-migration-source.test.ts | Unit test (static source guard) | White-box | Memastikan migrasi `0017_username_login_identity.sql` terdaftar di journal dan CHECK constraint username-nya identik dengan `isValidUsername()`. |

## dokumen

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/dokumen/ajukan-dokumen-parity-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi kelengkapan tahapan & teks form Ajukan Dokumen via source guard. |
| tests/unit/dokumen/cross-role-detail-parity-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi paritas visual halaman detail dokumen lintas role via source guard. |
| tests/unit/dokumen/cross-role-list-parity-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi paritas visual daftar dokumen lintas role via source guard. |
| tests/unit/dokumen/dokumen-delete-audit-log.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji audit trail hard-delete dokumen pada route DELETE dengan dependency di-mock. |
| tests/unit/dokumen/dokumen-get-ketua-tim-access.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji akses baca role Ketua Tim ke dokumen non-material pada route GET. |
| tests/unit/dokumen/local-submit-drizzle-adapter.test.ts | Unit test | White-box | Menguji fondasi adapter Drizzle untuk submit dokumen lokal. |
| tests/unit/dokumen/local-submit-repository.test.ts | Unit test | White-box | Menguji fondasi repository submit dokumen lokal. |
| tests/unit/dokumen/local-submit-write-bridge.test.ts | Unit test | White-box | Menguji fondasi helper write-bridge submit dokumen lokal. |
| tests/unit/dokumen/nominal-route-uuid-guard.test.ts | Unit/Component test + static source guard (gabungan) | White-box | Menguji guard UUID pada route nominal dokumen (mocked) sekaligus pola validasi di source. |
| tests/unit/dokumen/pembersihan-aging.test.ts | Unit test | White-box | Menguji perhitungan usia (aging) dokumen untuk proses pembersihan. |
| tests/unit/dokumen/pembersihan-plan.test.ts | Unit test | White-box | Menguji pembentukan rencana pembersihan dokumen. |
| tests/unit/dokumen/pembersihan-route.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji route eksekusi pembersihan dokumen dengan dependency di-mock. |
| tests/unit/dokumen/penambahan-dokumen-upload-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi wiring upload pada form Penambahan Dokumen via source guard. |
| tests/unit/dokumen/ppk-detail-and-log-route.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji paritas UUID pada route detail & log dokumen untuk role PPK. |
| tests/unit/dokumen/ppk-resubmit-parity-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi paritas visual alur resubmit PPK via source guard. |
| tests/unit/dokumen/revisi-dokumen-parity-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi paritas visual form Revisi Dokumen via source guard. |
| tests/unit/dokumen/submit-db-file-compensation.test.ts | Unit test | White-box | Menguji kebijakan kompensasi DB/file saat submit dokumen gagal sebagian. |
| tests/unit/dokumen/submit-disk-preflight-checker.test.ts | Unit test | White-box | Menguji pemeriksaan preflight kapasitas disk sebelum submit dokumen. |
| tests/unit/dokumen/submit-file-preflight.test.ts | Unit test | White-box | Menguji helper preflight validasi file sebelum submit dokumen. |
| tests/unit/dokumen/submit-route-parity.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji orkestrasi route submit dokumen lokal dengan seluruh dependency (auth, adapter DB, storage) di-mock. |
| tests/unit/dokumen/submit-runtime-orchestrator.test.ts | Unit test | White-box | Menguji fondasi orkestrator runtime batas proses submit dokumen. |

## export

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/export/document-zip.test.ts | Unit test | White-box | Menguji pembuatan rencana ZIP dokumen (fungsi murni) dan layer I/O streaming ZIP di direktori temp. |

## Lainnya (root `tests/unit/`)

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/kelengkapan-duplicate-validation.test.ts | Unit test | White-box | Menguji validasi duplikasi item kelengkapan dokumen. |

## laporan

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/laporan/export-zip.test.ts | Unit/Component test + static source guard (gabungan) | White-box | Menguji route ekspor ZIP laporan (mocked), helper nama file, dan keberadaan tombol/dialog ekspor via source guard. |
| tests/unit/laporan/hierarchical-filter-select-mount.test.ts | Unit test (static source guard) | White-box | Memverifikasi Select bertingkat pada HierarchicalFilter tetap "mounted" via source guard (RP-04). |
| tests/unit/laporan/kinerja-route.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji route API Laporan Kinerja dengan dependency di-mock. |
| tests/unit/laporan/kinerja-visual-parity-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi paritas visual halaman Laporan Kinerja via source guard. |
| tests/unit/laporan/monitoring-rows.test.ts | Unit test | White-box | Menguji pembangunan baris data monitoring (komponen/kegiatan/fungsi) dan total nominal. |
| tests/unit/laporan/periode.test.ts | Unit test | White-box | Menguji resolusi rentang periode, triwulan, label, dan normalisasi pencarian periode laporan. |

## pegawai

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/pegawai/pegawai-reports-visual-parity-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi paritas visual halaman laporan pegawai via source guard. |

## profile

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/profile/profile-avatar-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi wiring UI avatar profil via source guard. |

## security

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/security/same-origin.test.ts | Unit test | White-box | Menguji guard same-origin untuk method HTTP unsafe (POST/PUT/DELETE). |

## storage

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/storage/admin-analyze-storage-route.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji route analisis storage admin dengan dependency di-mock. |
| tests/unit/storage/admin-cleanup-orphan-files-route.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji route pembersihan file orphan admin dengan dependency di-mock. |
| tests/unit/storage/document-file-access-export.test.ts | Unit test | White-box | Menguji resolver path logis lampiran dokumen untuk ekspor ZIP non-HTTP. |
| tests/unit/storage/document-upload-policy.test.ts | Unit test | White-box | Menguji kebijakan sentral validasi upload dokumen. |
| tests/unit/storage/file-access-token.test.ts | Unit test | White-box | Menguji helper pembuatan/verifikasi token akses file. |
| tests/unit/storage/internal-file-access.test.ts | Unit test | White-box | Menguji fondasi akses file internal. |
| tests/unit/storage/internal-file-access-url.test.ts | Unit test | White-box | Menguji pembangun URL akses file internal. |
| tests/unit/storage/local-attachment-replacement-cleanup.test.ts | Unit test | White-box | Menguji pembersihan lampiran lama saat penggantian file lokal. |
| tests/unit/storage/local-pending-move.test.ts | Unit test | White-box | Menguji fondasi helper pemindahan file dari pending ke formal. |
| tests/unit/storage/local-storage-diagnostics.test.ts | Unit test | White-box | Menguji diagnostik penyimpanan lokal. |
| tests/unit/storage/local-storage-paths.test.ts | Unit test | White-box | Menguji helper path storage lokal: validasi path logis, resolusi path fisik, nama file/segmen, dan kepemilikan/klasifikasi path. |
| tests/unit/storage/local-upload.test.ts | Unit test | White-box | Menguji fondasi helper upload file lokal. |
| tests/unit/storage/logical-file-deletion.test.ts | Unit test | White-box | Menguji penghapusan file logis secara aman. |
| tests/unit/storage/manual-arsip-upload.test.ts | Unit test | White-box | Menguji kesesuaian kebijakan upload untuk arsip manual. |
| tests/unit/storage/pending-upload-session.test.ts | Unit test | White-box | Menguji helper sesi upload pending. |
| tests/unit/storage/profile-avatar.test.ts | Unit test | White-box | Menguji helper storage untuk avatar profil. |
| tests/unit/storage/raw-download-url-hardening.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji pengerasan keamanan URL unduhan mentah dengan dependency di-mock. |
| tests/unit/storage/raw-preview-internal-url-runtime.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji verifikasi runtime URL preview internal mentah dengan dependency di-mock. |
| tests/unit/storage/raw-preview-internal-url-wiring.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji wiring URL preview internal mentah dengan dependency di-mock. |
| tests/unit/storage/rename-pending-local-route.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji implementasi route rename/pemindahan file pending lokal dengan dependency di-mock. |
| tests/unit/storage/storage-client.test.ts | Unit test | White-box | Menguji penanganan error file-terhapus pada storage client. |
| tests/unit/storage/submit-move-plan.test.ts | Unit test | White-box | Menguji pembangun rencana pemindahan file saat submit dokumen. |
| tests/unit/storage/upload-route-local.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji implementasi route upload lokal dengan dependency di-mock. |

## styles

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/styles/color-budget.test.ts | Unit test (static source guard) | White-box | Membatasi/menghitung jumlah warna arbitrary/hardcoded pada source untuk menjaga konsolidasi Tema Global (Fase 0). |

## users

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/users/create-user-unique-violation.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji pemetaan error unique-violation Postgres (username, NIP) dan check-violation format username ke pesan 409/400 berbahasa Indonesia. |
| tests/unit/users/username-validation.test.ts | Unit test | White-box | Menguji `isValidUsername()`: panjang, karakter diizinkan, dan aturan wajib-mengandung-huruf yang menjaga namespace username tetap terpisah dari NIP. |

## utils

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/utils/client-id.test.ts | Unit test | White-box | Menguji fungsi pembuatan client ID unik. |
| tests/unit/utils/file.test.ts | Unit test | White-box | Menguji utilitas file: sanitasi nama file, ekstraksi ekstensi, ekstraksi nama file dari path, dan deteksi file pending. |
| tests/unit/utils/format.test.ts | Unit test | White-box | Menguji utilitas format tanggal/waktu dan pengurutan berdasarkan `created_at`. |
