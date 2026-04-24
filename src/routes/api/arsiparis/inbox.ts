import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/arsiparis/inbox — list dokumen COMPLETED yang belum diarsipkan
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/inbox')({
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
        const startDate = url.searchParams.get('start_date') ?? undefined
        const endDate = url.searchParams.get('end_date') ?? undefined

        // Query dokumen COMPLETED yang belum ada di tabel arsip
        let query = supabase
          .from('dokumen_transaksi')
          .select('id, judul, fungsi_id, kegiatan_jenis_id, created_by, tahun, tanggal, created_at')
          .eq('status', 'COMPLETED')

        if (fungsiId) query = query.eq('fungsi_id', fungsiId)
        if (startDate) query = query.gte('created_at', startDate)
        if (endDate) query = query.lte('created_at', endDate + 'T23:59:59')
        query = query.order('created_at', { ascending: false })

        const { data: docs, error } = await query
        if (error) return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })

        if (!docs || docs.length === 0) return Response.json({ inbox: [] })

        // Filter: exclude yang sudah punya record di arsip
        const docIds = docs.map(d => d.id)
        const { data: existingArsip } = await supabase
          .from('arsip')
          .select('dokumen_id')
          .in('dokumen_id', docIds)

        const archivedDocIds = new Set(existingArsip?.map(a => a.dokumen_id) ?? [])
        const unarchived = docs.filter(d => !archivedDocIds.has(d.id))

        if (unarchived.length === 0) return Response.json({ inbox: [] })

        // Manual joins: fungsi
        const fungsiIds = [...new Set(unarchived.map(d => d.fungsi_id).filter(Boolean))]
        const fungsiMap: Record<string, string> = {}
        if (fungsiIds.length > 0) {
          const { data: rows } = await supabase.from('master_fungsi').select('id, nama').in('id', fungsiIds)
          for (const r of rows ?? []) fungsiMap[r.id] = r.nama
        }

        // Manual joins: kegiatan
        const kegIds = [...new Set(unarchived.map(d => d.kegiatan_jenis_id).filter(Boolean))]
        const kegMap: Record<string, string> = {}
        if (kegIds.length > 0) {
          const { data: rows } = await supabase.from('master_kegiatan').select('id, nama').in('id', kegIds)
          for (const r of rows ?? []) kegMap[r.id] = r.nama
        }

        // Get BENDAHARA_APPROVE log entry untuk tanggal approve
        const { data: bendaharaLogs } = await supabase
          .from('log_aktivitas')
          .select('dokumen_id, timestamp')
          .in('dokumen_id', unarchived.map(d => d.id))
          .eq('aksi', 'BENDAHARA_APPROVE')

        const bendaharaLogMap: Record<string, string> = {}
        for (const log of bendaharaLogs ?? []) {
          bendaharaLogMap[log.dokumen_id] = log.timestamp
        }

        const result = unarchived.map(d => ({
          id: d.id,
          judul: d.judul,
          fungsi_id: d.fungsi_id,
          fungsi_nama: fungsiMap[d.fungsi_id] ?? '—',
          kegiatan_jenis_id: d.kegiatan_jenis_id,
          kegiatan_nama: kegMap[d.kegiatan_jenis_id] ?? '—',
          created_by: d.created_by,
          nama_pegawai: '—', // bisa dilengkapi dengan user metadata lookup di detail page
          tahun: d.tahun,
          tanggal: d.tanggal,
          created_at: d.created_at,
          bendahara_approve_at: bendaharaLogMap[d.id] ?? null,
        }))

        return Response.json({ inbox: result })
      },
    },
  },
})