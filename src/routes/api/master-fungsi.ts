
import { createFileRoute } from '@tanstack/react-router'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterFungsi } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { createFungsiSchema } from '#/lib/schemas/master-data'

async function requireAdmin(request: Request) {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: 'Hanya ADMIN yang bisa menambah fungsi' }, { status: 403 })
  }
  return null
}

export const Route = createFileRoute('/api/master-fungsi')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        // Public read endpoint: master data powers form dropdowns; mutations below remain ADMIN-only.
        try {
          const data = await db
            .select({
              id: masterFungsi.id,
              nama: masterFungsi.nama,
              deskripsi: masterFungsi.deskripsi,
              is_active: masterFungsi.isActive,
              created_at: masterFungsi.createdAt,
              updated_at: masterFungsi.updatedAt,
            })
            .from(masterFungsi)
            .where(eq(masterFungsi.isActive, true))
            .orderBy(asc(masterFungsi.nama))

          return Response.json(data, {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (err) {
          console.error('[API DEBUG] Error in master-fungsi GET:', err)
          return Response.json({ error: 'Gagal mengambil data fungsi' }, { status: 500 })
        }
      },

      POST: async ({ request }: { request: Request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = createFungsiSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const authError = await requireAdmin(request)
        if (authError) return authError

        // Cek duplikat nama
        const [existing] = await db
          .select({ id: masterFungsi.id })
          .from(masterFungsi)
          .where(and(
            eq(masterFungsi.nama, result.data.nama),
            eq(masterFungsi.isActive, true),
          ))
          .limit(1)

        if (existing) {
          return Response.json({ error: `Nama fungsi "${result.data.nama}" sudah ada` }, { status: 409 })
        }

        try {
          const [data] = await db
            .insert(masterFungsi)
            .values({
              nama: result.data.nama,
              deskripsi: result.data.deskripsi ?? null,
            })
            .returning({
              id: masterFungsi.id,
              nama: masterFungsi.nama,
              deskripsi: masterFungsi.deskripsi,
              is_active: masterFungsi.isActive,
              created_at: masterFungsi.createdAt,
              updated_at: masterFungsi.updatedAt,
            })

          if (!data) {
            return Response.json({ error: 'Gagal membuat fungsi' }, { status: 500 })
          }

          return Response.json(data, { status: 201 })
        } catch (err) {
          console.error('[API DEBUG] Error in master-fungsi POST:', err)
          return Response.json({ error: 'Gagal membuat fungsi' }, { status: 500 })
        }
      },
    },
  },
})
