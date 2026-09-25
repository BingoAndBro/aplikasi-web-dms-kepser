import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db/client'
import { ketuaTimAssignments } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import {
  PEMBERSIHAN_BATCH_LIMIT,
  PEMBERSIHAN_DOKUMEN_CONFIRMATION_PHRASE,
} from '#/lib/dokumen/pembersihan'
import { executePembersihanLampiran } from '#/lib/dokumen/pembersihan-service'
import { requireSameOrigin } from '#/lib/security/same-origin'

const bodySchema = z
  .object({
    dokumen_ids: z.array(z.string().uuid()).min(1).max(PEMBERSIHAN_BATCH_LIMIT),
    confirmation: z.literal(PEMBERSIHAN_DOKUMEN_CONFIRMATION_PHRASE),
  })
  .strict()

// ---------------------------------------------------------------------------
// POST /api/pembersihan-dokumen/bersihkan - Ketua tim membersihkan LAMPIRAN
// FISIK sekumpulan dokumen non-material (metadata/baris tetap ada). Otorisasi
// per dokumen divalidasi ulang di server (lihat buildPembersihanPlan) --
// filter di UI TIDAK dipercaya. Lihat arsip/docs-2026-09-25:docs/planning/pembersihan-non-material/rencana.md.
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/pembersihan-dokumen/bersihkan')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, 'PEGAWAI')) {
          return Response.json({ error: 'Akses ditolak' }, { status: 403 })
        }

        const body = await request.json().catch(() => null)
        const parsed = bodySchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
        }

        let actorKegiatanIds: Set<string>
        try {
          const assignments = await db
            .select({ kegiatan_id: ketuaTimAssignments.kegiatanId })
            .from(ketuaTimAssignments)
            .where(eq(ketuaTimAssignments.userId, session.user.id))

          actorKegiatanIds = new Set(assignments.map((assignment) => assignment.kegiatan_id))
        } catch (error) {
          console.error('[API] /api/pembersihan-dokumen/bersihkan assignment lookup error:', error)
          return Response.json({ error: 'Gagal membersihkan dokumen' }, { status: 500 })
        }

        if (actorKegiatanIds.size === 0) {
          return Response.json({ error: 'Anda bukan ketua tim kegiatan manapun' }, { status: 403 })
        }

        try {
          const report = await executePembersihanLampiran({
            dokumenIds: parsed.data.dokumen_ids,
            actorUserId: session.user.id,
            actorKegiatanIds,
          })

          return Response.json({ success: true, report })
        } catch (error) {
          console.error('[API] /api/pembersihan-dokumen/bersihkan execute error:', error)
          return Response.json({ error: 'Gagal membersihkan dokumen' }, { status: 500 })
        }
      },
    },
  },
})
