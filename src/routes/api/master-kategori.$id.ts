import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { updateKategoriSchema } from '#/lib/schemas/master-data'

export const Route = createFileRoute('/api/master-kategori/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { id: string } }) => {
        // Public read endpoint: master data powers form dropdowns; mutations below remain ADMIN-only.
        const cookieHeader = request.headers.get('cookie')
        const mockEvent = {
          request,
          cookie: { get: () => undefined, set: () => {}, delete: () => {} },
        } as any
        const supabase = createServerSupabaseClient(mockEvent, cookieHeader)

        const { data, error } = await supabase
          .from('master_kategori_permintaan')
          .select('*, master_jenis_permintaan(id, nama)')
          .eq('id', params.id)
          .single()

        if (error || !data) {
          return Response.json({ error: 'Kategori permintaan tidak ditemukan' }, { status: 404 })
        }

        const row = data as any
        return Response.json({
          ...row,
          jenis_nama: row.master_jenis_permintaan?.nama,
        })
      },

      PATCH: async ({ request, params }: { request: Request; params: { id: string } }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = updateKategoriSchema.safeParse(body)
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
          return Response.json({ error: 'Hanya ADMIN yang bisa mengubah kategori permintaan' }, { status: 403 })
        }

        const updates: Record<string, any> = {}
        if (result.data.jenisPermintaanId !== undefined) updates.jenis_permintaan_id = result.data.jenisPermintaanId
        if (result.data.nama !== undefined) updates.nama = result.data.nama
        if (result.data.deskripsi !== undefined) updates.deskripsi = result.data.deskripsi
        if (result.data.isActive !== undefined) updates.is_active = result.data.isActive

        const { data, error } = await supabase
          .from('master_kategori_permintaan')
          .update(updates)
          .eq('id', params.id)
          .select('*, master_jenis_permintaan(nama)')
          .single()

        if (error) {
          return Response.json({ error: 'Gagal mengubah kategori permintaan' }, { status: 500 })
        }

        const row = data as any
        return Response.json({
          ...row,
          jenis_nama: row.master_jenis_permintaan?.nama,
        })
      },

      DELETE: async ({ request, params }: { request: Request; params: { id: string } }) => {
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
          return Response.json({ error: 'Hanya ADMIN yang bisa menghapus kategori permintaan' }, { status: 403 })
        }

        const { error } = await supabase
          .from('master_kategori_permintaan')
          .update({ is_active: false })
          .eq('id', params.id)

        if (error) {
          return Response.json({ error: 'Gagal menghapus kategori permintaan' }, { status: 500 })
        }

        return Response.json({ success: true })
      },
    },
  },
})
