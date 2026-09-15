import { createFileRoute } from '@tanstack/react-router'
import { inArray, sql } from 'drizzle-orm'
import { db } from '#/db/client'
import { appSettings } from '#/db/schema/app'
import { getLocalServerSession } from '#/lib/auth/local-server-auth'

const WATCHED_KEYS = ['theme', 'app_title', 'app_subtitle']

// Fase 8: lets every logged-in tab detect "an admin changed theme/judul/sub-judul
// somewhere else" without websockets — AppLayout polls this and forces a
// re-login prompt when the value moves past what it saw at session start.
export const Route = createFileRoute('/api/settings/epoch')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        try {
          const [row] = await db
            .select({ epoch: sql<string | null>`max(${appSettings.updatedAt})` })
            .from(appSettings)
            .where(inArray(appSettings.key, WATCHED_KEYS))

          const epoch = row?.epoch ? new Date(row.epoch).getTime() : 0
          return Response.json({ epoch })
        } catch (err) {
          console.error('[API DEBUG] Error in settings-epoch GET:', err)
          return Response.json({ error: 'Gagal mengambil status setelan' }, { status: 500 })
        }
      },
    },
  },
})
