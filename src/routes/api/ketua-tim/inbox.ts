import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'

// ---------------------------------------------------------------------------
// GET /api/ketua-tim/inbox — List documents awaiting chairman approval
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ketua-tim/inbox')({
  ssr: false,
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const cookieHeader = request.headers.get('cookie')
        const mockEvent = {
          request,
          cookie: { get: () => undefined, set: () => {}, delete: () => {} },
        } as any
        const supabase = createServerSupabaseClient(mockEvent, cookieHeader)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Check if user is chairman of any kegiatan
        const { data: assignments } = await supabase
          .from('ketua_tim_assignments')
          .select('kegiatan_id')
          .eq('user_id', session.user.id)

        if (!assignments || assignments.length === 0) {
          return Response.json({ dokumen: [], message: 'Anda bukan Ketua Tim dari kegiatan manapun' })
        }

        const kegiatanIds = assignments.map(a => a.kegiatan_id)

        // Get documents in IN_KETUA_TIM_APPROVAL status for these kegiatan
        const admin = createAdminClient()

        // First, get documents without is_non_material filter (in case column doesn't exist)
        const { data, error } = await admin
          .from('dokumen_transaksi')
          .select('*')
          .in('kegiatan_jenis_id', kegiatanIds)
          .eq('status', 'IN_KETUA_TIM_APPROVAL')
          .order('created_at', { ascending: false })

        if (error) {
          console.error('[ketua-tim/inbox] documents query error:', error)
          return Response.json({ error: 'Gagal mengambil daftar dokumen', details: error.message }, { status: 500 })
        }

        // Filter for non-material documents in JS (since column might not exist yet)
        const nonMaterialDocs = (data ?? []).filter((d: any) => d.is_non_material === true)

        // Fetch kegiatan names
        const { data: kegiatanData } = await admin
          .from('master_kegiatan')
          .select('id, nama')
          .in('id', kegiatanIds)

        const kegMap: Record<string, string> = {}
        ;(kegiatanData ?? []).forEach((k: any) => { kegMap[k.id] = k.nama })

        // Parse dokumen with kegiatan names
        const dokumen = nonMaterialDocs.map((d: any) => ({
          ...d,
          kegiatan_nama: kegMap[d.kegiatan_jenis_id] ?? null,
        }))

        return Response.json({ dokumen })
      },
    },
  },
})
