import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterKegiatan, masterKomponen } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { createKomponenSchema } from '#/lib/schemas/master-data'

async function requireAdmin(request: Request) {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: 'Hanya ADMIN yang bisa menambah komponen' }, { status: 403 })
  }
  return null
}

export const Route = createFileRoute('/api/master-komponen')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        // Public read endpoint: master data powers form dropdowns; mutations below remain ADMIN-only.
        try {
          const url = new URL(request.url)
          const kegiatanId = url.searchParams.get('kegiatan_id')
          const filters = [eq(masterKomponen.isActive, true)]

          if (kegiatanId) {
            filters.push(eq(masterKomponen.kegiatanId, kegiatanId))
          }

          const rows = await db
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
            .where(and(...filters))
            .orderBy(asc(masterKomponen.nama))

          const result = rows.map((row) => ({
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
          }))

          return Response.json(result)
        } catch (err) {
          console.error('[API DEBUG] Error in master-komponen GET:', err)
          return Response.json({ error: 'Gagal mengambil data komponen' }, { status: 500 })
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

        const result = createKomponenSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const authError = await requireAdmin(request)
        if (authError) return authError

        const [kegiatan] = await db
          .select({ id: masterKegiatan.id, nama: masterKegiatan.nama })
          .from(masterKegiatan)
          .where(and(
            eq(masterKegiatan.id, result.data.kegiatanId),
            eq(masterKegiatan.isActive, true),
          ))
          .limit(1)

        if (!kegiatan) {
          return Response.json({ error: 'Kegiatan tidak ditemukan atau tidak aktif' }, { status: 400 })
        }

        const [existing] = await db
          .select({ id: masterKomponen.id })
          .from(masterKomponen)
          .where(and(
            eq(masterKomponen.nama, result.data.nama),
            eq(masterKomponen.kegiatanId, result.data.kegiatanId),
            eq(masterKomponen.isActive, true),
          ))
          .limit(1)

        if (existing) {
          return Response.json({
            error: `Komponen "${result.data.nama}" sudah ada di kegiatan "${kegiatan.nama}"`,
          }, { status: 409 })
        }

        try {
          const [row] = await db
            .insert(masterKomponen)
            .values({
              kegiatanId: result.data.kegiatanId,
              nama: result.data.nama,
              deskripsi: result.data.deskripsi ?? null,
            })
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
            return Response.json({ error: 'Gagal membuat komponen' }, { status: 500 })
          }

          return Response.json({
            ...row,
            master_kegiatan: { nama: kegiatan.nama },
            kegiatan_nama: kegiatan.nama,
          }, { status: 201 })
        } catch (err) {
          console.error('[API DEBUG] Error in master-komponen POST:', err)
          return Response.json({ error: 'Gagal membuat komponen' }, { status: 500 })
        }
      },
    },
  },
})
