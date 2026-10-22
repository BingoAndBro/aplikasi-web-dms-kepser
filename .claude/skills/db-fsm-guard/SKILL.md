---
name: db-fsm-guard
description: >
  Pagar integritas basis data dan alur status DMS Kepser. WAJIB dibaca sebelum menulis atau
  mengubah kode yang menyentuh basis data (skema Drizzle, kueri, migrasi), perubahan status
  dokumen (`dokumen_transaksi.status`), status berkas/arsip, riwayat aktivitas (`log_aktivitas`,
  `audit_log`), rute API yang mengubah data, atau skema Zod untuk data basis data. Pakai juga
  untuk tugas yang terlihat sepele seperti "tambah kolom" atau "ubah status".
---

# DB & FSM Guard — DMS Kepser

Kode basis data buatan AI cenderung benar di jalur bahagia tetapi melanggar batas akses dan
aturan status. Skill ini memastikan invariant di `AGENTS.md` tetap terjaga.

Stack aktual: PostgreSQL 16 lokal (Docker) + Drizzle ORM + node-postgres, sesi `dms_session`
buatan sendiri, lampiran di filesystem lokal. Otorisasi sepenuhnya di server (rute API);
tidak ada otorisasi tingkat basis data.

## 1. Status Dokumen Material — hanya lewat `src/lib/fsm.ts`

```ts
transition(currentStatus, action, actorRole, revisionTarget?) => {
  success, newStatus, newCurrentStep, newRevisionTarget, stepUrutan, error?
}
```

Transisi sah (lihat juga `tests/fsm.test.ts`):

| Status awal | Aksi | Aktor | Status akhir | revision_target |
|---|---|---|---|---|
| `DRAFT` | `SUBMIT` | PEGAWAI | `IN_PPK_VALIDATION` | null |
| `IN_PPK_VALIDATION` | `APPROVE` | PPK | `IN_PPSPM_APPROVAL` | null |
| `IN_PPK_VALIDATION` | `REJECT` | PPK | `NEED_REVISION` | `USER` |
| `IN_PPSPM_APPROVAL` | `APPROVE` | PPSPM | `COMPLETED` | null |
| `IN_PPSPM_APPROVAL` | `REJECT` | PPSPM | `NEED_REVISION` | `PPK` |
| `NEED_REVISION` (USER) | `RESUBMIT` | PEGAWAI | `IN_PPK_VALIDATION` | null |
| `NEED_REVISION` (PPK) | `RESUBMIT_PPK` | PPK | `IN_PPSPM_APPROVAL` | null |
| `NEED_REVISION` (PPK) | `KEMBALIKAN` | PPK | `NEED_REVISION` | `USER` |

Di luar FSM:
- Dokumen non-material langsung `TERSIMPAN` oleh handler submit non-material, bukan oleh `transition()`.
- Tidak ada status `ARCHIVED`. Setelah `COMPLETED`, dokumen diberkaskan ke `arsip.berkas_arsip`.

Menambah status atau aksi berarti memperbarui sekaligus: `src/lib/constants/document-status.ts`,
`src/lib/types/fsm.ts`, `src/lib/fsm.ts`, `tests/fsm.test.ts`, badge/filter yang memakai status, dan `AGENTS.md`.

### Pola wajib di rute API

Contoh nyata: `src/routes/api/ppk/kembalikan/$id.ts`.

```ts
const sameOriginError = requireSameOrigin(request)            // #/lib/security/same-origin
if (sameOriginError) return sameOriginError
const session = await getLocalServerSession(request)          // #/lib/auth/local-server-auth
if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
if (!hasLocalRole(session, 'PPK')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

const result = transition(dok.status as StatusDokumen, 'APPROVE', 'PPK')
if (!result.success) return Response.json({ error: result.error }, { status: 400 })

await db.transaction(async (tx) => {
  const updated = await tx.update(dokumenTransaksi)
    .set({ status: result.newStatus, currentStep: result.newCurrentStep,
           revisionTarget: result.newRevisionTarget, updatedAt: new Date() })
    // update bersyarat: status lama harus masih sama (cegah balapan dua pengguna)
    .where(and(eq(dokumenTransaksi.id, id), eq(dokumenTransaksi.status, dok.status)))
    .returning({ id: dokumenTransaksi.id })
  if (updated.length === 0) throw new DokumenTransitionConflictError()

  await tx.insert(logAktivitas).values({
    dokumenId: id, userId: session.user.id, aksi: 'PPK_APPROVE',
    catatan: catatan ?? null, stepUrutan: result.stepUrutan ?? 1,
  })
})
// tangkap DokumenTransitionConflictError -> dokumenTransitionConflictResponse()
```

### ❌ Jangan

- `db.update(dokumenTransaksi).set({ status: 'COMPLETED' })` tanpa `transition()`.
- Logika `if (status === ...) status = ...` di handler.
- Update status dan insert log di luar satu transaksi.
- Update tanpa syarat status lama di `WHERE`.

## 2. Status Berkas Arsip

Konstanta: `src/lib/constants/archive-status.ts`.

