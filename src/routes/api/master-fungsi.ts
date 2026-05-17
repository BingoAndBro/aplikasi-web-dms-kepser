
import { createFileRoute } from '@tanstack/react-router'
import { asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterFungsi } from '#/db/schema/master'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { createFungsiSchema } from '#/lib/schemas/master-data'

export const Route = createFileRoute('/api/master-fungsi')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        // Public read endpoint: master data powers form dropdowns; mutations below remain ADMIN-only.
        try {
          const data = await db
            .select({
              id: masterFungsi.id,
              nama: masterFungsi.nama,
              deskripsi: masterFungsi.deskripsi,
              is_active: masterFungsi.isActive,
              created_at: masterFungsi.createdAt,
              updated_at: masterFungsi.updatedAt,
            })
            .from(masterFungsi)
            .where(eq(masterFungsi.isActive, true))
            .orderBy(asc(masterFungsi.nama))

          return Response.json(data, {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (err) {
          console.error('[API DEBUG] Error in master-fungsi GET:', err)
          return Response.json({ error: 'Gagal mengambil data fungsi' }, { status: 500 })
        }
      },

      POST: async ({ request }: { request: Request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = createFungsiSchema.safeParse(body)
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
          return Response.json({ error: 'Hanya ADMIN yang bisa menambah fungsi' }, { status: 403 })
        }

        // Cek duplikat nama
        const { data: existing } = await supabase
          .from('master_fungsi')
          .select('id')
          .eq('nama', result.data.nama)
          .eq('is_active', true)
          .single()

        if (existing) {
          return Response.json({ error: `Nama fungsi "${result.data.nama}" sudah ada` }, { status: 409 })
        }

        const { data, error } = await supabase
          .from('master_fungsi')
          .insert({
            nama: result.data.nama,
            deskripsi: result.data.deskripsi ?? null,
          })
          .select()
          .single()

        if (error) {
          return Response.json({ error: 'Gagal membuat fungsi' }, { status: 500 })
        }

        return Response.json(data, { status: 201 })
      },
    },
  },
})
