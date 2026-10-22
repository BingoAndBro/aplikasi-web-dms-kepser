// Server-only module. Do not import from client components.
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'

import { db } from '#/db/client'
import {
  googleDriveAkun,
  laporanTautan,
  laporanTautanDriveFile,
  type LaporanTautan,
  type LaporanTautanAkses,
  type LaporanTautanDriveDilewati,
  type LaporanTautanSumber,
} from '#/db/schema/app'
import { manualArsip, manualArsipAttachment } from '#/db/schema/arsip'
import { users } from '#/db/schema/auth'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  ketuaTimAssignments,
  masterDetailPermintaan,
  masterFungsi,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
  masterKomponen,
} from '#/db/schema/master'
import { manualArsipEffectiveStatusArsip } from '#/lib/archive/manual-arsip-effective-status'
import { DOC_STATUS } from '#/lib/constants/document-status'
import { parseLampiranUrls } from '#/lib/dokumen'
import type { DokumenRow } from '#/lib/dokumen/types'
import { enqueueDriveJob } from '#/lib/google-drive/jobs'
import type { RencanaFileDrive } from '#/lib/google-drive/rencana-file'
import { LAPORAN_KEGIATAN_SCOPE_STATUSES } from '#/lib/laporan/kegiatan-scope'

/**
 * Akses basis data untuk Tautan Laporan (lihat src/lib/laporan/tautan.ts).
 * Kueri pembatasan di sini meniru persis kondisi endpoint ekspor ZIP yang
 * sudah ada (saya.export-zip.ts, kegiatan.export-zip.ts) dan GET
 * /api/laporan/kinerja; ubah bersama bila aturan cakupan laporan berubah.
 */

// ---- Pembatasan snapshot terhadap pembuat ----

/** Laporan Saya: milik pembuat, status final (= saya.export-zip.ts). */
export async function selectSayaDokumenIds(userId: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({ id: dokumenTransaksi.id })
    .from(dokumenTransaksi)
    .where(and(
      inArray(dokumenTransaksi.id, [...ids]),
      eq(dokumenTransaksi.createdBy, userId),
      inArray(dokumenTransaksi.status, [DOC_STATUS.COMPLETED, DOC_STATUS.TERSIMPAN]),
    ))
  return rows.map(row => row.id)
}

export async function selectKetuaTimKegiatanIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ kegiatanId: ketuaTimAssignments.kegiatanId })
    .from(ketuaTimAssignments)
    .where(eq(ketuaTimAssignments.userId, userId))
  return rows.map(row => row.kegiatanId)
}

/** Laporan Kegiatan: kegiatan yang dipimpin, scope final (= kegiatan.export-zip.ts). */
export async function selectKegiatanDokumenIds(
  kegiatanIds: readonly string[],
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0 || kegiatanIds.length === 0) return []
  const rows = await db
    .select({ id: dokumenTransaksi.id })
    .from(dokumenTransaksi)
    .where(and(
      inArray(dokumenTransaksi.id, [...ids]),
      inArray(dokumenTransaksi.kegiatanJenisId, [...kegiatanIds]),
      inArray(dokumenTransaksi.status, [...LAPORAN_KEGIATAN_SCOPE_STATUSES.final]),
    ))
  return rows.map(row => row.id)
}

/** Dokumen tambahan KSBU dari kegiatan yang dipimpin (= loadManualArsipExportRows). */
export async function selectManualArsipIdsByKegiatan(
  kegiatanIds: readonly string[],
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0 || kegiatanIds.length === 0) return []
  const rows = await db
    .select({ id: manualArsip.id })
    .from(manualArsip)
    .where(and(
      inArray(manualArsip.id, [...ids]),
      inArray(manualArsip.kegiatanId, [...kegiatanIds]),
    ))
  return rows.map(row => row.id)
}

/**
 * Laporan Kinerja (scope=laporan_kinerja): material COMPLETED berkomponen dan
 * non-material TERSIMPAN, se-satker (= GET /api/laporan/kinerja). Dokumen dari
 * berkas dimusnahkan tetap boleh masuk; lampirannya dijawab 410 saat dibuka.
 */
