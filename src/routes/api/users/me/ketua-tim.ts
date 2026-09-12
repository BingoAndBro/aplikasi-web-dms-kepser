import { createFileRoute } from '@tanstack/react-router'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { ketuaTimAssignments, masterKegiatan } from '#/db/schema/master'
import {
  createUnauthorizedResponse,
  getLocalServerSession,
} from '#/lib/auth/local-server-auth'
import { computeDokumenAging } from '#/lib/dokumen/pembersihan'

// ---------------------------------------------------------------------------
// GET /api/users/me/ketua-tim — Get current user's chairman kegiatan
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/users/me/ketua-tim')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)

        if (!session) {
          return createUnauthorizedResponse('Unauthorized')
        }

        try {
          const kegiatan = await db
            .select({
              id: ketuaTimAssignments.kegiatanId,
              nama: masterKegiatan.nama,
            })
            .from(ketuaTimAssignments)
            .innerJoin(
              masterKegiatan,
              eq(ketuaTimAssignments.kegiatanId, masterKegiatan.id),
            )
            .where(eq(ketuaTimAssignments.userId, session.user.id))
            .orderBy(asc(masterKegiatan.nama))

          const staleNonMaterialCount = kegiatan.length > 0
            ? await countStaleNonMaterialDokumen(kegiatan.map((item) => item.id))
            : 0

          return Response.json({
            is_ketua_tim: kegiatan.length > 0,
            kegiatan,
            stale_non_material_count: staleNonMaterialCount,
          })
        } catch (error) {
          console.error('[API] /api/users/me/ketua-tim GET error:', error)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      }
    }
  }
})

async function countStaleNonMaterialDokumen(kegiatanIds: string[]): Promise<number> {
  const rows = await db
    .select({ tanggal: dokumenTransaksi.tanggal })
    .from(dokumenTransaksi)
    .where(and(
      inArray(dokumenTransaksi.kegiatanJenisId, kegiatanIds),
      eq(dokumenTransaksi.isNonMaterial, true),
      eq(dokumenTransaksi.status, 'TERSIMPAN'),
      isNull(dokumenTransaksi.jenisPermintaanId),
      isNull(dokumenTransaksi.kategoriPermintaanId),
      isNull(dokumenTransaksi.detailPermintaanId),
      isNull(dokumenTransaksi.lampiranDibersihkanAt),
    ))

  return rows.filter((row) => computeDokumenAging({ tanggal: row.tanggal }).isStale).length
}
