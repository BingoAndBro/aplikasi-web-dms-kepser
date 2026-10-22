import { createFileRoute } from '@tanstack/react-router'

import {
  driveRouteError,
  parseDriveBody,
  requireDriveAdmin,
  requireDriveConfig,
} from '#/lib/google-drive/admin-route'
import { hubungkanDariAlamat } from '#/lib/google-drive/akun-connect'
import { hubungkanRequestSchema } from '#/lib/schemas/google-drive'

// POST /api/admin/google-drive/hubungkan -- ADMIN menempel alamat loopback
// dari tab yang gagal dimuat (SPEC 7.1 langkah 3-6). Respons tanpa token.
export const Route = createFileRoute('/api/admin/google-drive/hubungkan')({
  ssr: false,
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const session = await requireDriveAdmin(request)
        if (session instanceof Response) return session
        const config = requireDriveConfig()
        if (config instanceof Response) return config
        const body = await parseDriveBody(request, hubungkanRequestSchema)
        if (body instanceof Response) return body

        try {
          const akun = await hubungkanDariAlamat({
            alamat: body.alamat,
            session: { sessionId: session.sessionId, userId: session.user.id },
            now: new Date(),
            deps: { config },
          })
          console.info('[admin/google-drive] akun dihubungkan', { actor: session.user.id, akunId: akun.id })
          return Response.json({ akun })
        } catch (error) {
          return driveRouteError(error, 'hubungkan')
        }
      },
    },
  },
})
