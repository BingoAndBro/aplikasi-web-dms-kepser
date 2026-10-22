import { createFileRoute } from '@tanstack/react-router'

import { driveRouteError, requireDriveAdmin, requireDriveConfig } from '#/lib/google-drive/admin-route'
import { resetFailedDeletionJobs } from '#/lib/google-drive/jobs'

// POST /api/admin/google-drive/coba-lagi-penghapusan -- ADMIN. Menjadwalkan
// ulang job hapus Drive yang GAGAL (kecuali AKUN_DIPUTUS). Body diabaikan.
export const Route = createFileRoute('/api/admin/google-drive/coba-lagi-penghapusan')({
  ssr: false,
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const session = await requireDriveAdmin(request)
        if (session instanceof Response) return session
        const config = requireDriveConfig()
        if (config instanceof Response) return config

        try {
          const jumlah = await resetFailedDeletionJobs({ now: new Date() })
          console.info('[admin/google-drive] coba lagi penghapusan', { actor: session.user.id, jumlah })
          return Response.json({ jumlah })
        } catch (error) {
          return driveRouteError(error, 'coba-lagi-penghapusan')
        }
      },
    },
  },
})
