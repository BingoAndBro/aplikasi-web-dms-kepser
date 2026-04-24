import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { createJenisSchema } from '#/lib/schemas/master-data'

export const Route = createFileRoute('/api/master-jenis')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const cookieHeader = request.headers.get('cookie')
        const mockEvent = {
          request,
          cookie: { get: () => undefined, set: () => {}, delete: () => {} },
        } as any
        const supabase = createServerSupabaseClient(mockEvent, cookieHeader)

        const { data, error } = await supabase
          .from('master_jenis_permintaan')
          .select('*')
          .eq('is_active', true)
          .order('nama', { ascending: true })

        if (error) {
          return Response.json({ error: 'Gagal mengambil data jenis permintaan' }, { status: 500 })
        }

        return Response.json(data ?? [])
      },

      POST: async ({ request }: { request: Request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = createJenisSchema.safeParse(body)
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
          return Response.json({ error: 'Hanya ADMIN yang bisa menambah jenis permintaan' }, { status: 403 })
        }

        const { data: existing } = await supabase
          .from('master_jenis_permintaan')
          .select('id')
          .eq('nama', result.data.nama)
          .eq('is_active', true)
          .maybeSingle()

        if (existing) {
          return Response.json({
            error: `Jenis permintaan "${result.data.nama}" sudah ada`,
          }, { status: 409 })
        }

        const { data, error } = await supabase
          .from('master_jenis_permintaan')
          .insert({
            nama: result.data.nama,
            deskripsi: result.data.deskripsi ?? null,
          })
          .select()
          .single()

        if (error) {
          return Response.json({ error: 'Gagal membuat jenis permintaan' }, { status: 500 })
        }

        return Response.json(data, { status: 201 })
      },
    },
  },
})
