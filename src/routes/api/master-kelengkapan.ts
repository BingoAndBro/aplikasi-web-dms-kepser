import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, asc, eq, isNull, type SQL } from 'drizzle-orm'
import { db } from '#/db/client'
import {
  masterDetailPermintaan,
  masterFungsi,
  masterKegiatan,
  masterKategoriPermintaan,
  masterKelengkapanDokumen,
} from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { createKelengkapanSchema } from '#/lib/schemas/master-data'
import { normalizeKelengkapanName } from '#/lib/kelengkapan-validation'

async function requireAdmin(request: Request) {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: 'Hanya ADMIN yang bisa menambah kelengkapan' }, { status: 403 })
  }
  return null
}

async function validateKelengkapanChain(payload: {
  jenisPermintaanId?: string | null
  kategoriPermintaanId?: string | null
  detailPermintaanId?: string | null
}): Promise<string | null> {
  const jenisPermintaanId = payload.jenisPermintaanId ?? null
  const kategoriPermintaanId = payload.kategoriPermintaanId ?? null
  const detailPermintaanId = payload.detailPermintaanId ?? null

  if (detailPermintaanId && !kategoriPermintaanId) {
    return 'Detail permintaan harus memiliki kategori permintaan'
  }

  if (kategoriPermintaanId && !jenisPermintaanId) {
    return 'Kategori permintaan harus memiliki jenis permintaan'
  }

  if (kategoriPermintaanId) {
    const [kategori] = await db
      .select({ jenis_permintaan_id: masterKategoriPermintaan.jenisPermintaanId })
      .from(masterKategoriPermintaan)
      .where(eq(masterKategoriPermintaan.id, kategoriPermintaanId))
      .limit(1)

    if (!kategori) {
      return 'Kategori permintaan tidak ditemukan'
    }

    if (kategori.jenis_permintaan_id !== jenisPermintaanId) {
      return 'Kategori permintaan tidak sesuai dengan jenis permintaan'
    }
  }

  if (detailPermintaanId) {
    const [detail] = await db
      .select({ kategori_permintaan_id: masterDetailPermintaan.kategoriPermintaanId })
      .from(masterDetailPermintaan)
      .where(eq(masterDetailPermintaan.id, detailPermintaanId))
      .limit(1)

    if (!detail) {
      return 'Detail permintaan tidak ditemukan'
    }

    if (detail.kategori_permintaan_id !== kategoriPermintaanId) {
      return 'Detail permintaan tidak sesuai dengan kategori permintaan'
    }
  }

  return null
}

async function findDuplicateKelengkapan(payload: {
  kegiatanId: string
  isKetuaTim: boolean
  namaDokumen: string
  jenisPermintaanId?: string | null
  kategoriPermintaanId?: string | null
  detailPermintaanId?: string | null
}): Promise<{ id: string; nama_dokumen: string } | null> {
  const normalizedName = normalizeKelengkapanName(payload.namaDokumen)
  if (!normalizedName) return null

  const jenisPermintaanId = payload.jenisPermintaanId ?? null
  const kategoriPermintaanId = payload.kategoriPermintaanId ?? null
  const detailPermintaanId = payload.detailPermintaanId ?? null

  const rows = await db
    .select({
      id: masterKelengkapanDokumen.id,
      nama_dokumen: masterKelengkapanDokumen.namaDokumen,
    })
    .from(masterKelengkapanDokumen)
    .where(and(
      eq(masterKelengkapanDokumen.kegiatanId, payload.kegiatanId),
      eq(masterKelengkapanDokumen.isKetuaTim, payload.isKetuaTim),
      jenisPermintaanId
        ? eq(masterKelengkapanDokumen.jenisPermintaanId, jenisPermintaanId)
        : isNull(masterKelengkapanDokumen.jenisPermintaanId),
      kategoriPermintaanId
        ? eq(masterKelengkapanDokumen.kategoriPermintaanId, kategoriPermintaanId)
        : isNull(masterKelengkapanDokumen.kategoriPermintaanId),
      detailPermintaanId
        ? eq(masterKelengkapanDokumen.detailPermintaanId, detailPermintaanId)
        : isNull(masterKelengkapanDokumen.detailPermintaanId),
    ))

  return rows.find(row => normalizeKelengkapanName(row.nama_dokumen) === normalizedName) ?? null
}

