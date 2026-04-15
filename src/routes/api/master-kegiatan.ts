import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getSession, hasRole } from '#/lib/auth'
import { createKegiatanSchema } from '#/lib/schemas/master-data'

export const Route = createFileRoute('/api/master-kegiatan')({
  server: {
    get: async ({ request }) => {
      const cookieHeader = request.headers.get('cookie')
      const mockEvent = {
        request,
        cookie: { get: () => undefined, set: () => {}, delete: () => {} },
      } as any
      const supabase = createServerSupabaseClient(mockEvent, cookieHeader)

      const url = new URL(request.url)
      const fungsiId = url.searchParams.get('fungsi_id')

      let query = supabase
        .from('master_kegiatan')
        .select('*, master_fungsi(id, nama)')
        .eq('is_active', true)
        .order('nama', { ascending: true })

      if (fungsiId) {
        query = query.eq('fungsi_id', fungsiId)
      }

      const { data, error } = await query

      if (error) {
        return Response.json({ error: 'Gagal mengambil data kegiatan' }, { status: 500 })
      }

      const result = (data ?? []).map((row: any) => ({
        ...row,
        fungsi_nama: row.master_fungsi?.nama,
      }))

      return Response.json(result)
    },

    post: async ({ request }) => {
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
        .eq('id', result.data.fungsi_id)
        .eq('is_active', true)
        .single()

      if (!fungsi) {
        return Response.json({ error: 'Fungsi tidak ditemukan atau tidak aktif' }, { status: 400 })
      }

      const { data: existing } = await supabase
        .from('master_kegiatan')
        .select('id')
        .eq('nama', result.data.nama)
        .eq('fungsi_id', result.data.fungsi_id)
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
          fungsi_id: result.data.fungsi_id,
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
})
