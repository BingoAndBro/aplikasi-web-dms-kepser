import { createFileRoute } from '@tanstack/react-router'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterFungsi } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { updateFungsiSchema } from '#/lib/schemas/master-data'

async function requireAdmin(request: Request, action: 'mengubah' | 'menghapus') {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: `Hanya ADMIN yang bisa ${action} fungsi` }, { status: 403 })
  }
  return null
}

export const Route = createFileRoute('/api/master-fungsi/$id')({
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

        const result = updateFungsiSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const authError = await requireAdmin(request, 'mengubah')
        if (authError) return authError

        const [existing] = await db
          .select({ id: masterFungsi.id })
          .from(masterFungsi)
          .where(eq(masterFungsi.id, id))
          .limit(1)

        if (!existing) {
          return Response.json({ error: 'Fungsi tidak ditemukan' }, { status: 404 })
        }

        if (result.data.nama) {
          const [duplicate] = await db
            .select({ id: masterFungsi.id })
            .from(masterFungsi)
            .where(and(
              eq(masterFungsi.nama, result.data.nama),
              eq(masterFungsi.isActive, true),
              ne(masterFungsi.id, id),
            ))
            .limit(1)

          if (duplicate) {
            return Response.json({ error: `Nama fungsi "${result.data.nama}" sudah ada` }, { status: 409 })
          }
        }

        try {
          const updateData: Partial<typeof masterFungsi.$inferInsert> = {}
          if (result.data.nama !== undefined) updateData.nama = result.data.nama
          if (result.data.deskripsi !== undefined) updateData.deskripsi = result.data.deskripsi

          const [data] = await db
            .update(masterFungsi)
            .set(updateData)
            .where(eq(masterFungsi.id, id))
            .returning({
              id: masterFungsi.id,
              nama: masterFungsi.nama,
              deskripsi: masterFungsi.deskripsi,
              is_active: masterFungsi.isActive,
              created_at: masterFungsi.createdAt,
              updated_at: masterFungsi.updatedAt,
            })

          if (!data) {
            return Response.json({ error: 'Gagal mengupdate fungsi' }, { status: 500 })
          }

          return Response.json(data, { status: 200 })
        } catch (err) {
          console.error('[API DEBUG] Error in master-fungsi/$id PATCH:', err)
          return Response.json({ error: 'Gagal mengupdate fungsi' }, { status: 500 })
        }
      },

      DELETE: async ({ params, request }: { params: Record<string, string>; request: Request }) => {
        const { id } = params

        const authError = await requireAdmin(request, 'menghapus')
        if (authError) return authError

        const [existing] = await db
          .select({ id: masterFungsi.id, nama: masterFungsi.nama })
          .from(masterFungsi)
          .where(eq(masterFungsi.id, id))
          .limit(1)

        if (!existing) {
          return Response.json({ error: 'Fungsi tidak ditemukan' }, { status: 404 })
        }

        try {
          await db
            .update(masterFungsi)
            .set({ isActive: false })
            .where(eq(masterFungsi.id, id))
        } catch (err) {
          console.error('[API DEBUG] Error in master-fungsi/$id DELETE:', err)
          return Response.json({ error: 'Gagal menghapus fungsi' }, { status: 500 })
        }

        return Response.json({
          success: true,
          message: `Fungsi "${existing.nama}" berhasil dinonaktifkan`,
        }, { status: 200 })
      },
    },
  },
})
