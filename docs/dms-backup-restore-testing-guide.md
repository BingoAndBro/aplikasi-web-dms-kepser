# Panduan Backup, Restore, dan Pengujian DMS Lokal

> Dokumen ini menjelaskan alur backup sampai restore untuk aplikasi DMS lokal berbasis PostgreSQL + filesystem storage.
> Tujuannya agar operator lain dapat melakukan backup/restore dengan aman tanpa membocorkan secret dan tanpa merusak environment aktif.

---

## 1. Tujuan Drill

Backup/restore drill dilakukan untuk membuktikan bahwa:

1. Database PostgreSQL bisa di-backup.
2. Folder storage lokal bisa di-backup.
3. Backup database dan storage bisa di-restore ke target lokal yang bersih.
4. Aplikasi hasil restore bisa:
   - login,
   - membuka daftar dokumen,
   - preview/download file valid,
   - tetap memblokir arsip `DIMUSNAHKAN`,
   - menjalankan diagnostics storage.
5. Backup database dan storage tetap selaras, sehingga metadata dokumen dan file lampiran tidak terpisah.

---

## 2. Prinsip Keamanan

Jangan menulis, mengirim, atau commit informasi berikut:

- isi `.env` atau `.env.migration`;
- `DATABASE_URL` asli;
- password database;
- session secret;
- file/token signing secret;
- cookie/session token;
- physical storage root asli;
- URL token preview/download;
- screenshot yang memperlihatkan path lokal atau secret.

Gunakan placeholder seperti:

```text
<DATABASE_URL>
<RESTORE_DATABASE_URL>
<STORAGE_ROOT>
<RESTORE_STORAGE_ROOT>
<BACKUP_DIR>
<TIMESTAMP>
<APP_COMMIT>
```

Backup harus disimpan **di luar repository**, misalnya:

```text
D:\backup-dms-kepser\<tanggal>\
```

Jangan simpan backup di dalam:

```text
D:\GitHub\kepser-postgres-migration
```

---

## 3. Istilah Penting

| Istilah | Arti |
|---|---|
| Database aktif | Database yang sedang dipakai aplikasi normal, misalnya `kepser`. |
| Database restore drill | Database test bersih untuk menguji hasil restore, misalnya `kepser_restore_drill`. |
| Storage aktif | Folder file lampiran aplikasi normal. |
| Storage restore drill | Folder test hasil restore storage, bukan storage aktif. |
| Manifest | File catatan backup yang berisi metadata backup tanpa secret. |
| Dry-run cleanup | Mode simulasi cleanup orphan, tidak menghapus file. |
| Destructive cleanup | Cleanup yang benar-benar menghapus file. Jangan dijalankan saat drill restore. |

---

## 4. Alur Besar

Alur backup sampai restore:

```text
1. Catat commit dan branch
2. Buat folder backup di luar repo
3. Backup database PostgreSQL
4. Validasi dump database
5. Backup storage lokal
6. Buat manifest backup
7. Buat database restore drill yang bersih
8. Restore database ke database restore drill
9. Restore storage ke folder restore drill
10. Jalankan app memakai DB/storage restore sementara
11. Tes login, list dokumen, preview, download
12. Tes DIMUSNAHKAN
13. Jalankan analyze-storage
14. Jalankan cleanup dry-run saja
15. Catat evidence untuk 11G.3
```

---

## 5. Step 1 — Catat Branch dan Commit

Jalankan di terminal repo:

```powershell
git branch --show-current
git rev-parse HEAD
```

Catat:

```text
source_branch: migration/postgres-local
source_commit: <APP_COMMIT>
operator: <NAMA_OPERATOR>
created_at: <TANGGAL_JAM>
```

Jangan membuat commit baru saat drill berjalan.

---

## 6. Step 2 — Buat Folder Backup

Contoh:

```powershell
New-Item -ItemType Directory -Force "D:\backup-dms-kepser\2026-05-21"
```

Untuk konsistensi, pakai timestamp yang sama untuk file database dan storage, misalnya:

```text
20260521-110000
```

---

## 7. Step 3 — Backup Database PostgreSQL dengan Aman

### 7.1 Kenapa tidak memakai redirection PowerShell?

Hindari pola ini untuk custom dump binary:

```powershell
docker exec -t kepser-postgres pg_dump ... > "D:\...\dms-db.dump"
```