export async function selectKinerjaDokumenIds(ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({ id: dokumenTransaksi.id })
    .from(dokumenTransaksi)
    .where(and(
      inArray(dokumenTransaksi.id, [...ids]),
      or(
        and(
          eq(dokumenTransaksi.isNonMaterial, false),
          isNotNull(dokumenTransaksi.komponenId),
          eq(dokumenTransaksi.status, DOC_STATUS.COMPLETED),
        ),
        and(
          eq(dokumenTransaksi.isNonMaterial, true),
          eq(dokumenTransaksi.status, DOC_STATUS.TERSIMPAN),
        ),
      ),
    ))
  return rows.map(row => row.id)
}

/** Laporan Kinerja memuat seluruh dokumen tambahan KSBU se-satker. */
export async function selectExistingManualArsipIds(ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({ id: manualArsip.id })
    .from(manualArsip)
    .where(inArray(manualArsip.id, [...ids]))
  return rows.map(row => row.id)
}

// ---- Baris tautan ----

export async function insertTautan(values: {
  token: string
  sumber: LaporanTautanSumber
  akses: LaporanTautanAkses
  judul: string
  keterangan: string | null
  dokumenIds: string[]
  manualArsipIds: string[]
  createdBy: string
}): Promise<LaporanTautan> {
  const [row] = await db.insert(laporanTautan).values(values).returning()
  return row
}

/** `db` atau transaksi Drizzle; tes integrasi memakai transaksi yang di-rollback. */
export type TautanRepositoryExecutor = Pick<typeof db, 'select' | 'insert' | 'update' | 'execute' | 'transaction'>

// Batas parameter PostgreSQL 65535; 11 kolom per baris file -> potong per 1000 baris.
const DRIVE_FILE_INSERT_CHUNK = 1000

/**
 * Tautan akses DRIVE (SPEC 8.1 langkah 4): baris tautan, satu baris per
 * lampiran yang akan disalin, dan job SINKRON_TAUTAN dalam SATU transaksi,
 * supaya tidak pernah ada tautan Drive tanpa pekerjaan (atau sebaliknya).
 */
export async function insertTautanDrive(
  {
    values,
    files,
    dilewati,
    akunId,
    now,
  }: {
    values: {
      token: string
      sumber: LaporanTautanSumber
      judul: string
      keterangan: string | null
      dokumenIds: string[]
      manualArsipIds: string[]
      createdBy: string
    }
    files: RencanaFileDrive[]
    dilewati: LaporanTautanDriveDilewati[]
    akunId: string
    now: Date
  },
  executor: TautanRepositoryExecutor = db,
): Promise<LaporanTautan> {
  return executor.transaction(async (tx) => {
    const [row] = await tx
      .insert(laporanTautan)
      .values({
        ...values,
        akses: 'DRIVE',
        driveAkunId: akunId,
        driveStatus: 'MENUNGGU',
        driveDokumenDilewati: dilewati,
      })
      .returning()

    for (let start = 0; start < files.length; start += DRIVE_FILE_INSERT_CHUNK) {
      await tx.insert(laporanTautanDriveFile).values(files.slice(start, start + DRIVE_FILE_INSERT_CHUNK).map(file => ({
        tautanId: row.id,
        sumber: file.sumber,
        dokumenId: file.dokumenId,
        lampiranIndex: file.lampiranIndex,
        manualArsipId: file.manualArsipId,
        attachmentId: file.attachmentId,
        kunciLampiran: file.kunci,
        namaFile: file.namaFile,
        labelDokumen: file.labelDokumen,
        urutan: file.urutan,
        contentType: file.contentType,
      })))
    }

    await enqueueDriveJob(tx, { jenis: 'SINKRON_TAUTAN', akunId, tautanId: row.id, now })
    return row
  })
}

export type TautanDriveRingkasan = {
  /** Baris file yang sudah tidak MENUNGGU (terunggah, dilewati, atau sudah ditandai hapus). */
  selesai: number
  total: number
  /** galat_pesan job SINKRON_TAUTAN GAGAL terbaru (pesan sistem pendek, bukan respons Google). */
  galat: string | null
  /** Akun tautan sedang ditandai perlu dihubungkan ulang (job dijeda, SPEC 7.2). */
  akunPerluHubungUlang: boolean
}

