# Uji Terima Manual — Tautan Laporan ke Google Drive (SPEC 12.3)

Wajib dijalankan di **mesin lokal** (sandbox cloud memblokir Google). Pakai Gmail pribadi dan **data dummy** saja.
Fitur baru dinyatakan selesai setelah semua baris di tabel hasil terisi (SPEC 14).

Panduan per kasus uji yang lebih rinci (langkah + ekspektasi per peran): `TEST_VERIFICATION.md` di folder yang sama.

## A. Persiapan Google Cloud (sekali, SPEC 5)

- [ ] Google Cloud Console → buat project → aktifkan **Google Drive API**.
- [ ] OAuth consent screen: tipe **External**, status **Testing**, tambahkan Gmail penguji sebagai *test user*.
      (Mode Testing: refresh token kedaluwarsa ±7 hari → cukup "Hubungkan ulang". Untuk pemakaian nyata publikasikan ke
      *In production*; scope `drive.file` tergolong non-sensitive.)
- [ ] Credentials → **Create OAuth client ID** → tipe **Desktop app**. Catat client ID dan client secret (jangan dibagikan).
- [ ] Setelah uji berhasil: tambahkan akun kantor sebagai *Owner* project Google Cloud.

## B. Pengisian env lokal

- [ ] Node.js 22+ (`node -v`).
- [ ] Di `.env` lokal (bukan `.env.example`), isi:
      `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, dan `DMS_DRIVE_TOKEN_KEY` hasil
      `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- [ ] `pnpm db:local:migrate` (menerapkan `0024_google_drive_tautan`), lalu `pnpm dev`.
- [ ] Siapkan data dummy: minimal 3 dokumen dengan lampiran yang tampil di Laporan Saya / Laporan Kinerja, satu berkas
      `CLOSED` yang bisa dimusnahkan, dan satu dokumen non-material `TERSIMPAN`.
- [ ] Dua Gmail pribadi (akun A dan akun B), keduanya terdaftar sebagai *test user*.

## C. Checklist uji terima

| # | Langkah | Ekspektasi | Hasil (✅/❌ + catatan) | Tanggal |
|---|---|---|---|---|
| 1 | ADMIN → Pengaturan → **Hubungkan akun Google** (akun A) → **Buka halaman login Google** → Izinkan (centang izin Drive) → salin alamat `http://127.0.0.1:53682/...` dari tab yang gagal dimuat → tempel → **Simpan**. Lalu PEGAWAI/PJ Kinerja: **Bagikan Tautan** → pilih **Google Drive** → buat tautan berisi 3 dokumen. | Akun A "Terhubung". Dialog menampilkan "Sedang diunggah ke Google Drive (x/y)…" lalu **Salin link Drive** / **Buka di Drive**. Link dibuka dari HP dengan data seluler (tanpa login Google) → folder berisi file + `DAFTAR_ISI.txt`. | | |
| 1a | **Verifikasi `tokens.scope` (consent granular):** ulangi alur hubungkan, tetapi **lepas centang** izin Google Drive di layar persetujuan. | Muncul "Izin akses Google Drive tidak dicentang — ulangi dan centang izin Drive."; tidak ada akun baru/berubah di Pengaturan. Ulangi dengan centang lengkap → berhasil. | | |
| 2 | Buat tautan Drive baru dengan banyak lampiran; **matikan WiFi** saat progres berjalan → tunggu beberapa menit → nyalakan lagi (buka Riwayat Tautan untuk memicu runner). | Progres berhenti lalu lanjut sendiri sampai `SIAP`; di Drive tidak ada file ganda. | | |
| 3 | Riwayat Tautan → **Cabut** tautan Drive dari langkah 1 (konfirmasi menyebut "Salinan di Google Drive akan dihapus permanen."). | Baris "Dicabut · menghapus dari Drive…" lalu "Dicabut · terhapus dari Drive". Folder hilang dari Drive; link lama tidak bisa dibuka. | | |
| 4 | Buat tautan Drive yang memuat dokumen dari berkas `CLOSED`. KSBU: usulkan musnah → setujui pemusnahan berkas itu. | File dokumen berkas itu hilang dari folder Drive; `DAFTAR_ISI.txt` diperbarui (dokumen ditandai dimusnahkan). File lain tetap. | | |
| 5 | ADMIN → **Ganti akun** → hubungkan akun B. Buka link Drive tautan lama (akun A). Lalu cabut tautan lama itu. | Akun A tampil di "Akun tidak aktif"; tautan lama tetap terbuka; tautan baru disimpan di akun B. Setelah dicabut, folder terhapus dari Drive **akun A**. | | |
| 5a | **Uji berganti akun saat membuat tautan:** buka dialog Bagikan (kartu Drive aktif), lalu di tab lain ADMIN **Putuskan** akun aktif; kembali ke dialog → **Buat Tautan** dengan Google Drive. | Tautan tidak dibuat; pesan "Belum ada akun Google Drive terhubung — hubungi Admin"; kartu Drive menjadi nonaktif dan akses kembali ke Terbatas. | | |
| 6 | Pastikan akun A masih punya tautan Drive aktif → **Putuskan permanen** akun A (konfirmasi menyebut jumlah tautan aktif). | Akun A hilang dari daftar; tautannya muncul di "Perlu dihapus manual di Drive" (judul, nama folder, email akun A, "Seluruh folder", "Akun Google Drive diputus — hapus manual di Drive"). Hapus folder itu manual di Drive akun A. | | |
| 7 | Kosongkan tiga variabel env Google → restart server → buka dialog Bagikan Tautan dan ADMIN → Pengaturan. | Kartu Google Drive nonaktif dengan alasan "Fitur Google Drive belum dikonfigurasi"; Pengaturan menampilkan nama tiga variabel env (tanpa nilai). Simpan tema/identitas tetap memaksa logout; aksi Drive tidak. | | |
| 8 | Buat tautan Drive yang memuat dokumen non-material `TERSIMPAN` milik pegawai → pegawai **hapus permanen** dokumen itu. | File dokumen itu hilang dari folder Drive; `DAFTAR_ISI.txt` diperbarui (dihapus pemilik). | | |
| 9 | Buat tautan Drive → segera hentikan server (`Ctrl+C`) sebelum `SIAP` → jalankan `pnpm drive:sync` (beberapa kali bila perlu). | Skrip mencetak "Job diproses: x. Selesai: y. Gagal: z. Dijeda: w." tanpa token/email; setelah server dinyalakan, Riwayat menampilkan `SIAP`. | | |
| 10 | Uji visual: dialog Bagikan di lebar HP (kartu bertumpuk) dan desktop (tiga kolom); Riwayat menampilkan status Mengunggah/Siap/Gagal + **Coba lagi**; Pengaturan panel 2 langkah. | Tata letak rapi, tombol berlabel benar, tidak ada URL DMS untuk tautan Drive, tidak ada "dibuka N×" untuk tautan Drive. | | |

## D. Catatan hasil

- Penguji: ______________________  Tanggal: ______________
- Versi commit yang diuji: ______________
- Temuan / bug:
