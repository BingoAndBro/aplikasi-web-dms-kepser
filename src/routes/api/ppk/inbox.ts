import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/ppk/inbox — list dokumen IN_PPK_VALIDATION
// Query params: fungsi_id (optional), start_date (optional), end_date (optional)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ppk/inbox')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Role check: must be PPK
        const { data: rolesData } = await supabase
          .from('user_roles')
          .select('role:roles(nama)')
          .eq('user_id', session.user.id)

        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('PPK')) {
          return Response.json({ error: 'Akses ditolak — bukan PPK' }, { status: 403 })
        }

        // Parse query params
        const url = new URL(request.url)
        const fungsiId = url.searchParams.get('fungsi_id') ?? undefined
        const startDate = url.searchParams.get('start_date') ?? undefined
        const endDate = url.searchParams.get('end_date') ?? undefined

        // Build query
        let query = supabase
          .from('dokumen_transaksi')
          .select('id, judul, fungsi_id, kegiatan_jenis_id, created_by, tahun, tanggal, created_at')
          .eq('status', 'IN_PPK_VALIDATION')

        if (fungsiId) {
          query = query.eq('fungsi_id', fungsiId)
        }
        if (startDate) {
          query = query.gte('created_at', startDate)
        }
        if (endDate) {
          query = query.lte('created_at', endDate + 'T23:59:59')
        }
        query = query.order('created_at', { ascending: false })

        const { data: docs, error } = await query

        if (error) {
          console.error('[ppk/inbox] query error:', error)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }

        if (!docs || docs.length === 0) {
          return Response.json({ dokumen: [] })
        }

        // Manual join: fungsi_nama
        const fungsiIds = [...new Set(docs.map(d => d.fungsi_id).filter(Boolean))]
        const fungsiMap: Record<string, string> = {}
        if (fungsiIds.length > 0) {
          const { data: fungsiRows } = await supabase
            .from('master_fungsi')
            .select('id, nama')
            .in('id', fungsiIds)
          for (const row of fungsiRows ?? []) {
            fungsiMap[row.id] = row.nama
          }
        }

        // Manual join: kegiatan_nama
        const kegIds = [...new Set(docs.map(d => d.kegiatan_jenis_id).filter(Boolean))]
        const kegMap: Record<string, string> = {}
        if (kegIds.length > 0) {
          const { data: kegRows } = await supabase
            .from('master_kegiatan')
            .select('id, nama')
            .in('id', kegIds)
          for (const row of kegRows ?? []) {
            kegMap[row.id] = row.nama
          }
        }

        // created_by user info not fetched via PostgREST (auth.users needs admin).
        // Show "Pegawai" label — date will indicate who submitted.
        // In production, add a profiles table for user display names.

        const result = docs.map(d => ({
          id: d.id,
          judul: d.judul,
          fungsi_id: d.fungsi_id,
          fungsi_nama: fungsiMap[d.fungsi_id] ?? '—',
          kegiatan_jenis_id: d.kegiatan_jenis_id,
          kegiatan_nama: kegMap[d.kegiatan_jenis_id] ?? '—',
          created_by: d.created_by,
          tahun: d.tahun,
          tanggal: d.tanggal,
          created_at: d.created_at,
        }))

        return Response.json({ dokumen: result })
      },
    },
  },
})