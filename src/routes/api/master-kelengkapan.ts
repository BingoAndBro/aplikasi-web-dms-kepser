import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { createKelengkapanSchema } from '#/lib/schemas/master-data'

export const Route = createFileRoute('/api/master-kelengkapan')({
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
        const kegiatanId = url.searchParams.get('kegiatan_id')
        const isKetuaTim = url.searchParams.get('is_ketua_tim')

        let query = supabase
          .from('master_kelengkapan_dokumen')
          .select('*, master_kegiatan(nama, master_fungsi(nama))')

        if (kegiatanId) {
          query = query.eq('kegiatan_id', kegiatanId)
        }

        if (isKetuaTim !== null) {
          query = query.eq('is_ketua_tim', isKetuaTim === 'true')
        }

        query = query.order('is_ketua_tim', { ascending: true })
          .order('nama_dokumen', { ascending: true })

        const { data, error } = await query

        if (error) {
          return Response.json({ error: 'Gagal mengambil data kelengkapan' }, { status: 500 })
        }

        const result = (data ?? []).map((row: any) => ({
          ...row,
          kegiatan_nama: row.master_kegiatan?.nama,
          fungsi_nama: row.master_kegiatan?.master_fungsi?.nama,
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

        const result = createKelengkapanSchema.safeParse(body)
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
          return Response.json({ error: 'Hanya ADMIN yang bisa menambah kelengkapan' }, { status: 403 })
        }

        const { data: kegiatan } = await supabase
          .from('master_kegiatan')
          .select('id')
          .eq('id', result.data.kegiatanId)
          .eq('is_active', true)
          .single()

        if (!kegiatan) {
          return Response.json({ error: 'Kegiatan tidak ditemukan atau tidak aktif' }, { status: 400 })
        }

        const { data, error } = await supabase
          .from('master_kelengkapan_dokumen')
          .insert({
            kegiatan_id: result.data.kegiatanId,
            is_ketua_tim: result.data.isKetuaTim,
            nama_dokumen: result.data.namaDokumen,
            required: result.data.required,
          })
          .select('*, master_kegiatan(nama, master_fungsi(nama))')
          .single()

        if (error) {
          return Response.json({ error: 'Gagal menambah kelengkapan' }, { status: 500 })
        }

        const row = data as any
        return Response.json({
          ...row,
          kegiatan_nama: row.master_kegiatan?.nama,
          fungsi_nama: row.master_kegiatan?.master_fungsi?.nama,
        }, { status: 201 })
      },
    },
  },
})
