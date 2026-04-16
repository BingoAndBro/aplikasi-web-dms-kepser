import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'
import { updateDokumenSchema } from '#/lib/schemas/dokumen'
import {
  getDokumenById,
  updateDokumen,
  userHasApproverRole,
} from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/dokumen/[id] — Get dokumen detail
// PATCH /api/dokumen/[id] — Update lampiran_urls (NEED_REVISION target=USER only)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const dok = await getDokumenById(supabase, params.id)

        if (!dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        // Ownership check: own dokumen, or approver role
        const isOwner = dok.created_by === session.user.id
        const isApprover = await userHasApproverRole(supabase, session.user.id)

        if (!isOwner && !isApprover) {
          return Response.json({ error: 'Anda tidak memiliki akses ke dokumen ini' }, { status: 403 })
        }

        return Response.json({ dokumen: dok })
      },

      PATCH: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = updateDokumenSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: parsed.error.flatten(),
          }, { status: 400 })
        }

        const supabase = createClient(request)
        const session = await getSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const dok = await getDokumenById(supabase, params.id)

        if (!dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        if (dok.created_by !== session.user.id) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        if (dok.status !== 'NEED_REVISION') {
          return Response.json({ error: 'Dokumen tidak bisa diedit — status bukan NEED_REVISION' }, { status: 400 })
        }

        if (dok.revision_target !== 'USER') {
          return Response.json({ error: 'Dokumen ini perlu direvisi oleh PPK, bukan oleh Anda' }, { status: 400 })
        }

        const result = await updateDokumen(supabase, params.id, {
          lampiranUrls: parsed.data.lampiranUrls,
        })

        if (result.error) {
          return Response.json({ error: result.error }, { status: 500 })
        }

        return Response.json({ dokumen: result.data })
      },
    },
  },
})
