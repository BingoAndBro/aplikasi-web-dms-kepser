import { createFileRoute } from '@tanstack/react-router'
import { getOrCreateOpenBerkasForKlasifikasi } from '#/lib/archive/berkas-arsip-service'
import {
  berkasArsipErrorResponse,
  requireBerkasArsipApiSession,
  safeBerkasDto,
} from '#/lib/archive/berkas-arsip-api'
import { openBerkasRequestSchema } from '#/lib/schemas/berkas-arsip'
import { requireSameOrigin } from '#/lib/security/same-origin'

export const Route = createFileRoute('/api/kasubag/berkas/open')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const sessionOrResponse = await requireBerkasArsipApiSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        const parsed = openBerkasRequestSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.issues[0]?.message ?? 'Body tidak valid' },
            { status: 400 },
          )
        }

        try {
          const berkas = await getOrCreateOpenBerkasForKlasifikasi({
            klasifikasiId: parsed.data.klasifikasi_id,
            tahunAnggaran: parsed.data.tahun_anggaran,
            actorUserId: sessionOrResponse.user.id,
          })

          return Response.json({ berkas: safeBerkasDto(berkas) })
        } catch (error) {
          return berkasArsipErrorResponse(error)
        }
      },
    },
  },
})
