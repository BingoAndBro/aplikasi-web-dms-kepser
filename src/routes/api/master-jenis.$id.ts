import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterJenisPermintaan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { updateJenisSchema } from '#/lib/schemas/master-data'

async function requireAdmin(request: Request, action: 'mengubah' | 'menghapus') {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: `Hanya ADMIN yang bisa ${action} jenis permintaan` }, { status: 403 })
  }
  return null
}

export const Route = createFileRoute('/api/master-jenis/$id')({
  server: {
    handlers: {
      GET: async ({ params }: { request: Request; params: { id: string } }) => {
        // Public read endpoint: master data powers form dropdowns; mutations below remain ADMIN-only.
        try {
          const [data] = await db
            .select({
              id: masterJenisPermintaan.id,
              nama: masterJenisPermintaan.nama,
              deskripsi: masterJenisPermintaan.deskripsi,
              is_active: masterJenisPermintaan.isActive,
              created_at: masterJenisPermintaan.createdAt,
              updated_at: masterJenisPermintaan.updatedAt,
            })
            .from(masterJenisPermintaan)
            .where(eq(masterJenisPermintaan.id, params.id))
            .limit(1)

          if (!data) {
            return Response.json({ error: 'Jenis permintaan tidak ditemukan' }, { status: 404 })
          }

          return Response.json(data)
        } catch (err) {
          console.error('[API DEBUG] Error in master-jenis/$id GET:', err)
          return Response.json({ error: 'Gagal mengambil data jenis permintaan' }, { status: 500 })
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

        const result = updateJenisSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const authError = await requireAdmin(request, 'mengubah')
        if (authError) return authError

        const updates: Partial<typeof masterJenisPermintaan.$inferInsert> = {}
        if (result.data.nama !== undefined) updates.nama = result.data.nama
        if (result.data.deskripsi !== undefined) updates.deskripsi = result.data.deskripsi
        if (result.data.isActive !== undefined) updates.isActive = result.data.isActive

        try {
          const [data] = await db
            .update(masterJenisPermintaan)
            .set(updates)
            .where(eq(masterJenisPermintaan.id, params.id))
            .returning({
              id: masterJenisPermintaan.id,
              nama: masterJenisPermintaan.nama,
              deskripsi: masterJenisPermintaan.deskripsi,
              is_active: masterJenisPermintaan.isActive,
              created_at: masterJenisPermintaan.createdAt,
              updated_at: masterJenisPermintaan.updatedAt,
            })

          if (!data) {
            return Response.json({ error: 'Gagal mengubah jenis permintaan' }, { status: 500 })
          }

          return Response.json(data)
        } catch (err) {
          console.error('[API DEBUG] Error in master-jenis/$id PATCH:', err)
          return Response.json({ error: 'Gagal mengubah jenis permintaan' }, { status: 500 })
        }
      },

      DELETE: async ({ request, params }: { request: Request; params: { id: string } }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const authError = await requireAdmin(request, 'menghapus')
        if (authError) return authError

        // Soft delete: set is_active = false
        try {
          await db
            .update(masterJenisPermintaan)
            .set({ isActive: false })
            .where(eq(masterJenisPermintaan.id, params.id))
        } catch (err) {
          console.error('[API DEBUG] Error in master-jenis/$id DELETE:', err)
          return Response.json({ error: 'Gagal menghapus jenis permintaan' }, { status: 500 })
        }

        return Response.json({ success: true })
      },
    },
  },
})
