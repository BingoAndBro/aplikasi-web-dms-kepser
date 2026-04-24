import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { createDetailSchema } from '#/lib/schemas/master-data'

export const Route = createFileRoute('/api/master-detail')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const cookieHeader = request.headers.get('cookie')
        const mockEvent = {
          request,
          cookie: { get: () => undefined, set: () => {}, delete: () => {} },
        } as any
        const supabase = createServerSupabaseClient(mockEvent, cookieHeader)

        const url = new URL(request.url)
        const kategoriId = url.searchParams.get('kategori_id')

        let query = supabase
          .from('master_detail_permintaan')
          .select('*, master_kategori_permintaan(id, nama, master_jenis_permintaan(nama))')
          .eq('is_active', true)
          .order('nama', { ascending: true })

        if (kategoriId) {
          query = query.eq('kategori_permintaan_id', kategoriId)
        }

        const { data, error } = await query

        if (error) {
          return Response.json({ error: 'Gagal mengambil data detail permintaan' }, { status: 500 })
        }

        const result = (data ?? []).map((row: any) => ({
          ...row,
          kategori_nama: row.master_kategori_permintaan?.nama,
          jenis_nama: row.master_kategori_permintaan?.master_jenis_permintaan?.nama,
        }))

        return Response.json(result)
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