/** Ringkasan Drive untuk Riwayat Tautan (SPEC 10.2), per id tautan DRIVE. */
export async function loadDriveRingkasanByTautanIds(
  ids: readonly string[],
  executor: TautanRepositoryExecutor = db,
): Promise<Map<string, TautanDriveRingkasan>> {
  if (ids.length === 0) return new Map()

  const rows = await executor
    .select({
      id: laporanTautan.id,
      total: sql<number>`(
        SELECT count(*) FROM app.laporan_tautan_drive_file f
         WHERE f.tautan_id = ${laporanTautan.id}
      )::int`,
      selesai: sql<number>`(
        SELECT count(*) FROM app.laporan_tautan_drive_file f
         WHERE f.tautan_id = ${laporanTautan.id} AND f.status <> 'MENUNGGU'
      )::int`,
      galat: sql<string | null>`(
        SELECT j.galat_pesan FROM app.drive_job j
         WHERE j.tautan_id = ${laporanTautan.id} AND j.jenis = 'SINKRON_TAUTAN' AND j.status = 'GAGAL'
         ORDER BY j.selesai_pada DESC NULLS LAST, j.dibuat_pada DESC
         LIMIT 1
      )`,
      perluHubungUlangSejak: googleDriveAkun.perluHubungUlangSejak,
    })
    .from(laporanTautan)
    .leftJoin(googleDriveAkun, eq(googleDriveAkun.id, laporanTautan.driveAkunId))
    .where(and(inArray(laporanTautan.id, [...ids]), eq(laporanTautan.akses, 'DRIVE')))

  return new Map(rows.map(row => [row.id, {
    selesai: Number(row.selesai),
    total: Number(row.total),
    galat: row.galat,
    akunPerluHubungUlang: row.perluHubungUlangSejak !== null,
  }]))
}

export async function listTautanByCreator(
  userId: string,
  sumber: LaporanTautanSumber | undefined,
): Promise<LaporanTautan[]> {
  return db
    .select()
    .from(laporanTautan)
    .where(and(
      eq(laporanTautan.createdBy, userId),
      sumber ? eq(laporanTautan.sumber, sumber) : undefined,
    ))
    .orderBy(desc(laporanTautan.createdAt))
    .limit(100)
}

export type TautanWithCreator = LaporanTautan & {
  creatorDisplayName: string | null
  creatorNamaLengkap: string | null
  creatorUsername: string | null
}

export async function findTautanByToken(token: string): Promise<TautanWithCreator | null> {
  const rows = await db
    .select({
      tautan: laporanTautan,
      creatorDisplayName: users.displayName,
      creatorNamaLengkap: users.namaLengkap,
      creatorUsername: users.username,
    })
    .from(laporanTautan)
    .leftJoin(users, eq(laporanTautan.createdBy, users.id))
    .where(eq(laporanTautan.token, token))
    .limit(1)

  const row = rows[0]
  if (!row) return null
  return {
    ...row.tautan,
    creatorDisplayName: row.creatorDisplayName,
    creatorNamaLengkap: row.creatorNamaLengkap,
    creatorUsername: row.creatorUsername,
  }
}

/** Dipakai tautan per lampiran (/lampiran/<tautanId>/...): id baris, bukan token batch. */
export async function findTautanById(id: string): Promise<LaporanTautan | null> {
  const rows = await db
    .select()
    .from(laporanTautan)
    .where(eq(laporanTautan.id, id))
    .limit(1)

  return rows[0] ?? null
}

/** Hanya pembuat yang bisa mencabut; tautan yang sudah dicabut tidak diubah lagi. */
export async function revokeTautanByCreator(id: string, userId: string): Promise<'revoked' | 'already_revoked' | 'not_found'> {
  const updated = await db
    .update(laporanTautan)
    .set({ revokedAt: new Date(), revokedBy: userId })
    .where(and(
      eq(laporanTautan.id, id),
      eq(laporanTautan.createdBy, userId),
      isNull(laporanTautan.revokedAt),
    ))
    .returning({ id: laporanTautan.id })

  if (updated.length > 0) return 'revoked'

  const existing = await db
    .select({ id: laporanTautan.id })
    .from(laporanTautan)
    .where(and(eq(laporanTautan.id, id), eq(laporanTautan.createdBy, userId)))
    .limit(1)

  return existing.length > 0 ? 'already_revoked' : 'not_found'
}

