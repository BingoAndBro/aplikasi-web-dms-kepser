# Code Review: Section 03 — Paket Google, Klasifikasi Galat, DriveClient, FakeDrive

## Auto-fixes Applied
- `pnpm-lock.yaml`: pnpm 10.28 di VM menghapus 27 baris `libc:` milik paket native lain (beda versi pnpm dengan
  mesin pemilik). Baris itu dikembalikan sehingga diff lockfile murni penambahan (+337 baris); `pnpm install
  --frozen-lockfile` lulus tanpa mengubah lockfile.
- `classifyDriveError` menelusuri rantai `cause`/`error` sampai 4 tingkat untuk kode jaringan: fetch Node membungkus
  galat sistem (`GaxiosError` → `TypeError: fetch failed` → galat ber-`code`). Galat jaringan hanya dikenali bila
  tidak ada status HTTP.
- `updateFileContent` dan `shareAnyoneReader` juga mengirim `fields: 'id'` (prinsip "selalu minta fields minimal").
- Respons sukses tanpa `id` (`createFolder`/`uploadFile`) dilempar sebagai `PERMANEN` alih-alih mengembalikan id kosong.
- Salah ketik kurung di tes `drive-client` diperbaiki (tes sendiri, bukan pelemahan).

## User Decisions
- Tidak ada.

## Passed / No Action Needed
- `findChildByAppProperty` menolak (bukan meng-escape) nilai di luar `^[A-Za-z0-9:_-]+$`, juga nilai kosong;
  semua nilai yang dipakai adalah uuid/kunci buatan sistem.
- `drive-errors.ts` ditulis sebelum tesnya (urutan TDD tidak ketat untuk modul ini); `drive-client.ts` dan
  `FakeDrive` mengikuti urutan tes-dulu (merah → hijau).
