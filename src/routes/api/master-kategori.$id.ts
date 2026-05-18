import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterJenisPermintaan, masterKategoriPermintaan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { updateKategoriSchema } from '#/lib/schemas/master-data'

async function requireAdmin(request: Request, action: 'mengubah' | 'menghapus') {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: `Hanya ADMIN yang bisa ${action} kategori permintaan` }, { status: 403 })
  }
  return null
}

export const Route = createFileRoute('/api/master-kategori/$id')({
  server: {
    handlers: {
      GET: async ({ params }: { request: Request; params: { id: string } }) => {
        // Public read endpoint: master data powers form dropdowns; mutations below remain ADMIN-only.
        try {
          const [row] = await db
            .select({
              id: masterKategoriPermintaan.id,
              jenis_permintaan_id: masterKategoriPermintaan.jenisPermintaanId,
              nama: masterKategoriPermintaan.nama,
              deskripsi: masterKategoriPermintaan.deskripsi,
              is_active: masterKategoriPermintaan.isActive,
              created_at: masterKategoriPermintaan.createdAt,
              updated_at: masterKategoriPermintaan.updatedAt,
              master_jenis_permintaan_id: masterJenisPermintaan.id,
              master_jenis_permintaan_nama: masterJenisPermintaan.nama,
            })
            .from(masterKategoriPermintaan)
            .leftJoin(
              masterJenisPermintaan,
              eq(masterKategoriPermintaan.jenisPermintaanId, masterJenisPermintaan.id),
            )
            .where(eq(masterKategoriPermintaan.id, params.id))
            .limit(1)

          if (!row) {
            return Response.json({ error: 'Kategori permintaan tidak ditemukan' }, { status: 404 })
          }

          return Response.json({
            id: row.id,
            jenis_permintaan_id: row.jenis_permintaan_id,
            nama: row.nama,
            deskripsi: row.deskripsi,
            is_active: row.is_active,
            created_at: row.created_at,
            updated_at: row.updated_at,
            master_jenis_permintaan: row.master_jenis_permintaan_id
              ? { id: row.master_jenis_permintaan_id, nama: row.master_jenis_permintaan_nama }
              : null,
            jenis_nama: row.master_jenis_permintaan_nama ?? undefined,
          })
        } catch (err) {
          console.error('[API DEBUG] Error in master-kategori/$id GET:', err)
          return Response.json({ error: 'Gagal mengambil data kategori permintaan' }, { status: 500 })
        }
      },

      PATCH: async ({ request, params }: { request: Request; params: { id: string } }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = updateKategoriSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const authError = await requireAdmin(request, 'mengubah')
        if (authError) return authError

        const updates: Partial<typeof masterKategoriPermintaan.$inferInsert> = {}
        if (result.data.jenisPermintaanId !== undefined) updates.jenisPermintaanId = result.data.jenisPermintaanId
        if (result.data.nama !== undefined) updates.nama = result.data.nama
        if (result.data.deskripsi !== undefined) updates.deskripsi = result.data.deskripsi
        if (result.data.isActive !== undefined) updates.isActive = result.data.isActive

        try {
          const [row] = await db
            .update(masterKategoriPermintaan)
            .set(updates)
            .where(eq(masterKategoriPermintaan.id, params.id))
            .returning({
              id: masterKategoriPermintaan.id,
              jenis_permintaan_id: masterKategoriPermintaan.jenisPermintaanId,
              nama: masterKategoriPermintaan.nama,
              deskripsi: masterKategoriPermintaan.deskripsi,
              is_active: masterKategoriPermintaan.isActive,
              created_at: masterKategoriPermintaan.createdAt,
              updated_at: masterKategoriPermintaan.updatedAt,
            })

          if (!row) {
            return Response.json({ error: 'Gagal mengubah kategori permintaan' }, { status: 500 })
          }

          const [jenis] = await db
            .select({ nama: masterJenisPermintaan.nama })
            .from(masterJenisPermintaan)
            .where(eq(masterJenisPermintaan.id, row.jenis_permintaan_id))
            .limit(1)

          return Response.json({
            ...row,
            master_jenis_permintaan: jenis ? { nama: jenis.nama } : null,
            jenis_nama: jenis?.nama,
          })
        } catch (err) {
          console.error('[API DEBUG] Error in master-kategori/$id PATCH:', err)
          return Response.json({ error: 'Gagal mengubah kategori permintaan' }, { status: 500 })
        }
      },

      DELETE: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const authError = await requireAdmin(request, 'menghapus')
        if (authError) return authError

        try {
          await db
            .update(masterKategoriPermintaan)
            .set({ isActive: false })
            .where(eq(masterKategoriPermintaan.id, params.id))
        } catch (err) {
          console.error('[API DEBUG] Error in master-kategori/$id DELETE:', err)
          return Response.json({ error: 'Gagal menghapus kategori permintaan' }, { status: 500 })
        }

        return Response.json({ success: true })
      },
    },
  },
})
