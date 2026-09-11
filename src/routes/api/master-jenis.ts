import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterJenisPermintaan, masterKomponen } from '#/db/schema/master'
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
          const url = new URL(request.url)
          const komponenId = url.searchParams.get('komponen_id')
          const filters = [eq(masterJenisPermintaan.isActive, true)]

          if (komponenId) {
            filters.push(eq(masterJenisPermintaan.komponenId, komponenId))
          }

          const rows = await db
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
            .where(and(...filters))
            .orderBy(asc(masterJenisPermintaan.nama))

          const result = rows.map((row) => ({
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
          }))

          return Response.json(result)
        } catch (err) {
          console.error('[API DEBUG] Error in master-jenis GET:', err)
          return Response.json({ error: 'Gagal mengambil data jenis permintaan' }, { status: 500 })
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

        const result = createJenisSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const authError = await requireAdmin(request)
        if (authError) return authError

        const [komponen] = await db
          .select({ id: masterKomponen.id, nama: masterKomponen.nama })
          .from(masterKomponen)
          .where(and(
            eq(masterKomponen.id, result.data.komponenId),
            eq(masterKomponen.isActive, true),
          ))
          .limit(1)

        if (!komponen) {
          return Response.json({ error: 'Komponen tidak ditemukan atau tidak aktif' }, { status: 400 })
        }

        const [existing] = await db
          .select({ id: masterJenisPermintaan.id })
          .from(masterJenisPermintaan)
          .where(and(
            eq(masterJenisPermintaan.nama, result.data.nama),
            eq(masterJenisPermintaan.komponenId, result.data.komponenId),
            eq(masterJenisPermintaan.isActive, true),
          ))
          .limit(1)

        if (existing) {
          return Response.json({
            error: `Jenis permintaan "${result.data.nama}" sudah ada di komponen "${komponen.nama}"`,
          }, { status: 409 })
        }

        try {
          const [data] = await db
            .insert(masterJenisPermintaan)
            .values({
              komponenId: result.data.komponenId,
              nama: result.data.nama,
              deskripsi: result.data.deskripsi ?? null,
            })
            .returning({
              id: masterJenisPermintaan.id,
              komponen_id: masterJenisPermintaan.komponenId,
              nama: masterJenisPermintaan.nama,
              deskripsi: masterJenisPermintaan.deskripsi,
              is_active: masterJenisPermintaan.isActive,
              created_at: masterJenisPermintaan.createdAt,
              updated_at: masterJenisPermintaan.updatedAt,
            })

          if (!data) {
            return Response.json({ error: 'Gagal membuat jenis permintaan' }, { status: 500 })
          }

          return Response.json({
            ...data,
            master_komponen: { nama: komponen.nama },
            komponen_nama: komponen.nama,
          }, { status: 201 })
        } catch (err) {
          console.error('[API DEBUG] Error in master-jenis POST:', err)
          return Response.json({ error: 'Gagal membuat jenis permintaan' }, { status: 500 })
        }
      },
    },
  },
})
