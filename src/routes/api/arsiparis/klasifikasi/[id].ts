import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession, hasRole } from '#/lib/auth'
import { z } from 'zod'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// PATCH /api/arsiparis/klasifikasi/[id] — update klasifikasi (ADMIN only)
// DELETE /api/arsiparis/klasifikasi/[id] — soft delete klasifikasi (ADMIN only)
// ---------------------------------------------------------------------------

const updateKlasifikasiSchema = z.object({
  nama: z.string().min(1).max(100).optional(),
  deskripsi: z.string().nullable().optional(),
})

export const Route = createFileRoute('/api/arsiparis/klasifikasi/id')({
  server: {
    handlers: {
      PATCH: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const isAdmin = await hasRole(supabase, session.user.id, 'ADMIN')
        if (!isAdmin) return Response.json({ error: 'Hanya ADMIN yang bisa mengubah klasifikasi' }, { status: 403 })

        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Body tidak valid' }, { status: 400 })

        const parsed = updateKlasifikasiSchema.safeParse(body)
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })

        // Verify exists
        const { data: existing, error: existError } = await supabase
          .from('master_klasifikasi_arsip')
          .select('id')
          .eq('id', params.id)
          .single()

        if (existError || !existing) return Response.json({ error: 'Klasifikasi tidak ditemukan' }, { status: 404 })

        // Cek nama unique jika diupdate
        if (parsed.data.nama) {
          const { data: duplicate } = await supabase
            .from('master_klasifikasi_arsip')
            .select('id')
            .eq('nama', parsed.data.nama)
            .eq('is_active', true)
            .neq('id', params.id)
            .single()

          if (duplicate) return Response.json({ error: `Nama klasifikasi `${parsed.data.nama}` sudah ada` }, { status: 409 })
        }

        const updateData: Record<string, unknown> = {}
        if (parsed.data.nama !== undefined) updateData.nama = parsed.data.nama
        if (parsed.data.deskripsi !== undefined) updateData.deskripsi = parsed.data.deskripsi

        const { data, error } = await supabase
          .from('master_klasifikasi_arsip')
          .update(updateData)
          .eq('id', params.id)
          .select()
          .single()

        if (error) return Response.json({ error: 'Gagal memperbarui klasifikasi' }, { status: 500 })

        return Response.json(data)
      },

      DELETE: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const isAdmin = await hasRole(supabase, session.user.id, 'ADMIN')
        if (!isAdmin) return Response.json({ error: 'Hanya ADMIN yang bisa menghapus klasifikasi' }, { status: 403 })

        // Soft delete
        const { error } = await supabase
          .from('master_klasifikasi_arsip')
          .update({ is_active: false })
          .eq('id', params.id)

        if (error) return Response.json({ error: 'Gagal menghapus klasifikasi' }, { status: 500 })

        return Response.json({ success: true, message: 'Klasifikasi dinonaktifkan' })
      },
    },
  },
})