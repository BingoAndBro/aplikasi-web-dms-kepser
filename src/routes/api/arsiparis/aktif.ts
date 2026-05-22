import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { db } from '#/db/client'
import { arsip } from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { masterFungsi, masterKegiatan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'

function parseTahunFilter(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// ---------------------------------------------------------------------------
// GET /api/arsiparis/aktif - list arsip dengan status_arsip='AKTIF'
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/aktif')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, 'KEPALA_SUB_BAGIAN_UMUM')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const url = new URL(request.url)
        const fungsiId = url.searchParams.get('fungsi_id') ?? undefined
        const tahun = url.searchParams.get('tahun') ?? undefined
        const q = url.searchParams.get('q') ?? undefined

        const filters: SQL[] = [
          eq(arsip.statusArsip, 'AKTIF'),
          eq(arsip.isDitolak, false),
        ]
        if (fungsiId) filters.push(eq(dokumenTransaksi.fungsiId, fungsiId))
        if (tahun) {
          const parsedTahun = parseTahunFilter(tahun)
          if (parsedTahun === null) return Response.json({ aktif: [] })
          filters.push(eq(dokumenTransaksi.tahun, parsedTahun))
        }
        if (q) {
          const pattern = `%${q}%`
          filters.push(or(
            ilike(arsip.nomorSurat, pattern),
            ilike(dokumenTransaksi.judul, pattern),
          )!)
        }

        try {
          const rows = await db
            .select({
              id: arsip.id,
              nomor_surat: arsip.nomorSurat,
              judul_dokumen: dokumenTransaksi.judul,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
              archived_at: arsip.archivedAt,
              masa_aktif_berakhir: arsip.masaAktifBerakhir,
            })
            .from(arsip)
            .innerJoin(dokumenTransaksi, eq(arsip.dokumenId, dokumenTransaksi.id))
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .where(and(...filters))
            .orderBy(desc(arsip.archivedAt))

          return Response.json({
            aktif: rows.map((row) => ({
              id: row.id,
              nomor_surat: row.nomor_surat ?? '\u2014',
              judul_dokumen: row.judul_dokumen ?? '\u2014',
              fungsi_nama: row.fungsi_nama ?? '\u2014',
              kegiatan_nama: row.kegiatan_nama ?? '\u2014',
              archived_at: row.archived_at,
              masa_aktif_berakhir: row.masa_aktif_berakhir,
            })),
          })
        } catch (err) {
          console.error('[aktif] local query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },
    },
  },
})
