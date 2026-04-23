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

        let lampiranUrls: any[] = []
        if (dok.lampiran_urls) {
          lampiranUrls = typeof dok.lampiran_urls === 'string' ? JSON.parse(dok.lampiran_urls) : dok.lampiran_urls
        }

        console.log('[API/ppk/resubmit/:id] GET SUCCESS id:', params.id)
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

        let body: { lampiranUrls?: LampiranUrl[] } = {}
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
        let body: { lampiranUrls?: LampiranUrl[] } = {}
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

        // Build update payload
        const updatePayload: Record<string, any> = {
          status: result.newStatus,
          current_step: result.newCurrentStep,
          revision_target: result.newRevisionTarget,
          updated_at: new Date().toISOString(),
        }

        // Collect old URLs that will be replaced
        const oldUrls: string[] = []
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
          updatePayload.lampiran_urls = JSON.stringify(body.lampiranUrls)
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

        // Delete old files from storage (fire and forget)
        for (const oldUrl of oldUrls) {
          admin.storage.from('dokumen-lampiran').remove([oldUrl]).then(({ error }) => {
            if (error) console.warn('[resubmit] Failed to delete old file:', oldUrl, error.message)
          })
        }

        console.log('[API/ppk/resubmit/:id] POST SUCCESS')
        return Response.json({ success: true })
      },
    },
  },
})