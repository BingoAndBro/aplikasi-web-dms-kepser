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
| tests/unit/arsiparis/berkas-arsip-api.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji handler route API berkas arsip dengan auth/db di-mock, termasuk pemicu runner Google Drive hanya setelah `approve_destruction` sukses (sebelum pemusnahan fisik lokal; tidak untuk usul/batal, galat, 401/403, beda origin). |
| tests/unit/arsiparis/berkas-arsip-attachment-names.test.ts | Unit test | White-box | Menguji resolver nama lampiran berkas arsip. |
| tests/unit/arsiparis/berkas-arsip-csv.test.ts | Unit test | White-box | Menguji helper pembuatan CSV untuk arsip folder-first. |
| tests/unit/arsiparis/berkas-arsip-file-access.test.ts | Unit test | White-box | Menguji helper akses file item berkas arsip. |
| tests/unit/arsiparis/berkas-arsip-file-access-export.test.ts | Unit test | White-box | Menguji resolver lampiran non-HTTP untuk ekspor ZIP (RP-02). |
| tests/unit/arsiparis/berkas-arsip-file-access-route.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji route API akses file item berkas dengan dependency di-mock. |
| tests/unit/arsiparis/berkas-arsip-folder-pages.test.ts | Unit/Component test + static source guard (gabungan) | White-box | Menguji route API arsip folder-first (mocked) sekaligus memverifikasi format halaman via pembacaan source. |
| tests/unit/arsiparis/berkas-arsip-physical-destruction.test.ts | Unit test | White-box | Menguji helper penghancuran fisik file berkas folder-first, termasuk bookkeeping lampiran yang dibersihkan. |
| tests/unit/arsiparis/berkas-arsip-read-model.test.ts | Unit test | White-box | Menguji read model/transformasi data berkas arsip. |
| tests/unit/arsiparis/berkas-arsip-schema.test.ts | Unit test | White-box | Menguji schema/validasi dasar data berkas arsip. |
| tests/unit/arsiparis/berkas-arsip-service.test.ts | Unit test | White-box | Menguji fondasi service berkas arsip, termasuk `transitionBerkasArchiveStatus` transaksional: update bersyarat -> hook `onBerkasDimusnahkan` (hanya `approve_destruction`) -> activity dalam satu transaksi, rollback bila hook/activity gagal, tanpa hook bila update bersyarat gagal. |
| tests/unit/arsiparis/berkas-default-repository-transaction.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji repository berkas default: tutup berkas + riwayat BERKAS_DITUTUP dalam satu transaksi, dan get-or-create memakai ON CONFLICT DO NOTHING. |
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

## hooks

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/hooks/use-discard-pending-uploads-on-leave.test.ts | Unit test (jsdom) | White-box | Menguji hook yang menghapus file pending sesi saat form di-unmount (navigasi di aplikasi) atau tab ditutup (pagehide). |

## dashboard

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/dashboard/role-dashboard-visual-parity-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi paritas visual dashboard antar role langsung dari source komponen. |

## db

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/db/seed-users.test.ts | Unit test | White-box | Menguji fungsi seeding user development. |
| tests/unit/db/username-migration-source.test.ts | Unit test (static source guard) | White-box | Memastikan migrasi `0017_username_login_identity.sql` terdaftar di journal dan CHECK constraint username-nya identik dengan `isValidUsername()`. |
| tests/unit/db/google-drive-migration-source.test.ts | Unit test (static source guard) | White-box | Memastikan migrasi `0024_google_drive_tautan.sql` terdaftar di journal, idempoten, memakai nama constraint/index yang sama dengan skema Drizzle, dan setiap CHECK nilai (akses, status Drive, audit) identik dengan konstanta; Zod tautan menerima `DRIVE` (sejak section 08) dan tetap menolak nilai akses lain. |

