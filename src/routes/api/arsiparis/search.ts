import { createFileRoute } from '@tanstack/react-router'
import { desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '#/db/client'
import { arsip } from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { masterFungsi, masterKegiatan } from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'

// ---------------------------------------------------------------------------
// GET /api/arsiparis/search - search arsip (semua authenticated user)
// Hasil difilter berdasarkan role:
//   - ADMIN/ARSIPARIS: semua arsip
//   - PPK: arsip dari dokumen yang pernah masuk workflow PPK (status-based local approximation)
//   - Bendahara: arsip dari dokumen COMPLETED
//   - Pegawai: arsip dari dokumen miliknya sendiri
// ---------------------------------------------------------------------------

const PER_PAGE = 20

function parseTahunFilter(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const Route = createFileRoute('/api/arsiparis/search')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const url = new URL(request.url)
        const fungsiId = url.searchParams.get('fungsi_id') ?? undefined
        const kegiatanId = url.searchParams.get('kegiatan_id') ?? undefined
        const tahun = url.searchParams.get('tahun') ?? undefined
        const q = url.searchParams.get('q') ?? undefined
        const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
        const offset = (page - 1) * PER_PAGE
        const parsedTahun = tahun ? parseTahunFilter(tahun) : null

        const isAdmin = hasLocalRole(session, 'ADMIN')
        const isArsiparis = hasLocalRole(session, 'ARSIPARIS')
        const isPPK = hasLocalRole(session, 'PPK')
        const isBendahara = hasLocalRole(session, 'BENDAHARA')

        try {
          const totalRows = await db
            .select({ count: sql<number>`count(*)` })
            .from(arsip)
            .where(eq(arsip.isDitolak, false))
          const total = Number(totalRows[0]?.count ?? 0)

          const arsipRows = await db
            .select({
              id: arsip.id,
              dokumen_id: arsip.dokumenId,
              nomor_surat: arsip.nomorSurat,
              klasifikasi: arsip.klasifikasi,
              archived_at: arsip.archivedAt,
              status_arsip: arsip.statusArsip,
            })
            .from(arsip)
            .where(eq(arsip.isDitolak, false))
            .orderBy(desc(arsip.archivedAt))
            .limit(PER_PAGE)
            .offset(offset)

          if (arsipRows.length === 0) {
            return Response.json({ arsip: [], total: 0, page, per_page: PER_PAGE })
          }

          const docIds = arsipRows.map((row) => row.dokumen_id)
          const docs = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              fungsi_id: dokumenTransaksi.fungsiId,
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              tahun: dokumenTransaksi.tahun,
              created_by: dokumenTransaksi.createdBy,
              status: dokumenTransaksi.status,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .where(inArray(dokumenTransaksi.id, docIds))

          const allowedDocs = docs.filter((doc) => {
            if (isAdmin || isArsiparis) return true
            if (isPPK) {
              return ['IN_BENDAHARA_APPROVAL', 'COMPLETED', 'ARCHIVED'].includes(doc.status)
            }
            if (isBendahara) return doc.status === 'COMPLETED'
            return doc.created_by === session.user.id
          })
          const docMap = new Map(allowedDocs.map((doc) => [doc.id, doc]))

          let filteredArsip = arsipRows.filter((row) => docMap.has(row.dokumen_id))
          if (fungsiId) filteredArsip = filteredArsip.filter((row) => docMap.get(row.dokumen_id)?.fungsi_id === fungsiId)
          if (kegiatanId) filteredArsip = filteredArsip.filter((row) => docMap.get(row.dokumen_id)?.kegiatan_jenis_id === kegiatanId)
          if (tahun) {
            filteredArsip = parsedTahun === null
              ? []
              : filteredArsip.filter((row) => docMap.get(row.dokumen_id)?.tahun === parsedTahun)
          }
          if (q) {
            const lowerQ = q.toLowerCase()
            filteredArsip = filteredArsip.filter((row) => {
              const doc = docMap.get(row.dokumen_id)
              return (row.nomor_surat?.toLowerCase().includes(lowerQ) ?? false)
                || (doc?.judul.toLowerCase().includes(lowerQ) ?? false)
            })
          }

          const result = filteredArsip.map((row) => {
            const doc = docMap.get(row.dokumen_id)
            return {
              id: row.id,
              nomor_surat: row.nomor_surat ?? '\u2014',
              judul: doc?.judul ?? '\u2014',
              fungsi_nama: doc?.fungsi_nama ?? '\u2014',
              kegiatan_nama: doc?.kegiatan_nama ?? '\u2014',
              klasifikasi: row.klasifikasi ?? '\u2014',
              archived_at: row.archived_at,
              status_arsip: row.status_arsip,
            }
          })

          return Response.json({ arsip: result, total, page, per_page: PER_PAGE })
        } catch (err) {
          console.error('[arsiparis/search] local query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },
    },
  },
})
