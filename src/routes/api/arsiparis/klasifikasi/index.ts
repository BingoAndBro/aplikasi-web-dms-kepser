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
// GET /api/arsiparis/klasifikasi — list semua klasifikasi aktif (public)
// POST /api/arsiparis/klasifikasi — create klasifikasi baru (ADMIN only)
// ---------------------------------------------------------------------------

const createKlasifikasiSchema = z.object({
  nama: z.string().min(1, 'Nama klasifikasi wajib diisi').max(100),
  deskripsi: z.string().optional(),
})

export const Route = createFileRoute('/api/arsiparis/klasifikasi/')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)

        const { data, error } = await supabase
          .from('master_klasifikasi_arsip')
          .select('id, nama, deskripsi, created_at')
          .eq('is_active', true)
          .order('nama', { ascending: true })

        if (error) return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })

        return Response.json({ klasifikasi: data ?? [] })
      },

      POST: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const isAdmin = await hasRole(supabase, session.user.id, 'ADMIN')
        if (!isAdmin) return Response.json({ error: 'Hanya ADMIN yang bisa menambah klasifikasi' }, { status: 403 })

        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Body tidak valid' }, { status: 400 })

        const parsed = createKlasifikasiSchema.safeParse(body)
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })

        // Cek duplikat nama
        const { data: existing } = await supabase
          .from('master_klasifikasi_arsip')
          .select('id')
          .eq('nama', parsed.data.nama)
          .eq('is_active', true)
          .single()

        if (existing) return Response.json({ error: `Nama klasifikasi "${parsed.data.nama}" sudah ada` }, { status: 409 })

        const { data, error } = await supabase
          .from('master_klasifikasi_arsip')
          .insert({ nama: parsed.data.nama, deskripsi: parsed.data.deskripsi ?? null })
          .select()
          .single()

        if (error) return Response.json({ error: 'Gagal membuat klasifikasi' }, { status: 500 })

        return Response.json(data, { status: 201 })
      },
    },
  },
})