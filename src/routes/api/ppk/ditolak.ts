import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'

function createAuthClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/ppk/ditolak — list dokumen NEED_REVISION where revision_target='USER'
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ppk/ditolak')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const authClient = createAuthClient(request)
        const session = await getServerSession(authClient)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await authClient.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('PPK')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const admin = createAdminClient()

        const { data: docs, error } = await admin
          .from('dokumen_transaksi')
          .select('id, judul, fungsi_id, kegiatan_jenis_id, tahun, tanggal, created_at, revision_notes, updated_at')
          .eq('status', 'NEED_REVISION')
          .eq('revision_target', 'USER')
          .order('updated_at', { ascending: false })

        if (error) return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })

        const fungsiIds = [...new Set((docs ?? []).map(d => d.fungsi_id).filter(Boolean))]
        const fungsiMap: Record<string, string> = {}
        if (fungsiIds.length > 0) {
          const { data: rows } = await admin.from('master_fungsi').select('id, nama').in('id', fungsiIds)
          for (const r of rows ?? []) fungsiMap[r.id] = r.nama
        }

        const kegIds = [...new Set((docs ?? []).map(d => d.kegiatan_jenis_id).filter(Boolean))]
        const kegMap: Record<string, string> = {}
        if (kegIds.length > 0) {
          const { data: rows } = await admin.from('master_kegiatan').select('id, nama').in('id', kegIds)
          for (const r of rows ?? []) kegMap[r.id] = r.nama
        }

        const result = (docs ?? []).map(d => ({
          id: d.id,
          judul: d.judul,
          fungsi_id: d.fungsi_id,
          fungsi_nama: fungsiMap[d.fungsi_id] ?? '—',
          kegiatan_jenis_id: d.kegiatan_jenis_id,
          kegiatan_nama: kegMap[d.kegiatan_jenis_id] ?? '—',
          tahun: d.tahun,
          tanggal: d.tanggal,
          created_at: d.created_at,
          updated_at: d.updated_at,
          revision_notes: d.revision_notes,
        }))

        return Response.json({ dokumen: result })
      },
    },
  },
})