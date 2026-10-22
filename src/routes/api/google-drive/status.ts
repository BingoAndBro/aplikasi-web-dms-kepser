import { createFileRoute } from '@tanstack/react-router'

import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import { DRIVE_ROUTE_PESAN_UMUM, NO_STORE } from '#/lib/google-drive/admin-route'
import { getDriveAvailability, toStatusResponse } from '#/lib/google-drive/availability'

// GET /api/google-drive/status -- semua sesi login. Hanya { tersedia, alasan }
// untuk kartu Google Drive di dialog Bagikan Tautan; tanpa email/id akun.
export const Route = createFileRoute('/api/google-drive/status')({
  ssr: false,
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        try {
          return Response.json(toStatusResponse(await getDriveAvailability()), { headers: NO_STORE })
        } catch {
          console.error('[google-drive/status] gagal', { kategori: 'TAK_TERDUGA' })
          return Response.json({ error: DRIVE_ROUTE_PESAN_UMUM }, { status: 500 })
        }
      },
    },
  },
})
