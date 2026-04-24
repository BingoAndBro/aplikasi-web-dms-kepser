import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/arsip/[id] — detail arsip untuk semua authenticated user
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsip/id/')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: arsip, error } = await supabase
          .from('arsip')
          .select('*')
          .eq('id', params.id)
          .single()

        if (error || !arsip) return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })

        // Get dokumen info
        const { data: dok } = await supabase
          .from('dokumen_transaksi')
          .select('id, judul, fungsi_id, kegiatan_jenis_id, tahun, lampiran_urls, created_by')
          .eq('id', arsip.dokumen_id)
          .single()

        if (!dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        // Parse lampiran_urls
        let lampiranUrls: LampiranUrl[] = []
        if (dok.lampiran_urls) {
          lampiranUrls = typeof dok.lampiran_urls === 'string' ? JSON.parse(dok.lampiran_urls) : dok.lampiran_urls
        }

        // Get fungsi & kegiatan
        let fungsiNama = '—', fungsiId = ''
        if (dok.fungsi_id) {
          const { data: f } = await supabase.from('master_fungsi').select('id, nama').eq('id', dok.fungsi_id).single()
          if (f) { fungsiNama = f.nama; fungsiId = f.id }
        }

        let kegiatanNama = '—', kegiatanId = ''
        if (dok.kegiatan_jenis_id) {
          const { data: k } = await supabase.from('master_kegiatan').select('id, nama').eq('id', dok.kegiatan_jenis_id).single()
          if (k) { kegiatanNama = k.nama; kegiatanId = k.id }
        }

        // Get archived_by user info
        const { data: allUsers } = await supabase.auth.admin.listUsers()
        const archivedByUser = allUsers?.users.find(u => u.id === arsip.archived_by)
        const archivedByNama = archivedByUser?.user_metadata?.nama ?? archivedByUser?.email ?? '—'

        return Response.json({
          arsip: {
            id: arsip.id,
            nomor_surat: arsip.nomor_surat ?? '—',
            klasifikasi: arsip.klasifikasi ?? '—',
            retensi_aktif: arsip.retensi_aktif ?? '—',
            retensi_inaktif: arsip.retensi_inaktif ?? '—',
            masa_aktif_berakhir: arsip.masa_aktif_berakhir,
            masa_inaktif_berakhir: arsip.masa_inaktif_berakhir,
            status_arsip: arsip.status_arsip,
            archived_at: arsip.archived_at,
            archived_by_nama: archivedByNama,
            catatan_arsiparis: arsip.catatan_arsiparis,
            dokumen: {
              id: dok.id,
              judul: dok.judul,
              fungsi: { id: fungsiId, nama: fungsiNama },
              kegiatan: { id: kegiatanId, nama: kegiatanNama },
              tahun: dok.tahun,
              lampiran_urls: lampiranUrls,
            },
          },
        })
      },
    },
  },
})