## dokumen

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/dokumen/ajukan-dokumen-parity-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi kelengkapan tahapan & teks form Ajukan Dokumen via source guard. |
| tests/unit/dokumen/ajukan-pending-cleanup-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi Ajukan Dokumen, AttachmentEditor (Edit Non-Material, Revisi Pegawai, Revisi PPK) dan Penambahan Arsip KSBU memakai pola pending yang sama dan menghapus file pending yang dibuang. |
| tests/unit/dokumen/cross-role-detail-parity-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi paritas visual halaman detail dokumen lintas role via source guard. |
| tests/unit/dokumen/cross-role-list-parity-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi paritas visual daftar dokumen lintas role via source guard. |
| tests/unit/dokumen/dokumen-delete-audit-log.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji audit trail hard-delete dokumen pada route DELETE dengan dependency di-mock, serta hook Drive `DIHAPUS_PEMILIK` di transaksi yang sama sebelum baris dihapus + pemicu runner setelah commit (P4). |
| tests/unit/dokumen/dokumen-get-ketua-tim-access.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji akses baca role Ketua Tim ke dokumen non-material pada route GET. |
| tests/unit/dokumen/dokumen-transition-guards-route.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji guard transisi dokumen: update bersyarat atomik (409), catatan PPSPM pada KEMBALIKAN, validasi ulang RESUBMIT/RESUBMIT_PPK, Zod resubmit PPK, dan rollback file lampiran PPK. |
| tests/unit/dokumen/local-submit-drizzle-adapter.test.ts | Unit test | White-box | Menguji fondasi adapter Drizzle untuk submit dokumen lokal. |
| tests/unit/dokumen/local-submit-repository.test.ts | Unit test | White-box | Menguji fondasi repository submit dokumen lokal. |
| tests/unit/dokumen/local-submit-write-bridge.test.ts | Unit test | White-box | Menguji fondasi helper write-bridge submit dokumen lokal. |
| tests/unit/dokumen/pembersihan-aging.test.ts | Unit test | White-box | Menguji perhitungan usia (aging) dokumen untuk proses pembersihan. |
| tests/unit/dokumen/pembersihan-plan.test.ts | Unit test | White-box | Menguji pembentukan rencana pembersihan dokumen. |
| tests/unit/dokumen/pembersihan-drive-hook.test.ts | Unit test (transaksi palsu + hook di-mock) | White-box | Menguji `applyCleanupInTransaction`: update + audit per dokumen lalu salinan Drive ditandai `DIBERSIHKAN` dengan tx yang sama, tanpa entri tidak menyentuh apa pun, galat hook diteruskan. |
| tests/unit/dokumen/pembersihan-route.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji route eksekusi pembersihan dokumen dengan dependency di-mock, termasuk pemicu runner Google Drive hanya bila `cleaned_count > 0`. |
| tests/unit/dokumen/penambahan-dokumen-upload-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi wiring upload pada form Penambahan Dokumen via source guard. |
| tests/unit/dokumen/ppk-detail-and-log-route.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji paritas UUID pada route detail & log dokumen untuk role PPK. |
| tests/unit/dokumen/ppk-resubmit-parity-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi paritas visual alur resubmit PPK via source guard. |
| tests/unit/dokumen/resubmit-validation.test.ts | Unit test | White-box | Menguji aturan validasi ulang resubmit (nominal > 0, kelengkapan exact-match enam kolom) yang sama dengan submit. |
| tests/unit/dokumen/revisi-dokumen-parity-source.test.ts | Unit test (static source guard) | White-box | Memverifikasi paritas visual form Revisi Dokumen via source guard. |
| tests/unit/dokumen/submit-disk-preflight-checker.test.ts | Unit test | White-box | Menguji pemeriksaan preflight kapasitas disk sebelum submit dokumen. |
| tests/unit/dokumen/submit-file-preflight.test.ts | Unit test | White-box | Menguji helper preflight validasi file sebelum submit dokumen. |
| tests/unit/dokumen/submit-file-move-transaction.test.ts | Integration test (filesystem nyata, DB in-memory) | White-box | Menguji pemindahan file pending ke lokasi tetap di dalam transaksi submit: gagal pindah atau gagal commit tidak meninggalkan baris dan file kembali ke pending. |
| tests/unit/dokumen/submit-route-parity.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji orkestrasi route submit dokumen lokal dengan seluruh dependency (auth, adapter DB, storage) di-mock. |

