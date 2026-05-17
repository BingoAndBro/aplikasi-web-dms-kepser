import { createFileRoute } from '@tanstack/react-router'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import {
  masterDetailPermintaan,
  masterJenisPermintaan,
  masterKategoriPermintaan,
} from '#/db/schema/master'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { createDetailSchema } from '#/lib/schemas/master-data'

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

        const cookieHeader = request.headers.get('cookie')
        const mockEvent = {
          request,
          cookie: { get: () => undefined, set: () => {}, delete: () => {} },
        } as any
        const supabase = createServerSupabaseClient(mockEvent, cookieHeader)

        const session = await getSession(supabase)
        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const isAdmin = await hasRole(supabase, session.user.id, 'ADMIN')
        if (!isAdmin) {
          return Response.json({ error: 'Hanya ADMIN yang bisa menambah detail permintaan' }, { status: 403 })
        }

        const { data: kategori } = await supabase
          .from('master_kategori_permintaan')
          .select('id, nama')
          .eq('id', result.data.kategoriPermintaanId)
          .eq('is_active', true)
          .single()

        if (!kategori) {
          return Response.json({ error: 'Kategori permintaan tidak ditemukan atau tidak aktif' }, { status: 400 })
        }

        const { data: existing } = await supabase
          .from('master_detail_permintaan')
          .select('id')
          .eq('nama', result.data.nama)
          .eq('kategori_permintaan_id', result.data.kategoriPermintaanId)
          .eq('is_active', true)
          .maybeSingle()

        if (existing) {
          return Response.json({
            error: `Detail "${result.data.nama}" sudah ada di kategori "${kategori.nama}"`,
          }, { status: 409 })
        }

        const { data, error } = await supabase
          .from('master_detail_permintaan')
          .insert({
            kategori_permintaan_id: result.data.kategoriPermintaanId,
            nama: result.data.nama,
            deskripsi: result.data.deskripsi ?? null,
          })
          .select('*, master_kategori_permintaan(nama, master_jenis_permintaan(nama))')
          .single()

        if (error) {
          return Response.json({ error: 'Gagal membuat detail permintaan' }, { status: 500 })
        }

        const row = data as any
        return Response.json({
          ...row,
          kategori_nama: row.master_kategori_permintaan?.nama,
          jenis_nama: row.master_kategori_permintaan?.master_jenis_permintaan?.nama,
        }, { status: 201 })
      },
    },
  },
})
