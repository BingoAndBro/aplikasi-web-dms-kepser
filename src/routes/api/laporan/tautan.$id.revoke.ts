import { createFileRoute } from '@tanstack/react-router'

import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import { isUuid } from '#/lib/laporan/tautan'
import { revokeTautanByCreator } from '#/lib/laporan/tautan-repository'
import { requireSameOrigin } from '#/lib/security/same-origin'

// Mencabut tautan: hanya pembuatnya. Tautan yang dicabut langsung tidak bisa
// dibuka lagi (410) dan tidak bisa diaktifkan kembali -- buat tautan baru.
export const Route = createFileRoute('/api/laporan/tautan/$id/revoke')({
  ssr: false,
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const session = await getLocalServerSession(request)
        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Tautan tidak ditemukan' }, { status: 404 })
        }

        try {
          const result = await revokeTautanByCreator(params.id, session.user.id)
          if (result === 'not_found') {
            return Response.json({ error: 'Tautan tidak ditemukan' }, { status: 404 })
          }

          if (result === 'revoked') {
            console.info('[laporan/tautan] tautan dicabut', { actor: session.user.id, tautanId: params.id })
          }

          return Response.json({ success: true })
        } catch {
          console.error('[laporan/tautan/$id/revoke] revoke error')
          return Response.json({ error: 'Gagal mencabut tautan' }, { status: 500 })
        }
      },
    },
  },
})