## export

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/export/document-zip.test.ts | Unit test | White-box | Menguji pembuatan rencana ZIP dokumen (fungsi murni) dan layer I/O streaming ZIP di direktori temp. |
| tests/unit/export/laporan-zip-entries.test.ts | Unit test (dependency di-mock) | White-box | Menguji `buildLaporanZipEntries` mengisi kunci lampiran `DOKUMEN:<id>:<index>` sesuai index asli (lampiran yang tidak tersedia dilewati) tanpa mengubah isi ZIP. |

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
| tests/unit/laporan/manual-arsip-route.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji route read-only detail & lampiran dokumen manual KSBU untuk Laporan Kinerja/Monitoring Nominal (matriks peran, id tidak valid, dokumen dimusnahkan). |
| tests/unit/laporan/monitoring-rows.test.ts | Unit test | White-box | Menguji pembangunan baris data monitoring (komponen/kegiatan/fungsi) dan total nominal. |
| tests/unit/laporan/tautan-route.test.ts | Unit/Component test (dependency di-mock) | Black-box | Menguji rute `POST/GET /api/laporan/tautan`, cabut, dan detail tautan: 403 beda origin, 401, 400 Zod, akses bawaan LOGIN, DRIVE 201 tanpa path + `drive_status` + pemicu runner, 409 ketersediaan Drive dengan `kode`, riwayat memuat ringkasan Drive hanya untuk baris DRIVE + memicu runner, cabut memicu runner hanya bila `revoked`, 500 tanpa membocorkan galat/token. |
| tests/unit/laporan/tautan-service.test.ts | Unit test (repository di-mock) | White-box | Menguji layanan Tautan Laporan: penyaringan snapshot per sumber, batas 500, token, detail, file, ZIP anonim, tautan per lampiran, dan akses DRIVE (409 per alasan, 413 sebelum Drive, rencana file dari helper ZIP, `toTautanListItem` field Drive tanpa ID Drive/token, `drive_tertunda_akun`, pembuka DMS + `/lampiran` 404 identik). |
| tests/unit/laporan/tautan-drive-route.test.ts | Unit/Component test (dependency di-mock) | Black-box | Menguji `POST /api/laporan/tautan/$id/coba-lagi` (403 beda origin, 401, 404 id bukan uuid / bukan pembuat untuk semua peran, 409 bukan GAGAL, 200 + pemicu runner, 500 tanpa bocor) dan semua pembuka DMS (`/api/tautan/<token>`, preview/download dokumen & manual, export-zip, `/lampiran/...`) yang menjawab 404 identik untuk tautan DRIVE di setiap status, dengan/tanpa sesi. |
| tests/unit/laporan/periode.test.ts | Unit test | White-box | Menguji resolusi rentang periode (bulanan, triwulan, tahunan), label, pergeseran periode, dan normalisasi pencarian periode laporan. |

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
| tests/unit/storage/pending-upload-sweeper.test.ts | Integration test (filesystem nyata) | White-box | Menguji pembersihan otomatis file pending berumur > 24 jam: hanya file pending tak dirujuk yang dihapus, file resmi/avatar/arsip manual/rujukan lama aman, throttle sekali per jam. |
| tests/unit/storage/pending-upload-cleanup-client.test.ts | Unit test | White-box | Menguji helper klien pembersihan file pending (batch 50, keepalive, penanganan kegagalan). |
| tests/unit/storage/pending-upload-client.test.ts | Unit test | White-box | Menguji helper klien unggah file ke area pending (sukses, ditolak server, gagal jaringan). |
| tests/unit/storage/profile-avatar.test.ts | Unit test | White-box | Menguji helper storage untuk avatar profil. |
| tests/unit/storage/raw-download-url-hardening.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji pengerasan keamanan URL unduhan mentah dengan dependency di-mock. |
| tests/unit/storage/raw-preview-internal-url-runtime.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji verifikasi runtime URL preview internal mentah dengan dependency di-mock. |
| tests/unit/storage/raw-preview-internal-url-wiring.test.ts | Unit/Component test (dependency di-mock) | White-box | Menguji wiring URL preview internal mentah dengan dependency di-mock. |
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

