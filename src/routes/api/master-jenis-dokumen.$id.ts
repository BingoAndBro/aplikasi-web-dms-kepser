import { createFileRoute } from '@tanstack/react-router'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterJenisDokumen } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { updateMasterJenisDokumenSchema } from '#/lib/schemas/master-data'

async function requireAdmin(request: Request, action: 'mengubah' | 'menghapus') {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: `Hanya ADMIN yang bisa ${action} jenis dokumen` }, { status: 403 })
  }
  return null
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const jenisDokumenSelection = {
  id: masterJenisDokumen.id,
  nama: masterJenisDokumen.nama,
  deskripsi: masterJenisDokumen.deskripsi,
  is_active: masterJenisDokumen.isActive,
  created_at: masterJenisDokumen.createdAt,
  updated_at: masterJenisDokumen.updatedAt,
}

export const Route = createFileRoute('/api/master-jenis-dokumen/$id')({
  server: {
    handlers: {
      PATCH: async ({ params, request }: { params: { id: string }; request: Request }) => {
        const { id } = params
        if (!uuidPattern.test(id)) {
          return Response.json({ error: 'ID jenis dokumen tidak valid' }, { status: 400 })
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = updateMasterJenisDokumenSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const authError = await requireAdmin(request, 'mengubah')
        if (authError) return authError

        const [existing] = await db
          .select(jenisDokumenSelection)
          .from(masterJenisDokumen)
          .where(eq(masterJenisDokumen.id, id))
          .limit(1)

        if (!existing) {
          return Response.json({ error: 'Jenis dokumen tidak ditemukan' }, { status: 404 })
        }

        const nextNama = result.data.nama ?? existing.nama
        const nextIsActive = result.data.isActive ?? existing.is_active

        if (nextIsActive) {
          const [duplicate] = await db
            .select({ id: masterJenisDokumen.id })
            .from(masterJenisDokumen)
            .where(and(
              eq(masterJenisDokumen.nama, nextNama),
              eq(masterJenisDokumen.isActive, true),
              ne(masterJenisDokumen.id, id),
            ))
            .limit(1)

          if (duplicate) {
            return Response.json({ error: `Jenis dokumen "${nextNama}" sudah ada` }, { status: 409 })
          }
        }

        const updates: Partial<typeof masterJenisDokumen.$inferInsert> = {}
        if (result.data.nama !== undefined) updates.nama = result.data.nama
        if (result.data.deskripsi !== undefined) updates.deskripsi = result.data.deskripsi
        if (result.data.isActive !== undefined) updates.isActive = result.data.isActive

        if (Object.keys(updates).length === 0) {
          return Response.json(existing)
        }

        try {
          const [data] = await db
            .update(masterJenisDokumen)
            .set(updates)
            .where(eq(masterJenisDokumen.id, id))
            .returning(jenisDokumenSelection)

          if (!data) {
            return Response.json({ error: 'Gagal mengubah jenis dokumen' }, { status: 500 })
          }

          return Response.json(data)
        } catch (err) {
          console.error('[API DEBUG] Error in master-jenis-dokumen/$id PATCH:', err)
          return Response.json({ error: 'Gagal mengubah jenis dokumen' }, { status: 500 })
        }
      },

      DELETE: async ({ params, request }: { params: { id: string }; request: Request }) => {
        const { id } = params
        if (!uuidPattern.test(id)) {
          return Response.json({ error: 'ID jenis dokumen tidak valid' }, { status: 400 })
        }

        const authError = await requireAdmin(request, 'menghapus')
        if (authError) return authError

        const [existing] = await db
          .select({ id: masterJenisDokumen.id, nama: masterJenisDokumen.nama })
          .from(masterJenisDokumen)
          .where(eq(masterJenisDokumen.id, id))
          .limit(1)

        if (!existing) {
          return Response.json({ error: 'Jenis dokumen tidak ditemukan' }, { status: 404 })
        }

        try {
          await db
            .update(masterJenisDokumen)
            .set({ isActive: false })
            .where(eq(masterJenisDokumen.id, id))
        } catch (err) {
          console.error('[API DEBUG] Error in master-jenis-dokumen/$id DELETE:', err)
          return Response.json({ error: 'Gagal menghapus jenis dokumen' }, { status: 500 })
        }

        return Response.json({
          success: true,
          message: `Jenis dokumen "${existing.nama}" berhasil dinonaktifkan`,
        })
      },
    },
  },
})
