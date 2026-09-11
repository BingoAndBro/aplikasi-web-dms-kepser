import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterKegiatan, masterKomponen } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { updateKomponenSchema } from '#/lib/schemas/master-data'

async function requireAdmin(request: Request, action: 'mengubah' | 'menghapus') {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: `Hanya ADMIN yang bisa ${action} komponen` }, { status: 403 })
  }
  return null
}

export const Route = createFileRoute('/api/master-komponen/$id')({
  server: {
    handlers: {
      GET: async ({ params }: { request: Request; params: { id: string } }) => {
        // Public read endpoint: master data powers form dropdowns; mutations below remain ADMIN-only.
        try {
          const [row] = await db
            .select({
              id: masterKomponen.id,
              kegiatan_id: masterKomponen.kegiatanId,
              nama: masterKomponen.nama,
              deskripsi: masterKomponen.deskripsi,
              is_active: masterKomponen.isActive,
              created_at: masterKomponen.createdAt,
              updated_at: masterKomponen.updatedAt,
              master_kegiatan_id: masterKegiatan.id,
              master_kegiatan_nama: masterKegiatan.nama,
            })
            .from(masterKomponen)
            .leftJoin(masterKegiatan, eq(masterKomponen.kegiatanId, masterKegiatan.id))
            .where(eq(masterKomponen.id, params.id))
            .limit(1)

          if (!row) {
            return Response.json({ error: 'Komponen tidak ditemukan' }, { status: 404 })
          }

          return Response.json({
            id: row.id,
            kegiatan_id: row.kegiatan_id,
            nama: row.nama,
            deskripsi: row.deskripsi,
            is_active: row.is_active,
            created_at: row.created_at,
            updated_at: row.updated_at,
            master_kegiatan: row.master_kegiatan_id
              ? { id: row.master_kegiatan_id, nama: row.master_kegiatan_nama }
              : null,
            kegiatan_nama: row.master_kegiatan_nama ?? undefined,
          })
        } catch (err) {
          console.error('[API DEBUG] Error in master-komponen/$id GET:', err)
          return Response.json({ error: 'Gagal mengambil data komponen' }, { status: 500 })
        }
      },

      PATCH: async ({ params, request }: { params: { id: string }; request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const { id } = params

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = updateKomponenSchema.safeParse(body)
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
            id: masterKomponen.id,
            kegiatan_id: masterKomponen.kegiatanId,
            nama: masterKomponen.nama,
          })
          .from(masterKomponen)
          .where(eq(masterKomponen.id, id))
          .limit(1)

        if (!existing) {
          return Response.json({ error: 'Komponen tidak ditemukan' }, { status: 404 })
        }

        if (result.data.kegiatanId && result.data.kegiatanId !== existing.kegiatan_id) {
          const [kegiatan] = await db
            .select({ id: masterKegiatan.id })
            .from(masterKegiatan)
            .where(and(
              eq(masterKegiatan.id, result.data.kegiatanId),
              eq(masterKegiatan.isActive, true),
            ))
            .limit(1)

          if (!kegiatan) {
            return Response.json({ error: 'Kegiatan tidak ditemukan atau tidak aktif' }, { status: 400 })
          }
        }

        if (result.data.nama) {
          const kegiatanId = result.data.kegiatanId ?? existing.kegiatan_id
          const [duplicate] = await db
            .select({ id: masterKomponen.id })
            .from(masterKomponen)
            .where(and(
              eq(masterKomponen.nama, result.data.nama),
              eq(masterKomponen.kegiatanId, kegiatanId),
              eq(masterKomponen.isActive, true),
              ne(masterKomponen.id, id),
            ))
            .limit(1)

          if (duplicate) {
            return Response.json({ error: `Komponen "${result.data.nama}" sudah ada` }, { status: 409 })
          }
        }

        try {
          const updates: Partial<typeof masterKomponen.$inferInsert> = {}
          if (result.data.kegiatanId !== undefined) updates.kegiatanId = result.data.kegiatanId
          if (result.data.nama !== undefined) updates.nama = result.data.nama
          if (result.data.deskripsi !== undefined) updates.deskripsi = result.data.deskripsi
          if (result.data.isActive !== undefined) updates.isActive = result.data.isActive

          const [row] = await db
            .update(masterKomponen)
            .set(updates)
            .where(eq(masterKomponen.id, id))
            .returning({
              id: masterKomponen.id,
              kegiatan_id: masterKomponen.kegiatanId,
              nama: masterKomponen.nama,
              deskripsi: masterKomponen.deskripsi,
              is_active: masterKomponen.isActive,
              created_at: masterKomponen.createdAt,
              updated_at: masterKomponen.updatedAt,
            })

          if (!row) {
            return Response.json({ error: 'Gagal mengubah komponen' }, { status: 500 })
          }

          const [kegiatan] = await db
            .select({ nama: masterKegiatan.nama })
            .from(masterKegiatan)
            .where(eq(masterKegiatan.id, row.kegiatan_id))
            .limit(1)

          return Response.json({
            ...row,
            master_kegiatan: kegiatan ? { nama: kegiatan.nama } : null,
            kegiatan_nama: kegiatan?.nama,
          })
        } catch (err) {
          console.error('[API DEBUG] Error in master-komponen/$id PATCH:', err)
          return Response.json({ error: 'Gagal mengubah komponen' }, { status: 500 })
        }
      },

      DELETE: async ({ params, request }: { params: { id: string }; request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const { id } = params

        const authError = await requireAdmin(request, 'menghapus')
        if (authError) return authError

        const [existing] = await db
          .select({ id: masterKomponen.id, nama: masterKomponen.nama })
          .from(masterKomponen)
          .where(eq(masterKomponen.id, id))
          .limit(1)

        if (!existing) {
          return Response.json({ error: 'Komponen tidak ditemukan' }, { status: 404 })
        }

        try {
          await db
            .update(masterKomponen)
            .set({ isActive: false })
            .where(eq(masterKomponen.id, id))
        } catch (err) {
          console.error('[API DEBUG] Error in master-komponen/$id DELETE:', err)
          return Response.json({ error: 'Gagal menghapus komponen' }, { status: 500 })
        }

        return Response.json({
          success: true,
          message: `Komponen "${existing.nama}" berhasil dinonaktifkan`,
        }, { status: 200 })
      },
    },
  },
})