## google-drive

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/unit/google-drive/config.test.ts | Unit test | White-box | Menguji `readDriveConfig`: tiga env wajib, trim, kunci base64/base64url tepat 32 byte, fitur mati rapi tanpa melempar, serta konstanta OAuth/Drive. |
| tests/unit/google-drive/token-crypto.test.ts | Unit test | White-box | Menguji enkripsi refresh token AES-256-GCM `v1:<iv>:<tag>:<data>`: roundtrip, IV acak, ciphertext/tag/kunci salah, format tidak dikenal, dan pesan galat tanpa rahasia. |
| tests/unit/google-drive/shared.test.ts | Unit test + static source guard (gabungan) | White-box | Menguji `buildDriveFolderName` (zona Asia/Jakarta, sanitasi, batas 150 karakter), teks alasan/peringatan/pesan galat Drive, dan memastikan `shared.ts` tidak mengimpor modul server. |
| tests/unit/google-drive/drive-errors.test.ts | Unit test | White-box | Menguji `classifyDriveError`: pemetaan status/reason/`invalid_grant`/galat jaringan/`TokenCryptoError` ke kategori galat Drive dan pesan tanpa isi respons mentah. |
| tests/unit/google-drive/drive-client.test.ts | Unit/Component test (dependency di-mock) + static source guard | White-box | Menguji `createGoogleDriveClient` dengan Drive API dan OAuth2Client di-mock (argumen setiap metode, `retry: false` + timeout, kueri `appProperties has`, penolakan nilai kueri berbahaya) dan memastikan paket Google hanya diimpor `drive-client.ts`/`oauth.ts`. |
| tests/unit/google-drive/fake-drive.test.ts | Unit test | White-box | Menguji helper `FakeDrive` (Drive in-memory untuk tes): id berurutan, isi stream, hapus berantai, `failNext` termasuk mode respons hilang, dan `failWhen`. |
| tests/unit/google-drive/jobs.test.ts | Unit test | White-box | Menguji fungsi murni antrean Drive: konstanta prioritas/jeda, `computeRetrySchedule` (8 percobaan ulang lalu GAGAL), pemotongan `galat_pesan`, dan impor modul tanpa DATABASE_URL. |
| tests/unit/google-drive/oauth.test.ts | Unit test (dependency di-mock) | White-box | Menguji alur OAuth salin-tempel: URL login (offline, consent, scope K8, PKCE S256, redirect konstanta, state, `login_hint`), store state memori (TTL 10 menit, batas 20, sekali pakai, sesi berbeda), `parsePastedAddress` (loopback saja), dan `tukarCode` (tanpa refresh token, scope tanpa `drive.file`, email tidak terverifikasi, penukaran gagal) dengan pesan tanpa code/token/respons Google. |
| tests/unit/google-drive/availability.test.ts | Unit test (dependency di-mock) | White-box | Menguji `getDriveAvailability` (BELUM_DIKONFIGURASI, BELUM_ADA_AKUN, PERLU_HUBUNG_ULANG, tersedia) dan `toStatusResponse` yang membuang `akunId`. |
| tests/unit/google-drive/akun-connect.test.ts | Unit test (FakeDrive + repo/OAuth palsu) | White-box | Menguji orkestrasi `hubungkanDariAlamat`: folder akar dibuat/dipakai ulang/dibuat ulang saat 404, token disimpan terenkripsi, HUBUNGKAN_ULANG menolak email berbeda sebelum menyentuh Drive, `error=access_denied`, state sesi lain, dan galat Drive tanpa menyimpan akun. |
| tests/unit/google-drive/status-route.test.ts | Unit/Component test (dependency di-mock) | Black-box | Menguji `GET /api/google-drive/status`: 200 `{ tersedia, alasan }` tanpa email/id akun + `no-store`, 401 tanpa sesi, dan 500 pesan umum tanpa mencetak objek galat. |
| tests/unit/google-drive/admin-routes.test.ts | Unit/Component test (dependency di-mock) | Black-box | Menguji lima rute ADMIN Google Drive: 401/403 (PEGAWAI, KEPALA_SUB_BAGIAN_UMUM), 403 beda origin sebelum sesi dibaca, 409 env tidak lengkap, 400 body tidak valid, 404 `$id` bukan uuid, pemetaan OAuthFlowError/AkunDriveError/DriveApiError ke 400/409/502, 500 pesan umum, revoke token saat putus, `{ jumlah }` coba lagi penghapusan, dan pemicu runner (GET ringkasan, hubungkan sukses, coba lagi penghapusan; tidak untuk 401/403/beda origin/galat). |
| tests/unit/google-drive/rencana-file.test.ts | Unit test | White-box | Menguji `rencanakanFileDrive`: nama file sama dengan ZIP, kunci lampiran menjadi kolom sumber, dedup nama di tingkat folder tautan (termasuk bentrok `DAFTAR_ISI.txt`), content type, entri tanpa file sebagai dilewati, dan kunci tidak sah sebagai galat program. |
| tests/unit/google-drive/daftar-isi.test.ts | Unit test | White-box | Menguji teks `DAFTAR_ISI.txt` Drive: meta (WIB), pengelompokan per dokumen urut, penanda tidak tersedia/dimusnahkan/dibersihkan/dihapus pemiliknya, dokumen tanpa lampiran, pembersihan baris baru/karakter kontrol, tanpa path/id/token. |
| tests/unit/google-drive/file-source.test.ts | Unit test (dependency diinjeksi) | White-box | Menguji `bukaFileUntukUnggah`: stream dibuka malas, lampiran ditolak resolver, path tidak aman, file hilang/bukan file/> 5 MB menjadi tidak tersedia. |
| tests/unit/google-drive/sinkron-tautan.test.ts | Unit test (FakeDrive + repo in-memory) | White-box | Menguji handler SINKRON_TAUTAN: folder/file/DAFTAR_ISI/izin lalu SIAP + audit, `drive_folder_id` tersimpan sebelum unggah pertama, lanjut setelah gagal tanpa unggahan ganda (termasuk respons hilang untuk lampiran, folder, dan daftar isi), dicabut di tengah, file tidak tersedia, unggahan terbang -> MENGHAPUS + HAPUS_FILE, akar hilang dibuat ulang, KUOTA_PENUH, folder tautan 404, akun diputus. |
| tests/unit/google-drive/runner.test.ts | Unit test (fake timers + antrean in-memory) | White-box | Menguji `runDriveRunnerOnce` (no-op tanpa env, dispatch, KUOTA_PENUH -> GAGAL, TOKEN_TIDAK_VALID -> dijeda + akun ditandai, nasib 'MENUNGGU' termasuk job kembar tidak menandai tautan GAGAL, galat non-Drive -> PERMANEN tanpa melempar, jenis tanpa handler, anggaran waktu) dan `triggerDriveRunner` (single-flight, timer ke jadwal terdekat maks 1 jam, putaran lanjut saat anggaran habis, tidak pernah melempar); hasil `DITUNDA` (D13) tidak di-complete/tidak gagal, GAGAL job HAPUS_* tidak menandai tautan, dan deps bawaan mendaftarkan tiga handler. |
| tests/unit/google-drive/hapus.test.ts | Unit test (FakeDrive + repo in-memory) | White-box | Menguji handler HAPUS_TAUTAN (hapus permanen folder, 404 = berhasil, folder belum pernah dibuat tanpa panggilan Drive, pencarian `dmsTautanId`, D13 ditunda 30 dtk, AKUN_DIPUTUS, SEMENTARA, job ganda) dan HAPUS_FILE (hapus per file + DAFTAR_ISI.txt "telah dimusnahkan/dibersihkan/dihapus pemiliknya", audit per job, tautan dicabut tanpa Drive, D13, file 404/tanpa ID, SEMENTARA di tengah lalu lanjut, DAFTAR_ISI hilang). |
| tests/unit/google-drive/penghapusan.test.ts | Unit test (transaksi palsu pencatat urutan) | White-box | Menguji urutan hook pemicu penghapusan: `tandaiTautanDicabut` (MENGHAPUS -> batalkan job MENUNGGU -> HAPUS_TAUTAN), `tandaiFileDihapusUntukSumber` (tanpa id tidak menyentuh DB, MENGHAPUS/DILEWATI + satu HAPUS_FILE per tautan berubah, balapan tanpa job), `tandaiFileBerkasDimusnahkan`. |

