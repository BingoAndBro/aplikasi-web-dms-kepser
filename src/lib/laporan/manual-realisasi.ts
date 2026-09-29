import { and, eq, gte, inArray, lte, notInArray } from 'drizzle-orm'

import { db } from '#/db/client'
import { berkasArsip, berkasArsipItem, manualArsip } from '#/db/schema/arsip'
import { users } from '#/db/schema/auth'
import { masterFungsi, masterKegiatan, masterKomponen } from '#/db/schema/master'
import { BERKAS_ARCHIVE_STATUS } from '#/lib/constants/archive-status'

// Server-only. Dipakai bersama oleh /api/laporan/kinerja (Nominal Realisasi,
// Laporan Kinerja) dan /api/laporan/kegiatan (Laporan Kegiatan) supaya aturan
// "dimusnahkan" dan baris dokumen tambahan KSBU sama di ketiga halaman (D-28).

export type DestroyedArchiveIds = {
  /** dokumen_transaksi yang ikut berkas berstatus DIMUSNAHKAN. */
  dokumenIds: string[]
  /** manual_arsip yang ikut berkas berstatus DIMUSNAHKAN. */
  manualArsipIds: string[]
}

/**
 * Pemusnahan terjadi di tingkat berkas (`berkas_arsip.status_arsip`), bukan di
 * baris dokumennya: seluruh dokumen (alur maupun tambahan KSBU) mengikuti
 * status arsip berkasnya (D-29). Jadi otoritas "dimusnahkan" untuk kedua sumber
 * adalah join berkas_arsip_item → berkas_arsip ini — aturan yang sama dengan
 * `manualArsipEffectiveStatusArsip` (src/lib/archive/manual-arsip-effective-status.ts),
 * hanya dalam bentuk daftar id supaya bisa dipakai bersama untuk dokumen alur.
 */
export async function loadDestroyedArchiveIds(): Promise<DestroyedArchiveIds> {
  const rows = await db
    .select({
      dokumenId: berkasArsipItem.dokumenId,
      manualArsipId: berkasArsipItem.manualArsipId,
    })
    .from(berkasArsipItem)
    .innerJoin(berkasArsip, eq(berkasArsipItem.berkasId, berkasArsip.id))
    .where(eq(berkasArsip.statusArsip, BERKAS_ARCHIVE_STATUS.DIMUSNAHKAN))

  return {
    dokumenIds: rows
      .map((row) => row.dokumenId)
      .filter((id): id is string => typeof id === 'string'),
    manualArsipIds: rows
      .map((row) => row.manualArsipId)
      .filter((id): id is string => typeof id === 'string'),
  }
}

export type ManualRealisasiQueryRow = {
  id: string
  judul: string
  fungsi_id: string
  fungsi_nama: string | null
  kegiatan_id: string
  kegiatan_nama: string | null
  komponen_id: string | null
  komponen_nama: string | null
  tanggal: string
  pengaju_id: string | null
  created_at: Date | string | null
  updated_at: Date | string | null
  nominal_realisasi: string | number | null
  pengaju_display_name: string | null
  pengaju_nama_lengkap: string | null
  pengaju_username: string | null
}

/**
 * Baris dokumen tambahan KSBU (arsip.manual_arsip) untuk laporan realisasi.
 * Periode memakai `manual_arsip.tanggal` (tanggal dokumen), sama dengan
 * `dokumen_transaksi.tanggal` untuk dokumen alur.
 *
 * - `destroyed: 'exclude'` (Nominal Realisasi, Laporan Kinerja): dokumen yang
 *   dimusnahkan tidak dikembalikan sama sekali.
 * - `destroyed: 'include'` (Laporan Kegiatan): dikembalikan agar bisa diberi
 *   penanda; pemanggil wajib mengecualikannya dari total (`isManualArsipDestroyed`).
 */
export async function listManualRealisasiRows({
  kegiatanIds,
  startDate,
  endDate,
  destroyed,
  destroyedManualArsipIds,
}: {
  kegiatanIds?: readonly string[]
  startDate?: string | null
  endDate?: string | null
  destroyed: 'exclude' | 'include'
  destroyedManualArsipIds: readonly string[]
}): Promise<ManualRealisasiQueryRow[]> {
  const excludeDestroyed = destroyed === 'exclude'

  return db
    .select({
      id: manualArsip.id,
      judul: manualArsip.nama,
      fungsi_id: manualArsip.fungsiId,
      fungsi_nama: masterFungsi.nama,
      kegiatan_id: manualArsip.kegiatanId,
      kegiatan_nama: masterKegiatan.nama,
      komponen_id: manualArsip.komponenId,
      komponen_nama: masterKomponen.nama,
      tanggal: manualArsip.tanggal,
      pengaju_id: manualArsip.createdBy,
      created_at: manualArsip.createdAt,
      updated_at: manualArsip.updatedAt,
      nominal_realisasi: manualArsip.nominalRealisasi,
      pengaju_display_name: users.displayName,
      pengaju_nama_lengkap: users.namaLengkap,
      pengaju_username: users.username,
    })
    .from(manualArsip)
    .leftJoin(masterFungsi, eq(manualArsip.fungsiId, masterFungsi.id))
    .leftJoin(masterKegiatan, eq(manualArsip.kegiatanId, masterKegiatan.id))
    .leftJoin(masterKomponen, eq(manualArsip.komponenId, masterKomponen.id))
    .leftJoin(users, eq(manualArsip.createdBy, users.id))
    .where(and(
      kegiatanIds ? inArray(manualArsip.kegiatanId, [...kegiatanIds]) : undefined,
      excludeDestroyed && destroyedManualArsipIds.length > 0
        ? notInArray(manualArsip.id, [...destroyedManualArsipIds])
        : undefined,
      startDate ? gte(manualArsip.tanggal, startDate) : undefined,
      endDate ? lte(manualArsip.tanggal, endDate) : undefined,
    ))
}

export function isManualArsipDestroyed(
  row: { id: string },
  destroyedManualArsipIds: ReadonlySet<string>,
): boolean {
  return destroyedManualArsipIds.has(row.id)
}

/** Tahun milik dokumen manual sendiri (dari `tanggal`), bukan tahun anggaran berkas (Q5). */
export function tahunFromManualTanggal(tanggal: string): number {
  return new Date(tanggal).getUTCFullYear()
}
