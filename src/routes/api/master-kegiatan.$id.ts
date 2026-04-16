import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { updateKegiatanSchema } from '#/lib/schemas/master-data'

export const Route = createFileRoute('/api/master-kegiatan/$id')({
  server: {
    handlers: {
      PATCH: async ({ params, request }: { params: Record<string, string>; request: Request }) => {
        const { id } = params

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = updateKegiatanSchema.safeParse(body)
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
          return Response.json({ error: 'Hanya ADMIN yang bisa mengubah kegiatan' }, { status: 403 })
        }

        const { data: existing } = await supabase
          .from('master_kegiatan')
          .select('id, fungsi_id, nama')
          .eq('id', id)
          .single()

        if (!existing) {
          return Response.json({ error: 'Kegiatan tidak ditemukan' }, { status: 404 })
        }

        if (result.data.fungsiId && result.data.fungsiId !== existing.fungsi_id) {
          const { data: fungsi } = await supabase
            .from('master_fungsi')
            .select('id')
            .eq('id', result.data.fungsiId)
            .eq('is_active', true)
            .single()

          if (!fungsi) {
            return Response.json({ error: 'Fungsi tidak ditemukan atau tidak aktif' }, { status: 400 })
          }
        }

        if (result.data.nama) {
          const fungsiId = result.data.fungsiId ?? existing.fungsi_id
          const { data: duplicate } = await supabase
            .from('master_kegiatan')
            .select('id')
            .eq('nama', result.data.nama)
            .eq('fungsi_id', fungsiId)
            .eq('is_active', true)
            .neq('id', id)
            .single()

          if (duplicate) {
            return Response.json({ error: `Kegiatan "${result.data.nama}" sudah ada` }, { status: 409 })
          }
        }

        const { data, error } = await supabase
          .from('master_kegiatan')
          .update(result.data)
          .eq('id', id)
          .select('*, master_fungsi(nama)')
          .single()

        if (error) {
          return Response.json({ error: 'Gagal mengupdate kegiatan' }, { status: 500 })
        }

        const row = data as any
        return Response.json({
          ...row,
          fungsi_nama: row.master_fungsi?.nama,
        }, { status: 200 })
      },

      DELETE: async ({ params, request }: { params: Record<string, string>; request: Request }) => {
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
          return Response.json({ error: 'Hanya ADMIN yang bisa menghapus kegiatan' }, { status: 403 })
        }

        const { data: existing } = await supabase
          .from('master_kegiatan')
          .select('id, nama')
          .eq('id', id)
          .single()

        if (!existing) {
          return Response.json({ error: 'Kegiatan tidak ditemukan' }, { status: 404 })
        }

        const { error } = await supabase
          .from('master_kegiatan')
          .update({ is_active: false })
          .eq('id', id)

        if (error) {
          return Response.json({ error: 'Gagal menghapus kegiatan' }, { status: 500 })
        }

        return Response.json({
          success: true,
          message: `Kegiatan "${existing.nama}" berhasil dinonaktifkan`,
        }, { status: 200 })
      },
    },
  },
})