Alasannya:

- `pg_dump -Fc` menghasilkan file binary/custom archive.
- `-t` membuat pseudo-terminal.
- redirection PowerShell dapat merusak output binary.

Cara aman: **buat dump di dalam container**, validasi, lalu copy ke Windows.

### 7.2 Buat dump di dalam container PostgreSQL

Contoh jika container bernama `kepser-postgres`:

```powershell
docker exec kepser-postgres pg_dump -U kepser -d kepser -Fc -f /tmp/dms-db-20260521-110000.dump
```

Penjelasan:

| Bagian | Arti |
|---|---|
| `docker exec kepser-postgres` | Jalankan command di container PostgreSQL. |
| `pg_dump` | Tool backup PostgreSQL. |
| `-U kepser` | User database. |
| `-d kepser` | Nama database aktif. |
| `-Fc` | Format custom PostgreSQL dump. |
| `-f /tmp/...dump` | Simpan dump di dalam container. |

### 7.3 Validasi dump database

```powershell
docker exec kepser-postgres pg_restore -l /tmp/dms-db-20260521-110000.dump
```

Jika keluar daftar isi dump tanpa error, catat:

```text
database_dump_validation: pg_restore -l passed
```

### 7.4 Copy dump ke folder backup Windows

```powershell
docker cp kepser-postgres:/tmp/dms-db-20260521-110000.dump "D:\backup-dms-kepser\2026-05-21\dms-db-20260521-110000.dump"
```

Cek file:

```powershell
Get-Item "D:\backup-dms-kepser\2026-05-21\dms-db-20260521-110000.dump"
```

Catat ukuran file:

```text
database_dump_size_bytes: <UKURAN_DARI_Get-Item>
```

### 7.5 Hapus file dump sementara di container

Setelah file berhasil dicopy ke Windows:

```powershell
docker exec kepser-postgres rm /tmp/dms-db-20260521-110000.dump
```

---

## 8. Step 4 — Backup Storage Lokal

Pastikan folder storage ada:

```powershell
Test-Path .\storage
Get-ChildItem .\storage -Recurse -File | Measure-Object
```

Contoh backup storage:

```powershell
Compress-Archive `
  -Path ".\storage\*" `
  -DestinationPath "D:\backup-dms-kepser\2026-05-21\dms-storage-20260521-110000.zip" `
  -Force
```

Cek hasil backup:

```powershell
Get-Item "D:\backup-dms-kepser\2026-05-21\dms-storage-20260521-110000.zip"
Get-ChildItem .\storage -Recurse -File | Measure-Object
```

Catat:

```text
storage_backup_created: yes
storage_file_count: <JUMLAH_FILE>
storage_archive_size_bytes: <UKURAN_ZIP>
```

---

## 9. Step 5 — Buat Manifest Backup

Buat file manifest:

```powershell
notepad "D:\backup-dms-kepser\2026-05-21\manifest-20260521.md"
```

Isi contoh:

```md
# DMS Local Backup Manifest

backup_id: dms-local-2026-05-21-110000
created_at: 2026-05-21 11:00
operator: <NAMA_OPERATOR>
source_branch: migration/postgres-local
source_commit: <APP_COMMIT>

backup_scope:
  database: local PostgreSQL
  storage: local filesystem storage
  legacy_data_or_files_included: no

database_backup:
  database_dump_created: yes
  database_dump_file: operator-held, not stored in repo
  database_dump_filename: dms-db-20260521-110000.dump
  database_dump_format: PostgreSQL custom format (-Fc)
  database_dump_validation: pg_restore -l passed
  database_dump_size_bytes: <UKURAN_DUMP>
  backup_method: docker exec pg_dump inside PostgreSQL container
  notes: no DATABASE_URL, password, or secret stored in this manifest

storage_backup:
  storage_backup_created: yes
  storage_archive_file: operator-held, not stored in repo
  storage_archive_filename: dms-storage-20260521-110000.zip
  storage_file_count: <JUMLAH_FILE_STORAGE>
  storage_archive_size_bytes: <UKURAN_ZIP>
  backup_method: Compress-Archive from configured local storage root
  notes: physical storage root is not stored in this manifest

package_metadata:
  package_metadata_reference: pnpm-lock.yaml at source commit
  package_files_committed_with_source: yes

