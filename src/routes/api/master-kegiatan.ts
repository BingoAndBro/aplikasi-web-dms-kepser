import { createFileRoute } from '@tanstack/react-router'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterFungsi, masterKegiatan } from '#/db/schema/master'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { createKegiatanSchema } from '#/lib/schemas/master-data'

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
          return Response.json({ error: 'Hanya ADMIN yang bisa menambah kegiatan' }, { status: 403 })
        }

        const { data: fungsi } = await supabase
          .from('master_fungsi')
          .select('id, nama')
          .eq('id', result.data.fungsiId)
          .eq('is_active', true)
          .single()

        if (!fungsi) {
          return Response.json({ error: 'Fungsi tidak ditemukan atau tidak aktif' }, { status: 400 })
        }

        const { data: existing } = await supabase
          .from('master_kegiatan')
          .select('id')
          .eq('nama', result.data.nama)
          .eq('fungsi_id', result.data.fungsiId)
          .eq('is_active', true)
          .single()

        if (existing) {
          return Response.json({
            error: `Kegiatan "${result.data.nama}" sudah ada di fungsi "${fungsi.nama}"`,
          }, { status: 409 })
        }

        const { data, error } = await supabase
          .from('master_kegiatan')
          .insert({
            fungsi_id: result.data.fungsiId,
            nama: result.data.nama,
            deskripsi: result.data.deskripsi ?? null,
          })
          .select('*, master_fungsi(nama)')
          .single()

        if (error) {
          return Response.json({ error: 'Gagal membuat kegiatan' }, { status: 500 })
        }

        const row = data as any
        return Response.json({
          ...row,
          fungsi_nama: row.master_fungsi?.nama,
        }, { status: 201 })
      },
    },
  },
})
