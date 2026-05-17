import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq, type SQL } from 'drizzle-orm'
import { db } from '#/db/client'
import { arsip, arsipUsulMusnah } from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { masterFungsi } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'

function parseTahunFilter(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// ---------------------------------------------------------------------------
// GET /api/arsiparis/usul-musnah - list arsip USUL_MUSNAH
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/usul-musnah')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, 'ARSIPARIS')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const url = new URL(request.url)
        const fungsiId = url.searchParams.get('fungsi_id') ?? undefined
        const tahun = url.searchParams.get('tahun') ?? undefined

        const filters: SQL[] = [
          eq(arsip.statusArsip, 'USUL_MUSNAH'),
          eq(arsip.isDitolak, false),
        ]
        if (fungsiId) filters.push(eq(dokumenTransaksi.fungsiId, fungsiId))
        if (tahun) {
          const parsedTahun = parseTahunFilter(tahun)
          if (parsedTahun === null) return Response.json({ usul_musnah: [] })
          filters.push(eq(dokumenTransaksi.tahun, parsedTahun))
        }

        try {
          const rows = await db
            .select({
              arsip_id: arsip.id,
              musnah_id: arsipUsulMusnah.id,
              nomor_surat: arsip.nomorSurat,
              judul_dokumen: dokumenTransaksi.judul,
              fungsi_nama: masterFungsi.nama,
              musnah_status: arsipUsulMusnah.status,
              diusulkan_oleh: arsipUsulMusnah.diusulkanOleh,
              created_at: arsipUsulMusnah.createdAt,
              decided_by: arsipUsulMusnah.decidedBy,
              decided_at: arsipUsulMusnah.decidedAt,
              catatan: arsipUsulMusnah.catatan,
            })
            .from(arsip)
            .innerJoin(arsipUsulMusnah, eq(arsip.id, arsipUsulMusnah.arsipId))
            .innerJoin(dokumenTransaksi, eq(arsip.dokumenId, dokumenTransaksi.id))
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .where(and(...filters))
            .orderBy(desc(arsip.archivedAt))

          return Response.json({
            usul_musnah: rows.map((row) => ({
              arsip_id: row.arsip_id,
              musnah_id: row.musnah_id,
              nomor_surat: row.nomor_surat ?? '\u2014',
              judul_dokumen: row.judul_dokumen ?? '\u2014',
              fungsi_nama: row.fungsi_nama ?? '\u2014',
              musnah_status: row.musnah_status as 'MENUNGGU' | 'DISETUJUI' | 'DITOLAK',
              diusulkan_oleh: row.diusulkan_oleh,
              created_at: row.created_at,
              decided_by: row.decided_by,
              decided_at: row.decided_at,
              catatan: row.catatan,
            })),
          })
        } catch (err) {
          console.error('[usul-musnah] local query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },
    },
  },
})