config_key_names:
  - DATABASE_URL
  - DMS_LOCAL_STORAGE_ROOT
  - SESSION_SECRET
  - DMS_FILE_TOKEN_SECRET
  - APP_URL
  - HOST
  - PORT
  - USE_POSTGRES
  - USE_LOCAL_AUTH
  - USE_LOCAL_STORAGE

backup_location:
  location: operator-held, redacted
  stored_inside_repo: no
  committed_to_git: no

restore_drill_status:
  restore_drill_completed: no
  restore_target_type: pending
  postgresql_restore_completed: pending
  storage_restore_completed: pending
  app_login_validated: pending
  document_list_validated: pending
  preview_download_validated: pending
  dimusnahkan_access_blocked_validated: pending
  storage_diagnostics_validated: pending
  cleanup_dry_run_reviewed: pending
  destructive_cleanup_run: no

safety_notes:
  - Do not commit backup dump, storage archive, or this operator-held backup folder into Git.
  - Do not store DATABASE_URL, passwords, session secrets, file token secrets, cookies, or physical storage root values in this manifest.
  - Database dump and storage archive are a matched backup pair.
  - Restore drill should use a clean target, not the active runtime database/storage.
  - Data atau file dari versi aplikasi sebelum migrasi tidak termasuk dan tidak dipulihkan dari backup ini.
```

---

## 10. Step 6 — Buat Database Restore Drill yang Bersih

Database restore drill adalah target test, bukan database aktif.

Contoh nama:

```text
kepser_restore_drill
```

Jalankan:

```powershell
docker exec kepser-postgres dropdb -U kepser --if-exists kepser_restore_drill
docker exec kepser-postgres createdb -U kepser kepser_restore_drill
```

Catat:

```text
restore_target_type: clean local target
target_db_was_clean_before_restore: yes
```

---

## 11. Step 7 — Restore Database

Jika dump sudah ada di Windows, copy dulu ke container:

```powershell
docker cp "D:\backup-dms-kepser\2026-05-21\dms-db-20260521-110000.dump" kepser-postgres:/tmp/dms-db-20260521-110000.dump
```

Validasi sekali lagi jika perlu:

```powershell
docker exec kepser-postgres pg_restore -l /tmp/dms-db-20260521-110000.dump
```

Restore ke database drill:

```powershell
docker exec kepser-postgres pg_restore -U kepser -d kepser_restore_drill --clean --if-exists /tmp/dms-db-20260521-110000.dump
```

Catat:

```text
postgresql_restore_completed: yes
```

Jika ada error, catat error ringkas tanpa secret.

---

## 12. Step 8 — Restore Storage ke Folder Test

Buat folder restore storage:

```powershell
New-Item -ItemType Directory -Force "D:\backup-dms-kepser\2026-05-21\restore-storage-test"
```

Kosongkan jika folder sudah pernah dipakai:

```powershell
Remove-Item "D:\backup-dms-kepser\2026-05-21\restore-storage-test\*" -Recurse -Force -ErrorAction SilentlyContinue
```

Restore storage zip:

```powershell
Expand-Archive `
  -Path "D:\backup-dms-kepser\2026-05-21\dms-storage-20260521-110000.zip" `
  -DestinationPath "D:\backup-dms-kepser\2026-05-21\restore-storage-test" `
  -Force
```

Cek jumlah file:

```powershell
Get-ChildItem "D:\backup-dms-kepser\2026-05-21\restore-storage-test" -Recurse -File | Measure-Object
```

Catat:

```text
storage_restore_completed: yes
restored_storage_file_count: <JUMLAH_FILE>
```

---

## 13. Step 9 — Jalankan App dengan Target Restore

Jangan edit `.env` permanen. Gunakan PowerShell baru dan set environment sementara.

Buka terminal baru:

```powershell
cd D:\GitHub\kepser-postgres-migration
```

Set database restore:

```powershell
$env:DATABASE_URL="postgresql://<USER>:<PASSWORD>@localhost:5432/kepser_restore_drill"
```

Set storage restore:

```powershell
$env:DMS_LOCAL_STORAGE_ROOT="D:\backup-dms-kepser\2026-05-21\restore-storage-test"
```

Cek env sudah terpasang tanpa menampilkan nilainya:

