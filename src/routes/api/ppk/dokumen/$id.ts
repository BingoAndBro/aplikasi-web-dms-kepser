import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

function createAuthClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/ppk/dokumen/[id] — Get dokumen detail for PPK
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ppk/dokumen/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        // 1. Auth check
        const authClient = createAuthClient(request)
        const session = await getServerSession(authClient)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Role check
        const { data: rolesData } = await authClient
          .from('user_roles')
          .select('role:roles(nama)')
          .eq('user_id', session.user.id)

        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('PPK')) {
          return Response.json({ error: 'Akses ditolak — bukan PPK' }, { status: 403 })
        }

        // 3. Fetch dokumen via admin client (bypass RLS)
        const admin = createAdminClient()

        const { data: dok, error } = await admin
          .from('dokumen_transaksi')
          .select('*')
          .eq('id', params.id)
          .single()

        if (error || !dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        // Status check: PPK hanya boleh lihat dokumen yang relevan dengannya
        const ppkStatuses = [
          'IN_PPK_VALIDATION',
          'IN_BENDAHARA_APPROVAL',
          'NEED_REVISION',
          'COMPLETED',
          'ARCHIVED',
        ]
        if (!ppkStatuses.includes(dok.status)) {
          return Response.json({ error: 'Dokumen tidak tersedia untuk PPK' }, { status: 400 })
        }

        // Manual join: fungsi_nama
        let fungsiNama = '—'
        if (dok.fungsi_id) {
          const { data: fns } = await admin
            .from('master_fungsi')
            .select('nama')
            .eq('id', dok.fungsi_id)
            .single()
          if (fns) fungsiNama = fns.nama
        }

        // Manual join: kegiatan_nama
        let kegiatanNama = '—'
        if (dok.kegiatan_jenis_id) {
          const { data: keg } = await admin
            .from('master_kegiatan')
            .select('nama')
            .eq('id', dok.kegiatan_jenis_id)
            .single()
          if (keg) kegiatanNama = keg.nama
        }

        // Manual join: jenis_permintaan_nama
        let jenisPermintaanNama: string | undefined
        if (dok.jenis_permintaan_id) {
          const { data: jenis } = await admin
            .from('master_jenis_permintaan')
            .select('nama')
            .eq('id', dok.jenis_permintaan_id)
            .single()
          if (jenis) jenisPermintaanNama = jenis.nama
        }

        // Manual join: kategori_permintaan_nama
        let kategoriPermintaanNama: string | undefined
        if (dok.kategori_permintaan_id) {
          const { data: kat } = await admin
            .from('master_kategori_permintaan')
            .select('nama')
            .eq('id', dok.kategori_permintaan_id)
            .single()
          if (kat) kategoriPermintaanNama = kat.nama
        }

        // Manual join: detail_permintaan_nama
        let detailPermintaanNama: string | undefined
        if (dok.detail_permintaan_id) {
          const { data: det } = await admin
            .from('master_detail_permintaan')
            .select('nama')
            .eq('id', dok.detail_permintaan_id)
            .single()
          if (det) detailPermintaanNama = det.nama
        }

        // Parse lampiran_urls
        let lampiranUrls: LampiranUrl[] = []
        if (dok.lampiran_urls) {
          lampiranUrls = typeof dok.lampiran_urls === 'string'
            ? JSON.parse(dok.lampiran_urls)
            : dok.lampiran_urls
        }

        // Fetch activity log
        const { data: logs } = await admin
          .from('log_aktivitas')
          .select('*')
          .eq('dokumen_id', params.id)
          .order('timestamp', { ascending: true })

        return Response.json({
          dokumen: {
            id: dok.id,
            judul: dok.judul,
            fungsi_id: dok.fungsi_id,
            fungsi_nama: fungsiNama,
            kegiatan_jenis_id: dok.kegiatan_jenis_id,
            kegiatan_nama: kegiatanNama,
            is_ketua_tim: dok.is_ketua_tim,
            status: dok.status,
            current_step: dok.current_step,
            revision_target: dok.revision_target,
            revision_notes: dok.revision_notes,
            lampiran_urls: lampiranUrls,
            tahun: dok.tahun,
            tanggal: dok.tanggal,
            created_by: dok.created_by,
            created_at: dok.created_at,
            updated_at: dok.updated_at,
            jenis_permintaan_id: dok.jenis_permintaan_id,
            kategori_permintaan_id: dok.kategori_permintaan_id,
            detail_permintaan_id: dok.detail_permintaan_id,
            jenis_permintaan_nama: jenisPermintaanNama,
            kategori_permintaan_nama: kategoriPermintaanNama,
            detail_permintaan_nama: detailPermintaanNama,
          },
          logs: logs ?? [],
        })
      },
    },
  },
})