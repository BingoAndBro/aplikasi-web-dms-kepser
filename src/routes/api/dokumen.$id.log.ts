import { createFileRoute } from '@tanstack/react-router'
import { asc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { users } from '#/db/schema/auth'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value)
}

function canSessionReadDokumenLog(
  session: Awaited<ReturnType<typeof getLocalServerSession>>,
  dokumen: { created_by: string; status: string; revision_target: string | null },
): boolean {
  if (!session) return false
  if (dokumen.created_by === session.user.id) return true
  if (hasLocalRole(session, 'PPK')) {
    return [
      'IN_PPK_VALIDATION',
      'IN_BENDAHARA_APPROVAL',
      'NEED_REVISION',
      'COMPLETED',
      'ARCHIVED',
    ].includes(dokumen.status)
  }
  if (hasLocalRole(session, 'BENDAHARA')) {
    return dokumen.status === 'IN_BENDAHARA_APPROVAL'
      || dokumen.status === 'COMPLETED'
      || dokumen.status === 'ARCHIVED'
      || (dokumen.status === 'NEED_REVISION' && dokumen.revision_target === 'PPK')
  }
  if (hasLocalRole(session, 'ARSIPARIS')) {
    return dokumen.status === 'COMPLETED' || dokumen.status === 'ARCHIVED'
  }

  return false
}

// ---------------------------------------------------------------------------
// GET /api/dokumen/[id]/log — Get activity log for a dokumen
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/$id/log')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        try {
          const dokRows = await db
            .select({
              id: dokumenTransaksi.id,
              created_by: dokumenTransaksi.createdBy,
              status: dokumenTransaksi.status,
              revision_target: dokumenTransaksi.revisionTarget,
            })
            .from(dokumenTransaksi)
            .where(eq(dokumenTransaksi.id, params.id))
            .limit(1)

          const dok = dokRows[0]
          if (!dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

          if (!canSessionReadDokumenLog(session, dok)) {
            return Response.json({ error: 'Anda tidak memiliki akses ke log dokumen ini' }, { status: 403 })
          }

          const logs = await db
            .select({
              id: logAktivitas.id,
              aksi: logAktivitas.aksi,
              catatan: logAktivitas.catatan,
              step_urutan: logAktivitas.stepUrutan,
              timestamp: logAktivitas.timestamp,
              user_id: logAktivitas.userId,
              user_display_name: users.displayName,
              user_nama_lengkap: users.namaLengkap,
              user_email: users.email,
            })
            .from(logAktivitas)
            .leftJoin(users, eq(logAktivitas.userId, users.id))
            .where(eq(logAktivitas.dokumenId, params.id))
            .orderBy(asc(logAktivitas.timestamp))

          const formattedLogs = logs.map((log) => ({
            id: log.id,
            aksi: log.aksi,
            catatan: log.catatan,
            stepUrutan: log.step_urutan,
            createdAt: log.timestamp,
            userId: log.user_id,
            userNama: log.user_display_name ?? log.user_nama_lengkap ?? log.user_email ?? 'Unknown',
            userEmail: log.user_email ?? '',
          }))

          return Response.json({ logs: formattedLogs })
        } catch (err) {
          console.error('[API/dokumen/:id/log] local query error:', err)
          return Response.json({ error: 'Gagal mengambil log aktivitas' }, { status: 500 })
        }
      },
    },
  },
})
