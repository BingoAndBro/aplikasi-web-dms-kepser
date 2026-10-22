# Code Review: Section 09 — Handler Hapus dan Hook Pemicu Penghapusan

## Auto-fixes Applied
- `HAPUS_TAUTAN`/`HAPUS_FILE` membuat `DriveClient` secara malas: job yang tidak perlu menyentuh Drive (folder belum
  pernah dibuat, tidak ada file `MENGHAPUS` dan tidak ada `DAFTAR_ISI.txt`) selesai tanpa memuat akun, sehingga akun
  `DIPUTUS` tidak membuat job semacam itu masuk daftar "perlu dihapus manual" tanpa alasan.
- `selesaikanHapusTautan`/`selesaikanHapusFile` menandai job `SELESAI` di transaksi yang sama dengan status + audit
  (pola `tandaiSiap` section 07); `completeDriveJob` runner sesudahnya no-op.
- `enqueueDriveJob` menerima `Pick<DriveJobExecutor, 'insert'>` (hanya `insert` yang dipakai) supaya executor
  repository arsip `Pick<…, 'select' | 'insert' | 'update'>` cukup, sesuai catatan plan (tanpa SQL mentah).
- Tes integrasi awalnya menjalankan runner dengan `NOW` tetap padahal pemicu (cabut/lifecycle) memakai waktu nyata,
  sehingga job hapus belum jatuh tempo; tes diperbaiki memakai waktu setelah pemicu (tes sendiri, bukan pelemahan).
- Uji mutasi: membuang `tandaiTautanDicabut` di `revokeTautanByCreator` → 4 tes integrasi merah; mematikan hook
  `onBerkasDimusnahkan` → 2 tes integrasi + 3 tes unit arsiparis merah. Kode asli dikembalikan.

## User Decisions
- Tidak ada.

## Passed / No Action Needed
- Append-only tetap: kode baru hanya `INSERT` ke `audit.audit_log` dan `arsip.berkas_arsip_activity`; tidak ada
  `UPDATE`/`DELETE` riwayat. Pengecualian cascade hapus permanen dokumen non-material tidak diperluas.
- Update status berkas tetap bersyarat pada status lama; hook hanya dipanggil setelah update berhasil dan sebelum
  activity, semuanya di `runInRepositoryTransaction`. Repo palsu lama (tanpa hook/transaksi) tetap lulus apa adanya.
- `DAFTAR_ISI.txt` yang hilang (404) saat `HAPUS_FILE` tidak ditulis ulang: tujuan job adalah menghapus, dan
  sinkron berikutnya (bila ada) menulis ulang. Galat lain tetap dilempar ke runner.
- `HAPUS_TAUTAN` menandai SEMUA baris yang belum `DIHAPUS` (termasuk `DILEWATI`/`MENUNGGU`) sebagai `DIHAPUS`
  sesuai plan; keterangan lama dipertahankan, kosong → `DICABUT`.
- Rute DELETE dokumen memicu runner setelah transaksi DB commit, sebelum penghapusan file lokal; galat file lokal
  sesudahnya tidak membatalkan job Drive (dokumen memang sudah terhapus). Respons tidak berubah.
- Tidak ada respons API yang berubah bentuk; log runner tetap hanya `jenis` + `kategori`. Tidak ada token, path fisik,
  atau ID file Drive yang dikirim ke klien.
- Tes lama yang disesuaikan (injeksi saja, asersi lama utuh): `dokumen-delete-audit-log.test.ts` memock
  `#/lib/google-drive/penghapusan` + runner (tx tiruannya hanya punya `insert`/`delete`); `berkas-arsip-api`,
  `pembersihan-route`, `tautan-route` memock runner; repo palsu `berkas-arsip-service.test.ts` diberi opsi
  `withDestructionHook`/`destructionHookError`/`updateBerkasArchiveStatusConflict`; helper `memory-tautan-repo.ts`
  ditambah metode `HapusDriveRepository`.
