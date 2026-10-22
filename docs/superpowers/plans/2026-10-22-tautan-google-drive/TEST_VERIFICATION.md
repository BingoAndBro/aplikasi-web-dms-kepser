# Test & Verification Guide: Bagikan Tautan Laporan ke Google Drive

## Overview
Tautan Laporan kini punya akses ketiga, **Google Drive**: salinan lampiran diunggah ke folder di akun Google yang
dihubungkan ADMIN, lalu dibagikan lewat link folder Drive. Salinan otomatis dihapus dari Drive saat tautan dicabut, berkas
dimusnahkan, dokumen dibersihkan, atau dokumen non-material dihapus permanen.

Checklist ringkas yang wajib diisi sebelum fitur dinyatakan selesai: `uji-terima-manual.md` (SPEC 12.3). Dokumen ini
merinci langkah dan ekspektasi per kasus.

## Prerequisites
- Mesin lokal (bukan sandbox cloud — Google diblokir di sana), Node.js 22+, PostgreSQL Docker menyala.
- Persiapan Google Cloud + env lokal selesai (`uji-terima-manual.md` bagian A–B); `pnpm db:local:migrate`, `pnpm dev`.
- Akun DMS: ADMIN (`dev.admin`), PEGAWAI, KSBU, PJ Kinerja dari seed lokal (kata sandi = `DMS_DEV_SEED_PASSWORD` lokal).
- Dua Gmail pribadi uji (A, B) sebagai *test user*. HP dengan data seluler untuk membuka link tanpa jaringan kantor.
- Data dummy: ≥ 3 dokumen berlampiran, satu berkas `CLOSED`, satu dokumen non-material `TERSIMPAN`.

---

## Test Cases

### [TC-01] Kartu Google Drive tanpa konfigurasi
**Tujuan:** Tanpa env Google, fitur mati dengan jelas dan tidak mengganggu fitur lain.
**Langkah:**
1. Kosongkan `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `DMS_DRIVE_TOKEN_KEY`; restart server.
2. PEGAWAI → Laporan Saya → **Bagikan Tautan**.
3. ADMIN → Pengaturan.
**Ekspektasi:**
- Tiga kartu akses; kartu Google Drive abu-abu, tidak bisa dipilih, teks "Fitur Google Drive belum dikonfigurasi".
- Pengaturan menampilkan kartu Google Drive dengan nama tiga variabel env (tanpa nilai).
- Tautan Terbatas/Publik tetap bisa dibuat seperti sebelumnya.
**Status:** ⬜ Belum diuji

---

### [TC-02] ADMIN menghubungkan akun Google (alur salin-tempel)
**Tujuan:** Alur OAuth 2 langkah berhasil dan tidak memaksa logout.
**Langkah:**
1. Isi env, restart. ADMIN → Pengaturan → **Hubungkan akun Google**.
2. **Buka halaman login Google** → login akun A → centang izin Drive → Izinkan.
3. Tab baru gagal memuat `http://127.0.0.1:53682/?state=…&code=…` → salin seluruh alamat.
4. Tempel di "Tempel alamat dari tab yang gagal dimuat" → **Simpan**.
**Ekspektasi:**
- Toast "Akun terhubung"; kartu menampilkan email A, badge **Terhubung**, "0 tautan Drive aktif · 0 pekerjaan gagal".
- ADMIN tetap login (tidak diarahkan ke halaman login).
- Di Google Drive akun A muncul folder akar aplikasi.
**Status:** ⬜ Belum diuji

---

### [TC-03] Izin Drive tidak dicentang (verifikasi `tokens.scope`)
**Tujuan:** Consent granular tanpa izin Drive ditolak (belum pernah diuji dengan login nyata).
**Langkah:** Ulangi TC-02 (mode Ganti akun atau Hubungkan), tetapi lepas centang izin Google Drive sebelum Izinkan.
**Ekspektasi:**
- Pesan merah "Izin akses Google Drive tidak dicentang — ulangi dan centang izin Drive."
- Tidak ada akun baru/berubah. Ulangi dengan centang lengkap → berhasil.
**Status:** ⬜ Belum diuji

---

### [TC-04] Alamat tempel salah / kedaluwarsa
**Tujuan:** Galat alur OAuth jelas dan aman.
**Langkah:**
1. Tempel teks acak → Simpan.
2. Mulai langkah 1, tunggu > 10 menit (atau restart server), lalu tempel alamatnya.
3. Tempel alamat yang sama dua kali.
**Ekspektasi:** Pesan galat berbahasa Indonesia (alamat tidak dikenali / kedaluwarsa — ulangi dari langkah 1); tidak ada
akun tersimpan; tidak ada token di pesan.
**Status:** ⬜ Belum diuji

