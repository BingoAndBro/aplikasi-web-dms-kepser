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
// GET /api/arsiparis/inaktif/[id] — detail arsip inaktif
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/inaktif/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await supabase.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('ARSIPARIS')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const { data: arsip, error } = await supabase
          .from('arsip')
          .select('*, lampiran_snapshot')
          .eq('id', params.id)
          .eq('status_arsip', 'INAKTIF')
          .single()

        if (error || !arsip) return Response.json({ error: 'Arsip inaktif tidak ditemukan' }, { status: 404 })

        const { data: dok } = await supabase
          .from('dokumen_transaksi')
          .select('id, judul, fungsi_id, kegiatan_jenis_id, tahun, created_by, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id')
          .eq('id', arsip.dokumen_id)
          .single()

        if (!dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        // Use lampiran_snapshot from arsip, not from dokumen_transaksi
        let lampiranSnapshot: LampiranUrl[] = []
        if (arsip.lampiran_snapshot) {
          lampiranSnapshot = typeof arsip.lampiran_snapshot === 'string' ? JSON.parse(arsip.lampiran_snapshot) : arsip.lampiran_snapshot
        }

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

        let jenisPermintaanNama = '—'
        if (dok.jenis_permintaan_id) {
          const { data: j } = await supabase.from('master_jenis_permintaan').select('nama').eq('id', dok.jenis_permintaan_id).single()
          if (j) jenisPermintaanNama = j.nama
        }

        let kategoriPermintaanNama = '—'
        if (dok.kategori_permintaan_id) {
          const { data: k } = await supabase.from('master_kategori_permintaan').select('nama').eq('id', dok.kategori_permintaan_id).single()
          if (k) kategoriPermintaanNama = k.nama
        }

        let detailPermintaanNama = '—'
        if (dok.detail_permintaan_id) {
          const { data: d } = await supabase.from('master_detail_permintaan').select('nama').eq('id', dok.detail_permintaan_id).single()
          if (d) detailPermintaanNama = d.nama
        }

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
            archived_by: arsip.archived_by,
            archived_by_nama: archivedByNama,
            catatan_arsiparis: arsip.catatan_arsiparis,
            dokumen_id: dok.id,
            dokumen: {
              id: dok.id,
              judul: dok.judul,
              fungsi: { id: fungsiId, nama: fungsiNama },
              kegiatan: { id: kegiatanId, nama: kegiatanNama },
              jenis_permintaan: jenisPermintaanNama,
              kategori_permintaan: kategoriPermintaanNama,
              detail_permintaan: detailPermintaanNama,
              tahun: dok.tahun,
              lampiran_urls: lampiranSnapshot,
            },
          },
        })
      },
    },
  },
})
