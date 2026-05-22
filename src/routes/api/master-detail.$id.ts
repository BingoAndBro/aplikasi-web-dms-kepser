import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import {
  masterDetailPermintaan,
  masterJenisPermintaan,
  masterKategoriPermintaan,
} from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { updateDetailSchema } from '#/lib/schemas/master-data'

async function requireAdmin(request: Request, action: 'mengubah' | 'menghapus') {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: `Hanya ADMIN yang bisa ${action} detail permintaan` }, { status: 403 })
  }
  return null
}

export const Route = createFileRoute('/api/master-detail/$id')({
  server: {
    handlers: {
      GET: async ({ params }: { request: Request; params: { id: string } }) => {
        // Public read endpoint: master data powers form dropdowns; mutations below remain ADMIN-only.
        try {
          const [row] = await db
            .select({
              id: masterDetailPermintaan.id,
              kategori_permintaan_id: masterDetailPermintaan.kategoriPermintaanId,
              nama: masterDetailPermintaan.nama,
              deskripsi: masterDetailPermintaan.deskripsi,
              is_active: masterDetailPermintaan.isActive,
              created_at: masterDetailPermintaan.createdAt,
              updated_at: masterDetailPermintaan.updatedAt,
              master_kategori_permintaan_id: masterKategoriPermintaan.id,
              master_kategori_permintaan_nama: masterKategoriPermintaan.nama,
              master_jenis_permintaan_nama: masterJenisPermintaan.nama,
            })
            .from(masterDetailPermintaan)
            .leftJoin(
              masterKategoriPermintaan,
              eq(masterDetailPermintaan.kategoriPermintaanId, masterKategoriPermintaan.id),
            )
            .leftJoin(
              masterJenisPermintaan,
              eq(masterKategoriPermintaan.jenisPermintaanId, masterJenisPermintaan.id),
            )
            .where(eq(masterDetailPermintaan.id, params.id))
            .limit(1)

          if (!row) {
            return Response.json({ error: 'Detail permintaan tidak ditemukan' }, { status: 404 })
          }

          return Response.json({
            id: row.id,
            kategori_permintaan_id: row.kategori_permintaan_id,
            nama: row.nama,
            deskripsi: row.deskripsi,
            is_active: row.is_active,
            created_at: row.created_at,
            updated_at: row.updated_at,
            master_kategori_permintaan: row.master_kategori_permintaan_id
              ? {
                  id: row.master_kategori_permintaan_id,
                  nama: row.master_kategori_permintaan_nama,
                  master_jenis_permintaan: row.master_jenis_permintaan_nama
                    ? { nama: row.master_jenis_permintaan_nama }
                    : null,
                }
              : null,
            kategori_nama: row.master_kategori_permintaan_nama ?? undefined,
            jenis_nama: row.master_jenis_permintaan_nama ?? undefined,
          })
        } catch (err) {
          console.error('[API DEBUG] Error in master-detail/$id GET:', err)
          return Response.json({ error: 'Gagal mengambil data detail permintaan' }, { status: 500 })
        }
      },

      PATCH: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = updateDetailSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const authError = await requireAdmin(request, 'mengubah')
        if (authError) return authError

        const updates: Partial<typeof masterDetailPermintaan.$inferInsert> = {}
        if (result.data.kategoriPermintaanId !== undefined) updates.kategoriPermintaanId = result.data.kategoriPermintaanId
        if (result.data.nama !== undefined) updates.nama = result.data.nama
        if (result.data.deskripsi !== undefined) updates.deskripsi = result.data.deskripsi
        if (result.data.isActive !== undefined) updates.isActive = result.data.isActive

        try {
          const [row] = await db
            .update(masterDetailPermintaan)
            .set(updates)
            .where(eq(masterDetailPermintaan.id, params.id))
            .returning({
              id: masterDetailPermintaan.id,
              kategori_permintaan_id: masterDetailPermintaan.kategoriPermintaanId,
              nama: masterDetailPermintaan.nama,
              deskripsi: masterDetailPermintaan.deskripsi,
              is_active: masterDetailPermintaan.isActive,
              created_at: masterDetailPermintaan.createdAt,
              updated_at: masterDetailPermintaan.updatedAt,
            })

          if (!row) {
            return Response.json({ error: 'Gagal mengubah detail permintaan' }, { status: 500 })
          }

          const [kategori] = await db
            .select({
              nama: masterKategoriPermintaan.nama,
              jenis_nama: masterJenisPermintaan.nama,
            })
            .from(masterKategoriPermintaan)
            .leftJoin(
              masterJenisPermintaan,
              eq(masterKategoriPermintaan.jenisPermintaanId, masterJenisPermintaan.id),
            )
            .where(eq(masterKategoriPermintaan.id, row.kategori_permintaan_id))
            .limit(1)

          return Response.json({
            ...row,
            master_kategori_permintaan: kategori
              ? {
                  nama: kategori.nama,
                  master_jenis_permintaan: kategori.jenis_nama ? { nama: kategori.jenis_nama } : null,
                }
              : null,
            kategori_nama: kategori?.nama,
            jenis_nama: kategori?.jenis_nama,
          })
        } catch (err) {
          console.error('[API DEBUG] Error in master-detail/$id PATCH:', err)
          return Response.json({ error: 'Gagal mengubah detail permintaan' }, { status: 500 })
        }
      },

      DELETE: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const authError = await requireAdmin(request, 'menghapus')
        if (authError) return authError

        try {
          await db
            .update(masterDetailPermintaan)
            .set({ isActive: false })
            .where(eq(masterDetailPermintaan.id, params.id))
        } catch (err) {
          console.error('[API DEBUG] Error in master-detail/$id DELETE:', err)
          return Response.json({ error: 'Gagal menghapus detail permintaan' }, { status: 500 })
        }

        return Response.json({ success: true })
      },
    },
  },
})