---

### [TC-05] Membuat tautan Google Drive (happy path)
**Tujuan:** Salinan terunggah dan link bisa dibuka dari internet.
**Langkah:**
1. PEGAWAI atau PJ Kinerja → laporan berisi 3 dokumen → **Bagikan Tautan** → pilih **Google Drive**.
2. Baca peringatan kuning → **Buat Tautan**.
3. Biarkan dialog terbuka sampai selesai; lalu **Salin link Drive** / **Buka di Drive**.
4. Buka link dari HP (data seluler, tanpa login Google).
**Ekspektasi:**
- Peringatan: "Siapa saja yang memegang link Google Drive dapat melihat dan mengunduh dokumen tanpa login. Salinan dihapus
  dari Drive saat tautan dicabut atau berkas dimusnahkan."
- Progres "Sedang diunggah ke Google Drive (x/y)…" bertambah tiap ±3 detik, lalu tombol Drive muncul.
- Folder berisi lampiran + `DAFTAR_ISI.txt` (tanpa path server). Tidak ada URL DMS di dialog.
**Status:** ⬜ Belum diuji

---

### [TC-06] Riwayat Tautan untuk tautan Drive
**Tujuan:** Status Drive dan aksinya benar.
**Langkah:** Buka **Riwayat Tautan** saat tautan masih mengunggah, setelah siap, dan setelah gagal (mis. kuota/akun diputus).
**Ekspektasi:**
- Badge akses "Google Drive"; tidak ada "dibuka N×" dan tidak ada URL DMS untuk baris Drive.
- Mengunggah: "Mengunggah 12/40" + spinner (polling ±5 detik, berhenti saat dialog ditutup).
- Siap: "Google Drive · Siap" + **Salin link Drive** / **Buka di Drive** + Cabut.
- Gagal: "Gagal: <pesan>" + **Coba lagi** + Cabut; Coba lagi → toast "Dijadwalkan ulang", status kembali mengunggah.
- Akun perlu dihubungkan ulang: "Tertunda: akun Drive perlu dihubungkan ulang".
**Status:** ⬜ Belum diuji

---

### [TC-07] Internet putus saat mengunggah
**Tujuan:** Antrean tahan gangguan dan tidak membuat file ganda.
**Langkah:** Buat tautan Drive dengan banyak lampiran → matikan WiFi di tengah progres → tunggu → nyalakan → buka Riwayat.
**Ekspektasi:** Unggahan berlanjut sampai Siap; tidak ada file ganda di folder.
**Status:** ⬜ Belum diuji

---

### [TC-08] Cabut tautan Drive
**Tujuan:** Mencabut menghapus folder di Drive.
**Langkah:** Riwayat → **Cabut** tautan Drive → konfirmasi.
**Ekspektasi:** Konfirmasi memuat "Salinan di Google Drive akan dihapus permanen."; baris "Dicabut · menghapus dari Drive…"
lalu "Dicabut · terhapus dari Drive"; folder hilang dari Drive; link lama tidak bisa dibuka.
**Status:** ⬜ Belum diuji

---

### [TC-09] Pemusnahan berkas, Pembersihan Dokumen, hapus permanen
**Tujuan:** Tiga pemicu lain menghapus file terkait dan memperbarui daftar isi.
**Langkah:**
1. Buat tautan Drive memuat dokumen dari berkas `CLOSED`; KSBU usulkan musnah → setujui pemusnahan.
2. Buat tautan Drive memuat dokumen yang lalu dibersihkan lewat Pembersihan Dokumen (Ketua Tim/KSBU).
3. Buat tautan Drive memuat dokumen non-material `TERSIMPAN`; pemiliknya hapus permanen.
**Ekspektasi:** Pada setiap kasus file dokumen itu hilang dari folder Drive, file lain tetap, `DAFTAR_ISI.txt` diperbarui
dengan keterangan (dimusnahkan / dibersihkan / dihapus pemilik). Link folder tetap terbuka.
**Status:** ⬜ Belum diuji

---

### [TC-10] Ganti akun dan putuskan permanen
**Tujuan:** Tautan lama tetap dilayani akun lama; pemutusan memunculkan daftar hapus manual.
**Langkah:**
1. Dengan tautan Drive aktif di akun A: ADMIN → **Ganti akun** → hubungkan akun B.
2. Buka link tautan lama; buat tautan baru; cabut salah satu tautan lama.
3. **Putuskan permanen** akun A yang masih punya tautan aktif.
4. Klik **Coba lagi penghapusan yang gagal**.
**Ekspektasi:**
- Akun A di "Akun tidak aktif" dengan jumlah tautan; tautan lama tetap terbuka; tautan baru di Drive akun B; tautan lama
  yang dicabut terhapus dari Drive akun A.