- `status_berkas`: `OPEN` → `CLOSED`. Berkas `CLOSED` tidak menerima dokumen baru.
- Tutup berkas wajib Nomor SPM dan masa simpan, hanya oleh `KEPALA_SUB_BAGIAN_UMUM` (diperiksa di server).
- `status_arsip` (hanya untuk `CLOSED`): `AKTIF` → `USUL_MUSNAH` → `DIMUSNAHKAN`; `cancel_proposal` mengembalikan `USUL_MUSNAH` → `AKTIF`.
- `INAKTIF` masih ada di enum dan CHECK constraint demi kompatibilitas, tetapi tidak dipakai di alur.
- `DIMUSNAHKAN` memblokir pratinjau, unduhan, ekspor ZIP, dan tautan laporan untuk seluruh isi berkas; metadata tetap tersimpan.
- Satu berkas per pasangan klasifikasi (cara pembayaran) dan tahun anggaran (unique index `berkas_arsip_klasifikasi_tahun_unique`). Bila berkasnya sudah `CLOSED`, pasangan itu tidak bisa menerima dokumen baru.

## 3. Riwayat Aktivitas — append-only

- `dokumen.log_aktivitas`: jejak dokumen. Hanya `INSERT`. Tidak ada `UPDATE`/`DELETE`.
- `arsip.berkas_arsip_activity`: jejak aktivitas berkas (dibuka, dokumen masuk, ditutup, usul musnah, dimusnahkan). Hanya `INSERT`.
- `audit.audit_log`: jejak tindakan yang menghapus isi, yaitu pembersihan lampiran dokumen, hapus permanen dokumen non-material, dan pembersihan berkas. Hanya `INSERT`.
- Satu-satunya pengecualian: penghapusan dokumen non-material `TERSIMPAN` yang terdokumentasi dapat ikut menghapus log-nya lewat cascade. Jangan diperluas.
- Penolakan wajib `catatan` paling sedikit 10 karakter (validasi Zod sebelum insert).

## 4. Skema dan Migrasi Drizzle

- Skema ada di `src/db/schema/<skema>/` untuk enam skema PostgreSQL: `auth`, `master`, `dokumen`, `arsip`, `audit`, `app`. Semua diekspor lewat `src/db/schema/index.ts`.
- Koneksi: `import { db } from '#/db/client'`.
- Konvensi: PK `uuid('id').primaryKey().defaultRandom()`; FK dengan `onDelete` eksplisit; timestamp `{ withTimezone: true }`; nama kolom `snake_case`, properti TS `camelCase`; ekspor tipe `$inferSelect`/`$inferInsert`.

Alur migrasi:

```bash
# 1. ubah skema di src/db/schema/...
pnpm db:local:generate      # buat SQL migrasi baru di drizzle/
# 2. BACA SQL yang dihasilkan sebelum diterapkan
pnpm db:local:migrate       # terapkan ke DB lokal
```

- Jangan pakai `drizzle-kit push`. Jangan mengedit migrasi yang sudah pernah diterapkan; buat migrasi baru.
- Jangan mengubah `.env` atau `.env.migration`.

## 5. Penanganan Galat Basis Data

```ts
try { /* kueri */ } catch (err) {
  console.error('[API/<rute>] <konteks>:', err)   // detail hanya di log server
  return Response.json({ error: 'Gagal memproses permintaan' }, { status: 500 })
}
```

| Kode PostgreSQL | Arti | Respons |
|---|---|---|
| `23505` | unique violation | `409`, pesan "Data sudah ada" |
| `23503` | FK violation | `400`/`409`, "Data referensi tidak ditemukan" |
| `23514` | CHECK violation | `400` |

Pesan galat ke klien tidak boleh memuat SQL, path fisik, storage root, token, atau isi env.

## 6. Validasi Zod

- Validasi body dan parameter sebelum menyentuh basis data. Skema bersama di `src/lib/schemas/`.
- Validasi UUID parameter rute sebelum kueri; tidak valid → `404`.
- Batas yang sudah ditetapkan: file paling besar 5 MB (`DOCUMENT_UPLOAD_MAX_BYTES`), nominal realisasi > 0, ekspor ZIP dan tautan paling banyak 500 dokumen, pembersihan paling banyak 200 dokumen.

## Pohon Keputusan Singkat

```text
Mengubah dokumen_transaksi.status?   -> pakai transition(), update bersyarat + log dalam satu transaksi
Menulis log_aktivitas / audit_log?   -> INSERT saja
Membuat tabel/kolom baru?            -> konvensi skema + db:local:generate + baca SQL + db:local:migrate
Menulis rute API yang mengubah data? -> same-origin -> sesi -> peran -> Zod -> try/catch
Menyentuh file lampiran?             -> lewat helper src/lib/storage/*, cek DIMUSNAHKAN
```

Rujukan: `AGENTS.md`, `docs/routing-sop.md`, `docs/skripsi/rancangan-erd.md`,
`docs/skripsi/rancangan-behavioral-state-diagram.md`, `docs/best-practices/`.
