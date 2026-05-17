import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { masterJenisPermintaan } from '#/db/schema/master'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { updateJenisSchema } from '#/lib/schemas/master-data'

export const Route = createFileRoute('/api/master-jenis/$id')({
  server: {
    handlers: {
      GET: async ({ params }: { request: Request; params: { id: string } }) => {
        // Public read endpoint: master data powers form dropdowns; mutations below remain ADMIN-only.
        try {
          const [data] = await db
            .select({
              id: masterJenisPermintaan.id,
              nama: masterJenisPermintaan.nama,
              deskripsi: masterJenisPermintaan.deskripsi,
              is_active: masterJenisPermintaan.isActive,
              created_at: masterJenisPermintaan.createdAt,
              updated_at: masterJenisPermintaan.updatedAt,
            })
            .from(masterJenisPermintaan)
            .where(eq(masterJenisPermintaan.id, params.id))
            .limit(1)

          if (!data) {
            return Response.json({ error: 'Jenis permintaan tidak ditemukan' }, { status: 404 })
          }

          return Response.json(data)
        } catch (err) {
          console.error('[API DEBUG] Error in master-jenis/$id GET:', err)
          return Response.json({ error: 'Gagal mengambil data jenis permintaan' }, { status: 500 })
        }
      },

      PATCH: async ({ request, params }: { request: Request; params: { id: string } }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const result = updateJenisSchema.safeParse(body)
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
          return Response.json({ error: 'Hanya ADMIN yang bisa mengubah jenis permintaan' }, { status: 403 })
        }

        const updates: Record<string, any> = {}
        if (result.data.nama !== undefined) updates.nama = result.data.nama
        if (result.data.deskripsi !== undefined) updates.deskripsi = result.data.deskripsi
        if (result.data.isActive !== undefined) updates.is_active = result.data.isActive

        const { data, error } = await supabase
          .from('master_jenis_permintaan')
          .update(updates)
          .eq('id', params.id)
          .select()
          .single()

        if (error) {
          return Response.json({ error: 'Gagal mengubah jenis permintaan' }, { status: 500 })
        }

        return Response.json(data)
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
          return Response.json({ error: 'Hanya ADMIN yang bisa menghapus jenis permintaan' }, { status: 403 })
        }

        // Soft delete: set is_active = false
        const { error } = await supabase
          .from('master_jenis_permintaan')
          .update({ is_active: false })
          .eq('id', params.id)

        if (error) {
          return Response.json({ error: 'Gagal menghapus jenis permintaan' }, { status: 500 })
        }

        return Response.json({ success: true })
      },
    },
  },
})