export async function recordTautanAccess(id: string): Promise<void> {
  await db
    .update(laporanTautan)
    .set({
      jumlahAkses: sql`${laporanTautan.jumlahAkses} + 1`,
      lastAccessedAt: new Date(),
    })
    .where(eq(laporanTautan.id, id))
}

// ---- Isi snapshot ----

export type TautanDokumenRow = DokumenRow & {
  fungsi_nama: string | undefined
  pengaju_nama: string | null
}

/** Baris dokumen alur snapshot, bentuknya sama dengan baris ekspor ZIP (DokumenRow). */
export async function loadTautanDokumenRows(ids: readonly string[]): Promise<TautanDokumenRow[]> {
  if (ids.length === 0) return []

  const rawRows = await db
    .select({
      id: dokumenTransaksi.id,
      judul: dokumenTransaksi.judul,
      fungsi_id: dokumenTransaksi.fungsiId,
      kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
      is_ketua_tim: dokumenTransaksi.isKetuaTim,
      status: dokumenTransaksi.status,
      current_step: dokumenTransaksi.currentStep,
      revision_target: dokumenTransaksi.revisionTarget,
      revision_notes: dokumenTransaksi.revisionNotes,
      lampiran_urls: dokumenTransaksi.lampiranUrls,
      tahun: dokumenTransaksi.tahun,
      tanggal: dokumenTransaksi.tanggal,
      created_by: dokumenTransaksi.createdBy,
      nominal_realisasi: dokumenTransaksi.nominalRealisasi,
      is_non_material: dokumenTransaksi.isNonMaterial,
      nama_dokumen: dokumenTransaksi.namaDokumen,
      keterangan_detail: dokumenTransaksi.keteranganDetail,
      created_at: dokumenTransaksi.createdAt,
      updated_at: dokumenTransaksi.updatedAt,
      lampiran_dibersihkan_at: dokumenTransaksi.lampiranDibersihkanAt,
      komponen_id: dokumenTransaksi.komponenId,
      komponen_nama: masterKomponen.nama,
      jenis_permintaan_id: dokumenTransaksi.jenisPermintaanId,
      kategori_permintaan_id: dokumenTransaksi.kategoriPermintaanId,
      detail_permintaan_id: dokumenTransaksi.detailPermintaanId,
      fungsi_nama: masterFungsi.nama,
      kegiatan_nama: masterKegiatan.nama,
      jenis_permintaan_nama: masterJenisPermintaan.nama,
      kategori_permintaan_nama: masterKategoriPermintaan.nama,
      detail_permintaan_nama: masterDetailPermintaan.nama,
      pengaju_display_name: users.displayName,
      pengaju_nama_lengkap: users.namaLengkap,
      pengaju_username: users.username,
    })
    .from(dokumenTransaksi)
    .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
    .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
    .leftJoin(masterKomponen, eq(dokumenTransaksi.komponenId, masterKomponen.id))
    .leftJoin(masterJenisPermintaan, eq(dokumenTransaksi.jenisPermintaanId, masterJenisPermintaan.id))
    .leftJoin(masterKategoriPermintaan, eq(dokumenTransaksi.kategoriPermintaanId, masterKategoriPermintaan.id))
    .leftJoin(masterDetailPermintaan, eq(dokumenTransaksi.detailPermintaanId, masterDetailPermintaan.id))
    .leftJoin(users, eq(dokumenTransaksi.createdBy, users.id))
    .where(inArray(dokumenTransaksi.id, [...ids]))
    .orderBy(desc(dokumenTransaksi.tanggal), asc(dokumenTransaksi.judul))

  return rawRows.map(row => ({
    id: row.id,
    judul: row.judul,
    fungsi_id: row.fungsi_id,
    kegiatan_jenis_id: row.kegiatan_jenis_id,
    is_ketua_tim: row.is_ketua_tim,
    status: row.status,
    current_step: row.current_step,
    revision_target: row.revision_target,
    revision_notes: row.revision_notes,
    lampiran_urls: parseLampiranUrls(row.lampiran_urls),
    tahun: row.tahun,
    tanggal: row.tanggal,
    created_by: row.created_by,
    nominal_realisasi: normalizeNumericValue(row.nominal_realisasi),
    is_non_material: row.is_non_material ?? false,
    nama_dokumen: row.nama_dokumen ?? null,
    keterangan_detail: row.keterangan_detail ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    lampiran_dibersihkan_at: row.lampiran_dibersihkan_at ? row.lampiran_dibersihkan_at.toISOString() : null,
    komponen_id: row.komponen_id ?? null,
    komponen_nama: row.komponen_nama ?? undefined,
    jenis_permintaan_id: row.jenis_permintaan_id,
    kategori_permintaan_id: row.kategori_permintaan_id,
    detail_permintaan_id: row.detail_permintaan_id,
    fungsi_nama: row.fungsi_nama ?? undefined,
    kegiatan_nama: row.kegiatan_nama ?? undefined,
    jenis_permintaan_nama: row.jenis_permintaan_nama ?? undefined,
    kategori_permintaan_nama: row.kategori_permintaan_nama ?? undefined,
    detail_permintaan_nama: row.detail_permintaan_nama ?? undefined,
    pengaju_nama: row.pengaju_display_name ?? row.pengaju_nama_lengkap ?? row.pengaju_username ?? null,
  }))
}

