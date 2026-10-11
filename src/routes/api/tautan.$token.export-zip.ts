import { createFileRoute } from '@tanstack/react-router'

import { createTautanZipResponse, requireTautanViewer } from '#/lib/laporan/tautan'

// "Unduh Semua (ZIP)" di halaman tautan: GET biasa yang dinavigasi browser
// (sama seperti ekspor berkas KSBU), jadi unduhan ditangani browser sendiri.
// Tidak perlu tiket: daftar dokumennya sudah tersimpan di snapshot tautan.
// Tautan PUBLIK boleh dipanggil tanpa sesi (dibatasi per tautan di service).
export const Route = createFileRoute('/api/tautan/$token/export-zip')({
  ssr: false,
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        try {
          const viewer = await requireTautanViewer(request, params.token)
          if (viewer instanceof Response) return viewer

          const response = await createTautanZipResponse(viewer.session, viewer.tautan)
          console.info('[tautan/$token/export-zip] export completed', {
            actor: viewer.session?.user.id ?? 'anonymous',
            tautanId: viewer.tautan.id,
          })
          return response
        } catch {
          console.error('[tautan/$token/export-zip] export error')
          return Response.json({ error: 'Gagal membuat ekspor ZIP' }, { status: 500 })
        }
      },
    },
  },
})
