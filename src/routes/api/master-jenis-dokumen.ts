import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterJenisDokumen } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { createMasterJenisDokumenSchema } from '#/lib/schemas/master-data'

async function requireAdmin(request: Request) {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: 'Hanya ADMIN yang bisa menambah jenis dokumen' }, { status: 403 })
  }
  return null
}

const jenisDokumenSelection = {
  id: masterJenisDokumen.id,
  nama: masterJenisDokumen.nama,
  deskripsi: masterJenisDokumen.deskripsi,
  is_active: masterJenisDokumen.isActive,
  created_at: masterJenisDokumen.createdAt,
  updated_at: masterJenisDokumen.updatedAt,
}

export const Route = createFileRoute('/api/master-jenis-dokumen')({
  server: {
    handlers: {
      GET: async () => {
        // Public read endpoint: master data powers dropdowns; mutations below remain ADMIN-only.
        try {
          const data = await db
            .select(jenisDokumenSelection)
            .from(masterJenisDokumen)
            .where(eq(masterJenisDokumen.isActive, true))
            .orderBy(asc(masterJenisDokumen.nama))

          return Response.json(data)
        } catch (err) {
          console.error('[API DEBUG] Error in master-jenis-dokumen GET:', err)
          return Response.json({ error: 'Gagal mengambil data jenis dokumen' }, { status: 500 })
        }
      },

      POST: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = createMasterJenisDokumenSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const authError = await requireAdmin(request)
        if (authError) return authError

        const [existing] = await db
          .select({ id: masterJenisDokumen.id })
          .from(masterJenisDokumen)
          .where(and(
            eq(masterJenisDokumen.nama, result.data.nama),
            eq(masterJenisDokumen.isActive, true),
          ))
          .limit(1)

        if (existing) {
          return Response.json({ error: `Jenis dokumen "${result.data.nama}" sudah ada` }, { status: 409 })
        }

        try {
          const [data] = await db
            .insert(masterJenisDokumen)
            .values({
              nama: result.data.nama,
              deskripsi: result.data.deskripsi ?? null,
              isActive: true,
            })
            .returning(jenisDokumenSelection)

          if (!data) {
            return Response.json({ error: 'Gagal membuat jenis dokumen' }, { status: 500 })
          }

          return Response.json(data, { status: 201 })
        } catch (err) {
          console.error('[API DEBUG] Error in master-jenis-dokumen POST:', err)
          return Response.json({ error: 'Gagal membuat jenis dokumen' }, { status: 500 })
        }
      },
    },
  },
})