export const Route = createFileRoute('/api/master-kelengkapan')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        // Public read endpoint: master data powers form dropdowns; mutations below remain ADMIN-only.
        try {
          const url = new URL(request.url)
          const kegiatanId = url.searchParams.get('kegiatan_id')
          const isKetuaTim = url.searchParams.get('is_ketua_tim')
          const filters: SQL[] = []

          if (kegiatanId) {
            filters.push(eq(masterKelengkapanDokumen.kegiatanId, kegiatanId))
          }

          if (isKetuaTim !== null) {
            filters.push(eq(masterKelengkapanDokumen.isKetuaTim, isKetuaTim === 'true'))
          }

          const rows = await db
            .select({
              id: masterKelengkapanDokumen.id,
              kegiatan_id: masterKelengkapanDokumen.kegiatanId,
              is_ketua_tim: masterKelengkapanDokumen.isKetuaTim,
              nama_dokumen: masterKelengkapanDokumen.namaDokumen,
              required: masterKelengkapanDokumen.required,
              jenis_permintaan_id: masterKelengkapanDokumen.jenisPermintaanId,
              kategori_permintaan_id: masterKelengkapanDokumen.kategoriPermintaanId,
              detail_permintaan_id: masterKelengkapanDokumen.detailPermintaanId,
              created_at: masterKelengkapanDokumen.createdAt,
              updated_at: masterKelengkapanDokumen.updatedAt,
              master_kegiatan_nama: masterKegiatan.nama,
              master_fungsi_nama: masterFungsi.nama,
            })
            .from(masterKelengkapanDokumen)
            .leftJoin(masterKegiatan, eq(masterKelengkapanDokumen.kegiatanId, masterKegiatan.id))
            .leftJoin(masterFungsi, eq(masterKegiatan.fungsiId, masterFungsi.id))
            .where(filters.length > 0 ? and(...filters) : undefined)
            .orderBy(
              asc(masterKelengkapanDokumen.isKetuaTim),
              asc(masterKelengkapanDokumen.namaDokumen),
            )

          const result = rows.map((row) => ({
            id: row.id,
            kegiatan_id: row.kegiatan_id,
            is_ketua_tim: row.is_ketua_tim,
            nama_dokumen: row.nama_dokumen,
            required: row.required,
            jenis_permintaan_id: row.jenis_permintaan_id,
            kategori_permintaan_id: row.kategori_permintaan_id,
            detail_permintaan_id: row.detail_permintaan_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
            master_kegiatan: row.master_kegiatan_nama
              ? {
                  nama: row.master_kegiatan_nama,
                  master_fungsi: row.master_fungsi_nama
                    ? { nama: row.master_fungsi_nama }
                    : null,
                }
              : null,
            kegiatan_nama: row.master_kegiatan_nama ?? undefined,
            fungsi_nama: row.master_fungsi_nama ?? undefined,
          }))

          return Response.json(result)
        } catch (err) {
          console.error('[API DEBUG] Error in master-kelengkapan GET:', err)
          return Response.json({ error: 'Gagal mengambil data kelengkapan' }, { status: 500 })
        }
      },

      POST: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = createKelengkapanSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const authError = await requireAdmin(request)
        if (authError) return authError

        const chainError = await validateKelengkapanChain(result.data)
        if (chainError) {
          return Response.json({ error: chainError }, { status: 400 })
        }

        const [kegiatan] = await db
          .select({
            id: masterKegiatan.id,
            nama: masterKegiatan.nama,
            fungsi_nama: masterFungsi.nama,
          })
          .from(masterKegiatan)
          .leftJoin(masterFungsi, eq(masterKegiatan.fungsiId, masterFungsi.id))
          .where(and(
            eq(masterKegiatan.id, result.data.kegiatanId),
            eq(masterKegiatan.isActive, true),
          ))
          .limit(1)

        if (!kegiatan) {
          return Response.json({ error: 'Kegiatan tidak ditemukan atau tidak aktif' }, { status: 400 })
        }

        try {
          const duplicate = await findDuplicateKelengkapan(result.data)
          if (duplicate) {
            return Response.json({
              error: 'Kelengkapan sudah ada untuk detail permintaan dan tipe ini',
            }, { status: 409 })
          }

          const [row] = await db
            .insert(masterKelengkapanDokumen)
            .values({
              kegiatanId: result.data.kegiatanId,
              isKetuaTim: result.data.isKetuaTim,
              namaDokumen: result.data.namaDokumen,
              required: result.data.required,
              jenisPermintaanId: result.data.jenisPermintaanId ?? null,
              kategoriPermintaanId: result.data.kategoriPermintaanId ?? null,
              detailPermintaanId: result.data.detailPermintaanId ?? null,
            })
            .returning({
              id: masterKelengkapanDokumen.id,
              kegiatan_id: masterKelengkapanDokumen.kegiatanId,
              is_ketua_tim: masterKelengkapanDokumen.isKetuaTim,
              nama_dokumen: masterKelengkapanDokumen.namaDokumen,
              required: masterKelengkapanDokumen.required,
              jenis_permintaan_id: masterKelengkapanDokumen.jenisPermintaanId,
              kategori_permintaan_id: masterKelengkapanDokumen.kategoriPermintaanId,
              detail_permintaan_id: masterKelengkapanDokumen.detailPermintaanId,
              created_at: masterKelengkapanDokumen.createdAt,
              updated_at: masterKelengkapanDokumen.updatedAt,
            })

          if (!row) {
            return Response.json({ error: 'Gagal menambah kelengkapan' }, { status: 500 })
          }

          return Response.json({
            ...row,
            master_kegiatan: {
              nama: kegiatan.nama,
              master_fungsi: kegiatan.fungsi_nama ? { nama: kegiatan.fungsi_nama } : null,
            },
            kegiatan_nama: kegiatan.nama,
            fungsi_nama: kegiatan.fungsi_nama,
          }, { status: 201 })
        } catch (err) {
          console.error('[API DEBUG] Error in master-kelengkapan POST:', err)
          return Response.json({ error: 'Gagal menambah kelengkapan' }, { status: 500 })
        }
      },
    },
  },
})
