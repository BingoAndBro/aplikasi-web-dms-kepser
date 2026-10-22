# Implementation Plan: Bagikan Tautan Laporan ke Google Drive

Rujukan: spec asli `docs/superpowers/specs/2026-10-22-tautan-google-drive-design.md` (disingkat **SPEC**),
`claude-spec.md`, `claude-interview.md` (keputusan P1–P5, D1–D16), `claude-research.md`.
Rencana ini prosa; tidak memuat implementasi kode lengkap. Nama file, fungsi, dan kolom ditulis persis
agar implementor tidak perlu menebak.

## Overview

Fitur menambah akses `DRIVE` pada Tautan Laporan. Saat tautan `DRIVE` dibuat, server menyimpan baris
tautan, satu baris per lampiran yang akan disalin, dan satu job antrean dalam satu transaksi. Runner di
dalam proses server mengklaim job dari tabel `app.drive_job` (`FOR UPDATE SKIP LOCKED`), membuat folder
tautan di Drive akun aktif, mengunggah lampiran satu per satu (status disimpan per file), menulis
`DAFTAR_ISI.txt`, memasang izin "siapa saja yang memegang link", lalu menandai tautan `SIAP` dengan link
folder. Cabut tautan, pemusnahan berkas, Pembersihan Dokumen, dan hapus permanen dokumen non-material
membuat job hapus di transaksi yang sama dengan perubahan pemicunya; runner menghapus permanen folder/file
di Drive. ADMIN mengelola akun Google lewat alur OAuth "Desktop app" salin-tempel; refresh token
disimpan terenkripsi AES-256-GCM dengan kunci di env. Semua panggilan Google terkumpul di satu interface
`DriveClient`, sehingga tes memakai `FakeDrive` in-memory.

## Architecture

### Komponen

```text
src/db/schema/app/
  google-drive-akun.ts           tabel akun Google (baru)
  laporan-tautan.ts              + akses DRIVE + kolom drive_* (diubah)
  laporan-tautan-drive-file.ts   tabel baris lampiran yang disalin (baru)
  drive-job.ts                   tabel antrean (baru)
src/db/schema/audit/audit-log.ts + entity_type/aksi Drive (diubah)
drizzle/0024_google_drive_tautan.sql + meta/_journal.json idx 24

src/lib/google-drive/
  shared.ts            (klien-aman) konstanta status, label, pesan alasan, tipe respons API
  config.ts            baca/validasi env, isDriveConfigured(), konstanta OAuth (scope, redirect)
  token-crypto.ts      encryptRefreshToken / decryptRefreshToken (v1:<iv>:<tag>:<data>)
  drive-errors.ts      DriveApiError + classifyDriveError(unknown) -> kategori
  drive-client.ts      interface DriveClient + createGoogleDriveClient(refreshToken)
  oauth.ts             state+PKCE store memori, buildAuthUrl, parsePastedAddress, exchangeCode
  akun-repository.ts   hubungkan/ganti/hubungkan ulang/putus/tandai perlu hubung ulang (tx + audit)
  availability.ts      getDriveAvailability() -> { tersedia, alasan } (dipakai status API & buat tautan)
  jobs.ts              enqueueDriveJob(tx,…), claimNextDriveJob, completeJob, failJob, deferJob, jadwal jeda
  tautan-drive-repository.ts  kueri/aksi tabel file + kolom drive_* tautan
  daftar-isi.ts        bangun teks DAFTAR_ISI.txt dari baris DB
  sinkron-tautan.ts    handler SINKRON_TAUTAN
  hapus.ts             handler HAPUS_TAUTAN dan HAPUS_FILE
  penghapusan.ts       hook pemicu (dipanggil dengan tx dari cabut/pemusnahan/pembersihan/hapus permanen)
  runner.ts            triggerDriveRunner(), runDriveRunnerOnce(), single-flight + timer

src/routes/api/google-drive/status.ts
src/routes/api/admin/google-drive/index.ts, mulai-hubung.ts, hubungkan.ts, $id.putuskan.ts,
  coba-lagi-penghapusan.ts
src/routes/api/laporan/tautan.$id.coba-lagi.ts
src/components/laporan/BagikanTautan.tsx (diubah)
src/components/admin/GoogleDriveSettings.tsx (baru) + src/routes/admin.settings.tsx (dipasang)
src/scripts/drive-sync.ts + package.json script drive:sync
tests/unit/google-drive/** (+ helpers/fake-drive.ts), tests/integration/google-drive-*.test.ts
```

### Aliran data utama

1. **Buat tautan DRIVE**: `POST /api/laporan/tautan` → Zod (`akses` menerima `DRIVE`) →
   `createTautanForSession` → `getDriveAvailability()` (409 bila tidak tersedia) → penyaringan snapshot
   (sama dengan sekarang) → rencana file (helper ZIP) → transaksi: insert tautan + baris file + job
   `SINKRON_TAUTAN` → setelah commit `triggerDriveRunner()` → respons 201 tanpa link.
2. **Runner**: klaim job → muat akun → `DriveClient` dari refresh token terdekripsi → handler → selesai /
   gagal berjadwal / dijeda (token) / dibatalkan.
3. **Hapus**: pemicu menulis status baris + job di transaksi pemicu → runner menghapus di Drive →
   transaksi kecil menandai `DIHAPUS` + audit.
4. **ADMIN**: mulai-hubung (state+PKCE di memori, terikat `sessionId`) → ADMIN menempel alamat →
   tukar code, verifikasi `id_token`, pastikan folder akar → transaksi ganti akun + audit → jadwalkan ulang
   job yang tertunda → picu runner.

### Mesin status

`laporan_tautan.drive_status`: `MENUNGGU → MENGUNGGAH → SIAP | GAGAL`; `GAGAL → MENUNGGU` (coba lagi);
dari status apa pun saat dicabut → `MENGHAPUS → DIHAPUS`.

`laporan_tautan_drive_file.status`: `MENUNGGU → TERUNGGAH | DILEWATI`; `TERUNGGAH → MENGHAPUS → DIHAPUS`;
`MENUNGGU → DILEWATI` (pemicu hapus sebelum terunggah); saat dicabut semua baris yang belum `DIHAPUS`
→ `DIHAPUS` setelah folder terhapus.

`drive_job.status`: `MENUNGGU → PROSES → SELESAI | GAGAL | DIBATALKAN`; `PROSES → MENUNGGU` (galat
sementara berjadwal, token dijeda, atau penundaan 30 dtk); `GAGAL → MENUNGGU` (coba lagi oleh pembuat /
coba lagi penghapusan oleh ADMIN). `PROSES` dengan `dikunci_pada` > 15 menit boleh diklaim ulang.

`google_drive_akun.status`: `AKTIF ⇄ NONAKTIF` (ganti akun), `AKTIF|NONAKTIF → DIPUTUS` (final).

Status ini **bukan** status dokumen; FSM `src/lib/fsm.ts` tidak tersentuh. Tetap berlaku pola
db-fsm-guard: setiap perubahan status memakai update bersyarat pada status lama.

---

## Implementation Steps

Langkah di bawah sudah diurutkan sesuai section (`sections/index.md`). Setiap langkah diakhiri tes yang
lulus dan `pnpm typecheck` bersih.

### Step 1: Skema, migrasi 0024, dan konstanta dasar

**What:** Tiga tabel baru, perubahan `laporan_tautan` dan `audit_log`, migrasi SQL tulis tangan, konstanta
status (tanpa logika).

