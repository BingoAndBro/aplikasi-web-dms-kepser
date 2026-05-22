import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterJenisPermintaan, masterKategoriPermintaan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { createKategoriSchema } from '#/lib/schemas/master-data'

async function requireAdmin(request: Request) {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: 'Hanya ADMIN yang bisa menambah kategori permintaan' }, { status: 403 })
  }
  return null
}

export const Route = createFileRoute('/api/master-kategori')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        // Public read endpoint: master data powers form dropdowns; mutations below remain ADMIN-only.
        try {
          const url = new URL(request.url)
          const jenisId = url.searchParams.get('jenis_id')
          const filters = [eq(masterKategoriPermintaan.isActive, true)]

          if (jenisId) {
            filters.push(eq(masterKategoriPermintaan.jenisPermintaanId, jenisId))
          }

          const rows = await db
            .select({
              id: masterKategoriPermintaan.id,
              jenis_permintaan_id: masterKategoriPermintaan.jenisPermintaanId,
              nama: masterKategoriPermintaan.nama,
              deskripsi: masterKategoriPermintaan.deskripsi,
              is_active: masterKategoriPermintaan.isActive,
              created_at: masterKategoriPermintaan.createdAt,
              updated_at: masterKategoriPermintaan.updatedAt,
              master_jenis_permintaan_id: masterJenisPermintaan.id,
              master_jenis_permintaan_nama: masterJenisPermintaan.nama,
            })
            .from(masterKategoriPermintaan)
            .leftJoin(
              masterJenisPermintaan,
              eq(masterKategoriPermintaan.jenisPermintaanId, masterJenisPermintaan.id),
            )
            .where(and(...filters))
            .orderBy(asc(masterKategoriPermintaan.nama))

          const result = rows.map((row) => ({
            id: row.id,
            jenis_permintaan_id: row.jenis_permintaan_id,
            nama: row.nama,
            deskripsi: row.deskripsi,
            is_active: row.is_active,
            created_at: row.created_at,
            updated_at: row.updated_at,
            master_jenis_permintaan: row.master_jenis_permintaan_id
              ? { id: row.master_jenis_permintaan_id, nama: row.master_jenis_permintaan_nama }
              : null,
            jenis_nama: row.master_jenis_permintaan_nama ?? undefined,
          }))

          return Response.json(result)
        } catch (err) {
          console.error('[API DEBUG] Error in master-kategori GET:', err)
          return Response.json({ error: 'Gagal mengambil data kategori permintaan' }, { status: 500 })
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

        const result = createKategoriSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const authError = await requireAdmin(request)
        if (authError) return authError

        const [jenis] = await db
          .select({ id: masterJenisPermintaan.id, nama: masterJenisPermintaan.nama })
          .from(masterJenisPermintaan)
          .where(and(
            eq(masterJenisPermintaan.id, result.data.jenisPermintaanId),
            eq(masterJenisPermintaan.isActive, true),
          ))
          .limit(1)

        if (!jenis) {
          return Response.json({ error: 'Jenis permintaan tidak ditemukan atau tidak aktif' }, { status: 400 })
        }

        const [existing] = await db
          .select({ id: masterKategoriPermintaan.id })
          .from(masterKategoriPermintaan)
          .where(and(
            eq(masterKategoriPermintaan.nama, result.data.nama),
            eq(masterKategoriPermintaan.jenisPermintaanId, result.data.jenisPermintaanId),
            eq(masterKategoriPermintaan.isActive, true),
          ))
          .limit(1)

        if (existing) {
          return Response.json({
            error: `Kategori "${result.data.nama}" sudah ada di jenis "${jenis.nama}"`,
          }, { status: 409 })
        }

        try {
          const [row] = await db
            .insert(masterKategoriPermintaan)
            .values({
              jenisPermintaanId: result.data.jenisPermintaanId,
              nama: result.data.nama,
              deskripsi: result.data.deskripsi ?? null,
            })
            .returning({
              id: masterKategoriPermintaan.id,
              jenis_permintaan_id: masterKategoriPermintaan.jenisPermintaanId,
              nama: masterKategoriPermintaan.nama,
              deskripsi: masterKategoriPermintaan.deskripsi,
              is_active: masterKategoriPermintaan.isActive,
              created_at: masterKategoriPermintaan.createdAt,
              updated_at: masterKategoriPermintaan.updatedAt,
            })

          if (!row) {
            return Response.json({ error: 'Gagal membuat kategori permintaan' }, { status: 500 })
          }

          return Response.json({
            ...row,
            master_jenis_permintaan: { nama: jenis.nama },
            jenis_nama: jenis.nama,
          }, { status: 201 })
        } catch (err) {
          console.error('[API DEBUG] Error in master-kategori POST:', err)
          return Response.json({ error: 'Gagal membuat kategori permintaan' }, { status: 500 })
        }
      },
    },
  },
})
