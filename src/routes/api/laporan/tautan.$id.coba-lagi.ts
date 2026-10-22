import { createFileRoute } from '@tanstack/react-router'

import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import { triggerDriveRunner } from '#/lib/google-drive/runner'
import { cobaLagiTautanDrive } from '#/lib/google-drive/tautan-drive-repository'
import { isUuid } from '#/lib/laporan/tautan'
import { requireSameOrigin } from '#/lib/security/same-origin'

// "Coba lagi" unggahan Google Drive yang GAGAL (SPEC 8.4): hanya pembuat,
// tautan DRIVE belum dicabut. Tautan orang lain dijawab sama dengan tidak ada
// (404) supaya id tautan milik pengguna lain tidak bisa diuji keberadaannya.
export const Route = createFileRoute('/api/laporan/tautan/$id/coba-lagi')({
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
          const hasil = await cobaLagiTautanDrive({ tautanId: params.id, userId: session.user.id, now: new Date() })
          if (hasil === 'TIDAK_DITEMUKAN') {
            return Response.json({ error: 'Tautan tidak ditemukan' }, { status: 404 })
          }
          if (hasil === 'BUKAN_GAGAL') {
            return Response.json({ error: 'Tautan tidak dalam keadaan gagal' }, { status: 409 })
          }

          console.info('[laporan/tautan] coba lagi unggah Drive', { actor: session.user.id, tautanId: params.id })
          triggerDriveRunner()
          return Response.json({ success: true })
        } catch {
          console.error('[laporan/tautan/$id/coba-lagi] retry error')
          return Response.json({ error: 'Gagal menjadwalkan ulang unggahan' }, { status: 500 })
        }
      },
    },
  },
})
