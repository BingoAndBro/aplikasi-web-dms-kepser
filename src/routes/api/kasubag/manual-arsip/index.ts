import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import {
  MANUAL_ARSIP_LIST_DEFAULT_LIMIT,
  ManualArsipApiError,
  createManualArsipRecord,
  listManualArsipRecords,
  requireManualArsipApiSession,
  toSafeErrorLog,
} from '#/lib/manual-arsip'
import {
  createManualArsipSchema,
  listManualArsipQuerySchema,
} from '#/lib/schemas/manual-arsip'

export const Route = createFileRoute('/api/kasubag/manual-arsip/')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const sessionOrResponse = await requireManualArsipApiSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        const url = new URL(request.url)
        const rawQuery = Object.fromEntries(
          [...url.searchParams.entries()].filter(([, value]) => value !== ''),
        )
        const parsed = listManualArsipQuerySchema.safeParse({
          limit: MANUAL_ARSIP_LIST_DEFAULT_LIMIT,
          ...rawQuery,
        })

        if (!parsed.success) {
          return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
        }

        try {
          const manual_arsip = await listManualArsipRecords(parsed.data)
          return Response.json({
            manual_arsip,
            meta: {
              limit: parsed.data.limit,
            },
          })
        } catch (err) {
          console.error('[arsiparis/manual-arsip] GET local query error:', toSafeErrorLog(err))
          return Response.json({ error: 'Gagal mengambil dokumen manual' }, { status: 500 })
        }
      },

      POST: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const sessionOrResponse = await requireManualArsipApiSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Body tidak valid' }, { status: 400 })

        const parsed = createManualArsipSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
        }

        try {
          const manual_arsip = await createManualArsipRecord(parsed.data, sessionOrResponse.user.id)
          return Response.json({ manual_arsip }, { status: 201 })
        } catch (err) {
          if (err instanceof ManualArsipApiError) {
            return Response.json({ error: err.message }, { status: err.status })
          }

          console.error('[arsiparis/manual-arsip] POST local query error:', toSafeErrorLog(err))
          return Response.json({ error: 'Gagal membuat dokumen manual' }, { status: 500 })
        }
      },
    },
  },
})
