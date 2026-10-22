import { createFileRoute } from '@tanstack/react-router'

import {
  driveRouteError,
  parseDriveBody,
  requireDriveAdmin,
  requireDriveConfig,
} from '#/lib/google-drive/admin-route'
import { muatAkunUntukJob } from '#/lib/google-drive/akun-repository'
import { mulaiHubung } from '#/lib/google-drive/oauth'
import { mulaiHubungRequestSchema } from '#/lib/schemas/google-drive'

// POST /api/admin/google-drive/mulai-hubung -- ADMIN. Membuat state + PKCE
// (terikat sesi ADMIN ini) dan mengembalikan URL login Google (SPEC 7.1 langkah 1).
export const Route = createFileRoute('/api/admin/google-drive/mulai-hubung')({
  ssr: false,
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const session = await requireDriveAdmin(request)
        if (session instanceof Response) return session
        const config = requireDriveConfig()
        if (config instanceof Response) return config
        const body = await parseDriveBody(request, mulaiHubungRequestSchema)
        if (body instanceof Response) return body

        try {
          let akunId: string | null = null
          let loginHint: string | undefined
          if (body.mode === 'HUBUNGKAN_ULANG' && body.akun_id) {
            const akun = await muatAkunUntukJob(body.akun_id)
            if (!akun || akun.status === 'DIPUTUS') {
              return Response.json({ error: 'Akun Google Drive tidak ditemukan' }, { status: 404 })
            }
            akunId = akun.id
            loginHint = akun.email
          }

          const { authUrl } = await mulaiHubung({
            sessionId: session.sessionId,
            mode: body.mode,
            akunId,
            loginHint,
            now: new Date(),
            deps: { config },
          })
          return Response.json({ auth_url: authUrl })
        } catch (error) {
          return driveRouteError(error, 'mulai-hubung')
        }
      },
    },
  },
})