**Why:** Semua modul berikutnya bergantung pada bentuk data. Constraint DB (partial unique akun AKTIF,
check konsistensi DRIVE, unique kunci lampiran, unique job menunggu) adalah jaring pengaman terakhir untuk
balapan.

**How:**
- `src/db/schema/app/google-drive-akun.ts`: ekspor `GOOGLE_DRIVE_AKUN_STATUS_VALUES = ['AKTIF','NONAKTIF','DIPUTUS']`
  dan tipe; tabel `app.google_drive_akun` dengan kolom SPEC 6.1 (`email` disimpan huruf kecil). FK
  `dihubungkan_oleh` dan `diputus_oleh` ke `auth.users` `on delete no action`. Index:
  `uniqueIndex('google_drive_akun_satu_aktif').on(table.status).where(sql\`status = 'AKTIF'\`)` dan
  `uniqueIndex('google_drive_akun_email_belum_diputus').on(table.email).where(sql\`status <> 'DIPUTUS'\`)`;
  check status.
- `src/db/schema/app/laporan-tautan.ts`: `LAPORAN_TAUTAN_AKSES_VALUES` menjadi `['LOGIN','PUBLIK','DRIVE']`;
  `LAPORAN_TAUTAN_DRIVE_STATUS_VALUES = ['MENUNGGU','MENGUNGGAH','SIAP','GAGAL','MENGHAPUS','DIHAPUS']`;
  kolom baru `drive_akun_id` (FK akun, `on delete restrict`), `drive_folder_id`, `drive_folder_url`,
  `drive_status`, `drive_daftar_isi_file_id`, `drive_folder_dicoba_pada` (timestamptz), `drive_dokumen_dilewati`
  (jsonb `Array<{ label: string; alasan: string }>`, default `[]`). Check akses diperbarui; check baru
  `laporan_tautan_drive_check`: `(akses = 'DRIVE') = (drive_akun_id IS NOT NULL AND drive_status IS NOT NULL)`
  plus check nilai `drive_status`. Index `(drive_akun_id)`.
- `src/db/schema/app/laporan-tautan-drive-file.ts`: konstanta `…_SUMBER_VALUES = ['DOKUMEN','MANUAL_ARSIP']`,
  `…_STATUS_VALUES = ['MENUNGGU','TERUNGGAH','MENGHAPUS','DIHAPUS','DILEWATI']`,
  `…_KETERANGAN_HAPUS_VALUES = ['DICABUT','DIMUSNAHKAN','DIBERSIHKAN','DIHAPUS_PEMILIK']`. Kolom SPEC 6.3 +
  `label_dokumen`, `urutan`, `content_type`, `dicoba_pada` (P5/D14). `tautan_id` FK `laporan_tautan`
  `on delete no action`; `dokumen_id`, `manual_arsip_id`, `attachment_id` uuid **tanpa FK** (P4).
  Unique `(tautan_id, kunci_lampiran)`, index `(dokumen_id)`, `(manual_arsip_id)`, `(tautan_id, status)`.
  Check: sumber `DOKUMEN` ⇒ `dokumen_id` dan `lampiran_index` terisi; `MANUAL_ARSIP` ⇒ `manual_arsip_id`
  dan `attachment_id` terisi.
- `src/db/schema/app/drive-job.ts`: konstanta jenis, status, kategori galat
  (`SEMENTARA`, `TOKEN_TIDAK_VALID`, `KUOTA_PENUH`, `TIDAK_DITEMUKAN`, `PERMANEN`, `AKUN_DIPUTUS`); kolom SPEC 6.4;
  FK `akun_id` (`restrict`), `tautan_id` (`no action`). Index `(status, prioritas, jadwal_berikut)`,
  `(tautan_id)`, unique partial `drive_job_satu_menunggu` `(tautan_id, jenis) WHERE status = 'MENUNGGU'` (D12).
- `src/db/schema/app/index.ts`: ekspor tiga file baru.
- `src/db/schema/audit/audit-log.ts`: `AUDIT_ENTITY_TYPE_VALUES` + `GOOGLE_DRIVE_AKUN`, `LAPORAN_TAUTAN`;
  `AUDIT_LOG_AKSI_VALUES` + enam aksi SPEC 6.5; perbarui string check (komentar kanonik ikut).
- `drizzle/0024_google_drive_tautan.sql`: gaya 0022/0023 (komentar kepala, `CREATE TABLE IF NOT EXISTS`,
  `ADD COLUMN IF NOT EXISTS`, blok `DO $$` yang memeriksa `pg_constraint` sebelum `ADD CONSTRAINT`,
  `CREATE [UNIQUE] INDEX IF NOT EXISTS … WHERE …`). Check yang berubah (`laporan_tautan_akses_check`,
  `audit_log_entity_type_check`, `audit_log_aksi_check`) di-`DROP CONSTRAINT IF EXISTS` lalu ditambah ulang.
  Pisahkan pernyataan dengan `--> statement-breakpoint`.
- `drizzle/meta/_journal.json`: entri `idx: 24`, `version: "7"`, `when` = entri 23 + 86 400 000,
  `tag: "0024_google_drive_tautan"`, `breakpoints: true`.
- `src/lib/laporan/tautan-shared.ts`: `TAUTAN_AKSES.DRIVE`, `TAUTAN_AKSES_LABEL.DRIVE = 'Google Drive'`
  (wajib agar `Record<LaporanTautanAkses, …>` tetap lengkap). **Zod `createTautanRequestSchema` belum
  menerima `DRIVE`** di step ini (dibuka di Step 8) supaya tidak ada jalur yang menyisipkan baris DRIVE
  tanpa kolom wajib.
- `BagikanTautan.tsx` badge riwayat: cukup pastikan masih ter-typecheck (label baru dipakai otomatis).

**Files affected:** file skema di atas, `drizzle/0024_google_drive_tautan.sql`, `drizzle/meta/_journal.json`,
`src/lib/laporan/tautan-shared.ts`, tes baru.

**Dependencies:** tidak ada. Persiapan lingkungan tes (pnpm install, PostgreSQL, DB `dms_kepser_test`) dijelaskan
di section 01.

### Step 2: Konfigurasi, enkripsi token, konstanta bersama

**What:** `config.ts`, `token-crypto.ts`, `shared.ts`.

**Why:** Fitur harus mati rapi tanpa env; enkripsi adalah prasyarat menyimpan akun (K9).

**How:**
- `config.ts`: `readDriveConfig(env = process.env)` mengembalikan `{ ok: true, clientId, clientSecret, tokenKey: Buffer }`
  atau `{ ok: false }` tanpa melempar. Syarat: `GOOGLE_OAUTH_CLIENT_ID` dan `GOOGLE_OAUTH_CLIENT_SECRET`
  tidak kosong, `DMS_DRIVE_TOKEN_KEY` base64 yang terdekode tepat 32 byte. `isDriveConfigured()`. Konstanta:
  `GOOGLE_OAUTH_REDIRECT_URI = 'http://127.0.0.1:53682/'`, `GOOGLE_OAUTH_SCOPES` (K8),
  `DRIVE_ROOT_FOLDER_NAME = 'DMS Kepser'`, `DRIVE_HTTP_TIMEOUT_MS = 60_000`. Tidak pernah mencetak nilai env.
