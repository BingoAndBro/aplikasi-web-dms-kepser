import { createFileRoute } from '@tanstack/react-router'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { analyzeLocalStorageReferences } from '#/lib/storage/local-storage-diagnostics'

// ---------------------------------------------------------------------------
// GET /api/admin/analyze-storage
// Local-only storage diagnostics. Reports logical paths, never physical paths.
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/admin/analyze-storage')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        if (!hasLocalRole(session, 'ADMIN')) {
          return Response.json({ error: 'Akses ditolak - hanya admin' }, { status: 403 })
        }

        try {
          const { db } = await import('#/db/client')
          const { dokumenTransaksi } = await import('#/db/schema/dokumen')
          const { arsip } = await import('#/db/schema/arsip')

          const [documents, archives] = await Promise.all([
            db
              .select({
                id: dokumenTransaksi.id,
                lampiranUrls: dokumenTransaksi.lampiranUrls,
              })
              .from(dokumenTransaksi),
            db
              .select({
                id: arsip.id,
                statusArsip: arsip.statusArsip,
                lampiranSnapshot: arsip.lampiranSnapshot,
              })
              .from(arsip),
          ])

          const analysis = await analyzeLocalStorageReferences({
            documents,
            archives,
          })

          return Response.json(analysis)
        } catch {
          console.error('[admin/analyze-storage] local diagnostics failed')
          return Response.json({ error: 'Gagal menganalisis storage lokal' }, { status: 500 })
        }
      },
    },
  },
})
