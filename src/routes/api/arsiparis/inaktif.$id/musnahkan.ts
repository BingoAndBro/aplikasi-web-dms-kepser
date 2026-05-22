import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import { eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { arsip, arsipUsulMusnah } from '#/db/schema/arsip'
import { logAktivitas } from '#/db/schema/dokumen'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

// ---------------------------------------------------------------------------
// POST /api/arsiparis/inaktif/[id]/musnahkan
// Usulkan arsip untuk dimusnahkan (INAKTIF -> USUL_MUSNAH)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/inaktif/$id/musnahkan')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        if (!hasLocalRole(session, 'KEPALA_SUB_BAGIAN_UMUM')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const body = await request.json().catch(() => null)
        const catatan = typeof body?.catatan === 'string' ? body.catatan : null

        if (!isUuid(params.id)) return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })

        let arsipRows: Array<{ id: string; dokumen_id: string; status_arsip: string }>
        try {
          arsipRows = await db
            .select({
              id: arsip.id,
              dokumen_id: arsip.dokumenId,
              status_arsip: arsip.statusArsip,
            })
            .from(arsip)
            .where(eq(arsip.id, params.id))
            .limit(1)
        } catch (err) {
          console.error('[inaktif-musnahkan] arsip lookup error:', err)
          return Response.json({ error: 'Gagal mengusulkan pemusnahan' }, { status: 500 })
        }

        const arsipRecord = arsipRows[0]
        if (!arsipRecord) return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })
        if (arsipRecord.status_arsip !== 'INAKTIF') return Response.json({ error: 'Arsip bukan dalam status inaktif' }, { status: 400 })

        let existingRows: Array<{ id: string }>
        try {
          existingRows = await db
            .select({ id: arsipUsulMusnah.id })
            .from(arsipUsulMusnah)
            .where(eq(arsipUsulMusnah.arsipId, arsipRecord.id))
            .limit(1)
        } catch (err) {
          console.error('[inaktif-musnahkan] existing usul lookup error:', err)
          return Response.json({ error: 'Gagal mengusulkan pemusnahan' }, { status: 500 })
        }

        if (existingRows.length > 0) return Response.json({ error: 'Arsip sudah diusulkan untuk dimusnahkan' }, { status: 400 })

        try {
          await db.transaction(async (tx) => {
            await tx.insert(arsipUsulMusnah).values({
              arsipId: arsipRecord.id,
              status: 'MENUNGGU',
              diusulkanOleh: session.user.id,
              catatan,
            })

            const updatedRows = await tx
              .update(arsip)
              .set({ statusArsip: 'USUL_MUSNAH' })
              .where(eq(arsip.id, arsipRecord.id))
              .returning({ id: arsip.id })

            if (updatedRows.length === 0) {
              throw new Error('ARSIP_STATUS_UPDATE_NOT_FOUND')
            }

            await tx.insert(logAktivitas).values({
              dokumenId: arsipRecord.dokumen_id,
              userId: session.user.id,
              aksi: 'PINDAHKAN_USUL_MUSNAH',
              catatan,
              stepUrutan: null,
            })
          })
        } catch (err) {
          console.error('[inaktif-musnahkan] local transaction error:', err)
          return Response.json({ error: 'Gagal mengusulkan pemusnahan' }, { status: 500 })
        }

        return Response.json({ success: true, message: 'Arsip diusulkan untuk dimusnahkan' })
      },
    },
  },
})
