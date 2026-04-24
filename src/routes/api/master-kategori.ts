import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { createKategoriSchema } from '#/lib/schemas/master-data'

export const Route = createFileRoute('/api/master-kategori')({
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
        const jenisId = url.searchParams.get('jenis_id')

        let query = supabase
          .from('master_kategori_permintaan')
          .select('*, master_jenis_permintaan(id, nama)')
          .eq('is_active', true)
          .order('nama', { ascending: true })

        if (jenisId) {
          query = query.eq('jenis_permintaan_id', jenisId)
        }

        const { data, error } = await query

        if (error) {
          return Response.json({ error: 'Gagal mengambil data kategori permintaan' }, { status: 500 })
        }

        const result = (data ?? []).map((row: any) => ({
          ...row,
          jenis_nama: row.master_jenis_permintaan?.nama,
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