- Konfirmasi putus menyebut jumlah tautan aktif dan bahwa folder harus dihapus manual.
- "Perlu dihapus manual di Drive" memuat judul tautan, nama folder, email A, "Seluruh folder", "Akun Google Drive diputus —
  hapus manual di Drive". Coba lagi → toast "Tidak ada yang dicoba lagi" (akun diputus tidak bisa dicoba).
- Tidak ada nama file atau daftar dokumen di halaman ADMIN.
**Status:** ⬜ Belum diuji

---

### [TC-11] Akun berganti/diputus saat dialog Bagikan terbuka
**Tujuan:** Kondisi balapan yang diketahui ditangani dengan pesan yang benar.
**Langkah:** Buka dialog Bagikan (kartu Drive aktif) → di tab lain ADMIN memutus akun aktif → kembali → buat tautan Drive.
**Ekspektasi:** Tidak ada tautan dibuat; pesan "Belum ada akun Google Drive terhubung — hubungi Admin"; kartu Drive nonaktif
dan akses kembali ke Terbatas. (Bila ADMIN *mengganti* akun di antara cek dan insert, tautan memakai akun lama yang kini
NONAKTIF — batasan yang diketahui, salinan tetap diproses.)
**Status:** ⬜ Belum diuji

---

### [TC-12] `pnpm drive:sync` saat server mati
**Tujuan:** Antrean bisa diproses tanpa server aplikasi.
**Langkah:** Buat tautan Drive → hentikan server sebelum Siap → `pnpm drive:sync` → nyalakan server → Riwayat.
**Ekspektasi:** Keluaran "Job diproses: x. Selesai: y. Gagal: z. Dijeda: w." tanpa token/email; status Siap setelahnya.
Tanpa env Google: "Google Drive belum dikonfigurasi; tidak ada yang diproses." (exit 0).
**Status:** ⬜ Belum diuji

---

### [TC-13] Hak akses negatif
**Tujuan:** Tautan Drive tidak bisa dibuka lewat DMS dan rute admin terlindung.
**Langkah:**
1. Ambil token tautan Drive dari DB lokal (jangan dibagikan) → buka `/tautan/<token>` dengan dan tanpa login.
2. Login non-ADMIN → panggil `GET /api/admin/google-drive` dari DevTools.
3. Pengguna lain mencoba `POST /api/laporan/tautan/<id>/coba-lagi` untuk tautan bukan miliknya.
**Ekspektasi:** (1) 404 "tidak ditemukan" identik; (2) 403; (3) 404.
**Status:** ⬜ Belum diuji

---

### [TC-14] Tampilan HP dan desktop
**Tujuan:** UI rapi di dua lebar layar.
**Langkah:** Buka dialog Bagikan, Riwayat, dan Pengaturan di lebar ±375 px dan desktop.
**Ekspektasi:** Kartu akses bertumpuk di HP dan tiga kolom di desktop; tombol Riwayat tidak terpotong; panel 2 langkah terbaca.
**Status:** ⬜ Belum diuji

---

## Manual Verification Checklist

| # | Fitur | Tested | Pass | Fail | Catatan |
|---|-------|--------|------|------|---------|
| 1 | Tanpa konfigurasi (TC-01) | ⬜ | ⬜ | ⬜ | |
| 2 | Hubungkan akun + scope (TC-02, TC-03, TC-04) | ⬜ | ⬜ | ⬜ | |
| 3 | Buat tautan Drive + progres (TC-05) | ⬜ | ⬜ | ⬜ | |
| 4 | Riwayat Tautan Drive (TC-06) | ⬜ | ⬜ | ⬜ | |
| 5 | Ketahanan internet putus (TC-07) | ⬜ | ⬜ | ⬜ | |
| 6 | Empat pemicu hapus (TC-08, TC-09) | ⬜ | ⬜ | ⬜ | |
| 7 | Ganti/putus akun + hapus manual (TC-10, TC-11) | ⬜ | ⬜ | ⬜ | |
| 8 | `pnpm drive:sync` (TC-12) | ⬜ | ⬜ | ⬜ | |
| 9 | Hak akses negatif (TC-13) | ⬜ | ⬜ | ⬜ | |
| 10 | Tampilan responsif (TC-14) | ⬜ | ⬜ | ⬜ | |

---

## Bug yang Ditemukan

| # | Deskripsi Bug | Severity | Status | Link |
|---|---------------|----------|--------|------|
| 1 | | | | — |

---

## Sign-off

- **Tester:** _______________________
- **Tanggal:** _______________________
- **Hasil:** ⬜ Lolos / ⬜ Perlu Perbaikan
