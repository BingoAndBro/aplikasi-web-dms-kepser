# Code Review: Section 07 — Rencana File, Daftar Isi, Handler Sinkron, Runner

## Auto-fixes Applied
- Salinan yatim: bila percobaan terputus sudah menaruh lampiran di Drive tetapi file lokalnya kini tidak tersedia, salinan itu
  dihapus sebelum baris ditandai `DILEWATI` (sebelumnya salinan akan tertinggal di folder tanpa tercatat). Diuji.
- `file-source` membuka stream secara malas (`buka()`), supaya tidak ada stream yang dibuka lalu ditinggal.
- 404 di folder tautan saat unggah/daftar isi/izin selalu keluar sebagai `TIDAK_DITEMUKAN` dengan pesan SPEC 11.2.
- Nama lampiran yang bentrok dengan `DAFTAR_ISI.txt` diberi akhiran; kunci lampiran ganda hanya direncanakan sekali
  (unique `laporan_tautan_drive_file_kunci_unique` tidak akan terlanggar).
- Teks bebas pengguna di `DAFTAR_ISI.txt` dibersihkan dari baris baru dan karakter kontrol.
- Tes kembar dan tes respons hilang dirapikan (baris sisa yang tidak berpengaruh dihapus); tes debug dihapus.

## User Decisions
- Tidak ada (perilaku `failDriveJob` = 'MENUNGGU' untuk job kembar sudah ditetapkan pemilik di instruksi sesi).

## Passed / No Action Needed
- `setDriveStatus('MENGUNGGAH')` terjadi sebelum `driveClientFor`; job yang dijeda karena token (akun perlu hubung ulang)
  menyisakan `drive_status = MENGUNGGAH`. Rute riwayat section 08 menampilkan penanda `drive_tertunda_akun`.
- Runner tidak menjadwalkan timer bila putarannya gagal total (DB mati); pemicu berikutnya menjalankannya lagi.
- `bukaFileUntukUnggah` jalur DB bawaan (resolver dokumen + status arsip efektif manual) tidak diuji dengan DB di section ini;
  jalur keputusannya diuji lewat dependensi yang diinjeksi. Uji terima manual section 12 mencakup lampiran dimusnahkan.
- Jalur `tandaiSiap` + audit + job SELESAI, update bersyarat, dan unggahan terbang + HAPUS_FILE diuji di PostgreSQL asli.
- Urutan TDD: antarmuka `TautanDriveRepository` ditulis sebelum tes handler (tes butuh tipenya); implementasi DB-nya diuji
  setelahnya di integrasi.
