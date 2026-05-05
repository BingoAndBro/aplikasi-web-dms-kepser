import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'

function createAuthClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/admin/analyze-storage
// Lists all files in storage, cross-references with dokumen_transaksi lampiran_urls
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/admin/analyze-storage')({
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
          .select('id, judul, created_by, lampiran_urls, is_non_material, status')

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
          } catch { /* ignore parse errors */ }
        }

        // Get all files in storage bucket
        const { data: storageFiles, error: storageError } = await admin.storage
          .from('dokumen-lampiran')
          .list()

        if (storageError) {
          return Response.json({ error: 'Gagal mengambil file storage', details: storageError }, { status: 500 })
        }

        // Organize storage files by folder (user_id)
        const folderStats: Record<string, {
          total_files: number
          orphan_files: string[]
          orphan_count: number
          referenced_files: string[]
          referenced_count: number
        }> = {}

        const allOrphanPaths: string[] = []

        for (const file of (storageFiles ?? [])) {
          if (!file.name || file.name === '.folderMarker') continue

          const folder = file.name
          if (!folderStats[folder]) {
            folderStats[folder] = {
              total_files: 0,
              orphan_files: [],
              orphan_count: 0,
              referenced_files: [],
              referenced_count: 0,
            }
          }

          // List files in this folder
          const { data: folderFiles, error: folderError } = await admin.storage
            .from('dokumen-lampiran')
            .list(folder)

          if (folderError) continue

          for (const f of (folderFiles ?? [])) {
            if (!f.name || f.name === '.folderMarker') continue
            const fullPath = `${folder}/${f.name}`

            folderStats[folder].total_files++

            if (referencedPaths.has(fullPath)) {
              folderStats[folder].referenced_files.push(f.name)
              folderStats[folder].referenced_count++
            } else {
              folderStats[folder].orphan_files.push(f.name)
              folderStats[folder].orphan_count++
              allOrphanPaths.push(fullPath)
            }
          }
        }

        return Response.json({
          summary: {
            total_folders: Object.keys(folderStats).length,
            total_storage_files: Object.values(folderStats).reduce((sum, f) => sum + f.total_files, 0),
            total_orphan_files: Object.values(folderStats).reduce((sum, f) => sum + f.orphan_count, 0),
            total_referenced_files: Object.values(folderStats).reduce((sum, f) => sum + f.referenced_count, 0),
          },
          folder_details: folderStats,
          orphan_paths: allOrphanPaths,
          referenced_paths_count: referencedPaths.size,
        })
      },
    },
  },
})