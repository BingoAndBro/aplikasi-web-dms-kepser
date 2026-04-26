import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/arsiparis/inaktif — list arsip dengan status_arsip='INAKTIF'
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/inaktif')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await supabase.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('ARSIPARIS')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const url = new URL(request.url)
        const fungsiId = url.searchParams.get('fungsi_id') ?? undefined
        const tahun = url.searchParams.get('tahun') ?? undefined

        let query = supabase
          .from('arsip')
          .select('id, dokumen_id, nomor_surat, archived_at, masa_aktif_berakhir, masa_inaktif_berakhir, klasifikasi')
          .eq('status_arsip', 'INAKTIF')
          .eq('is_ditolak', false)
          .order('archived_at', { ascending: false })

        const { data: arsipList, error } = await query
        if (error) {
          console.error('[inaktif] arsip query error:', JSON.stringify(error))
          return Response.json({ error: 'Gagal mengambil data', detail: error.message }, { status: 500 })
        }

        if (!arsipList || arsipList.length === 0) return Response.json({ inaktif: [] })

        const docIds = arsipList.map(a => a.dokumen_id)
        const { data: docs } = await supabase
          .from('dokumen_transaksi')
          .select('id, judul, fungsi_id, kegiatan_jenis_id, tahun')
          .in('id', docIds)

        const docMap: Record<string, { judul: string; fungsi_id: string; kegiatan_jenis_id: string; tahun: number }> = {}
        for (const d of docs ?? []) docMap[d.id] = d

        let filtered = arsipList.filter(a => docMap[a.dokumen_id])
        if (fungsiId) filtered = filtered.filter(a => docMap[a.dokumen_id]?.fungsi_id === fungsiId)
        if (tahun) filtered = filtered.filter(a => docMap[a.dokumen_id]?.tahun === Number(tahun))

        if (filtered.length === 0) return Response.json({ inaktif: [] })

        const fungsiIds = [...new Set(filtered.map(a => docMap[a.dokumen_id]?.fungsi_id).filter(Boolean))]
        const kegIds = [...new Set(filtered.map(a => docMap[a.dokumen_id]?.kegiatan_jenis_id).filter(Boolean))]

        const fungsiMap: Record<string, string> = {}
        if (fungsiIds.length > 0) {
          const { data: rows } = await supabase.from('master_fungsi').select('id, nama').in('id', fungsiIds)
          for (const r of rows ?? []) fungsiMap[r.id] = r.nama
        }

        const kegMap: Record<string, string> = {}
        if (kegIds.length > 0) {
          const { data: rows } = await supabase.from('master_kegiatan').select('id, nama').in('id', kegIds)
          for (const r of rows ?? []) kegMap[r.id] = r.nama
        }

        const result = filtered.map(a => {
          const d = docMap[a.dokumen_id]
          return {
            id: a.id,
            nomor_surat: a.nomor_surat ?? '—',
            judul_dokumen: d?.judul ?? '—',
            fungsi_nama: fungsiMap[d?.fungsi_id] ?? '—',
            kegiatan_nama: kegMap[d?.kegiatan_jenis_id] ?? '—',
            archived_at: a.archived_at,
            masa_aktif_berakhir: a.masa_aktif_berakhir,
            masa_inaktif_berakhir: a.masa_inaktif_berakhir,
          }
        })

        return Response.json({ inaktif: result })
      },
    },
  },
})