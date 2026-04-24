import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/arsip — search arsip (semua authenticated user)
// ---------------------------------------------------------------------------

const PER_PAGE = 20

export const Route = createFileRoute('/api/arsip/')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const url = new URL(request.url)
        const fungsiId = url.searchParams.get('fungsi_id') ?? undefined
        const kegiatanId = url.searchParams.get('kegiatan_id') ?? undefined
        const tahun = url.searchParams.get('tahun') ?? undefined
        const q = url.searchParams.get('q') ?? undefined
        const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
        const offset = (page - 1) * PER_PAGE

        // Count total
        const { count } = await supabase.from('arsip').select('id', { count: 'exact', head: true }).eq('is_ditolak', false)

        // Fetch arsip
        let query = supabase
          .from('arsip')
          .select('id, dokumen_id, nomor_surat, klasifikasi, archived_at, status_arsip')
          .eq('is_ditolak', false)
          .order('archived_at', { ascending: false })
          .range(offset, offset + PER_PAGE - 1)

        const { data: arsipList, error } = await query
        if (error) return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })

        if (!arsipList || arsipList.length === 0) {
          return Response.json({ arsip: [], total: count ?? 0, page, per_page: PER_PAGE })
        }

        // Join dokumen
        const docIds = arsipList.map(a => a.dokumen_id)
        const { data: docs } = await supabase
          .from('dokumen_transaksi')
          .select('id, judul, fungsi_id, kegiatan_jenis_id, tahun')
          .in('id', docIds)

        const docMap: Record<string, { judul: string; fungsi_id: string; kegiatan_jenis_id: string; tahun: number }> = {}
        for (const d of docs ?? []) docMap[d.id] = d

        // Filter dokumen-level filters
        let filtered = arsipList.filter(a => docMap[a.dokumen_id])
        if (fungsiId) filtered = filtered.filter(a => docMap[a.dokumen_id]?.fungsi_id === fungsiId)
        if (kegiatanId) filtered = filtered.filter(a => docMap[a.dokumen_id]?.kegiatan_jenis_id === kegiatanId)
        if (tahun) filtered = filtered.filter(a => docMap[a.dokumen_id]?.tahun === Number(tahun))
        if (q) {
          const lowerQ = q.toLowerCase()
          filtered = filtered.filter(a => {
            const d = docMap[a.dokumen_id]
            return (a.nomor_surat?.toLowerCase().includes(lowerQ) ?? false)
              || (d?.judul.toLowerCase().includes(lowerQ) ?? false)
          })
        }

        // Join fungsi & kegiatan
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
            judul: d?.judul ?? '—',
            fungsi_nama: fungsiMap[d?.fungsi_id] ?? '—',
            kegiatan_nama: kegMap[d?.kegiatan_jenis_id] ?? '—',
            klasifikasi: a.klasifikasi ?? '—',
            archived_at: a.archived_at,
            status_arsip: a.status_arsip,
          }
        })

        return Response.json({ arsip: result, total: count ?? result.length, page, per_page: PER_PAGE })
      },
    },
  },
})