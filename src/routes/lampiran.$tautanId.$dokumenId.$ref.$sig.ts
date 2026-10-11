import { createFileRoute } from '@tanstack/react-router'

import { handleTautanLampiranRequest } from '#/lib/laporan/tautan'

// Tautan per lampiran: membuka satu berkas langsung di tab (inline), tanpa
// halaman aplikasi. Alamat dibuat dari halaman Tautan Laporan (tombol "Tautan"
// di samping Preview/Unduh). Tidak memuat token batch; lihat tautan-lampiran-link.ts.
export const Route = createFileRoute('/lampiran/$tautanId/$dokumenId/$ref/$sig')({
  ssr: false,
  server: {
    handlers: {
      GET: ({ request, params }: { request: Request; params: Record<string, string> }) =>
        handleTautanLampiranRequest({ request, params }),
    },
  },
})
