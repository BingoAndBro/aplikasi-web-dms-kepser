import { createFileRoute } from '@tanstack/react-router'
import {
  listManualArsipCategories,
  requireManualArsipApiSession,
  toSafeErrorLog,
} from '#/lib/manual-arsip'

export const Route = createFileRoute('/api/arsiparis/manual-arsip/categories')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const sessionOrResponse = await requireManualArsipApiSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        try {
          const categories = await listManualArsipCategories()
          return Response.json({ categories })
        } catch (err) {
          console.error('[arsiparis/manual-arsip/categories] GET local query error:', toSafeErrorLog(err))
          return Response.json({ error: 'Gagal mengambil kategori dokumen manual' }, { status: 500 })
        }
      },
    },
  },
})