- `token-crypto.ts`: `encryptRefreshToken(plain, key)` → `v1:<iv>:<tag>:<data>` (base64url; IV 12 byte acak,
  `aes-256-gcm`, tag 16 byte). `decryptRefreshToken(enc, key)` melempar `TokenCryptoError` (kode
  `FORMAT_TIDAK_DIKENAL` / `DEKRIPSI_GAGAL`) tanpa menyertakan ciphertext di pesan. Versi selain `v1` ditolak.
- `shared.ts` (tidak mengimpor modul server): label status tautan Drive untuk UI, pesan alasan
  ketersediaan (tiga kalimat SPEC 10.1), tipe `GoogleDriveStatusResponse`, `GoogleDriveAdminResponse`,
  `GoogleDriveAkunSummary`, `PerluHapusManualItem`, dan pesan galat pengguna per kategori (mis.
  `KUOTA_PENUH` → "Kuota Google Drive penuh").

**Files affected:** `src/lib/google-drive/{config,token-crypto,shared}.ts`, tes unit.
**Dependencies:** Step 1 (tipe konstanta).

### Step 3: Paket, klasifikasi galat, DriveClient, FakeDrive

**What:** Pasang paket, tulis `drive-errors.ts`, `drive-client.ts`, dan `tests/unit/google-drive/helpers/fake-drive.ts`.

**Why:** `DriveClient` adalah satu-satunya pemanggil Google; handler dan tes bergantung pada interface-nya.

**How:**
- `pnpm add @googleapis/drive@27.0.0 google-auth-library@11.3.1` (versi persis, disetujui pemilik; P1).
- `drive-errors.ts`: `class DriveApiError extends Error { kategori; pesan }` (pesan pendek bahasa Indonesia).
  `classifyDriveError(error: unknown): DriveApiError` membaca, tanpa menyalin isi mentah: `status`/`response.status`,
  `response.data.error.errors[0].reason`, `response.data.error` bila string (`invalid_grant`), dan `code`
  jaringan. Pemetaan sesuai tabel riset web 2.6. Fungsi bantu `isDriveNotFound(err)`.
  Juga memetakan `TokenCryptoError` → `TOKEN_TIDAK_VALID`.
