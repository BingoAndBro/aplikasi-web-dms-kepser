import { createFileRoute } from '@tanstack/react-router'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterFungsi, masterKegiatan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { updateKegiatanSchema } from '#/lib/schemas/master-data'

async function requireAdmin(request: Request, action: 'mengubah' | 'menghapus') {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: `Hanya ADMIN yang bisa ${action} kegiatan` }, { status: 403 })
  }
  return null
}

export const Route = createFileRoute('/api/master-kegiatan/$id')({
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

        const result = updateKegiatanSchema.safeParse(body)
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
            id: masterKegiatan.id,
            fungsi_id: masterKegiatan.fungsiId,
            nama: masterKegiatan.nama,
          })
          .from(masterKegiatan)
          .where(eq(masterKegiatan.id, id))
          .limit(1)

        if (!existing) {
          return Response.json({ error: 'Kegiatan tidak ditemukan' }, { status: 404 })
        }

        if (result.data.fungsiId && result.data.fungsiId !== existing.fungsi_id) {
          const [fungsi] = await db
            .select({ id: masterFungsi.id })
            .from(masterFungsi)
            .where(and(
              eq(masterFungsi.id, result.data.fungsiId),
              eq(masterFungsi.isActive, true),
            ))
            .limit(1)

          if (!fungsi) {
            return Response.json({ error: 'Fungsi tidak ditemukan atau tidak aktif' }, { status: 400 })
          }
        }

        if (result.data.nama) {
          const fungsiId = result.data.fungsiId ?? existing.fungsi_id
          const [duplicate] = await db
            .select({ id: masterKegiatan.id })
            .from(masterKegiatan)
            .where(and(
              eq(masterKegiatan.nama, result.data.nama),
              eq(masterKegiatan.fungsiId, fungsiId),
              eq(masterKegiatan.isActive, true),
              ne(masterKegiatan.id, id),
            ))
            .limit(1)

          if (duplicate) {
            return Response.json({ error: `Kegiatan "${result.data.nama}" sudah ada` }, { status: 409 })
          }
        }

        try {
          const updateData: Partial<typeof masterKegiatan.$inferInsert> = {}
          if (result.data.fungsiId !== undefined) updateData.fungsiId = result.data.fungsiId
          if (result.data.nama !== undefined) updateData.nama = result.data.nama
          if (result.data.deskripsi !== undefined) updateData.deskripsi = result.data.deskripsi

          const [row] = await db
            .update(masterKegiatan)
            .set(updateData)
            .where(eq(masterKegiatan.id, id))
            .returning({
              id: masterKegiatan.id,
              fungsi_id: masterKegiatan.fungsiId,
              nama: masterKegiatan.nama,
              deskripsi: masterKegiatan.deskripsi,
              is_active: masterKegiatan.isActive,
              created_at: masterKegiatan.createdAt,
              updated_at: masterKegiatan.updatedAt,
            })

          if (!row) {
            return Response.json({ error: 'Gagal mengupdate kegiatan' }, { status: 500 })
          }

          const [fungsi] = await db
            .select({ nama: masterFungsi.nama })
            .from(masterFungsi)
            .where(eq(masterFungsi.id, row.fungsi_id))
            .limit(1)

          return Response.json({
            ...row,
            master_fungsi: fungsi ? { nama: fungsi.nama } : null,
            fungsi_nama: fungsi?.nama,
          }, { status: 200 })
        } catch (err) {
          console.error('[API DEBUG] Error in master-kegiatan/$id PATCH:', err)
          return Response.json({ error: 'Gagal mengupdate kegiatan' }, { status: 500 })
        }
      },

      DELETE: async ({ params, request }: { params: Record<string, string>; request: Request }) => {
        const { id } = params

        const authError = await requireAdmin(request, 'menghapus')
        if (authError) return authError

        const [existing] = await db
          .select({ id: masterKegiatan.id, nama: masterKegiatan.nama })
          .from(masterKegiatan)
          .where(eq(masterKegiatan.id, id))
          .limit(1)

        if (!existing) {
          return Response.json({ error: 'Kegiatan tidak ditemukan' }, { status: 404 })
        }

        try {
          await db
            .update(masterKegiatan)
            .set({ isActive: false })
            .where(eq(masterKegiatan.id, id))
        } catch (err) {
          console.error('[API DEBUG] Error in master-kegiatan/$id DELETE:', err)
          return Response.json({ error: 'Gagal menghapus kegiatan' }, { status: 500 })
        }

        return Response.json({
          success: true,
          message: `Kegiatan "${existing.nama}" berhasil dinonaktifkan`,
        }, { status: 200 })
      },
    },
  },
})
