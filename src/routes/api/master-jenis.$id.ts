import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterJenisPermintaan, masterKomponen } from '#/db/schema/master'
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
          const [row] = await db
            .select({
              id: masterJenisPermintaan.id,
              komponen_id: masterJenisPermintaan.komponenId,
              nama: masterJenisPermintaan.nama,
              deskripsi: masterJenisPermintaan.deskripsi,
              is_active: masterJenisPermintaan.isActive,
              created_at: masterJenisPermintaan.createdAt,
              updated_at: masterJenisPermintaan.updatedAt,
              master_komponen_id: masterKomponen.id,
              master_komponen_nama: masterKomponen.nama,
            })
            .from(masterJenisPermintaan)
            .leftJoin(masterKomponen, eq(masterJenisPermintaan.komponenId, masterKomponen.id))
            .where(eq(masterJenisPermintaan.id, params.id))
            .limit(1)

          if (!row) {
            return Response.json({ error: 'Jenis permintaan tidak ditemukan' }, { status: 404 })
          }

          return Response.json({
            id: row.id,
            komponen_id: row.komponen_id,
            nama: row.nama,
            deskripsi: row.deskripsi,
            is_active: row.is_active,
            created_at: row.created_at,
            updated_at: row.updated_at,
            master_komponen: row.master_komponen_id
              ? { id: row.master_komponen_id, nama: row.master_komponen_nama }
              : null,
            komponen_nama: row.master_komponen_nama ?? undefined,
          })
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

        const [existing] = await db
          .select({
            id: masterJenisPermintaan.id,
            komponen_id: masterJenisPermintaan.komponenId,
            nama: masterJenisPermintaan.nama,
          })
          .from(masterJenisPermintaan)
          .where(eq(masterJenisPermintaan.id, params.id))
          .limit(1)

        if (!existing) {
          return Response.json({ error: 'Jenis permintaan tidak ditemukan' }, { status: 404 })
        }

        if (result.data.komponenId && result.data.komponenId !== existing.komponen_id) {
          const [komponen] = await db
            .select({ id: masterKomponen.id })
            .from(masterKomponen)
            .where(and(
              eq(masterKomponen.id, result.data.komponenId),
              eq(masterKomponen.isActive, true),
            ))
            .limit(1)

          if (!komponen) {
            return Response.json({ error: 'Komponen tidak ditemukan atau tidak aktif' }, { status: 400 })
          }
        }

        if (result.data.nama) {
          const komponenId = result.data.komponenId ?? existing.komponen_id
          const [duplicate] = await db
            .select({ id: masterJenisPermintaan.id })
            .from(masterJenisPermintaan)
            .where(and(
              eq(masterJenisPermintaan.nama, result.data.nama),
              eq(masterJenisPermintaan.komponenId, komponenId),
              eq(masterJenisPermintaan.isActive, true),
              ne(masterJenisPermintaan.id, params.id),
            ))
            .limit(1)

          if (duplicate) {
            return Response.json({ error: `Jenis permintaan "${result.data.nama}" sudah ada` }, { status: 409 })
          }
        }

        const updates: Partial<typeof masterJenisPermintaan.$inferInsert> = {}
        if (result.data.komponenId !== undefined) updates.komponenId = result.data.komponenId
        if (result.data.nama !== undefined) updates.nama = result.data.nama
        if (result.data.deskripsi !== undefined) updates.deskripsi = result.data.deskripsi
        if (result.data.isActive !== undefined) updates.isActive = result.data.isActive

        try {
          const [row] = await db
            .update(masterJenisPermintaan)
            .set(updates)
            .where(eq(masterJenisPermintaan.id, params.id))
            .returning({
              id: masterJenisPermintaan.id,
              komponen_id: masterJenisPermintaan.komponenId,
              nama: masterJenisPermintaan.nama,
              deskripsi: masterJenisPermintaan.deskripsi,
              is_active: masterJenisPermintaan.isActive,
              created_at: masterJenisPermintaan.createdAt,
              updated_at: masterJenisPermintaan.updatedAt,
            })

          if (!row) {
            return Response.json({ error: 'Gagal mengubah jenis permintaan' }, { status: 500 })
          }

          const [komponen] = await db
            .select({ nama: masterKomponen.nama })
            .from(masterKomponen)
            .where(eq(masterKomponen.id, row.komponen_id))
            .limit(1)

          return Response.json({
            ...row,
            master_komponen: komponen ? { nama: komponen.nama } : null,
            komponen_nama: komponen?.nama,
          })
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
