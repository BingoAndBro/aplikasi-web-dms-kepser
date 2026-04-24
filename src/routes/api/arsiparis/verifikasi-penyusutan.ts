import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/arsiparis/verifikasi-penyusutan — list arsip VERIFIKASI_PENYUSUTAN
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/verifikasi-penyusutan')({
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

        // Get arsip di tahap verifikasi
        const { data: arsipList, error } = await supabase
          .from('arsip')
          .select('id, dokumen_id, nomor_surat, archived_at, masa_aktif_berakhir')
          .eq('status_arsip', 'VERIFIKASI_PENYUSUTAN')
          .eq('is_ditolak', false)
          .order('archived_at', { ascending: false })

        if (error) return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        if (!arsipList || arsipList.length === 0) return Response.json({ verifikasi: [] })

        // Join verifikasi info
        const arsipIds = arsipList.map(a => a.id)
        const { data: verifikasiList } = await supabase
          .from('arsip_verifikasi_penyusutan')
          .select('id, arsip_id, status, catatan, dipindahkan_oleh, created_at, decided_by, decided_at')
          .in('arsip_id', arsipIds)

        const verifikasiMap: Record<string, { id: string; status: string; catatan: string | null; dipindahkan_oleh: string; created_at: string; decided_by: string | null; decided_at: string | null }> = {}
        for (const v of verifikasiList ?? []) verifikasiMap[v.arsip_id] = v

        // Join dokumen info
        const docIds = arsipList.map(a => a.dokumen_id)
        const { data: docs } = await supabase
          .from('dokumen_transaksi')
          .select('id, judul, fungsi_id, kegiatan_jenis_id, tahun')
          .in('id', docIds)

        const docMap: Record<string, { judul: string; fungsi_id: string; kegiatan_jenis_id: string; tahun: number }> = {}
        for (const d of docs ?? []) docMap[d.id] = d

        let filtered = arsipList.filter(a => docMap[a.dokumen_id] && verifikasiMap[a.id])
        if (fungsiId) filtered = filtered.filter(a => docMap[a.dokumen_id]?.fungsi_id === fungsiId)
        if (tahun) filtered = filtered.filter(a => docMap[a.dokumen_id]?.tahun === Number(tahun))

        if (filtered.length === 0) return Response.json({ verifikasi: [] })

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
          const v = verifikasiMap[a.id]
          return {
            arsip_id: a.id,
            verifikasi_id: v.id,
            nomor_surat: a.nomor_surat ?? '—',
            judul_dokumen: d?.judul ?? '—',
            fungsi_nama: fungsiMap[d?.fungsi_id] ?? '—',
            verifikasi_status: v.status as 'MENUNGGU' | 'DISETUJUI' | 'DITOLAK',
            dipindahkan_oleh: v.dipindahkan_oleh,
            created_at: v.created_at,
            decided_by: v.decided_by,
            decided_at: v.decided_at,
            catatan: v.catatan,
          }
        })

        return Response.json({ verifikasi: result })
      },
    },
  },
})