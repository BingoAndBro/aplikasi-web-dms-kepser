import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'
import { insertLog } from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// POST /api/arsiparis/dokumen/[id]/skip — tolak mengarsipkan dokumen
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/dokumen/$id/skip')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        // Role check
        const { data: rolesData } = await supabase.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('ARSIPARIS')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        // Validate body
        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Body tidak valid' }, { status: 400 })

        const schema = z.object({
          catatan_arsiparis: z.string().optional(),
        })

        const parsed = schema.safeParse(body)
        if (!parsed.success) {
          return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
        }

        const data = parsed.data

        // Verify dokumen exists + status = COMPLETED
        const { data: dok, error: dokError } = await supabase
          .from('dokumen_transaksi')
          .select('id, status')
          .eq('id', params.id)
          .single()

        if (dokError || !dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        if (dok.status !== 'COMPLETED') return Response.json({ error: 'Dokumen belum berada di tahap final' }, { status: 400 })

        // Check belum diarsipkan
        const { data: existingArsip } = await supabase
          .from('arsip')
          .select('id')
          .eq('dokumen_id', params.id)
          .single()

        if (existingArsip) return Response.json({ error: 'Dokumen sudah diarsipkan atau tidak diarsipkan' }, { status: 400 })

        // Insert arsip record dengan is_ditolak=true
        const { error: arsipError } = await supabase.from('arsip').insert({
          dokumen_id: params.id,
          catatan_arsiparis: data.catatan_arsiparis ?? null,
          archived_by: session.user.id,
          is_ditolak: true,
          status_arsip: 'AKTIF', // tetap AKTIF karena ditolak, tidak masuk lifecycle
        })

        if (arsipError) {
          console.error('[skip] arsip insert error:', arsipError)
          return Response.json({ error: 'Gagal mencatat penolakan' }, { status: 500 })
        }

        // Insert log — dokumen tetap COMPLETED
        await insertLog(supabase, {
          dokumenId: params.id,
          userId: session.user.id,
          aksi: 'ARCHIVE_SKIP',
          catatan: data.catatan_arsiparis ?? null,
          stepUrutan: null,
        })

        return Response.json({ success: true, message: 'Dokumen tidak diarsipkan' })
      },
    },
  },
})