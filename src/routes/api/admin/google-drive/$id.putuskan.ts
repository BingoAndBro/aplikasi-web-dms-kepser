import { createFileRoute } from '@tanstack/react-router'

import {
  driveRouteError,
  isDriveUuid,
  parseDriveBody,
  requireDriveAdmin,
  requireDriveConfig,
} from '#/lib/google-drive/admin-route'
import { muatAkunUntukJob, putuskanAkun } from '#/lib/google-drive/akun-repository'
import { createGoogleDriveClient } from '#/lib/google-drive/drive-client'
import { decryptRefreshToken } from '#/lib/google-drive/token-crypto'
import { putuskanRequestSchema } from '#/lib/schemas/google-drive'

// POST /api/admin/google-drive/$id/putuskan -- ADMIN memutus akun permanen
// (SPEC 7.2). Token dicabut di Google secara best effort; galat dekripsi atau
// revoke tidak menggagalkan pemutusan.
export const Route = createFileRoute('/api/admin/google-drive/$id/putuskan')({
  ssr: false,
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const session = await requireDriveAdmin(request)
        if (session instanceof Response) return session
        if (!isDriveUuid(params.id)) {
          return Response.json({ error: 'Akun Google Drive tidak ditemukan' }, { status: 404 })
        }
        const config = requireDriveConfig()
        if (config instanceof Response) return config
        const body = await parseDriveBody(request, putuskanRequestSchema)
        if (body instanceof Response) return body

        try {
          const akun = await muatAkunUntukJob(params.id)
          if (!akun) return Response.json({ error: 'Akun Google Drive tidak ditemukan' }, { status: 404 })

          const tokenEnc = akun.refreshTokenEnc
          const revoke = tokenEnc
            ? () => createGoogleDriveClient({ refreshToken: decryptRefreshToken(tokenEnc, config.tokenKey), config }).revokeToken()
            : null
          const result = await putuskanAkun({ akunId: akun.id, actorUserId: session.user.id, now: new Date(), revoke })
          console.info('[admin/google-drive] akun diputus', { actor: session.user.id, akunId: akun.id })
          return Response.json({ success: true, jumlah_tautan_aktif: result.jumlah_tautan_aktif })
        } catch (error) {
          return driveRouteError(error, 'putuskan')
        }
      },
    },
  },
})
