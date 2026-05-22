import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import {
  masterDetailPermintaan,
  masterJenisPermintaan,
  masterKategoriPermintaan,
} from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { createDetailSchema } from '#/lib/schemas/master-data'

async function requireAdmin(request: Request) {
  const session = await getLocalServerSession(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasLocalRole(session, 'ADMIN')) {
    return Response.json({ error: 'Hanya ADMIN yang bisa menambah detail permintaan' }, { status: 403 })
  }
  return null
}

export const Route = createFileRoute('/api/master-detail')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        // Public read endpoint: master data powers form dropdowns; mutations below remain ADMIN-only.
        try {
          const url = new URL(request.url)
          const kategoriId = url.searchParams.get('kategori_id')
          const filters = [eq(masterDetailPermintaan.isActive, true)]

          if (kategoriId) {
            filters.push(eq(masterDetailPermintaan.kategoriPermintaanId, kategoriId))
          }

          const rows = await db
            .select({
              id: masterDetailPermintaan.id,
              kategori_permintaan_id: masterDetailPermintaan.kategoriPermintaanId,
              nama: masterDetailPermintaan.nama,
              deskripsi: masterDetailPermintaan.deskripsi,
              is_active: masterDetailPermintaan.isActive,
              created_at: masterDetailPermintaan.createdAt,
              updated_at: masterDetailPermintaan.updatedAt,
              master_kategori_permintaan_id: masterKategoriPermintaan.id,
              master_kategori_permintaan_nama: masterKategoriPermintaan.nama,
              master_jenis_permintaan_nama: masterJenisPermintaan.nama,
            })
            .from(masterDetailPermintaan)
            .leftJoin(
              masterKategoriPermintaan,
              eq(masterDetailPermintaan.kategoriPermintaanId, masterKategoriPermintaan.id),
            )
            .leftJoin(
              masterJenisPermintaan,
              eq(masterKategoriPermintaan.jenisPermintaanId, masterJenisPermintaan.id),
            )
            .where(and(...filters))
            .orderBy(asc(masterDetailPermintaan.nama))

          const result = rows.map((row) => ({
            id: row.id,
            kategori_permintaan_id: row.kategori_permintaan_id,
            nama: row.nama,
            deskripsi: row.deskripsi,
            is_active: row.is_active,
            created_at: row.created_at,
            updated_at: row.updated_at,
            master_kategori_permintaan: row.master_kategori_permintaan_id
              ? {
                  id: row.master_kategori_permintaan_id,
                  nama: row.master_kategori_permintaan_nama,
                  master_jenis_permintaan: row.master_jenis_permintaan_nama
                    ? { nama: row.master_jenis_permintaan_nama }
                    : null,
                }
              : null,
            kategori_nama: row.master_kategori_permintaan_nama ?? undefined,
            jenis_nama: row.master_jenis_permintaan_nama ?? undefined,
          }))

          return Response.json(result)
        } catch (err) {
          console.error('[API DEBUG] Error in master-detail GET:', err)
          return Response.json({ error: 'Gagal mengambil data detail permintaan' }, { status: 500 })
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

        const result = createDetailSchema.safeParse(body)
        if (!result.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: result.error.flatten(),
          }, { status: 400 })
        }

        const authError = await requireAdmin(request)
        if (authError) return authError

        const [kategori] = await db
          .select({
            id: masterKategoriPermintaan.id,
            nama: masterKategoriPermintaan.nama,
            jenis_nama: masterJenisPermintaan.nama,
          })
          .from(masterKategoriPermintaan)
          .leftJoin(
            masterJenisPermintaan,
            eq(masterKategoriPermintaan.jenisPermintaanId, masterJenisPermintaan.id),
          )
          .where(and(
            eq(masterKategoriPermintaan.id, result.data.kategoriPermintaanId),
            eq(masterKategoriPermintaan.isActive, true),
          ))
          .limit(1)

        if (!kategori) {
          return Response.json({ error: 'Kategori permintaan tidak ditemukan atau tidak aktif' }, { status: 400 })
        }

        const [existing] = await db
          .select({ id: masterDetailPermintaan.id })
          .from(masterDetailPermintaan)
          .where(and(
            eq(masterDetailPermintaan.nama, result.data.nama),
            eq(masterDetailPermintaan.kategoriPermintaanId, result.data.kategoriPermintaanId),
            eq(masterDetailPermintaan.isActive, true),
          ))
          .limit(1)

        if (existing) {
          return Response.json({
            error: `Detail "${result.data.nama}" sudah ada di kategori "${kategori.nama}"`,
          }, { status: 409 })
        }

        try {
          const [row] = await db
            .insert(masterDetailPermintaan)
            .values({
              kategoriPermintaanId: result.data.kategoriPermintaanId,
              nama: result.data.nama,
              deskripsi: result.data.deskripsi ?? null,
            })
            .returning({
              id: masterDetailPermintaan.id,
              kategori_permintaan_id: masterDetailPermintaan.kategoriPermintaanId,
              nama: masterDetailPermintaan.nama,
              deskripsi: masterDetailPermintaan.deskripsi,
              is_active: masterDetailPermintaan.isActive,
              created_at: masterDetailPermintaan.createdAt,
              updated_at: masterDetailPermintaan.updatedAt,
            })

          if (!row) {
            return Response.json({ error: 'Gagal membuat detail permintaan' }, { status: 500 })
          }

          return Response.json({
            ...row,
            master_kategori_permintaan: {
              nama: kategori.nama,
              master_jenis_permintaan: kategori.jenis_nama ? { nama: kategori.jenis_nama } : null,
            },
            kategori_nama: kategori.nama,
            jenis_nama: kategori.jenis_nama,
          }, { status: 201 })
        } catch (err) {
          console.error('[API DEBUG] Error in master-detail POST:', err)
          return Response.json({ error: 'Gagal membuat detail permintaan' }, { status: 500 })
        }
      },
    },
  },
})