export type TautanManualRow = {
  id: string
  nama: string
  tanggal: string
  fungsi_nama: string | null
  kegiatan_nama: string | null
  komponen_nama: string | null
  status_arsip: string
  pengaju_nama: string | null
}

export async function loadTautanManualRows(ids: readonly string[]): Promise<TautanManualRow[]> {
  if (ids.length === 0) return []

  const rows = await db
    .select({
      id: manualArsip.id,
      nama: manualArsip.nama,
      tanggal: manualArsip.tanggal,
      fungsi_nama: masterFungsi.nama,
      kegiatan_nama: masterKegiatan.nama,
      komponen_nama: masterKomponen.nama,
      status_arsip: manualArsipEffectiveStatusArsip,
      pengaju_display_name: users.displayName,
      pengaju_nama_lengkap: users.namaLengkap,
      pengaju_username: users.username,
    })
    .from(manualArsip)
    .leftJoin(masterFungsi, eq(manualArsip.fungsiId, masterFungsi.id))
    .leftJoin(masterKegiatan, eq(manualArsip.kegiatanId, masterKegiatan.id))
    .leftJoin(masterKomponen, eq(manualArsip.komponenId, masterKomponen.id))
    .leftJoin(users, eq(manualArsip.createdBy, users.id))
    .where(inArray(manualArsip.id, [...ids]))
    .orderBy(desc(manualArsip.tanggal), asc(manualArsip.nama))

  return rows.map(row => ({
    id: row.id,
    nama: row.nama,
    tanggal: row.tanggal,
    fungsi_nama: row.fungsi_nama,
    kegiatan_nama: row.kegiatan_nama,
    komponen_nama: row.komponen_nama,
    status_arsip: row.status_arsip,
    pengaju_nama: row.pengaju_display_name ?? row.pengaju_nama_lengkap ?? row.pengaju_username ?? null,
  }))
}

export type TautanManualAttachmentRow = {
  id: string
  manual_arsip_id: string
  judul_lampiran: string
  content_type: string
}

export async function loadTautanManualAttachments(manualArsipIds: readonly string[]): Promise<TautanManualAttachmentRow[]> {
  if (manualArsipIds.length === 0) return []

  return db
    .select({
      id: manualArsipAttachment.id,
      manual_arsip_id: manualArsipAttachment.manualArsipId,
      judul_lampiran: manualArsipAttachment.judulLampiran,
      content_type: manualArsipAttachment.contentType,
    })
    .from(manualArsipAttachment)
    .where(inArray(manualArsipAttachment.manualArsipId, [...manualArsipIds]))
    .orderBy(asc(manualArsipAttachment.createdAt), asc(manualArsipAttachment.id))
}

function normalizeNumericValue(value: string | number | null): number | null {
  if (value === null) return null
  if (typeof value === 'number') return value

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
