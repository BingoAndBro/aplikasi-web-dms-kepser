import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession as getSession } from '#/lib/auth'
import { insertLog } from '#/lib/dokumen-helpers'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET  /api/arsiparis/usul-musnah/[id]   — detail usul musnah
// PATCH /api/arsiparis/usul-musnah/[id]  — setuju musnah (destroy)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/usul-musnah/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await supabase.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('ARSIPARIS')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const { data: musnah, error } = await supabase
          .from('arsip_usul_musnah')
          .select('*')
          .eq('id', params.id)
          .single()

        if (error || !musnah) return Response.json({ error: 'Usul musnah tidak ditemukan' }, { status: 404 })

        const { data: arsip } = await supabase
          .from('arsip')
          .select('id, nomor_surat, klasifikasi, retensi_aktif, retensi_inaktif, masa_aktif_berakhir, masa_inaktif_berakhir, status_arsip, archived_at, archived_by, dokumen_id, lampiran_snapshot, musnah_at, musnah_by, musnah_catatan')
          .eq('id', musnah.arsip_id)
          .single()

        if (!arsip) return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })

        const { data: dok } = await supabase
          .from('dokumen_transaksi')
          .select('id, judul, fungsi_id, kegiatan_jenis_id, tahun, created_by, jenis_permintaan_id, kategori_permintaan_id, detail_permintaan_id')
          .eq('id', arsip.dokumen_id)
          .single()

        let fungsiNama = '—'
        if (dok?.fungsi_id) {
          const { data: f } = await supabase.from('master_fungsi').select('nama').eq('id', dok.fungsi_id).single()
          if (f) fungsiNama = f.nama
        }

        let kegiatanNama = '—'
        if (dok?.kegiatan_jenis_id) {
          const { data: k } = await supabase.from('master_kegiatan').select('nama').eq('id', dok.kegiatan_jenis_id).single()
          if (k) kegiatanNama = k.nama
        }

        let jenisPermintaanNama = '—'
        if (dok?.jenis_permintaan_id) {
          const { data: j } = await supabase.from('master_jenis_permintaan').select('nama').eq('id', dok.jenis_permintaan_id).single()
          if (j) jenisPermintaanNama = j.nama
        }

        let kategoriPermintaanNama = '—'
        if (dok?.kategori_permintaan_id) {
          const { data: k } = await supabase.from('master_kategori_permintaan').select('nama').eq('id', dok.kategori_permintaan_id).single()
          if (k) kategoriPermintaanNama = k.nama
        }

        let detailPermintaanNama = '—'
        if (dok?.detail_permintaan_id) {
          const { data: d } = await supabase.from('master_detail_permintaan').select('nama').eq('id', dok.detail_permintaan_id).single()
          if (d) detailPermintaanNama = d.nama
        }

        // Use lampiran_snapshot from arsip, not from dokumen_transaksi
        let lampiranUrls: LampiranUrl[] = []
        if (arsip.lampiran_snapshot) {
          lampiranUrls = typeof arsip.lampiran_snapshot === 'string' ? JSON.parse(arsip.lampiran_snapshot) : arsip.lampiran_snapshot
        }

        const { data: allUsers } = await supabase.auth.admin.listUsers()
        const diusulkanUser = allUsers?.users.find(u => u.id === musnah.diusulkan_oleh)
        const diusulkanNama = diusulkanUser?.user_metadata?.nama ?? diusulkanUser?.email ?? '—'

        const archivedByUser = allUsers?.users.find(u => u.id === arsip.archived_by)
        const archivedByNama = archivedByUser?.user_metadata?.nama ?? archivedByUser?.email ?? '—'

        let musnahByNama = '—'
        if (arsip.musnah_by) {
          const musnahUser = allUsers?.users.find(u => u.id === arsip.musnah_by)
          musnahByNama = musnahUser?.user_metadata?.nama ?? musnahUser?.email ?? '—'
        }

        return Response.json({
          musnah: {
            id: musnah.id,
            arsip_id: musnah.arsip_id,
            status: musnah.status,
            catatan: musnah.catatan,
            created_at: musnah.created_at,
            diusulkan_oleh: musnah.diusulkan_oleh,
            diusulkan_oleh_nama: diusulkanNama,
          },
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
            dokumen_id: dok?.id ?? '—',
            lampiran_urls: lampiranUrls,
            lampiran_snapshot: arsip.lampiran_snapshot,
            musnah_at: arsip.musnah_at,
            musnah_by: arsip.musnah_by,
            musnah_by_nama: musnahByNama,
            musnah_catatan: arsip.musnah_catatan,
            dokumen: dok ? {
              id: dok.id,
              judul: dok.judul,
              fungsi_nama: fungsiNama,
              kegiatan_nama: kegiatanNama,
              jenis_permintaan: jenisPermintaanNama,
              kategori_permintaan: kategoriPermintaanNama,
              detail_permintaan: detailPermintaanNama,
              tahun: dok.tahun,
            } : null,
          },
        })
      },

      PATCH: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await supabase.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('ARSIPARIS')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Body tidak valid' }, { status: 400 })

        const parsed = z.object({
          aksi: z.literal('SETUJUI', { message: 'Aksi harus SETUJUI' }),
        }).safeParse(body)

        if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })

        const { data: musnah, error: musnahError } = await supabase
          .from('arsip_usul_musnah')
          .select('id, arsip_id, status, catatan')
          .eq('id', params.id)
          .single()

        if (musnahError || !musnah) return Response.json({ error: 'Usul musnah tidak ditemukan' }, { status: 404 })
        if (musnah.status !== 'MENUNGGU') return Response.json({ error: 'Usul musnah sudah diputuskan' }, { status: 400 })

        const { data: arsip, error: arsipError } = await supabase
          .from('arsip')
          .select('id, dokumen_id, lampiran_snapshot')
          .eq('id', musnah.arsip_id)
          .single()

        if (arsipError || !arsip) return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })

        let lampiranUrls: LampiranUrl[] = []
        if (arsip.lampiran_snapshot) {
          lampiranUrls = typeof arsip.lampiran_snapshot === 'string' ? JSON.parse(arsip.lampiran_snapshot) : arsip.lampiran_snapshot
        }

        const { error: updateMusnahError } = await supabase
          .from('arsip_usul_musnah')
          .update({
            status: 'DISETUJUI',
            decided_by: session.user.id,
            decided_at: new Date().toISOString(),
          })
          .eq('id', musnah.id)

        if (updateMusnahError) {
          console.error('[usul-musnah-patch] update musnah error:', updateMusnahError)
          return Response.json({ error: 'Gagal memperbarui usul musnah' }, { status: 500 })
        }

        const supabaseAdmin = createAdminClient()
        for (const lamp of lampiranUrls) {
          try {
            await supabaseAdmin.storage.from('dokumen-lampiran').remove([lamp.url])
          } catch (e) {
            console.warn('[usul-musnah-patch] file deletion warning:', e)
          }
        }

        // Keep arsip record, set DIMUSNAHKAN, clear snapshot
        const { error: updateArsipError } = await supabase.from('arsip').update({
          status_arsip: 'DIMUSNAHKAN',
          lampiran_snapshot: [],
          musnah_at: new Date().toISOString(),
          musnah_by: session.user.id,
          musnah_catatan: musnah.catatan ?? null,
        }).eq('id', arsip.id)

        if (updateArsipError) {
          console.error('[usul-musnah-patch] update arsip error:', updateArsipError)
          return Response.json({ error: 'Gagal memperbarui status arsip' }, { status: 500 })
        }

        await insertLog(supabase, {
          dokumenId: arsip.dokumen_id,
          userId: session.user.id,
          aksi: 'USUL_MUSNAH_SETUJUI',
          catatan: null,
          stepUrutan: null,
        })

        return Response.json({ success: true, message: 'Arsip berhasil dimusnahkan' })
      },
    },
  },
})
