import { createFileRoute } from '@tanstack/react-router'

import { NO_STORE, driveRouteError, requireDriveAdmin } from '#/lib/google-drive/admin-route'
import { muatRingkasanAdmin } from '#/lib/google-drive/akun-repository'
import { isDriveConfigured } from '#/lib/google-drive/config'
import { triggerDriveRunner } from '#/lib/google-drive/runner'
import type { GoogleDriveAdminResponse } from '#/lib/google-drive/shared'

// GET /api/admin/google-drive -- ADMIN. Ringkasan akun (tanpa token) dan
// daftar folder yang perlu dihapus manual (judul tautan + nama folder, tanpa
// nama file/dokumen). Tetap 200 saat env belum lengkap (dikonfigurasi: false).
export const Route = createFileRoute('/api/admin/google-drive/')({
  ssr: false,
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await requireDriveAdmin(request)
        if (session instanceof Response) return session

        try {
          const ringkasan = await muatRingkasanAdmin()
          const body: GoogleDriveAdminResponse = { dikonfigurasi: isDriveConfigured(), ...ringkasan }
          // Halaman Pengaturan ADMIN ikut menyusul antrean yang tertinggal (SPEC 8.3).
          triggerDriveRunner()
          return Response.json(body, { headers: NO_STORE })
        } catch (error) {
          return driveRouteError(error, 'ringkasan')
        }
      },
    },
  },
})