## Integrasi (`pnpm test:integration`, PostgreSQL asli)

Dijalankan terpisah dengan `vitest.integration.config.ts` (tidak termasuk `pnpm test`). Butuh database yang sudah dimigrasi dan di-seed; data uji dibuat di transaksi yang di-ROLLBACK (lihat `docs/superpowers/plans/2026-10-22-tautan-google-drive/sections/index.md` untuk menyiapkan DB tes `dms_kepser_test`).

| File | Jenis Test | White/Black-box | Deskripsi Singkat |
|---|---|---|---|
| tests/integration/dokumen-transaksi-permintaan-fk.test.ts | Integration test | White-box | Memastikan FK `dokumen_transaksi` ke master permintaan menolak id yang tidak ada (23503). |
| tests/integration/manual-arsip-effective-status.test.ts | Integration test | White-box | Menguji SQL status arsip efektif dokumen tambahan KSBU di SELECT, WHERE, dan UPDATE. |
| tests/integration/google-drive-schema.test.ts | Integration test | White-box | Menguji hasil migrasi 0024: kolom/constraint/index sama dengan Drizzle, partial unique akun AKTIF dan email, check konsistensi tautan DRIVE, unique kunci lampiran, unique job MENUNGGU, dan aksi audit Drive. |
| tests/integration/google-drive-jobs.test.ts | Integration test | White-box | Menguji antrean `app.drive_job` di PostgreSQL asli: enqueue + ON CONFLICT jadwal, urutan klaim, klaim ulang job macet, jeda akun perlu hubung ulang, selesai/gagal/tunda bersyarat PROSES, `resetFailedDeletionJobs` (tanpa AKUN_DIPUTUS/akun diputus/job kembar/tidak relevan), dan dua klaim bersamaan dari dua koneksi (`FOR UPDATE SKIP LOCKED`). |
| tests/integration/google-drive-akun.test.ts | Integration test | White-box | Menguji `akun-repository` di PostgreSQL asli: hubungkan pertama, ganti akun atomik + audit, GANTI ke akun NONAKTIF, HUBUNGKAN_ULANG (status tetap, job dijadwalkan now, email berbeda ditolak), email pernah DIPUTUS, dua ADMIN bersamaan (23505 -> AKUN_BERUBAH, dua koneksi), putus akun (job/tautan GAGAL, audit, revoke best effort), dan ringkasan ADMIN + daftar perlu dihapus manual. |
| tests/integration/google-drive-tautan.test.ts | Integration test (PostgreSQL asli + FakeDrive) | White-box | Menguji `insertTautanDrive` (tautan + baris file + job SINKRON_TAUTAN dalam satu transaksi; galat baris file tidak menyisakan tautan/job), `loadDriveRingkasanByTautanIds` + `toTautanListItem` (progres, galat, tanpa ID Drive), penanda `drive_tertunda_akun` untuk job yang dijeda TOKEN_TIDAK_VALID (drive_status tetap MENGUNGGAH), dan `cobaLagiTautanDrive` (reset job GAGAL, BUKAN_GAGAL, bukan pembuat/dicabut/bukan DRIVE, job kembar MENUNGGU, enqueue baru) sampai runner menandai SIAP. |
| tests/integration/google-drive-penghapusan.test.ts | Integration test (PostgreSQL asli + FakeDrive) | White-box | Menguji empat pemicu penghapusan salinan Drive: cabut (satu transaksi revoked_at + MENGHAPUS + job dibatalkan + HAPUS_TAUTAN; LOGIN tanpa job; rollback; ujung ke ujung folder benar-benar terhapus di FakeDrive + audit; akun DIPUTUS -> daftar hapus manual), pemusnahan berkas (TERUNGGAH/MENUNGGU -> MENGHAPUS/DILEWATI, tautan dicabut tidak disentuh, runner + DAFTAR_ISI, rollback, update bersyarat gagal tanpa job, usul/batal tanpa job), Pembersihan Dokumen, hapus permanen (baris file tetap ada setelah dokumen terhapus), dan D13. |
| tests/integration/google-drive-sinkron.test.ts | Integration test (PostgreSQL asli + FakeDrive) | White-box | Menguji runner + handler SINKRON_TAUTAN dengan repository DB dan antrean asli: SIAP + audit actor null + job SELESAI dalam satu transaksi, KUOTA_PENUH -> GAGAL, job kembar (SEMENTARA/TOKEN_TIDAK_VALID) DIBATALKAN tetapi tautan tidak GAGAL, serta update bersyarat repository (tautan dicabut, baris bukan MENUNGGU, unggahan terbang + HAPUS_FILE, data daftar isi). |
