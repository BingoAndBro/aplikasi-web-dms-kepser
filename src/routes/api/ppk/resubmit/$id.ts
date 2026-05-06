import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'
import { transition } from '#/lib/fsm'
import { updateDokumenStatus, insertLog } from '#/lib/dokumen-helpers'
import { resubmitDokumenSchema } from '#/lib/schemas/dokumen'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

function createAuthClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/ppk/resubmit/[id] — get dokumen detail for resubmit page
// PATCH /api/ppk/resubmit/[id] — save lampiran (no FSM transition)
// POST /api/ppk/resubmit/[id] — resubmit after Bendahara rejection (FSM transition)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ppk/resubmit/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const authClient = createAuthClient(request)
        const session = await getServerSession(authClient)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await authClient.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('PPK')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const admin = createAdminClient()
        const { data: dok, error } = await admin
          .from('dokumen_transaksi')
          .select('*')
          .eq('id', params.id)
          .single()

        if (error || !dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        if (dok.status !== 'NEED_REVISION' || dok.revision_target !== 'PPK') {
          return Response.json({ error: 'Dokumen ini tidak memerlukan revisi oleh PPK' }, { status: 400 })
        }

        let fungsiNama = '—'
        if (dok.fungsi_id) {
          const { data: f } = await admin.from('master_fungsi').select('nama').eq('id', dok.fungsi_id).single()
          if (f) fungsiNama = f.nama
        }

        let kegiatanNama = '—'
        if (dok.kegiatan_jenis_id) {
          const { data: k } = await admin.from('master_kegiatan').select('nama').eq('id', dok.kegiatan_jenis_id).single()
          if (k) kegiatanNama = k.nama
        }

        let jenisPermintaanNama: string | undefined
        if (dok.jenis_permintaan_id) {
          const { data: j } = await admin.from('master_jenis_permintaan').select('nama').eq('id', dok.jenis_permintaan_id).single()
          if (j) jenisPermintaanNama = j.nama
        }

        let kategoriPermintaanNama: string | undefined
        if (dok.kategori_permintaan_id) {
          const { data: k } = await admin.from('master_kategori_permintaan').select('nama').eq('id', dok.kategori_permintaan_id).single()
          if (k) kategoriPermintaanNama = k.nama
        }

        let detailPermintaanNama: string | undefined
        if (dok.detail_permintaan_id) {
          const { data: d } = await admin.from('master_detail_permintaan').select('nama').eq('id', dok.detail_permintaan_id).single()
          if (d) detailPermintaanNama = d.nama
        }

        // Fetch is_non_material from dokumen_transaksi for dokumen pendukung detection
        const isNonMaterial = dok.is_non_material === true ||
          (!dok.jenis_permintaan_id && !dok.kategori_permintaan_id && !dok.detail_permintaan_id)

        // Parse lampiran_urls
        let lampiranUrls: any[] = []
        if (dok.lampiran_urls) {
          lampiranUrls = typeof dok.lampiran_urls === 'string' ? JSON.parse(dok.lampiran_urls) : dok.lampiran_urls
        }

        console.log('[API/ppk/resubmit/:id] GET SUCCESS id:', params.id, 'isNonMaterial:', isNonMaterial, 'lampiranCount:', lampiranUrls.length)
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
            revision_notes: dok.revision_notes,
            lampiran_urls: lampiranUrls,
            tahun: dok.tahun,
            tanggal: dok.tanggal,
            created_at: dok.created_at,
            updated_at: dok.updated_at,
            nominal_realisasi: dok.nominal_realisasi,
            is_non_material: isNonMaterial,
            jenis_permintaan_id: dok.jenis_permintaan_id,
            kategori_permintaan_id: dok.kategori_permintaan_id,
            detail_permintaan_id: dok.detail_permintaan_id,
            jenis_permintaan_nama: jenisPermintaanNama,
            kategori_permintaan_nama: kategoriPermintaanNama,
            detail_permintaan_nama: detailPermintaanNama,
          },
        })
      },

      PATCH: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const authClient = createAuthClient(request)
        const session = await getServerSession(authClient)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await authClient.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('PPK')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        let body: { lampiranUrls?: LampiranUrl[]; nominalRealisasi?: number | null } = {}
        try { body = await request.json() } catch { /* empty body OK */ }

        if (body.lampiranUrls !== undefined) {
          const parsed = resubmitDokumenSchema.safeParse(body)
          if (!parsed.success) return Response.json({ error: 'Validasi gagal', details: parsed.error.flatten() }, { status: 400 })
        }

        const admin = createAdminClient()
        const { data: dok, error } = await admin.from('dokumen_transaksi').select('*').eq('id', params.id).single()
        if (error || !dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        if (dok.status !== 'NEED_REVISION' || dok.revision_target !== 'PPK') {
          return Response.json({ error: 'Dokumen ini tidak memerlukan revisi oleh PPK' }, { status: 400 })
        }

        const oldUrls: string[] = []
        let existingLampirans: any[] = []
        if (dok.lampiran_urls) {
          existingLampirans = typeof dok.lampiran_urls === 'string' ? JSON.parse(dok.lampiran_urls) : dok.lampiran_urls
        }

        if (body.lampiranUrls && Array.isArray(body.lampiranUrls)) {
          for (const newLamp of body.lampiranUrls) {
            const oldLamp = existingLampirans.find((l: any) => l.kelengkapan_id === newLamp.kelengkapan_id)
            if (oldLamp && oldLamp.url !== newLamp.url) oldUrls.push(oldLamp.url)
          }
        }

        const { error: updateErr } = await admin.from('dokumen_transaksi').update({
          lampiran_urls: body.lampiranUrls ? JSON.stringify(body.lampiranUrls) : undefined,
          nominal_realisasi: body.nominalRealisasi,
          updated_at: new Date().toISOString(),
        }).eq('id', params.id)

        if (updateErr) return Response.json({ error: 'Gagal menyimpan' }, { status: 500 })

        for (const oldUrl of oldUrls) {
          admin.storage.from('dokumen-lampiran').remove([oldUrl]).then(({ error }) => {
            if (error) console.warn('[resubmit/PATCH] Failed to delete old file:', oldUrl, error.message)
          })
        }

        return Response.json({ success: true })
      },

      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        console.log('[API/ppk/resubmit/:id] POST START id:', params.id)
        const authClient = createAuthClient(request)
        const session = await getServerSession(authClient)
        console.log('[API/ppk/resubmit/:id] session user:', session?.user?.id)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await authClient.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('PPK')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        // Parse optional body for lampiran update
        let body: { lampiranUrls?: LampiranUrl[]; nominalRealisasi?: number | null } = {}
        try {
          body = await request.json()
        } catch { /* empty body OK */ }

        // Validate body if provided
        if (body.lampiranUrls !== undefined) {
          const parsed = resubmitDokumenSchema.safeParse(body)
          if (!parsed.success) {
            return Response.json({ error: 'Validasi gagal', details: parsed.error.flatten() }, { status: 400 })
          }
        }

        const admin = createAdminClient()
        const { data: dok, error } = await admin
          .from('dokumen_transaksi')
          .select('*')
          .eq('id', params.id)
          .single()

        if (error || !dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        if (dok.status !== 'NEED_REVISION' || dok.revision_target !== 'PPK') {
          return Response.json({ error: 'Dokumen ini tidak memerlukan revisi oleh PPK' }, { status: 400 })
        }

        // FSM transition: NEED_REVISION:RESUBMIT_PPK -> IN_BENDAHARA_APPROVAL
        const result = transition(dok.status, 'RESUBMIT_PPK', 'PPK', dok.revision_target)
        console.log('[API/ppk/resubmit/:id] FSM result:', result.success ? 'success' : result.error)
        if (!result.success) return Response.json({ error: result.error || 'Transisi gagal' }, { status: 400 })

        // Helper functions for renaming
        function isPendingPath(url: string): boolean {
          const pathParts = url.split('/')
          const filenameWithExt = pathParts[pathParts.length - 1] || ''
          return /^\d{13}-[a-zA-Z0-9]+-.+$/.test(filenameWithExt)
        }

        function extractExtension(url: string): string {
          const filename = url.split('/').pop() || ''
          const parts = filename.split('.')
          return parts.length > 1 ? parts[parts.length - 1] : ''
        }

        // Collect old URLs that will be replaced
        const oldUrls: string[] = []
        let updatedLampirans: LampiranUrl[] | undefined

        if (body.lampiranUrls && Array.isArray(body.lampiranUrls)) {
          let existingLampirans: any[] = []
          if (dok.lampiran_urls) {
            existingLampirans = typeof dok.lampiran_urls === 'string' ? JSON.parse(dok.lampiran_urls) : dok.lampiran_urls
          }
          for (const newLamp of body.lampiranUrls) {
            const oldLamp = existingLampirans.find((l: any) => l.kelengkapan_id === newLamp.kelengkapan_id)
            if (oldLamp && oldLamp.url !== newLamp.url) {
              oldUrls.push(oldLamp.url)
            }
          }
          updatedLampirans = [...body.lampiranUrls]
        }

        // Rename pending files before saving to database
        const pathsToDelete: string[] = []
        if (updatedLampirans && updatedLampirans.length > 0) {
          console.log('[API/ppk/resubmit/:id] Renaming pending files...')
          for (let i = 0; i < updatedLampirans.length; i++) {
            const lamp = updatedLampirans[i]
            if (!lamp.url || !isPendingPath(lamp.url)) {
              console.log('[API/ppk/resubmit/:id] Skipping non-pending:', lamp.url)
              continue
            }

            const oldPath = lamp.url
            const ext = extractExtension(oldPath)
            const newPath = `${session.user.id}/${params.id}/${crypto.randomUUID()}.${ext}`

            console.log('[API/ppk/resubmit/:id] Moving:', oldPath, '->', newPath)
            const { error: moveError } = await admin.storage
              .from('dokumen-lampiran')
              .move(oldPath, newPath)

            if (moveError) {
              console.error('[API/ppk/resubmit/:id] Move failed:', oldPath, 'error:', moveError.message)
              return Response.json({
                error: `Gagal menyimpan perubahan: file "${oldPath}" gagal diproses. Silakan coba lagi.`,
                details: {
                  failedPath: oldPath,
                  newPath: newPath,
                  reason: moveError.message,
                },
              }, { status: 500 })
            }

            // Track old PENDING path for deletion (cleanup orphan PENDING files)
            pathsToDelete.push(oldPath)
            console.log('[API/ppk/resubmit/:id] Move success, new path:', newPath)

            // Update lampiran with new path
            updatedLampirans[i] = { ...lamp, url: newPath }
          }
        }

        // Build update payload
        const updatePayload: Record<string, any> = {
          status: result.newStatus,
          current_step: result.newCurrentStep,
          revision_target: result.newRevisionTarget,
          updated_at: new Date().toISOString(),
        }

        if (updatedLampirans) {
          updatePayload.lampiran_urls = JSON.stringify(updatedLampirans)
        }

        // Update nominal_realisasi if provided
        if (body.nominalRealisasi !== undefined) {
          updatePayload.nominal_realisasi = body.nominalRealisasi
        }

        const { error: updateErr } = await admin
          .from('dokumen_transaksi')
          .update(updatePayload)
          .eq('id', params.id)

        if (updateErr) {
          console.error('[API/ppk/resubmit/:id] update error:', updateErr)
          return Response.json({ error: 'Gagal resubmit' }, { status: 500 })
        }

        await insertLog(admin, {
          dokumenId: params.id,
          userId: session.user.id,
          aksi: 'RESUBMIT_PPK',
          stepUrutan: result.stepUrutan,
        })

        // Delete REPLACED old files (from database old URLs)
        for (const oldUrl of oldUrls) {
          admin.storage.from('dokumen-lampiran').remove([oldUrl]).then(({ error }) => {
            if (error) console.warn('[resubmit] Failed to delete replaced file:', oldUrl, error.message)
            else console.log('[resubmit] Deleted replaced file:', oldUrl)
          })
        }

        // Delete OLD PENDING paths (cleanup orphan PENDING files from previous edits)
        for (const pendingPath of pathsToDelete) {
          admin.storage.from('dokumen-lampiran').remove([pendingPath]).then(({ error }) => {
            if (error) console.warn('[resubmit] Failed to delete orphan pending:', pendingPath, error.message)
            else console.log('[resubmit] Deleted orphan pending:', pendingPath)
          })
        }

        console.log('[API/ppk/resubmit/:id] POST SUCCESS')
        return Response.json({ success: true })
      },
    },
  },
})