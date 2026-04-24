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
// GET /api/arsiparis/dokumen/[id] — detail dokumen untuk review arsip
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/dokumen/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await supabase.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('ARSIPARIS')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const { data: dok, error } = await supabase.from('dokumen_transaksi').select('*').eq('id', params.id).single()
        if (error || !dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        // Hanya bisa lihat dokumen berstatus COMPLETED
        if (dok.status !== 'COMPLETED') {
          return Response.json({ error: 'Dokumen belum menyelesaikan approval' }, { status: 400 })
        }

        // Get fungsi & kegiatan names
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

        // Parse lampiran_urls
        let lampiranUrls: LampiranUrl[] = []
        if (dok.lampiran_urls) {
          lampiranUrls = typeof dok.lampiran_urls === 'string' ? JSON.parse(dok.lampiran_urls) : dok.lampiran_urls
        }

        // Get BENDAHARA_APPROVE log
        const { data: bendaharaLog } = await supabase
          .from('log_aktivitas')
          .select('user_id, timestamp')
          .eq('dokumen_id', params.id)
          .eq('aksi', 'BENDAHARA_APPROVE')
          .single()

        const bendaharaApprove = bendaharaLog
          ? { nama: 'Bendahara', tanggal: bendaharaLog.timestamp }
          : null

        // Check apakah sudah ada record arsip
        const { data: arsipRecord } = await supabase
          .from('arsip')
          .select('id, status_arsip, nomor_surat')
          .eq('dokumen_id', params.id)
          .single()

        return Response.json({
          dokumen: {
            id: dok.id,
            judul: dok.judul,
            fungsi: { id: fungsiId, nama: fungsiNama },
            kegiatan: { id: kegiatanId, nama: kegiatanNama },
            tanggal: dok.tanggal,
            tahun: dok.tahun,
            lampiran_urls: lampiranUrls,
            created_by: { id: dok.created_by, nama: 'Pegawai' },
            status: dok.status,
          },
          bendahara_approve: bendaharaApprove,
          arsip: arsipRecord
            ? { id: arsipRecord.id, status_arsip: arsipRecord.status_arsip, nomor_surat: arsipRecord.nomor_surat }
            : null,
        })
      },
    },
  },
})