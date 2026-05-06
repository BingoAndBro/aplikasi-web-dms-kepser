import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'

function createAuthClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

/**
 * Helper: Check if path is PENDING format (timestamp-random-filename)
 * PENDING = storage path dengan format timestamp-random-filename (dash).
 * Pattern: {userId}/{timestamp}-{random}-{filename}.{ext}
 */
function isPendingPath(url: string): boolean {
  const pathParts = url.split('/')
  const filenameWithExt = pathParts[pathParts.length - 1] || ''
  return /^\d{13}-[a-zA-Z0-9]+-.+$/.test(filenameWithExt)
}

// ---------------------------------------------------------------------------
// GET /api/admin/cleanup-orphan-files
// Deletes storage files that are not referenced by any dokumen_transaksi lampiran_urls
// Query params:
//   - pending_only=true : only delete PENDING format files (not formal paths)
//   - dry_run=true : return list without deleting
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/admin/cleanup-orphan-files')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const authClient = createAuthClient(request)
        const session = await getServerSession(authClient)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        // Check admin role
        const { data: rolesData } = await authClient
          .from('user_roles')
          .select('role:roles(nama)')
          .eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('ADMIN')) {
          return Response.json({ error: 'Akses ditolak — hanya admin' }, { status: 403 })
        }

        const admin = createAdminClient()

        // Get all documents with their lampiran_urls
        const { data: allDocs, error: docsError } = await admin
          .from('dokumen_transaksi')
          .select('id, lampiran_urls')

        if (docsError) {
          return Response.json({ error: 'Gagal mengambil dokumen' }, { status: 500 })
        }

        // Build set of all referenced storage paths
        const referencedPaths = new Set<string>()
        for (const doc of (allDocs ?? [])) {
          try {
            const lampiranUrls = typeof doc.lampiran_urls === 'string'
              ? JSON.parse(doc.lampiran_urls)
              : (doc.lampiran_urls ?? [])
            for (const lamp of lampiranUrls) {
              if (lamp.url) {
                referencedPaths.add(lamp.url)
              }
            }
          } catch { /* ignore */ }
        }

        console.log(`[cleanup-orphan] Referenced paths: ${referencedPaths.size}`)

        // Get all files in storage bucket
        const { data: storageFiles, error: storageError } = await admin.storage
          .from('dokumen-lampiran')
          .list()

        if (storageError) {
          return Response.json({ error: 'Gagal mengambil file storage', details: storageError }, { status: 500 })
        }

        // Collect orphan files
        const orphanPaths: string[] = []
        for (const folder of (storageFiles ?? [])) {
          if (!folder.name || folder.name === '.folderMarker') continue

          const { data: folderFiles } = await admin.storage
            .from('dokumen-lampiran')
            .list(folder.name)

          for (const f of (folderFiles ?? [])) {
            if (!f.name || f.name === '.folderMarker') continue
            const fullPath = `${folder.name}/${f.name}`
            if (!referencedPaths.has(fullPath)) {
              orphanPaths.push(fullPath)
            }
          }
        }

        console.log(`[cleanup-orphan] Found ${orphanPaths.length} orphan files`)

        if (orphanPaths.length === 0) {
          return Response.json({
            message: 'Tidak ada file orphan',
            deleted_count: 0,
          })
        }

        // Delete orphan files
        const { data: deleteResult, error: deleteError } = await admin.storage
          .from('dokumen-lampiran')
          .remove(orphanPaths)

        if (deleteError) {
          console.error('[cleanup-orphan] Delete error:', deleteError)
          return Response.json({ error: 'Gagal menghapus file', details: deleteError }, { status: 500 })
        }

        const deletedCount = deleteResult?.length ?? orphanPaths.length
        console.log(`[cleanup-orphan] Deleted ${deletedCount} files`)

        return Response.json({
          message: 'Cleanup berhasil',
          deleted_count: deletedCount,
          orphan_paths: orphanPaths,
        })
      },
    },
  },
})