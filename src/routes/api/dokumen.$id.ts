import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'
import { updateDokumenSchema } from '#/lib/schemas/dokumen'
import {
  getDokumenById,
  updateDokumen,
  insertLog,
  userHasApproverRole,
  syncDocumentAttachments,
  deleteOrphanFiles,
  type LampiranUrl,
} from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/dokumen/[id] — Get dokumen detail
// PATCH /api/dokumen/[id] — Update lampiran_urls (NEED_REVISION target=USER only)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Use adminClient to bypass RLS on dokumen_transaksi SELECT.
        // Ownership/role check is enforced below at the application layer.
        const admin = createAdminClient()
        const dok = await getDokumenById(admin, params.id)

        if (!dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        // Ownership check: own dokumen, or approver role
        const isOwner = dok.created_by === session.user.id
        const isApprover = await userHasApproverRole(supabase, session.user.id)

        if (!isOwner && !isApprover) {
          return Response.json({ error: 'Anda tidak memiliki akses ke dokumen ini' }, { status: 403 })
        }

        return Response.json({ dokumen: dok })
      },

      PATCH: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = updateDokumenSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: parsed.error.flatten(),
          }, { status: 400 })
        }

        // Session-scoped client for auth check (SELECT operations)
        const supabase = createClient(request)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const dok = await getDokumenById(supabase, params.id)

        if (!dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        if (dok.created_by !== session.user.id) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        // Check if Non-Material
        const isNonMaterial = dok.is_non_material === true ||
          (!dok.jenis_permintaan_id && !dok.kategori_permintaan_id && !dok.detail_permintaan_id)

        // Allow edit for:
        // 1. Non-Material with TERSIMPAN status
        // 2. Material with NEED_REVISION target=USER
        const canEditNonMaterial = isNonMaterial && dok.status === 'TERSIMPAN'
        const canEditMaterial = !isNonMaterial && dok.status === 'NEED_REVISION' && dok.revision_target === 'USER'

        if (!canEditNonMaterial && !canEditMaterial) {
          if (isNonMaterial) {
            return Response.json({ error: 'Dokumen Non-Material hanya bisa diedit jika status Tersimpan' }, { status: 400 })
          }
          return Response.json({ error: 'Dokumen tidak bisa diedit — status bukan NEED_REVISION' }, { status: 400 })
        }

        // lampiran_urls may come back as JSON string from DB
        const storedLampirans = dok.lampiran_urls
          ? (typeof dok.lampiran_urls === 'string'
              ? JSON.parse(dok.lampiran_urls) as LampiranUrl[]
              : dok.lampiran_urls as LampiranUrl[])
          : []

        const admin = createAdminClient()
        let processedLampirans = parsed.data.lampiranUrls ?? storedLampirans

        // Sync attachments: move PENDING files + track old files for deletion
        let pathsToDelete: string[] = []
        if (parsed.data.lampiranUrls && parsed.data.lampiranUrls.length > 0) {
          try {
            const syncResult = await syncDocumentAttachments(
              admin,
              session.user.id,
              params.id,
              parsed.data.lampiranUrls,
              storedLampirans
            )
            processedLampirans = syncResult.updatedLampirans
            pathsToDelete = syncResult.pathsToDelete
          } catch (err) {
            console.error('[PATCH] syncDocumentAttachments error:', err)
            return Response.json({
              error: `Gagal menyimpan perubahan: ${err instanceof Error ? err.message : 'Terjadi kesalahan'}`,
            }, { status: 500 })
          }
        }

        const result = await updateDokumen(admin, params.id, {
          lampiranUrls: processedLampirans,
          judul: parsed.data.judul,
          tahun: parsed.data.tahun,
          fungsiId: parsed.data.fungsiId,
          kegiatanId: parsed.data.kegiatanId,
          tanggal: parsed.data.tanggal,
          nominalRealisasi: parsed.data.nominalRealisasi,
          keteranganDetail: parsed.data.keteranganDetail,
        })

        if (result.error) {
          return Response.json({ error: result.error }, { status: 500 })
        }

        // Insert log for Non-Material edit
        if (isNonMaterial) {
          await insertLog(admin, {
            dokumenId: params.id,
            userId: session.user.id,
            aksi: 'UPDATE',
            stepUrutan: null,
          })
        }

        // Delete orphaned files (fire and forget)
        deleteOrphanFiles(admin, pathsToDelete)

        return Response.json({ dokumen: result.data })
      },

      DELETE: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Use admin client to bypass RLS
        const admin = createAdminClient()
        const dok = await getDokumenById(admin, params.id)

        if (!dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        // Check if owner
        if (dok.created_by !== session.user.id) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        // Check if Non-Material and TERSIMPAN
        const isNonMaterial = dok.is_non_material === true ||
          (!dok.jenis_permintaan_id && !dok.kategori_permintaan_id && !dok.detail_permintaan_id)

        if (!isNonMaterial || dok.status !== 'TERSIMPAN') {
          return Response.json({ error: 'Dokumen tidak bisa dihapus' }, { status: 400 })
        }

        // Get lampiran URLs for file deletion
        const lampiranUrls = dok.lampiran_urls || []
        console.log('[DELETE] Deleting dokumen:', {
          dokumenId: params.id,
          judul: dok.judul,
          lampiranFiles: lampiranUrls.map(l => l.url)
        })

        // Insert log before delete (so it records who deleted)
        await insertLog(admin, {
          dokumenId: params.id,
          userId: session.user.id,
          aksi: 'DELETE',
          stepUrutan: null,
        })

        // Delete dokumen from database
        const { error: deleteError } = await admin
          .from('dokumen_transaksi')
          .delete()
          .eq('id', params.id)

        if (deleteError) {
          console.error('[API/dokumen/:id] DELETE error:', deleteError)
          return Response.json({ error: 'Gagal menghapus dokumen' }, { status: 500 })
        }

        console.log('[DELETE] Dokumen metadata deleted from database:', params.id)

        // Delete files from storage
        for (const lamp of lampiranUrls) {
          console.log('[DELETE] Deleting file from storage:', lamp.url)
          admin.storage.from('dokumen-lampiran').remove([lamp.url]).then(({ error }) => {
            if (error) console.warn('[dokumen] Failed to delete file:', lamp.url, error.message)
            else console.log('[DELETE] File deleted from storage:', lamp.url)
          })
        }

        console.log('[DELETE] Complete:', {
          dokumenId: params.id,
          judul: dok.judul,
          filesDeleted: lampiranUrls.length
        })

        return Response.json({ success: true })
      },
    },
  },
})
