import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { transition } from '#/lib/fsm'
import { isStoragePathPending, syncDocumentAttachments, deleteOrphanFiles } from '#/lib/dokumen-helpers'
import { resubmitDokumenSchema } from '#/lib/schemas/dokumen'
import { parseLampiranUrls } from '#/lib/dokumen'
import type { LampiranUrl } from '#/lib/dokumen-helpers'
import type { StatusDokumen } from '#/lib/types/fsm'

function createAuthClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function sameLampiranUrlSet(current: LampiranUrl[], next: LampiranUrl[]): boolean {
  if (current.length !== next.length) return false

  const currentUrls = current.map(lamp => lamp.url).sort()
  const nextUrls = next.map(lamp => lamp.url).sort()
  return currentUrls.every((url, index) => url === nextUrls[index])
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

        // Parse existing lampirans from database
        const existingLampirans: LampiranUrl[] = dok.lampiran_urls
          ? (typeof dok.lampiran_urls === 'string' ? JSON.parse(dok.lampiran_urls) : dok.lampiran_urls)
          : []

        // Sync attachments: move PENDING files + track old files for deletion
        let pathsToDelete: string[] = []
        let updatedLampirans = body.lampiranUrls ?? existingLampirans

        if (body.lampiranUrls && Array.isArray(body.lampiranUrls)) {
          try {
            const result = await syncDocumentAttachments(
              admin,
              session.user.id,
              params.id,
              body.lampiranUrls,
              existingLampirans
            )
            updatedLampirans = result.updatedLampirans
            pathsToDelete = result.pathsToDelete
          } catch (err) {
            console.error('[resubmit/PATCH] syncDocumentAttachments error:', err)
            return Response.json({
              error: `Gagal menyimpan perubahan: ${err instanceof Error ? err.message : 'Terjadi kesalahan'}`,
            }, { status: 500 })
          }
        }

        // Update database
        const { error: updateErr } = await admin.from('dokumen_transaksi').update({
          lampiran_urls: JSON.stringify(updatedLampirans),
          nominal_realisasi: body.nominalRealisasi,
          updated_at: new Date().toISOString(),
        }).eq('id', params.id)

        if (updateErr) return Response.json({ error: 'Gagal menyimpan' }, { status: 500 })

        // Delete orphaned files (fire and forget)
        deleteOrphanFiles(admin, pathsToDelete)

        return Response.json({ success: true })
      },

      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        if (!hasLocalRole(session, 'PPK')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

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

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        let dokRows: Array<{
          id: string
          status: string
          revision_target: string | null
          lampiran_urls: unknown
        }>
        try {
          dokRows = await db
            .select({
              id: dokumenTransaksi.id,
              status: dokumenTransaksi.status,
              revision_target: dokumenTransaksi.revisionTarget,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
            })
            .from(dokumenTransaksi)
            .where(eq(dokumenTransaksi.id, params.id))
            .limit(1)
        } catch (err) {
          console.error('[API/ppk/resubmit/:id] local lookup error:', err)
          return Response.json({ error: 'Gagal resubmit' }, { status: 500 })
        }

        const dok = dokRows[0]
        if (!dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        if (dok.status !== 'NEED_REVISION' || dok.revision_target !== 'PPK') {
          return Response.json({ error: 'Dokumen ini tidak memerlukan revisi oleh PPK' }, { status: 400 })
        }

        // FSM transition: NEED_REVISION:RESUBMIT_PPK -> IN_BENDAHARA_APPROVAL
        const result = transition(dok.status as StatusDokumen, 'RESUBMIT_PPK', 'PPK', dok.revision_target)
        if (!result.success) return Response.json({ error: result.error || 'Transisi gagal' }, { status: 400 })

        // Parse existing lampirans from database
        const existingLampirans = parseLampiranUrls(dok.lampiran_urls)

        let updatedLampirans: LampiranUrl[] | undefined = body.lampiranUrls

        if (body.lampiranUrls && Array.isArray(body.lampiranUrls)) {
          if (body.lampiranUrls.some(lamp => isStoragePathPending(lamp.url))) {
            return Response.json({
              error: 'Perubahan lampiran dengan file baru belum didukung pada fase migrasi ini',
            }, { status: 400 })
          }

          if (!sameLampiranUrlSet(existingLampirans, body.lampiranUrls)) {
            return Response.json({
              error: 'Perubahan lampiran yang memerlukan sinkronisasi file belum didukung pada fase migrasi ini',
            }, { status: 400 })
          }
        }

        try {
          await db.transaction(async (tx) => {
            const updatePayload: Partial<typeof dokumenTransaksi.$inferInsert> = {
              status: result.newStatus,
              currentStep: result.newCurrentStep,
              revisionTarget: result.newRevisionTarget,
              updatedAt: new Date(),
            }

            if (updatedLampirans) {
              updatePayload.lampiranUrls = updatedLampirans
            }

            if (body.nominalRealisasi !== undefined) {
              updatePayload.nominalRealisasi =
                body.nominalRealisasi === null
                  ? null
                  : String(body.nominalRealisasi)
            }

            const updatedRows = await tx
              .update(dokumenTransaksi)
              .set(updatePayload)
              .where(eq(dokumenTransaksi.id, params.id))
              .returning({ id: dokumenTransaksi.id })

            if (updatedRows.length === 0) {
              throw new Error('DOCUMENT_STATUS_UPDATE_NOT_FOUND')
            }

            await tx.insert(logAktivitas).values({
              dokumenId: params.id,
              userId: session.user.id,
              aksi: 'RESUBMIT_PPK',
              stepUrutan: result.stepUrutan,
            })
          })
        } catch (err) {
          console.error('[API/ppk/resubmit/:id] local transaction error:', err)
          return Response.json({ error: 'Gagal resubmit' }, { status: 500 })
        }

        return Response.json({ success: true })
      },
    },
  },
})
