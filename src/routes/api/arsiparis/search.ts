import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/arsiparis/search — search arsip (semua authenticated user)
// Hasil difilter berdasarkan role:
//   - ADMIN/ARSIPARIS: semua arsip
//   - PPK: arsip dari dokumen yang ada di workflow PPK
//   - Bendahara: arsip dari dokumen COMPLETED
//   - Pegawai: arsip dari dokumen miliknya sendiri
// ---------------------------------------------------------------------------

const PER_PAGE = 20

export const Route = createFileRoute('/api/arsiparis/search')({
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

        // Get user roles
        const { data: rolesData } = await supabase
          .from('user_roles')
          .select('role:roles(nama)')
          .eq('user_id', session.user.id)
        const roleNames = (rolesData ?? []).map((r: any) => r.role?.nama as string).filter(Boolean)
        const isAdmin = roleNames.includes('ADMIN')
        const isArsiparis = roleNames.includes('ARSIPARIS')
        const isPPK = roleNames.includes('PPK')
        const isBendahara = roleNames.includes('BENDAHARA')

        // Base query for arsip
        let baseQuery = supabase
          .from('arsip')
          .select('id, dokumen_id, nomor_surat, klasifikasi, archived_at, status_arsip', { count: 'exact' })
          .eq('is_ditolak', false)
          .order('archived_at', { ascending: false })
          .range(offset, offset + PER_PAGE - 1)

        const { data: arsipList, error, count } = await baseQuery
        if (error) return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })

        if (!arsipList || arsipList.length === 0) {
          return Response.json({ arsip: [], total: 0, page, per_page: PER_PAGE })
        }

        const docIds = arsipList.map(a => a.dokumen_id)

        // Role-based document filtering
        let docsQuery = supabase
          .from('dokumen_transaksi')
          .select('id, judul, fungsi_id, kegiatan_jenis_id, tahun, created_by, status, step_urutan')
          .in('id', docIds)

        if (isPPK && !isAdmin && !isArsiparis) {
          // PPK hanya lihat dokumen yang sudah sampai di step PPK
          docsQuery = docsQuery.gte('step_urutan', 5)
        } else if (isBendahara && !isAdmin && !isArsiparis) {
          // Bendahara hanya lihat dokumen COMPLETED
          docsQuery = docsQuery.eq('status', 'COMPLETED')
        } else if (!isAdmin && !isArsiparis && !isPPK && !isBendahara) {
          // Pegawai hanya lihat dokumen miliknya sendiri
          docsQuery = docsQuery.eq('created_by', session.user.id)
        }

        const { data: docs } = await docsQuery

        // Filter arsip by accessible documents
        const allowedDocIds = new Set((docs ?? []).map(d => d.id))
        let filteredArsip = arsipList.filter(a => allowedDocIds.has(a.dokumen_id))

        // Document-level filtering
        const docMap: Record<string, { judul: string; fungsi_id: string; kegiatan_jenis_id: string; tahun: number }> = {}
        for (const d of docs ?? []) docMap[d.id] = d

        if (fungsiId) filteredArsip = filteredArsip.filter(a => docMap[a.dokumen_id]?.fungsi_id === fungsiId)
        if (kegiatanId) filteredArsip = filteredArsip.filter(a => docMap[a.dokumen_id]?.kegiatan_jenis_id === kegiatanId)
        if (tahun) filteredArsip = filteredArsip.filter(a => docMap[a.dokumen_id]?.tahun === Number(tahun))
        if (q) {
          const lowerQ = q.toLowerCase()
          filteredArsip = filteredArsip.filter(a => {
            const d = docMap[a.dokumen_id]
            return (a.nomor_surat?.toLowerCase().includes(lowerQ) ?? false)
              || (d?.judul.toLowerCase().includes(lowerQ) ?? false)
          })
        }

        // Join fungsi & kegiatan
        const fungsiIds = [...new Set(filteredArsip.map(a => docMap[a.dokumen_id]?.fungsi_id).filter(Boolean))]
        const kegIds = [...new Set(filteredArsip.map(a => docMap[a.dokumen_id]?.kegiatan_jenis_id).filter(Boolean))]

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

        const result = filteredArsip.map(a => {
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
