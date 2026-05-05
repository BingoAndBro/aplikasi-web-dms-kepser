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
// GET /api/bendahara/dokumen/[id] — get dokumen detail for Bendahara
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/bendahara/dokumen/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await supabase.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('BENDAHARA')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const { data: dok, error } = await supabase.from('dokumen_transaksi').select('*').eq('id', params.id).single()
        if (error || !dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        let fungsiNama = '—'
        if (dok.fungsi_id) {
          const { data: f } = await supabase.from('master_fungsi').select('nama').eq('id', dok.fungsi_id).single()
          if (f) fungsiNama = f.nama
        }

        let kegiatanNama = '—'
        if (dok.kegiatan_jenis_id) {
          const { data: k } = await supabase.from('master_kegiatan').select('nama').eq('id', dok.kegiatan_jenis_id).single()
          if (k) kegiatanNama = k.nama
        }

        let jenisPermintaanNama: string | undefined
        if (dok.jenis_permintaan_id) {
          const { data: j } = await supabase.from('master_jenis_permintaan').select('nama').eq('id', dok.jenis_permintaan_id).single()
          if (j) jenisPermintaanNama = j.nama
        }

        let kategoriPermintaanNama: string | undefined
        if (dok.kategori_permintaan_id) {
          const { data: k } = await supabase.from('master_kategori_permintaan').select('nama').eq('id', dok.kategori_permintaan_id).single()
          if (k) kategoriPermintaanNama = k.nama
        }

        let detailPermintaanNama: string | undefined
        if (dok.detail_permintaan_id) {
          const { data: d } = await supabase.from('master_detail_permintaan').select('nama').eq('id', dok.detail_permintaan_id).single()
          if (d) detailPermintaanNama = d.nama
        }

        let lampiranUrls: LampiranUrl[] = []
        if (dok.lampiran_urls) {
          lampiranUrls = typeof dok.lampiran_urls === 'string' ? JSON.parse(dok.lampiran_urls) : dok.lampiran_urls
        }

        // Get PPK validation info
        const { data: logs } = await supabase
          .from('log_aktivitas')
          .select('*')
          .eq('dokumen_id', params.id)
          .eq('aksi', 'PPK_APPROVE')
          .single()

        const { data: logs2 } = await supabase
          .from('log_aktivitas')
          .select('*')
          .eq('dokumen_id', params.id)
          .order('timestamp', { ascending: true })

        return Response.json({
          dokumen: {
            id: dok.id, judul: dok.judul, fungsi_id: dok.fungsi_id, fungsi_nama: fungsiNama,
            kegiatan_jenis_id: dok.kegiatan_jenis_id, kegiatan_nama: kegiatanNama,
            is_ketua_tim: dok.is_ketua_tim, status: dok.status, lampiran_urls: lampiranUrls,
            tahun: dok.tahun, tanggal: dok.tanggal, created_by: dok.created_by,
            created_at: dok.created_at, revision_notes: dok.revision_notes,
            nominal_realisasi: dok.nominal_realisasi,
            jenis_permintaan_id: dok.jenis_permintaan_id,
            kategori_permintaan_id: dok.kategori_permintaan_id,
            detail_permintaan_id: dok.detail_permintaan_id,
            jenis_permintaan_nama: jenisPermintaanNama,
            kategori_permintaan_nama: kategoriPermintaanNama,
            detail_permintaan_nama: detailPermintaanNama,
          },
          ppkValidation: logs ? { user_id: logs.user_id, timestamp: logs.timestamp } : null,
          logs: logs2 ?? [],
        })
      },
    },
  },
})