- `drive-client.ts`: interface `DriveClient` dengan metode:
  `createFolder({ name, parentId?, appProperties }) → { id }`,
  `fileExists(id) → boolean` (404 → false),
  `findChildByAppProperty({ parentId, key, value }) → string | null`,
  `uploadFile({ parentId, name, mimeType, body, appProperties }) → { id }`,
  `updateFileContent({ fileId, mimeType, body }) → void`,
  `shareAnyoneReader(fileId) → void`, `getWebViewLink(fileId) → string`,
  `deleteFile(fileId) → void` (404 dilempar sebagai `TIDAK_DITEMUKAN`; pemanggil memutuskan),
  `revokeToken() → void`.
  `createGoogleDriveClient({ refreshToken, config })` membuat `OAuth2Client` (clientId, secret, redirect),
  `setCredentials({ refresh_token })`, `drive({ version: 'v3', auth, retry: false, timeout })`. Semua
  pemanggilan dibungkus `try/catch` → `throw classifyDriveError(err)`. Selalu minta `fields` minimal.
  Kueri `findChildByAppProperty`: `'<parentId>' in parents and appProperties has { key='<k>' and value='<v>' } and trashed = false`
  dengan nilai di-escape (hanya uuid/kunci buatan sistem; tolak karakter `'` dan `\`).
- `FakeDrive` (tes): menyimpan objek `{ id, name, parents, appProperties, mimeType, content, shared }`,
  menghitung panggilan per metode, dan menerima jadwal kegagalan (`failNext(method, kategori)` / predikat
  per panggilan) termasuk mode "respons hilang" (objek tersimpan tetapi metode melempar `SEMENTARA`).

**Files affected:** `package.json`, `pnpm-lock.yaml`, `src/lib/google-drive/{drive-errors,drive-client}.ts`,
`tests/unit/google-drive/helpers/fake-drive.ts`, tes unit.
**Dependencies:** Step 2.

### Step 4: Antrean job

**What:** `jobs.ts` — enqueue (dalam `tx`), klaim, selesai, gagal + backoff, tunda, batal.

**Why:** Ketahanan K7 dan pencegahan pemrosesan ganda bertumpu di sini.

**How:**
- Tipe executor: `type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'execute'>` (tx Drizzle memenuhinya).
- `DRIVE_JOB_PRIORITAS = { HAPUS: 0, SINKRON: 10 }`, `DRIVE_JOB_JEDA_MS = [1m, 5m, 15m, 1j, 3j, 6j, 12j, 24j]`,
  `DRIVE_JOB_MAKS_PERCOBAAN_ULANG = 8`, `DRIVE_JOB_KUNCI_MACET_MS = 15m`, `DRIVE_JOB_TUNDA_SINKRON_MS = 30s`.
- `enqueueDriveJob(tx, { jenis, akunId, tautanId, now })`: `INSERT … ON CONFLICT (tautan_id, jenis) WHERE status = 'MENUNGGU'
  DO UPDATE SET jadwal_berikut = LEAST(drive_job.jadwal_berikut, excluded.jadwal_berikut)` (D12). Prioritas dari jenis.
- `claimNextDriveJob({ now, executor })`: satu pernyataan `UPDATE … SET status='PROSES', dikunci_pada=now
  WHERE id = (SELECT j.id FROM app.drive_job j JOIN app.google_drive_akun a ON a.id = j.akun_id
  WHERE ((j.status='MENUNGGU' AND j.jadwal_berikut <= now) OR (j.status='PROSES' AND j.dikunci_pada < now - 15m))
  AND a.perlu_hubung_ulang_sejak IS NULL ORDER BY j.prioritas, j.jadwal_berikut FOR UPDATE OF j SKIP LOCKED LIMIT 1)
  RETURNING *` (via `sql` Drizzle). Job akun `DIPUTUS` tetap diklaim agar handler menandainya `GAGAL AKUN_DIPUTUS`.
- `completeDriveJob(id, { now, status: 'SELESAI' | 'DIBATALKAN' })` bersyarat `status='PROSES'`.
- `failDriveJob(id, { kategori, pesan, now })`: `SEMENTARA` → `percobaan + 1`; bila > 8 → `GAGAL`, selain itu
  `MENUNGGU` dengan `jadwal_berikut = now + JEDA[percobaan-1]` (D11). Kategori lain → `GAGAL`
  langsung, kecuali `TOKEN_TIDAK_VALID` → `MENUNGGU`, `jadwal_berikut = now`, percobaan tidak berubah (dijeda
  oleh filter akun di klaim). Semua bersyarat `status='PROSES'`. Pesan dipotong ≤ 200 karakter.
- `deferDriveJob(id, { now, ms })` → `MENUNGGU`, `jadwal_berikut = now + ms`, percobaan tetap.
- `nextScheduledAt({ now })` → `min(jadwal_berikut)` untuk job `MENUNGGU` akun tidak dijeda (untuk timer runner).
- Fungsi murni `computeRetrySchedule(percobaanSebelumnya, now)` diekspor untuk tes unit.

**Files affected:** `src/lib/google-drive/jobs.ts`, `tests/unit/google-drive/jobs.test.ts`,
`tests/integration/google-drive-jobs.test.ts`.
**Dependencies:** Step 1.

### Step 5: Akun, OAuth, ketersediaan

**What:** `oauth.ts`, `akun-repository.ts`, `availability.ts`.

**Why:** Tanpa akun aktif tidak ada tautan Drive; alur salin-tempel K6 punya banyak jalur galat.

**How:**
- `oauth.ts`:
  - Store memori `Map<state, { sessionId, mode, akunId | null, codeVerifier, expiresAt }>`; TTL 10 menit;
    batas 20 entri (yang tertua dibuang); `state` 32 byte acak base64url; fungsi `resetOAuthStoreForTest()`.
  - `mulaiHubung({ sessionId, mode: 'HUBUNGKAN' | 'GANTI' | 'HUBUNGKAN_ULANG', akunId?, now })` →
    `{ authUrl }` lewat `generateCodeVerifierAsync` + `generateAuthUrl` (offline, consent, scope K8,
    S256, `redirect_uri` konstanta, `login_hint` = email akun untuk `HUBUNGKAN_ULANG`).
  - `parsePastedAddress(text)` → `{ kind: 'code', state, code } | { kind: 'error', state, error }` atau galat
    `ALAMAT_TIDAK_VALID`. Aturan: trim, `new URL`, protokol `http:`, host `127.0.0.1` atau `localhost`
    (port apa pun diterima, tetapi pertukaran tetap memakai redirect konstanta), harus ada `state` dan
    salah satu `code`/`error`.
  - `ambilState(state, sessionId, now)`: tidak ada/kedaluwarsa → `STATE_KEDALUWARSA`; sesi berbeda →
    `STATE_SESI_BERBEDA`; entri dihapus saat diambil (sekali pakai).
  - `tukarCode({ code, codeVerifier })` → `{ refreshToken, email }`: `getToken({ code, codeVerifier, redirect_uri })`;
    tidak ada `refresh_token` → `TANPA_REFRESH_TOKEN`; `tokens.scope` tanpa `drive.file` → `IZIN_DRIVE_TIDAK_DIBERIKAN`;
    `verifyIdToken({ idToken, audience: clientId })`, `email_verified` wajib, email huruf kecil.
  - Semua galat dibungkus `OAuthFlowError { kode, pesan }` (pesan Indonesia, tanpa isi respons Google).
    `error=access_denied` → "Izin ditolak di halaman Google".
  - Dependensi Google diinjeksi (`oauthClientFactory`) agar tes tidak memanggil jaringan.
- `akun-repository.ts` (semua tulis dalam satu `db.transaction` + audit):
  - `simpanAkunTerhubung({ email, refreshTokenEnc, rootFolderId, mode, akunIdTarget, actorUserId, now })` sesuai
    SPEC 7.1 langkah 6 dan 7.2: cari baris email belum `DIPUTUS`; `HUBUNGKAN_ULANG` → email harus sama dengan
    akun target (beda → `EMAIL_BERBEDA`, 409), status tetap; `HUBUNGKAN`/`GANTI` → bila email itu sudah `AKTIF`
    cukup perbarui token; bila `NONAKTIF` atau baru → akun `AKTIF` lama `NONAKTIF` (`dinonaktifkan_pada`) lalu
    target `AKTIF` (urutan ini menghindari pelanggaran partial unique). Kosongkan `perlu_hubung_ulang_sejak`.
    Audit `DRIVE_AKUN_DIHUBUNGKAN` (dan `DRIVE_AKUN_DINONAKTIFKAN` untuk akun lama), metadata `{ email, mode }`.
    Lalu `UPDATE drive_job SET jadwal_berikut = now WHERE akun_id = target AND status='MENUNGGU'`.
  - `tandaiPerluHubungUlang(akunId, now)` (idempoten, `WHERE perlu_hubung_ulang_sejak IS NULL`).
  - `putuskanAkun({ akunId, actorUserId, now, revoke })`: muat akun (belum `DIPUTUS`, else 404/409), panggil
    `revoke()` best effort di luar transaksi (galat diabaikan, dicatat kategori saja), lalu transaksi:
    `refresh_token_enc = null`, `status = 'DIPUTUS'`, `diputus_oleh/pada`; job `MENUNGGU` akun itu →
    `GAGAL` kategori `AKUN_DIPUTUS` pesan "Akun Google Drive diputus — hapus manual di Drive"; tautan akun itu
    berstatus `MENUNGGU`/`MENGUNGGAH` → `GAGAL`; audit `DRIVE_AKUN_DIPUTUS` metadata `{ email, jumlah_tautan_aktif }`.
  - Kueri baca untuk ADMIN: ringkasan akun non-`DIPUTUS` (email, status, perlu hubung ulang, jumlah tautan Drive aktif
    = belum dicabut dan `drive_status` ∈ {MENUNGGU, MENGUNGGAH, SIAP, GAGAL}, jumlah job `GAGAL`) dan daftar
    "perlu dihapus manual" = job `HAPUS_*` `GAGAL` (semua kategori) dengan judul tautan, nama folder
    (`<judul> (<tanggal>)`), email akun, kategori, dan jumlah file `MENGHAPUS` untuk `HAPUS_FILE`.
  - `muatAkunUntukJob(akunId)` → `{ status, refreshTokenEnc, rootFolderId, perluHubungUlang }`.
  - `perbaruiRootFolder(akunId, folderId)`.
- `availability.ts`: `getDriveAvailability()` → `BELUM_DIKONFIGURASI` bila env tidak lengkap; `BELUM_ADA_AKUN` bila
  tidak ada akun `AKTIF`; `PERLU_HUBUNG_ULANG` bila akun aktif punya `perlu_hubung_ulang_sejak` atau token null;
  selain itu `{ tersedia: true, alasan: null, akunId }` (akunId tidak pernah dikirim ke klien).
- Folder akar saat hubungkan (dipanggil rute, di luar transaksi): akun dipakai ulang dan `root_folder_id` ada →
  `fileExists`; tidak ada → `createFolder({ name: 'DMS Kepser', appProperties: { dmsJenis: 'AKAR' } })`.

**Files affected:** `src/lib/google-drive/{oauth,akun-repository,availability}.ts`, tes unit + integrasi.
**Dependencies:** Step 2, 3, 4.

### Step 6: Rute ADMIN dan status

**What:** enam endpoint SPEC 7.3 + konstanta path.

**Why:** Antarmuka server untuk Pengaturan dan dialog.

**How:**
- `src/lib/constants/routes.ts`: tambah `GOOGLE_DRIVE_API = { STATUS: '/api/google-drive/status', ADMIN: '/api/admin/google-drive',
  MULAI_HUBUNG: …, HUBUNGKAN: …, putuskan: (id) => …, COBA_LAGI_PENGHAPUSAN: … }` dan
  `TAUTAN_API.cobaLagi(id)`.
- Zod di `src/lib/schemas/google-drive.ts`: `mulaiHubungSchema` (`mode` enum, `akun_id` uuid opsional, wajib untuk
  `HUBUNGKAN_ULANG`, strict), `hubungkanSchema` (`alamat` string 1–2048, strict), `putuskanSchema`
  (`konfirmasi: z.literal(true)`), body kosong untuk coba-lagi.
- Pola setiap rute: `requireSameOrigin` (POST) → `getLocalServerSession` (401) → `hasLocalRole(session, ROLES.ADMIN)`
  (403 "Akses ditolak - hanya admin") → `readDriveConfig` (409 `BELUM_DIKONFIGURASI` untuk POST) → Zod (400) →
  logika → `try/catch` (500 "Gagal memproses permintaan Google Drive"; log hanya `[admin/google-drive] <aksi> <kategori>`).
- `GET /api/google-drive/status`: sesi apa pun; `{ tersedia, alasan }` — **tanpa** email/id. `Cache-Control: no-store`.
- `GET /api/admin/google-drive`: `{ dikonfigurasi, akun_aktif, akun_lain, perlu_hapus_manual }`.
- `POST …/mulai-hubung` → `{ auth_url }`; `POST …/hubungkan` → tukar code → folder akar → `simpanAkunTerhubung` →
  ringkasan akun; peta `OAuthFlowError` → 400 (alamat/izin) / 409 (state/sesi/email berbeda) dengan pesan Indonesia.
- `POST …/$id/putuskan` (`isUuid` → 404) → `putuskanAkun`.
- `POST …/coba-lagi-penghapusan`: job `HAPUS_*` `GAGAL` dengan kategori ≠ `AKUN_DIPUTUS` → `MENUNGGU`,
  `percobaan = 0`, `jadwal_berikut = now`, galat dikosongkan (bersyarat status). Respons `{ jumlah }`.
- Pemicu runner untuk rute ini dipasang di Step 8 (runner belum ada).

**Files affected:** `src/routes/api/google-drive/status.ts`, `src/routes/api/admin/google-drive/*.ts`,
`src/lib/constants/routes.ts`, `src/lib/schemas/google-drive.ts`, tes rute.
**Dependencies:** Step 5.

**Catatan `routeTree.gen.ts`:** `createFileRoute('/api/…')` diperiksa tipenya terhadap `src/routeTree.gen.ts`, jadi
`pnpm typecheck` gagal sampai berkas itu dibuat ulang. Jangan diedit manual: jalankan `pnpm build` (plugin router
membuat ulang berkas), periksa diff-nya hanya berisi rute baru, lalu ikut di-commit bersama rute (preseden: commit
`f10101f` fitur tautan). Berlaku juga untuk Step 8.

### Step 7: Daftar isi, handler sinkron, runner

**What:** `daftar-isi.ts`, `tautan-drive-repository.ts` (bagian sinkron), `sinkron-tautan.ts`, `runner.ts`,
perluasan helper ZIP.

**Why:** Inti K2/K7/K10.

**How:**
- Helper ZIP (`src/lib/export/laporan-zip-entries.ts`, `document-zip.ts`): `DocumentZipFileInput` mendapat field
  opsional `kunci?: string`; `buildLaporanZipEntries` mengisi `DOKUMEN:<dokumen_id>:<index>` dan
  `buildManualArsipZipEntries` mengisi `MANUAL:<manual_arsip_id>:<attachment_id>` (tambahkan `id` ke select
  attachment). Ekspor `nextAvailableFileName` (atau fungsi baru `dedupeFileNames`) supaya dedup tingkat folder bisa
  dipakai ulang. Ekspor `inferContentType` dari `internal-file-access.ts`. Perilaku ZIP tidak berubah (tes ekspor lama
  tetap lulus).
- `rencanakanFileDrive(entries)` (di `tautan-drive-repository.ts` atau modul murni `rencana-file.ts`): dari
  `DocumentZipEntry[]` → baris file `{ sumber, dokumenId|manualArsipId, lampiranIndex|attachmentId, kunci,
  namaFile (dedup tingkat folder, P3), labelDokumen (folderPath ZIP), urutan, contentType, logicalPath? }` dan daftar
  `dilewati` (`entry.files.length === 0` → `{ label: folderPath, alasan: skipReason ?? 'tanpa lampiran tersedia' }`).
  `logicalPath` **tidak** disimpan di DB (dicari ulang saat unggah).
- `daftar-isi.ts`: `buildDriveDaftarIsiText({ judul, sumberLabel, dibagikanOleh, diperbaruiPada, files, dilewati })`
  murni. Format: judul "DAFTAR ISI TAUTAN GOOGLE DRIVE", baris meta, lalu dokumen dikelompokkan per `labelDokumen`
  (urut `urutan`), tiap file `- <nama_file>` dengan akhiran status: tersedia (tanpa akhiran), `DILEWATI` tanpa
  keterangan → "(tidak tersedia)", keterangan `DIMUSNAHKAN` → "(telah dimusnahkan)", `DIBERSIHKAN` →
  "(telah dibersihkan)", `DIHAPUS_PEMILIK` → "(telah dihapus pemiliknya)"; lalu "Dokumen tanpa lampiran tersedia".
  Tidak memuat path, id, atau token.
- `sinkron-tautan.ts` `handleSinkronTautan({ job, deps })` (deps: repo, `driveClientFor(akun)`, storage reader, `now`):
  1. Muat tautan + akun. Tautan dicabut → `DIBATALKAN`. Akun `DIPUTUS`/token null → gagal `AKUN_DIPUTUS`.
  2. Set `drive_status = 'MENGUNGGAH'` (bersyarat ∈ {MENUNGGU, MENGUNGGAH}, belum dicabut).
  3. Folder tautan: bila `drive_folder_id` null → bila `drive_folder_dicoba_pada` terisi cari dulu
     `findChildByAppProperty(root, 'dmsTautanId', id)`; bila tidak ada → isi `drive_folder_dicoba_pada`, lalu
     `createFolder` di root dengan `appProperties { dmsJenis: 'TAUTAN', dmsTautanId }`. 404 pada parent → buat ulang
     akar (simpan `root_folder_id` baru) dan ulangi sekali. **Simpan `drive_folder_id` segera** (commit sendiri).
  4. Loop baris `MENUNGGU` urut `kunci_lampiran` (diambil ulang tiap iterasi, satu per satu): cek tautan belum
     dicabut (bila dicabut → `DIBATALKAN`, berhenti) dan akun belum `DIPUTUS` (bila diputus → lempar
     `AKUN_DIPUTUS`); resolusi file: dokumen → `resolveDocumentLampiranLogicalPathForExport`,
     manual → status arsip efektif bukan `DIMUSNAHKAN` + baris attachment ada; `stat` file fisik ada dan ≤ 5 MB; gagal →
     baris `DILEWATI` (bersyarat `MENUNGGU`). Bila `dicoba_pada` terisi → `findChildByAppProperty(folder, 'dmsKunci', kunci)`;
     ketemu → pakai ID. Jika tidak: isi `dicoba_pada`, unggah stream (`createReadStream` dari path fisik hasil
     `resolvePhysicalStoragePath`). Tandai `TERUNGGAH` + `drive_file_id` + `diunggah_pada` bersyarat `status='MENUNGGU'`.
     Bila 0 baris (pemicu hapus menandai `DILEWATI` di tengah unggah) → simpan `drive_file_id`, status `MENGHAPUS`
     (keterangan dipertahankan) dan enqueue `HAPUS_FILE` untuk tautan itu.
     404 pada folder tautan saat unggah → job `GAGAL` kategori `TIDAK_DITEMUKAN`, pesan SPEC 11.2, `drive_status = GAGAL`.
  5. `DAFTAR_ISI.txt`: ID ada → `updateFileContent`; belum → (cari `dmsJenis='DAFTAR_ISI'` bila folder pernah dicoba)
     atau `uploadFile`; simpan `drive_daftar_isi_file_id`.
  6. `shareAnyoneReader(folder)` lalu `getWebViewLink(folder)`.
  7. Transaksi: `drive_folder_url`, `drive_status='SIAP'` bersyarat belum dicabut & `MENGUNGGAH`; audit
     `DRIVE_TAUTAN_SIAP` (actor null, metadata `{ jumlah_file, jumlah_dilewati }`); job `SELESAI`. 0 baris → `DIBATALKAN`.
  Galat dari `DriveClient` dilempar ke runner (runner yang memanggil `failDriveJob`). Untuk kategori final
  (`KUOTA_PENUH`, `PERMANEN`, `TIDAK_DITEMUKAN`, `AKUN_DIPUTUS`, dan `SEMENTARA` yang melewati batas) runner juga set
  `drive_status = 'GAGAL'` bila tautan belum dicabut.
- `runner.ts`:
  - `runDriveRunnerOnce({ now = () => new Date(), deps, anggaranMs = 5 menit })`: bila `!isDriveConfigured()` → no-op.
    Loop `claimNextDriveJob` → dispatch per `jenis` lewat peta handler bertipe
    `Partial<Record<DriveJobJenis, DriveJobHandler>>` (`SINKRON_TAUTAN` di step ini; `HAPUS_*` di Step 9; jenis tanpa
    handler → `PERMANEN` "Pemroses belum tersedia", yang tidak mungkin terjadi sebelum Step 9 karena belum ada pemicu
    hapus) → tangkap galat: `DriveApiError` → `failDriveJob` (+ `tandaiPerluHubungUlang` untuk
    `TOKEN_TIDAK_VALID`), galat lain → `PERMANEN` pesan umum. Kembalikan ringkasan `{ diproses, selesai, gagal, dijeda }`.
  - `triggerDriveRunner()` single-flight: bila loop berjalan, set flag `ulangi`; selesai loop → bila `ulangi` atau
    anggaran habis dengan job tersisa → jalankan lagi (`setImmediate`); selain itu jadwalkan `setTimeout` (unref) ke
    `nextScheduledAt` (maks 1 jam). Tidak pernah melempar; log hanya kategori. `resetDriveRunnerForTest()`.
  - Penundaan 30 dtk (D13) dilakukan di handler hapus (Step 9).

**Files affected:** `src/lib/export/{laporan-zip-entries,document-zip}.ts`, `src/lib/storage/internal-file-access.ts`,
`src/lib/google-drive/{daftar-isi,tautan-drive-repository,sinkron-tautan,runner}.ts`, tes.
**Dependencies:** Step 3, 4, 5.

### Step 8: Rute tautan (buat DRIVE, coba lagi, riwayat, 404 pembuka) dan pemicu runner

**What:** Membuka akses `DRIVE` ujung-ke-ujung di server.

**Why:** Menghubungkan antrean dengan pengguna.

**How:**
- Zod: `akses: z.enum(['LOGIN','PUBLIK','DRIVE']).default('LOGIN')`.
- `createTautanForSession`: urutan pemeriksaan tetap (413 → scope → 400 0 dokumen); khusus `DRIVE`:
  `getDriveAvailability()` di awal (409 dengan pesan alasan), lalu muat baris snapshot (`loadTautanDokumenRows`,
  `loadTautanManualRows`) → `buildLaporanZipEntries` + `buildManualArsipZipEntries` → `rencanakanFileDrive` →
  `db.transaction`: insert tautan (`akses DRIVE`, `drive_akun_id`, `drive_status MENUNGGU`, `drive_dokumen_dilewati`)
  + insert baris file + `enqueueDriveJob(SINKRON_TAUTAN)`. Alur `LOGIN`/`PUBLIK` tetap memakai `insertTautan` lama.
  Rute memanggil `triggerDriveRunner()` setelah respons dibentuk (tidak di-`await`).
- `toTautanListItem` → `path: null` untuk DRIVE (D1) dan field Drive SPEC 10.2 dari kueri tambahan
  `loadDriveRingkasanByTautanIds(ids)` (progres = jumlah `TERUNGGAH`+`DILEWATI` / total baris; `drive_url` hanya
  `SIAP` & belum dicabut; `drive_galat` = `galat_pesan` job `SINKRON_TAUTAN` `GAGAL` terbaru; `drive_tertunda_akun` =
  akun `perlu_hubung_ulang_sejak` terisi dan status ∈ {MENUNGGU, MENGUNGGAH}). Tipe `TautanListItem`/`TautanCreateResponse`
  diperbarui (D2). `GET /api/laporan/tautan` memicu runner.
- `POST /api/laporan/tautan/$id/coba-lagi`: same-origin → sesi → `isUuid` → transaksi bersyarat: tautan milik pembuat,
  `akses='DRIVE'`, belum dicabut, `drive_status='GAGAL'` → `MENUNGGU`; job `SINKRON_TAUTAN` terbaru tautan itu
  (`GAGAL`) → `MENUNGGU`, `percobaan=0`, `jadwal_berikut=now`, galat null. Tidak cocok → 404 (spec: bukan pembuat → 404;
  status lain → 409 "Tautan tidak dalam keadaan gagal"). Picu runner.
- Tolak pembuka: `resolveActiveTautan` dan `handleTautanLampiranRequest` memperlakukan `akses === 'DRIVE'` sama
  dengan tidak ditemukan (404, pesan `TAUTAN_NOT_FOUND_MESSAGE`) — sebelum cek dicabut, supaya respons identik.
- Pemicu runner tambahan: `GET /api/admin/google-drive`, `POST …/hubungkan` (setelah commit), `POST …/coba-lagi-penghapusan`.

**Files affected:** `src/lib/schemas/tautan.ts`, `src/lib/laporan/{tautan,tautan-repository,tautan-shared}.ts`,
`src/routes/api/laporan/tautan.ts`, `src/routes/api/laporan/tautan.$id.coba-lagi.ts`, rute admin Drive, tes.
**Dependencies:** Step 6, 7.

### Step 9: Handler hapus dan hook pemicu penghapusan

**What:** `hapus.ts`, `penghapusan.ts`, dan perubahan pada empat pemicu.

**Why:** K4 + P4: aturan DMS berlaku pada salinan.

**How:**
- `penghapusan.ts` (semua menerima `tx`):
  - `tandaiTautanDicabut(tx, tautan, now)`: bila `akses='DRIVE'` → `drive_status='MENGHAPUS'`; job `SINKRON_TAUTAN`
    dan `HAPUS_FILE` `MENUNGGU` tautan itu → `DIBATALKAN`; `enqueueDriveJob(HAPUS_TAUTAN)`.
  - `tandaiFileDihapusUntukSumber(tx, { dokumenIds?, manualArsipIds?, keterangan, now })`: untuk baris file pada tautan
    `DRIVE` belum dicabut: `TERUNGGAH` → `MENGHAPUS` + keterangan; `MENUNGGU` → `DILEWATI` + keterangan; enqueue
    `HAPUS_FILE` per tautan terdampak (akun dari `laporan_tautan.drive_akun_id`). Kembalikan jumlah.
- Pemicu:
  - **Cabut** (`revokeTautanByCreator`): bungkus `db.transaction`; update bersyarat yang sama mengembalikan baris
    (`akses`), lalu `tandaiTautanDicabut` bila DRIVE. Rute cabut memicu runner. Hasil `revoked/already_revoked/not_found` tidak berubah.
  - **Pemusnahan**: `transitionBerkasArchiveStatus` memakai `runInRepositoryTransaction`; tambah metode repository
    opsional `onBerkasDimusnahkan?({ berkasId })` yang hanya dipanggil untuk `approve_destruction` setelah update status
    berhasil dan sebelum `appendBerkasActivity`. Implementasi Drizzle: ambil `dokumen_id` (WORKFLOW) dan `manual_arsip_id`
    (MANUAL) dari `berkas_arsip_item` berkas itu → `tandaiFileDihapusUntukSumber(…, 'DIMUSNAHKAN')`. Rute lifecycle memicu
    runner setelah sukses. Fake repository di tes arsip tidak wajib memiliki metode ini.
  - **Pembersihan**: `applyCleanup` (di dalam transaksinya) memanggil `tandaiFileDihapusUntukSumber({ dokumenIds: cleanedIds }, 'DIBERSIHKAN')`.
    Rute `pembersihan-dokumen.bersihkan.ts` memicu runner.
  - **Hapus permanen** (`DELETE /api/dokumen/$id`): di dalam `db.transaction` yang sudah ada (sebelum delete baris)
    `tandaiFileDihapusUntukSumber({ dokumenIds: [id] }, 'DIHAPUS_PEMILIK')`; picu runner setelah sukses.
- `hapus.ts`:
  - Awal kedua handler: bila job `SINKRON_TAUTAN` tautan yang sama `PROSES` dengan kunci < 15 menit → `deferDriveJob(30 dtk)` (D13).
  - Akun `DIPUTUS`/token null → `AKUN_DIPUTUS` (final; muncul di daftar ADMIN).
  - `handleHapusTautan`: folder id null → bila `drive_folder_dicoba_pada` terisi, cari `dmsTautanId` di root; tidak ada → lewati.
    Ada → `deleteFile(folder)`; `TIDAK_DITEMUKAN` = berhasil. Transaksi: `drive_status='DIHAPUS'`, baris file yang belum
    `DIHAPUS` → `DIHAPUS` (keterangan `DICABUT` bila null, `dihapus_pada`), audit `DRIVE_TAUTAN_DIHAPUS`, job `SELESAI`.
  - `handleHapusFile`: tautan sudah dicabut → `SELESAI` (folder ditangani `HAPUS_TAUTAN`). Loop baris `MENGHAPUS`
    (diambil ulang sampai habis): `drive_file_id` null → langsung `DIHAPUS`; selain itu `deleteFile` (404 = berhasil) →
    `DIHAPUS` + `dihapus_pada` bersyarat `MENGHAPUS`. Lalu bila `drive_daftar_isi_file_id` ada → perbarui isi `DAFTAR_ISI.txt`.
    Audit `DRIVE_FILE_DIHAPUS` per job (metadata `{ jumlah_file, keterangan }`), job `SELESAI`.
- Daftarkan kedua handler di peta runner.

**Files affected:** `src/lib/google-drive/{penghapusan,hapus,runner,tautan-drive-repository}.ts`,
`src/lib/laporan/tautan-repository.ts`, `src/routes/api/laporan/tautan.$id.revoke.ts`,
`src/lib/archive/berkas-arsip-service.ts`, `src/routes/api/kasubag/berkas/$id/lifecycle.ts`,
`src/lib/dokumen/pembersihan-service.ts`, `src/routes/api/pembersihan-dokumen.bersihkan.ts`,
`src/routes/api/dokumen.$id.ts`, tes unit + integrasi.
**Dependencies:** Step 4, 7, 8.

### Step 10: UI dialog Bagikan dan Riwayat Tautan

**What:** SPEC 10.1–10.2.

**How:**
- `BagikanTautanDialog`: muat `GET GOOGLE_DRIVE_API.STATUS` saat dibuka; radiogroup `sm:grid-cols-3` dengan kartu
  Google Drive ("Bisa dibuka dari internet lewat link Google Drive"); kartu nonaktif (`aria-disabled`, tidak bisa dipilih)
  + alasan dari `shared.ts` bila tidak tersedia; peringatan kuning teks persis SPEC 10.1 saat DRIVE dipilih; akses kembali
  ke Terbatas setiap dialog dibuka. Setelah dibuat (DRIVE): tampilan "Sedang diunggah ke Google Drive (x/y)…" dengan
  polling `GET /api/laporan/tautan?sumber=` tiap 3 dtk selama dialog terbuka dan item belum final; `SIAP` →
  `TautanUrlField` dengan label tombol "Salin link Drive" / "Buka di Drive" (tambahkan prop label opsional); `GAGAL` → pesan.
  Teks deskripsi mencatat bahwa dialog boleh ditutup.
- `RiwayatTautanDialog`: tampilan per status tabel SPEC 10.2 (badge `Google Drive`, progres + spinner, "Gagal: <pesan>"
  + tombol **Coba lagi**, "Tertunda: akun Drive perlu dihubungkan ulang", "Dicabut · menghapus dari Drive…" /
  "Dicabut · terhapus dari Drive"); konfirmasi cabut untuk DRIVE menambah kalimat bahwa salinan di Drive dihapus permanen.
  Polling 5 dtk selama dialog terbuka dan ada baris `MENUNGGU`/`MENGUNGGAH`/`MENGHAPUS`. `jumlah_akses` disembunyikan untuk DRIVE.
- Hindari `setState` setelah unmount (flag `cancelled`, `clearTimeout`).

**Files affected:** `src/components/laporan/BagikanTautan.tsx`, `tests/unit/laporan/tautan-drive-ui-source.test.ts`.
**Dependencies:** Step 8.

### Step 11: UI Pengaturan ADMIN — bagian Google Drive

**What:** SPEC 10.3 sebagai komponen `GoogleDriveSettings`.

**How:**
- Komponen memuat `GET /api/admin/google-drive`; bila `dikonfigurasi=false` tampilkan info "Fitur Google Drive belum
  dikonfigurasi (isi GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, DMS_DRIVE_TOKEN_KEY di .env)".
- Akun aktif: email, badge Terhubung / Perlu dihubungkan ulang, jumlah tautan aktif, jumlah pekerjaan gagal; tombol
  Ganti akun, Putuskan, Hubungkan ulang (bila perlu). Tanpa akun: **Hubungkan akun Google**.
- Panel hubungkan 2 langkah: (1) tombol membuka `auth_url` di tab baru (`window.open(url, '_blank', 'noopener,noreferrer')`);
  (2) textarea "Tempel alamat dari tab yang gagal dimuat" + **Simpan** + teks bantu.
- Akun lain (NONAKTIF): email, jumlah tautan, **Putuskan permanen** dengan `AdminConfirmationDialog` yang menyebut jumlah tautan.
- "Perlu dihapus manual di Drive" + **Coba lagi penghapusan yang gagal**.
- Tidak memanggil logout/epoch. Dipasang di `admin.settings.tsx` sebagai kartu terpisah di bawah tema.

**Files affected:** `src/components/admin/GoogleDriveSettings.tsx`, `src/routes/admin.settings.tsx`,
`tests/unit/admin/google-drive-settings-source.test.ts`.
**Dependencies:** Step 6.

### Step 12: Dokumentasi, env, skrip `drive:sync`

**What:** `.env.example`, `AGENTS.md`, `docs/skripsi/rancangan-erd.md`, `src/scripts/drive-sync.ts`, `package.json` script,
`tests/TEST-CLASSIFICATION.md`, checklist uji terima manual.

**How:**
- `.env.example`: blok "GOOGLE DRIVE (opsional)" dengan tiga variabel, penjelasan Desktop app, dan perintah kunci
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`; catatan Node ≥ 22.
- `src/scripts/drive-sync.ts` meniru `sweep-pending-uploads.ts`: `runDriveRunnerOnce()` → cetak ringkasan
  (jumlah saja), `exitCode = 1` bila ada galat sistem, tutup `pool`. `package.json`:
  `"drive:sync": "dotenv -e .env -- tsx src/scripts/drive-sync.ts"`.
- `AGENTS.md`: bagian "Google Drive" (tabel, status, pemicu hapus empat jalur, batasan, catatan migrasi tulis tangan,
  Node 22), baris di tabel batas beban bila perlu, peta kode `src/lib/google-drive/`.
- ERD: tambahkan `laporan_tautan` (bila belum) dan tiga tabel baru + relasi + constraint di bagian audit/pengaturan.
- `docs/superpowers/plans/2026-10-22-tautan-google-drive/uji-terima-manual.md`: langkah SPEC 12.3 + persiapan Google Cloud SPEC 5.

**Dependencies:** semua step sebelumnya.

---

## Edge Cases & Error Handling

| Kasus | Penanganan |
|---|---|
| Env Google kosong/kunci salah panjang | `readDriveConfig` → `ok:false`; status `BELUM_DIKONFIGURASI`; runner no-op; rute admin POST 409 |
| `DMS_DRIVE_TOKEN_KEY` diganti | dekripsi gagal → `TOKEN_TIDAK_VALID` → akun ditandai; ADMIN hubungkan ulang (token baru dienkripsi kunci baru) |
| Refresh token kedaluwarsa (Testing 7 hari) | `invalid_grant` → `TOKEN_TIDAK_VALID`; job dijeda; dialog menonaktifkan Drive dengan alasan |
| Pengguna menolak izin / tidak mencentang Drive | `access_denied` / scope tanpa `drive.file` → 400 dengan pesan |
| Tidak ada `refresh_token` | 400 "Google tidak mengirim refresh token — ulangi dari langkah 1" |
| State kedaluwarsa / server restart | 409 "Sesi menghubungkan sudah kedaluwarsa — ulangi dari langkah 1" |
| Dua ADMIN menghubungkan bersamaan | transaksi + partial unique; pelanggaran `23505` → 409 "Akun aktif berubah, muat ulang" |
| Internet putus di tengah unggah | `SEMENTARA` → jadwal ulang; baris yang sudah `TERUNGGAH` tidak diunggah ulang; `dicoba_pada` + `appProperties` mencegah ganda |
| Server restart saat job `PROSES` | dianggap macet setelah 15 menit dan diklaim ulang |
| Cabut saat unggah berjalan | handler cek `revoked_at` per file → `DIBATALKAN`; `HAPUS_TAUTAN` ditunda 30 dtk sampai sinkron lepas |
| Pemusnahan saat unggah berjalan | baris `MENUNGGU` → `DILEWATI`; unggahan yang sedang terbang → `MENGHAPUS` + job `HAPUS_FILE` |
| Folder tautan dihapus manual | unggah: `GAGAL TIDAK_DITEMUKAN`; hapus: 404 = berhasil |
| Folder akar dihapus manual | buat ulang akar saat membuat folder tautan berikutnya |
| Kuota penuh | `GAGAL KUOTA_PENUH` "Kuota Google Drive penuh"; pembuat bisa Coba lagi setelah ruang dikosongkan |
| Akun diputus dengan tautan aktif | tautan tetap terbuka di Drive; cabut → job `GAGAL AKUN_DIPUTUS` → daftar hapus manual |
| Ganti akun | tautan lama tetap memakai `drive_akun_id` lamanya (token NONAKTIF disimpan) |
| Semua lampiran tautan tidak tersedia | folder tetap dibuat berisi `DAFTAR_ISI.txt` saja → `SIAP` |
| Nama file ganda antar-dokumen | dedup ` (2)` di tingkat folder, disimpan saat tautan dibuat |
| Tautan DRIVE dibuka lewat `/tautan/<token>` atau `/lampiran/...` | 404 identik dengan tidak ditemukan |
| Log/galat | hanya kategori + pesan pendek; `classifyDriveError` tidak pernah menyalin `response.data` |

## Integration Points

- **Tautan Laporan**: `createTautanForSession`, `toTautanListItem`, `revokeTautanByCreator`, `resolveActiveTautan`,
  `handleTautanLampiranRequest`, skema Zod, tipe bersama.
- **Ekspor ZIP**: helper entri mendapat field `kunci` opsional; renderer daftar isi ZIP tidak berubah.
- **Arsip**: `transitionBerkasArchiveStatus` menjadi transaksional + hook `onBerkasDimusnahkan`.
- **Pembersihan**: `applyCleanup`.
- **Dokumen**: `DELETE /api/dokumen/$id`.
- **Storage**: `resolveDocumentLampiranLogicalPathForExport`, `resolvePhysicalStoragePath`, `inferContentType` (diekspor).
- **Audit**: enam aksi baru; actor null untuk runner.
- **Admin Pengaturan**: komponen baru tanpa alur logout.

## Migration / Compatibility Notes

- Migrasi 0024 idempoten dan aditif: baris tautan lama tidak berubah (`drive_*` null, `akses` tetap), check baru lolos.
- `TautanListItem.path` menjadi nullable → klien lama di repo ini diperbarui di Step 10; tidak ada konsumen eksternal.
- `transitionBerkasArchiveStatus` dan `revokeTautanByCreator` menjadi transaksional; respons API tidak berubah.
- Paket baru menambah dependensi Node ≥ 22.
- Tanpa env Google, tidak ada perilaku yang berubah selain kartu Drive nonaktif.

## Open Questions

Tidak ada yang memblokir. Verifikasi saat implementasi (lihat `claude-spec.md`): sintaks `appProperties has`,
`tokens.scope` pada consent granular, bundling Nitro paket CJS.

## Catatan Self-Review (Fase 5)

Risiko yang sengaja ditandai untuk implementor:
1. **Transaksionalisasi kode lama** (Step 9: `transitionBerkasArchiveStatus`, `revokeTautanByCreator`) menyentuh alur
   yang sudah teruji. Jalankan ulang seluruh `tests/unit/arsiparis` dan `tests/unit/laporan` sebelum menganggap selesai.
2. **Balapan sinkron vs hapus** ditangani tiga lapis: update bersyarat status baris, penundaan 30 dtk (D13), dan
   jalur "unggahan terbang → `MENGHAPUS`". Tes FakeDrive wajib mencakup ketiganya.
3. **Klaim SQL mentah** (`FOR UPDATE OF j SKIP LOCKED`) hanya terbukti lewat tes integrasi dua koneksi.
4. **`routeTree.gen.ts`** harus dibuat ulang lewat `pnpm build` di Step 6 dan 8; tanpa itu typecheck merah.
5. **Uji terima manual** tidak bisa dijalankan di sandbox cloud (Google diblokir); wajib di mesin lokal sebelum
   fitur dinyatakan selesai (SPEC 14).

Glue yang mudah terlupa dan sudah dimasukkan: ekspor `inferContentType`; field `kunci` helper ZIP; konstanta API di
`routes.ts`; ekspor skema baru di `src/db/schema/app/index.ts`; entri journal; pembaruan `TEST-CLASSIFICATION.md`;
pemicu runner di setiap rute pemicu; label `DRIVE` di `TAUTAN_AKSES_LABEL` sejak Step 1 agar typecheck tetap hijau.
