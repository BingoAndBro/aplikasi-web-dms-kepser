import { and, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import {
  masterDetailPermintaan,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKomponen,
} from '#/db/schema/master'

// A kelengkapan item is scoped to one exact combination:
// (Kegiatan -> Komponen) x (Jenis -> Kategori -> Detail), where the second
// chain must end at its leaf (a Kategori with no Detail, or a Detail).
export async function validateKelengkapanChain(payload: {
  kegiatanId: string
  komponenId?: string | null
  jenisPermintaanId?: string | null
  kategoriPermintaanId?: string | null
  detailPermintaanId?: string | null
}): Promise<string | null> {
  const komponenId = payload.komponenId ?? null
  const jenisPermintaanId = payload.jenisPermintaanId ?? null
  const kategoriPermintaanId = payload.kategoriPermintaanId ?? null
  const detailPermintaanId = payload.detailPermintaanId ?? null

  if (!komponenId) return 'Komponen wajib dipilih'
  if (!jenisPermintaanId) return 'Jenis permintaan wajib dipilih'
  if (!kategoriPermintaanId) return 'Kategori permintaan wajib dipilih'

  const [komponen] = await db
    .select({ kegiatan_id: masterKomponen.kegiatanId })
    .from(masterKomponen)
    .where(eq(masterKomponen.id, komponenId))
    .limit(1)
  if (!komponen) return 'Komponen tidak ditemukan'
  if (komponen.kegiatan_id !== payload.kegiatanId) return 'Komponen tidak sesuai dengan kegiatan'

  const [jenis] = await db
    .select({ id: masterJenisPermintaan.id })
    .from(masterJenisPermintaan)
    .where(eq(masterJenisPermintaan.id, jenisPermintaanId))
    .limit(1)
  if (!jenis) return 'Jenis permintaan tidak ditemukan'

  const [kategori] = await db
    .select({ jenis_permintaan_id: masterKategoriPermintaan.jenisPermintaanId })
    .from(masterKategoriPermintaan)
    .where(eq(masterKategoriPermintaan.id, kategoriPermintaanId))
    .limit(1)
  if (!kategori) return 'Kategori permintaan tidak ditemukan'
  if (kategori.jenis_permintaan_id !== jenisPermintaanId) {
    return 'Kategori permintaan tidak sesuai dengan jenis permintaan'
  }

  if (detailPermintaanId) {
    const [detail] = await db
      .select({ kategori_permintaan_id: masterDetailPermintaan.kategoriPermintaanId })
      .from(masterDetailPermintaan)
      .where(eq(masterDetailPermintaan.id, detailPermintaanId))
      .limit(1)
    if (!detail) return 'Detail permintaan tidak ditemukan'
    if (detail.kategori_permintaan_id !== kategoriPermintaanId) {
      return 'Detail permintaan tidak sesuai dengan kategori permintaan'
    }
    return null
  }

  const [activeDetail] = await db
    .select({ id: masterDetailPermintaan.id })
    .from(masterDetailPermintaan)
    .where(and(
      eq(masterDetailPermintaan.kategoriPermintaanId, kategoriPermintaanId),
      eq(masterDetailPermintaan.isActive, true),
    ))
    .limit(1)
  if (activeDetail) return 'Detail permintaan wajib dipilih karena kategori ini memiliki detail'

  return null
}
