import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import {
  masterDetailPermintaan,
  masterFungsi,
  masterKegiatan,
  masterKategoriPermintaan,
  masterKelengkapanDokumen,
} from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { updateKelengkapanSchema } from '#/lib/schemas/master-data'

async function requireAdmin(request: Request, action: 'mengubah' | 'menghapus') {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: `Hanya ADMIN yang bisa ${action} kelengkapan` }, { status: 403 })
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

export const Route = createFileRoute('/api/master-kelengkapan/$id')({
  server: {
    handlers: {
      PATCH: async ({ params, request }: { params: Record<string, string>; request: Request }) => {
        const { id } = params

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = updateKelengkapanSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const authError = await requireAdmin(request, 'mengubah')
        if (authError) return authError

        const [existing] = await db
          .select({
            id: masterKelengkapanDokumen.id,
            jenis_permintaan_id: masterKelengkapanDokumen.jenisPermintaanId,
            kategori_permintaan_id: masterKelengkapanDokumen.kategoriPermintaanId,
            detail_permintaan_id: masterKelengkapanDokumen.detailPermintaanId,
          })
          .from(masterKelengkapanDokumen)
          .where(eq(masterKelengkapanDokumen.id, id))
          .limit(1)

        if (!existing) {
          return Response.json({ error: 'Kelengkapan tidak ditemukan' }, { status: 404 })
        }

        const chainError = await validateKelengkapanChain({
          jenisPermintaanId: result.data.jenisPermintaanId !== undefined
            ? result.data.jenisPermintaanId
            : existing.jenis_permintaan_id,
          kategoriPermintaanId: result.data.kategoriPermintaanId !== undefined
            ? result.data.kategoriPermintaanId
            : existing.kategori_permintaan_id,
          detailPermintaanId: result.data.detailPermintaanId !== undefined
            ? result.data.detailPermintaanId
            : existing.detail_permintaan_id,
        })
        if (chainError) {
          return Response.json({ error: chainError }, { status: 400 })
        }

        try {
          const updates: Partial<typeof masterKelengkapanDokumen.$inferInsert> = {}
          if (result.data.isKetuaTim !== undefined) updates.isKetuaTim = result.data.isKetuaTim
          if (result.data.namaDokumen !== undefined) updates.namaDokumen = result.data.namaDokumen
          if (result.data.required !== undefined) updates.required = result.data.required
          if (result.data.jenisPermintaanId !== undefined) updates.jenisPermintaanId = result.data.jenisPermintaanId
          if (result.data.kategoriPermintaanId !== undefined) updates.kategoriPermintaanId = result.data.kategoriPermintaanId
          if (result.data.detailPermintaanId !== undefined) updates.detailPermintaanId = result.data.detailPermintaanId

          const [row] = await db
            .update(masterKelengkapanDokumen)
            .set(updates)
            .where(eq(masterKelengkapanDokumen.id, id))
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
            return Response.json({ error: 'Gagal mengupdate kelengkapan' }, { status: 500 })
          }

          const [kegiatan] = await db
            .select({
              nama: masterKegiatan.nama,
              fungsi_nama: masterFungsi.nama,
            })
            .from(masterKegiatan)
            .leftJoin(masterFungsi, eq(masterKegiatan.fungsiId, masterFungsi.id))
            .where(eq(masterKegiatan.id, row.kegiatan_id))
            .limit(1)

          return Response.json({
            ...row,
            master_kegiatan: kegiatan
              ? {
                  nama: kegiatan.nama,
                  master_fungsi: kegiatan.fungsi_nama ? { nama: kegiatan.fungsi_nama } : null,
                }
              : null,
            kegiatan_nama: kegiatan?.nama,
            fungsi_nama: kegiatan?.fungsi_nama,
          }, { status: 200 })
        } catch (err) {
          console.error('[API DEBUG] Error in master-kelengkapan/$id PATCH:', err)
          return Response.json({ error: 'Gagal mengupdate kelengkapan' }, { status: 500 })
        }
      },

      DELETE: async ({ params, request }: { params: Record<string, string>; request: Request }) => {
        const { id } = params

        const authError = await requireAdmin(request, 'menghapus')
        if (authError) return authError

        const [existing] = await db
          .select({
            id: masterKelengkapanDokumen.id,
            nama_dokumen: masterKelengkapanDokumen.namaDokumen,
          })
          .from(masterKelengkapanDokumen)
          .where(eq(masterKelengkapanDokumen.id, id))
          .limit(1)

        if (!existing) {
          return Response.json({ error: 'Kelengkapan tidak ditemukan' }, { status: 404 })
        }

        try {
          await db
            .delete(masterKelengkapanDokumen)
            .where(eq(masterKelengkapanDokumen.id, id))
        } catch (err) {
          console.error('[API DEBUG] Error in master-kelengkapan/$id DELETE:', err)
          return Response.json({ error: 'Gagal menghapus kelengkapan' }, { status: 500 })
        }

        return Response.json({
          success: true,
          message: `Kelengkapan "${existing.nama_dokumen}" berhasil dihapus`,
        }, { status: 200 })
      },
    },
  },
})