```powershell
if ($env:DATABASE_URL) { "DATABASE_URL set" } else { "DATABASE_URL missing" }
if ($env:DMS_LOCAL_STORAGE_ROOT) { "DMS_LOCAL_STORAGE_ROOT set" } else { "DMS_LOCAL_STORAGE_ROOT missing" }
```

Jalankan app:

```powershell
pnpm dev
```

Catat:

```text
app_pointed_to_restored_target_without_printing_values: yes
app_started: yes
serving_mode: dev
```

Setelah selesai drill, tutup terminal itu agar env sementara hilang.

---

## 14. Step 10 — Tes Aplikasi Hasil Restore

### 14.1 Login

Coba login dengan user valid.

Catat:

```text
login_works: yes
role_tested: <ROLE>
```

Jangan catat password.

### 14.2 Daftar Dokumen

Buka salah satu atau beberapa route:

```text
/pegawai/dokumen
/ppk/inbox
/ppspm/selesai
/kasubag/berkas
/admin
```

Catat:

```text
document_list_loads: yes
route_tested: <ROUTE>
```

### 14.3 Preview dan Download

Pilih dokumen yang punya lampiran valid.

Coba:

```text
preview file
download file
```

Catat:

```text
selected_preview_works: yes
selected_download_works: yes
document_label: redacted-safe label only
```

Jangan catat token URL, signed URL, atau path file.

### 14.4 Missing File

Jika ada dokumen yang file-nya memang hilang, pastikan app gagal dengan aman.

Catat:

```text
missing_old_files_fail_cleanly: yes/no/not applicable
error_category: UI-safe error / 404 / 410 / other
```

Jika tidak ada contoh:

```text
missing_old_files_fail_cleanly: not applicable
```

### 14.5 Arsip DIMUSNAHKAN

Jika ada arsip `DIMUSNAHKAN`, coba preview/download lampiran.

Expected: akses harus diblokir.

Catat:

```text
dimusnahkan_access_blocked: yes/no/not recorded
result: 403/404/410/UI blocked
```

Jika tidak ada data representatif:

```text
dimusnahkan_access_blocked: not recorded
notes: no representative DIMUSNAHKAN archive in dataset
```

---

## 15. Step 11 — Diagnostics Storage

Login sebagai Admin.

Buka:

```text
/api/admin/analyze-storage
```

Catat ringkasan:

```text
analyze_storage_run: yes
summary_reviewed: yes
physical_paths_exposed: no
```

Jangan kirim full response jika memuat data yang tidak perlu.

---

## 16. Step 12 — Cleanup Dry-Run Saja

Jalankan:

```text
/api/admin/cleanup-orphan-files?dry_run=true
```

Catat:

```text
cleanup_dry_run_reviewed: yes
destructive_cleanup_avoided_during_drill: yes
```

Jangan jalankan:

```text
/api/admin/cleanup-orphan-files?dry_run=false
```

saat drill restore.

---

## 17. Step 13 — Cek Alignment DB dan Storage

Ambil sampel 1–3 dokumen.

Validasi lewat aplikasi dan diagnostics, bukan dengan membagikan physical path.

Catat:

```text
selected_dokumen_transaksi_lampiran_urls_align: yes/no/not recorded
selected_arsip_lampiran_snapshot_handled_correctly: yes/no/not recorded
destroyed_archive_snapshots_not_treated_as_live_access: yes/no/not recorded
no_referenced_files_listed_as_orphan_in_cleanup_dry_run: yes/no/not recorded
missing_referenced_files_classified_carefully_and_not_auto_cleaned: yes/no/not recorded
```

---

## 18. Format Evidence untuk Codex

Setelah semua selesai, kirim ke Codex format berikut:

