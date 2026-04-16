import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/ppk/dokumen/[id] — Get dokumen detail for PPK
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ppk/dokumen/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Role check
        const { data: rolesData } = await supabase
          .from('user_roles')
          .select('role:roles(nama)')
          .eq('user_id', session.user.id)

        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('PPK')) {
          return Response.json({ error: 'Akses ditolak — bukan PPK' }, { status: 403 })
        }

        // Fetch dokumen
        const { data: dok, error } = await supabase
          .from('dokumen_transaksi')
          .select('*')
          .eq('id', params.id)
          .single()

        if (error || !dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        // Status check: must be IN_PPK_VALIDATION
        if (dok.status !== 'IN_PPK_VALIDATION') {
          return Response.json({ error: 'Dokumen tidak dalam tahap validasi PPK' }, { status: 400 })
        }

        // Manual join: fungsi_nama
        let fungsiNama = '—'
        if (dok.fungsi_id) {
          const { data: fns } = await supabase
            .from('master_fungsi')
            .select('nama')
            .eq('id', dok.fungsi_id)
            .single()
          if (fns) fungsiNama = fns.nama
        }

        // Manual join: kegiatan_nama
        let kegiatanNama = '—'
        if (dok.kegiatan_jenis_id) {
          const { data: keg } = await supabase
            .from('master_kegiatan')
            .select('nama')
            .eq('id', dok.kegiatan_jenis_id)
            .single()
          if (keg) kegiatanNama = keg.nama
        }

        // Parse lampiran_urls
        let lampiranUrls: LampiranUrl[] = []
        if (dok.lampiran_urls) {
          lampiranUrls = typeof dok.lampiran_urls === 'string'
            ? JSON.parse(dok.lampiran_urls)
            : dok.lampiran_urls
        }

        // Fetch activity log
        const { data: logs } = await supabase
          .from('log_aktivitas')
          .select('*')
          .eq('dokumen_id', params.id)
          .order('timestamp', { ascending: true })

        return Response.json({
          dokumen: {
            id: dok.id,
            judul: dok.judul,
            fungsi_id: dok.fungsi_id,
            fungsi_nama: fungsiNama,
            kegiatan_jenis_id: dok.kegiatan_jenis_id,
            kegiatan_nama: kegiatanNama,
            is_ketua_tim: dok.is_ketua_tim,
            status: dok.status,
            current_step: dok.current_step,
            revision_target: dok.revision_target,
            revision_notes: dok.revision_notes,
            lampiran_urls: lampiranUrls,
            tahun: dok.tahun,
            tanggal: dok.tanggal,
            created_by: dok.created_by,
            created_at: dok.created_at,
            updated_at: dok.updated_at,
          },
          logs: logs ?? [],
        })
      },
    },
  },
})