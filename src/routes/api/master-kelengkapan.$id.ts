import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getSession, hasRole } from '#/lib/auth'
import { updateKelengkapanSchema } from '#/lib/schemas/master-data'

export const Route = createFileRoute('/api/master-kelengkapan/$id')({
  server: {
    patch: async ({ params, request }) => {
      const { id } = params

      let body: unknown
      try {
        body = await request.json()
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
      }

      const result = updateKelengkapanSchema.safeParse(body)
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
        return Response.json({ error: 'Hanya ADMIN yang bisa mengubah kelengkapan' }, { status: 403 })
      }

      const { data: existing } = await supabase
        .from('master_kelengkapan_dokumen')
        .select('id')
        .eq('id', id)
        .single()

      if (!existing) {
        return Response.json({ error: 'Kelengkapan tidak ditemukan' }, { status: 404 })
      }

      const { data, error } = await supabase
        .from('master_kelengkapan_dokumen')
        .update(result.data)
        .eq('id', id)
        .select('*, master_kegiatan(nama, master_fungsi(nama))')
        .single()

      if (error) {
        return Response.json({ error: 'Gagal mengupdate kelengkapan' }, { status: 500 })
      }

      const row = data as any
      return Response.json({
        ...row,
        kegiatan_nama: row.master_kegiatan?.nama,
        fungsi_nama: row.master_kegiatan?.master_fungsi?.nama,
      }, { status: 200 })
    },

    delete: async ({ params, request }) => {
      const { id } = params

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
        return Response.json({ error: 'Hanya ADMIN yang bisa menghapus kelengkapan' }, { status: 403 })
      }

      const { data: existing } = await supabase
        .from('master_kelengkapan_dokumen')
        .select('id, nama_dokumen')
        .eq('id', id)
        .single()

      if (!existing) {
        return Response.json({ error: 'Kelengkapan tidak ditemukan' }, { status: 404 })
      }

      const { error } = await supabase
        .from('master_kelengkapan_dokumen')
        .delete()
        .eq('id', id)

      if (error) {
        return Response.json({ error: 'Gagal menghapus kelengkapan' }, { status: 500 })
      }

      return Response.json({
        success: true,
        message: `Kelengkapan "${existing.nama_dokumen}" berhasil dihapus`,
      }, { status: 200 })
    },
  },
})
