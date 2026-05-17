import { createFileRoute } from '@tanstack/react-router'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterJenisPermintaan, masterKategoriPermintaan } from '#/db/schema/master'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { createKategoriSchema } from '#/lib/schemas/master-data'

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
          return Response.json({ error: 'Hanya ADMIN yang bisa menambah kategori permintaan' }, { status: 403 })
        }

        const { data: jenis } = await supabase
          .from('master_jenis_permintaan')
          .select('id, nama')
          .eq('id', result.data.jenisPermintaanId)
          .eq('is_active', true)
          .single()

        if (!jenis) {
          return Response.json({ error: 'Jenis permintaan tidak ditemukan atau tidak aktif' }, { status: 400 })
        }

        const { data: existing } = await supabase
          .from('master_kategori_permintaan')
          .select('id')
          .eq('nama', result.data.nama)
          .eq('jenis_permintaan_id', result.data.jenisPermintaanId)
          .eq('is_active', true)
          .maybeSingle()

        if (existing) {
          return Response.json({
            error: `Kategori "${result.data.nama}" sudah ada di jenis "${jenis.nama}"`,
          }, { status: 409 })
        }

        const { data, error } = await supabase
          .from('master_kategori_permintaan')
          .insert({
            jenis_permintaan_id: result.data.jenisPermintaanId,
            nama: result.data.nama,
            deskripsi: result.data.deskripsi ?? null,
          })
          .select('*, master_jenis_permintaan(nama)')
          .single()

        if (error) {
          return Response.json({ error: 'Gagal membuat kategori permintaan' }, { status: 500 })
        }

        const row = data as any
        return Response.json({
          ...row,
          jenis_nama: row.master_jenis_permintaan?.nama,
        }, { status: 201 })
      },
    },
  },
})
