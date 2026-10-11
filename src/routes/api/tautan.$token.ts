import { createFileRoute } from '@tanstack/react-router'

import { buildTautanDetail, requireTautanViewer } from '#/lib/laporan/tautan'
import { recordTautanAccess } from '#/lib/laporan/tautan-repository'

// Isi Tautan Laporan untuk halaman /tautan/$token. Tautan LOGIN wajib login
// (role apa pun); tautan PUBLIK terbuka tanpa akun. Keduanya: isi snapshot
// sudah diotorisasi terhadap pembuat tautan saat dibuat.
export const Route = createFileRoute('/api/tautan/$token')({
  ssr: false,
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        try {
          const viewer = await requireTautanViewer(request, params.token)
          if (viewer instanceof Response) return viewer

          const detail = await buildTautanDetail(viewer.tautan)

          try {
            await recordTautanAccess(viewer.tautan.id)
          } catch {
            // Penghitung akses hanya informasi; jangan gagalkan pembukaan tautan.
            console.error('[tautan/$token] gagal mencatat akses')
          }

          return Response.json(detail, { headers: { 'Cache-Control': 'no-store' } })
        } catch {
          console.error('[tautan/$token] load error')
          return Response.json({ error: 'Gagal memuat isi tautan' }, { status: 500 })
        }
      },
    },
  },
})
