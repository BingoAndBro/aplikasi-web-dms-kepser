import { createFileRoute } from '@tanstack/react-router'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterFungsi, masterKegiatan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { createKegiatanSchema } from '#/lib/schemas/master-data'

async function requireAdmin(request: Request) {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: 'Hanya ADMIN yang bisa menambah kegiatan' }, { status: 403 })
  }
  return null
}

export const Route = createFileRoute('/api/master-kegiatan')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        // Public read endpoint: master data powers form dropdowns; mutations below remain ADMIN-only.
        try {
          const url = new URL(request.url)
          const fungsiId = url.searchParams.get('fungsi_id')
          const filters = [eq(masterKegiatan.isActive, true)]

          if (fungsiId) {
            filters.push(eq(masterKegiatan.fungsiId, fungsiId))
          }

          const rows = await db
            .select({
              id: masterKegiatan.id,
              fungsi_id: masterKegiatan.fungsiId,
              nama: masterKegiatan.nama,
              deskripsi: masterKegiatan.deskripsi,
              is_active: masterKegiatan.isActive,
              created_at: masterKegiatan.createdAt,
              updated_at: masterKegiatan.updatedAt,
              master_fungsi_id: masterFungsi.id,
              master_fungsi_nama: masterFungsi.nama,
            })
            .from(masterKegiatan)
            .leftJoin(masterFungsi, eq(masterKegiatan.fungsiId, masterFungsi.id))
            .where(and(...filters))
            .orderBy(asc(masterKegiatan.nama))

          const result = rows.map((row) => ({
            id: row.id,
            fungsi_id: row.fungsi_id,
            nama: row.nama,
            deskripsi: row.deskripsi,
            is_active: row.is_active,
            created_at: row.created_at,
            updated_at: row.updated_at,
            master_fungsi: row.master_fungsi_id
              ? { id: row.master_fungsi_id, nama: row.master_fungsi_nama }
              : null,
            fungsi_nama: row.master_fungsi_nama ?? undefined,
          }))

          return Response.json(result)
        } catch (err) {
          console.error('[API DEBUG] Error in master-kegiatan GET:', err)
          return Response.json({ error: 'Gagal mengambil data kegiatan' }, { status: 500 })
        }
      },

      POST: async ({ request }: { request: Request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = createKegiatanSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const authError = await requireAdmin(request)
        if (authError) return authError

        const [fungsi] = await db
          .select({ id: masterFungsi.id, nama: masterFungsi.nama })
          .from(masterFungsi)
          .where(and(
            eq(masterFungsi.id, result.data.fungsiId),
            eq(masterFungsi.isActive, true),
          ))
          .limit(1)

        if (!fungsi) {
          return Response.json({ error: 'Fungsi tidak ditemukan atau tidak aktif' }, { status: 400 })
        }

        const [existing] = await db
          .select({ id: masterKegiatan.id })
          .from(masterKegiatan)
          .where(and(
            eq(masterKegiatan.nama, result.data.nama),
            eq(masterKegiatan.fungsiId, result.data.fungsiId),
            eq(masterKegiatan.isActive, true),
          ))
          .limit(1)

        if (existing) {
          return Response.json({
            error: `Kegiatan "${result.data.nama}" sudah ada di fungsi "${fungsi.nama}"`,
          }, { status: 409 })
        }

        try {
          const [row] = await db
            .insert(masterKegiatan)
            .values({
              fungsiId: result.data.fungsiId,
              nama: result.data.nama,
              deskripsi: result.data.deskripsi ?? null,
            })
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
            return Response.json({ error: 'Gagal membuat kegiatan' }, { status: 500 })
          }

          return Response.json({
            ...row,
            master_fungsi: { nama: fungsi.nama },
            fungsi_nama: fungsi.nama,
          }, { status: 201 })
        } catch (err) {
          console.error('[API DEBUG] Error in master-kegiatan POST:', err)
          return Response.json({ error: 'Gagal membuat kegiatan' }, { status: 500 })
        }
      },
    },
  },
})
