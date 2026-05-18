import { createFileRoute } from '@tanstack/react-router'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterJenisPermintaan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { createJenisSchema } from '#/lib/schemas/master-data'

async function requireAdmin(request: Request) {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: 'Hanya ADMIN yang bisa menambah jenis permintaan' }, { status: 403 })
  }
  return null
}

export const Route = createFileRoute('/api/master-jenis')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        // Public read endpoint: master data powers form dropdowns; mutations below remain ADMIN-only.
        try {
          const data = await db
            .select({
              id: masterJenisPermintaan.id,
              nama: masterJenisPermintaan.nama,
              deskripsi: masterJenisPermintaan.deskripsi,
              is_active: masterJenisPermintaan.isActive,
              created_at: masterJenisPermintaan.createdAt,
              updated_at: masterJenisPermintaan.updatedAt,
            })
            .from(masterJenisPermintaan)
            .where(eq(masterJenisPermintaan.isActive, true))
            .orderBy(asc(masterJenisPermintaan.nama))

          return Response.json(data)
        } catch (err) {
          console.error('[API DEBUG] Error in master-jenis GET:', err)
          return Response.json({ error: 'Gagal mengambil data jenis permintaan' }, { status: 500 })
        }
      },

      POST: async ({ request }: { request: Request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = createJenisSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const authError = await requireAdmin(request)
        if (authError) return authError

        const [existing] = await db
          .select({ id: masterJenisPermintaan.id })
          .from(masterJenisPermintaan)
          .where(and(
            eq(masterJenisPermintaan.nama, result.data.nama),
            eq(masterJenisPermintaan.isActive, true),
          ))
          .limit(1)

        if (existing) {
          return Response.json({
            error: `Jenis permintaan "${result.data.nama}" sudah ada`,
          }, { status: 409 })
        }

        try {
          const [data] = await db
            .insert(masterJenisPermintaan)
            .values({
              nama: result.data.nama,
              deskripsi: result.data.deskripsi ?? null,
            })
            .returning({
              id: masterJenisPermintaan.id,
              nama: masterJenisPermintaan.nama,
              deskripsi: masterJenisPermintaan.deskripsi,
              is_active: masterJenisPermintaan.isActive,
              created_at: masterJenisPermintaan.createdAt,
              updated_at: masterJenisPermintaan.updatedAt,
            })

          if (!data) {
            return Response.json({ error: 'Gagal membuat jenis permintaan' }, { status: 500 })
          }

          return Response.json(data, { status: 201 })
        } catch (err) {
          console.error('[API DEBUG] Error in master-jenis POST:', err)
          return Response.json({ error: 'Gagal membuat jenis permintaan' }, { status: 500 })
        }
      },
    },
  },
})
