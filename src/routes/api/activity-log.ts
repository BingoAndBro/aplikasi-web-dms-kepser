import { createFileRoute } from '@tanstack/react-router'
import { desc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { users } from '#/db/schema/auth'
import { berkasArsip, berkasArsipActivity, manualArsip } from '#/db/schema/arsip'
import { dokumenTransaksi, logAktivitas } from '#/db/schema/dokumen'
import { getLocalServerSession, hasAnyLocalRole } from '#/lib/auth/local-server-auth'
import { isBerkasActivityEventType } from '#/lib/archive/berkas-arsip-activity'
import { resolveAksiRole } from '#/lib/dokumen/aksi-labels'
import type { RoleName } from '#/lib/constants/roles'

const MAX_ROWS = 500

// Roles allowed to view every user's activity, not just their own.
const GLOBAL_SCOPE_ROLES = ['ADMIN', 'PENANGGUNG_JAWAB_KINERJA'] as const

type ActivityLogEntry = {
  id: string
  aksi: string
  catatan: string | null
  timestamp: Date
  dokumenId: string
  dokumenJudul: string
  userId: string | null
  userNama: string
  role: RoleName | null
}

function displayUserName(user: {
  displayName: string | null
  namaLengkap: string | null
  username: string | null
} | null): string {
  return user?.displayName
    ?? user?.namaLengkap
    ?? user?.username
    ?? 'Unknown'
}

// ---------------------------------------------------------------------------
// GET /api/activity-log — Riwayat aktivitas lintas dokumen DAN lintas berkas
// arsip. `scope=all` (Admin dan Penanggung Jawab Kinerja) menampilkan
// aktivitas seluruh user; selain itu hanya menampilkan aktivitas milik
// pemanggil sendiri.
//
// Sumbernya dua tabel terpisah karena domainnya memang terpisah:
// - `dokumen.log_aktivitas` — alur submit/approve/reject dokumen (Pegawai,
//   PPK, PPSPM, dan update nominal oleh Pegawai/Kasubag).
// - `arsip.berkas_arsip_activity` — alur pemberkasan (buka/tutup berkas,
//   klasifikasi dokumen, penambahan dokumen manual, pemusnahan), yang
//   seluruhnya aksi Kasubag (KEPALA_SUB_BAGIAN_UMUM) — lihat guard role di
//   src/routes/api/kasubag/dokumen.$id.archive.ts dan pemanggil
//   `berkasArsipActivity` lainnya.
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/activity-log')({
  ssr: false,
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const url = new URL(request.url)
        const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'self'

        if (scope === 'all' && !hasAnyLocalRole(session, [...GLOBAL_SCOPE_ROLES])) {
          return Response.json({ error: 'Anda tidak memiliki akses ke log aktivitas seluruh user' }, { status: 403 })
        }

        try {
          const dokumenWhere = scope === 'all' ? undefined : eq(logAktivitas.userId, session.user.id)

          const dokumenRows = await db
            .select({
              id: logAktivitas.id,
              aksi: logAktivitas.aksi,
              catatan: logAktivitas.catatan,
              timestamp: logAktivitas.timestamp,
              dokumen_id: logAktivitas.dokumenId,
              dokumen_judul: dokumenTransaksi.judul,
              dokumen_created_by: dokumenTransaksi.createdBy,
              user_id: logAktivitas.userId,
              user_display_name: users.displayName,
              user_nama_lengkap: users.namaLengkap,
              user_username: users.username,
            })
            .from(logAktivitas)
            .innerJoin(dokumenTransaksi, eq(logAktivitas.dokumenId, dokumenTransaksi.id))
            .leftJoin(users, eq(logAktivitas.userId, users.id))
            .where(dokumenWhere)
            .orderBy(desc(logAktivitas.timestamp))
            .limit(MAX_ROWS)

          const dokumenLogs: ActivityLogEntry[] = dokumenRows.map((row) => ({
            id: row.id,
            aksi: row.aksi,
            catatan: row.catatan,
            timestamp: row.timestamp,
            dokumenId: row.dokumen_id,
            dokumenJudul: row.dokumen_judul,
            userId: row.user_id,
            userNama: displayUserName({
              displayName: row.user_display_name,
              namaLengkap: row.user_nama_lengkap,
              username: row.user_username,
            }),
            role: resolveAksiRole(row.aksi, {
              actorId: row.user_id,
              dokumenCreatedBy: row.dokumen_created_by,
            }),
          }))

          const berkasWhere = scope === 'all' ? undefined : eq(berkasArsipActivity.actorUserId, session.user.id)

          const berkasRows = await db
            .select({
              id: berkasArsipActivity.id,
              event_type: berkasArsipActivity.eventType,
              catatan: berkasArsipActivity.catatan,
              timestamp: berkasArsipActivity.createdAt,
              berkas_id: berkasArsipActivity.berkasId,
              berkas_klasifikasi_nama: berkasArsip.klasifikasiNamaSnapshot,
              workflow_dokumen_id: berkasArsipActivity.workflowDocumentId,
              workflow_dokumen_judul: dokumenTransaksi.judul,
              manual_dokumen_id: berkasArsipActivity.manualDocumentId,
              manual_dokumen_nama: manualArsip.nama,
              user_id: berkasArsipActivity.actorUserId,
              user_display_name: users.displayName,
              user_nama_lengkap: users.namaLengkap,
              user_username: users.username,
            })
            .from(berkasArsipActivity)
            .innerJoin(berkasArsip, eq(berkasArsipActivity.berkasId, berkasArsip.id))
            .leftJoin(dokumenTransaksi, eq(berkasArsipActivity.workflowDocumentId, dokumenTransaksi.id))
            .leftJoin(manualArsip, eq(berkasArsipActivity.manualDocumentId, manualArsip.id))
            .leftJoin(users, eq(berkasArsipActivity.actorUserId, users.id))
            .where(berkasWhere)
            .orderBy(desc(berkasArsipActivity.createdAt))
            .limit(MAX_ROWS)

          const berkasLogs: ActivityLogEntry[] = berkasRows.map((row) => ({
            id: row.id,
            aksi: row.event_type,
            catatan: row.catatan,
            timestamp: row.timestamp,
            dokumenId: row.workflow_dokumen_id ?? row.manual_dokumen_id ?? row.berkas_id,
            dokumenJudul: row.workflow_dokumen_judul
              ?? row.manual_dokumen_nama
              ?? `Berkas ${row.berkas_klasifikasi_nama}`,
            userId: row.user_id,
            userNama: row.user_id
              ? displayUserName({
                displayName: row.user_display_name,
                namaLengkap: row.user_nama_lengkap,
                username: row.user_username,
              })
              : 'Sistem',
            // Every berkas_arsip_activity write path is Kasubag-gated — see
            // module doc comment above.
            role: isBerkasActivityEventType(row.event_type) ? 'KEPALA_SUB_BAGIAN_UMUM' : null,
          }))

          const logs = [...dokumenLogs, ...berkasLogs]
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, MAX_ROWS)

          return Response.json({ logs, scope })
        } catch (err) {
          console.error('[API/activity-log] query error:', err)
          return Response.json({ error: 'Gagal mengambil log aktivitas' }, { status: 500 })
        }
      },
    },
  },
})