```text
Phase 11G.3 backup/restore drill evidence

Date/time:
Operator:
Evidence source: manual notes / terminal output summarized
Source branch:
Source commit:
Backup id:

Backup evidence:
- PostgreSQL dump created: yes/no
- DB dump validation: pg_restore -l passed/failed/not recorded
- DB dump size: <bytes or not recorded>
- Storage backup created: yes/no
- Storage file count: <number or not recorded>
- Storage archive size: <bytes or not recorded>
- Manifest created: yes/no
- Package metadata reference recorded: yes/no
- Non-secret config key names recorded: yes/no
- Backup storage location: operator-held/redacted
- Backup result: pass/partial/fail
- Notes:

Restore evidence:
- Restore target type: clean local target / other
- Target DB was clean before restore: yes/no/not recorded
- PostgreSQL restore completed: yes/no
- Storage restore completed: yes/no
- Restored storage file count: <number or not recorded>
- App pointed to restored target without printing values: yes/no
- App started: yes/no
- Serving mode: dev/preview/other
- Login works: yes/no
- Document list loads: yes/no
- Selected preview works: yes/no
- Selected download works: yes/no
- Missing old files fail cleanly: yes/no/not applicable/not recorded
- DIMUSNAHKAN access blocked: yes/no/not recorded
- /api/admin/analyze-storage run: yes/no
- Cleanup dry-run reviewed: yes/no
- Destructive cleanup avoided during drill: yes/no
- Restore result: pass/partial/fail
- Notes:

DB/storage alignment:
- Selected dokumen_transaksi.lampiran_urls align: yes/no/not recorded
- Selected arsip.lampiran_snapshot handled correctly: yes/no/not recorded
- Destroyed archive snapshots not treated as live access: yes/no/not recorded
- No referenced files listed as orphan in cleanup dry-run: yes/no/not recorded
- Missing referenced files classified carefully and not auto-cleaned: yes/no/not recorded

Blockers:
- none / list blockers

Decision:
- pass / partial / fail
```

---

## 19. Kriteria Keputusan

### PASS

Gunakan `PASS` hanya jika:

- PostgreSQL dump berhasil;
- dump divalidasi dengan `pg_restore -l`;
- storage backup berhasil;
- manifest dibuat;
- restore database berhasil ke target bersih;
- restore storage berhasil;
- app bisa start dengan target restore;
- login berhasil;
- daftar dokumen tampil;
- preview file valid berhasil;
- download file valid berhasil;
- `DIMUSNAHKAN` diblokir atau keterbatasan data dicatat jelas;
- diagnostics storage berhasil;
- cleanup dry-run direview;
- destructive cleanup tidak dijalankan;
- DB/storage alignment aman.

### PARTIAL

Gunakan `PARTIAL` jika:

- backup berhasil tapi restore belum;
- restore berhasil tapi beberapa validasi belum dicatat;
- tidak ada sampel untuk beberapa skenario penting;
- evidence kurang lengkap.

### FAIL/BLOCKER

Gunakan `FAIL/BLOCKER` jika:

- restore database gagal;
- restore storage gagal;
- app tidak bisa start;
- login gagal;
- daftar dokumen gagal load;
- preview/download file valid gagal;
- `DIMUSNAHKAN` tidak diblokir;
- diagnostics salah menandai referenced file sebagai orphan;
- DB dan storage tidak align.

---

## 20. Checklist Cepat

```text
[ ] Branch dan commit dicatat
[ ] Folder backup dibuat di luar repo
[ ] Database dump dibuat di container
[ ] Database dump divalidasi pg_restore -l
[ ] Dump dicopy ke folder backup
[ ] Storage backup dibuat
[ ] Manifest dibuat
[ ] Database restore drill dibuat bersih
[ ] Database restore berhasil
[ ] Storage restore berhasil
[ ] App dijalankan dengan DATABASE_URL restore
[ ] App dijalankan dengan DMS_LOCAL_STORAGE_ROOT restore
[ ] Login berhasil
[ ] Daftar dokumen tampil
[ ] Preview berhasil
[ ] Download berhasil
[ ] DIMUSNAHKAN diblokir atau dicatat tidak ada sampel
[ ] analyze-storage dijalankan
[ ] cleanup-orphan-files dry-run dijalankan
[ ] destructive cleanup tidak dijalankan
[ ] Evidence dikirim ke Codex
```
note:
Saat restore drill, terjadi accidental mutation ketika environment target belum dipastikan sepenuhnya.
Dampaknya active DB/storage sempat mismatch.
Mismatch diperbaiki dengan menyalin 2 file missing dari restore storage ke active storage.
Setelah itu preview/download kembali aman.
analyze-storage dan cleanup dry-run sudah direview.
Tidak ada destructive cleanup.

Restore drill tidak boleh dipakai untuk upload/ganti file kecuali DB dan storage target sudah diverifikasi berpasangan.
