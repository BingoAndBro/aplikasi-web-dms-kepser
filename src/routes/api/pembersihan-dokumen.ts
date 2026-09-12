import { createFileRoute } from '@tanstack/react-router'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '#/db/client'
import { users } from '#/db/schema/auth'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { ketuaTimAssignments, masterKegiatan } from '#/db/schema/master'
import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import { computeDokumenAging, NON_MATERIAL_STALE_DAYS } from '#/lib/dokumen/pembersihan'

function displayUserName(user: {
  displayName: string | null
  namaLengkap: string | null
  email: string | null
} | null): string {
  return user?.displayName
    ?? user?.namaLengkap
    ?? user?.email?.split('@')[0]
    ?? 'Unknown'
}

// ---------------------------------------------------------------------------
// GET /api/pembersihan-dokumen - Dokumen non-material (TERSIMPAN) dari
// kegiatan yang dipimpin caller sebagai ketua tim. Lihat
// docs/planning/pembersihan-non-material/rencana.md.
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/pembersihan-dokumen')({
  ssr: false,
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const assignments = await db
            .select({ kegiatan_id: ketuaTimAssignments.kegiatanId })
            .from(ketuaTimAssignments)
            .where(eq(ketuaTimAssignments.userId, session.user.id))

          if (assignments.length === 0) {
            return Response.json({
              dokumen: [],
              is_ketua_tim: false,
              stale_count: 0,
              stale_days: NON_MATERIAL_STALE_DAYS,
            })
          }

          const kegiatanIds = assignments.map((assignment) => assignment.kegiatan_id)

          const rows = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              nama_dokumen: dokumenTransaksi.namaDokumen,
              tanggal: dokumenTransaksi.tanggal,
              tahun: dokumenTransaksi.tahun,
              created_by: dokumenTransaksi.createdBy,
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              kegiatan_nama: masterKegiatan.nama,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
              pengaju_display_name: users.displayName,
              pengaju_nama_lengkap: users.namaLengkap,
              pengaju_email: users.email,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .leftJoin(users, eq(dokumenTransaksi.createdBy, users.id))
            .where(and(
              inArray(dokumenTransaksi.kegiatanJenisId, kegiatanIds),
              eq(dokumenTransaksi.isNonMaterial, true),
              eq(dokumenTransaksi.status, 'TERSIMPAN'),
              isNull(dokumenTransaksi.jenisPermintaanId),
              isNull(dokumenTransaksi.kategoriPermintaanId),
              isNull(dokumenTransaksi.detailPermintaanId),
              // Halaman ini khusus dokumen yang BELUM dibersihkan. Yang sudah
              // bersih tetap bisa dilihat lewat Laporan Kegiatan / detail
              // dokumen (dengan badge "File Dibersihkan").
              isNull(dokumenTransaksi.lampiranDibersihkanAt),
            ))

          let staleCount = 0

          const dokumen = rows.map((row) => {
            const aging = computeDokumenAging({ tanggal: row.tanggal })
            if (aging.isStale) staleCount += 1

            const lampiranUrls = Array.isArray(row.lampiran_urls) ? row.lampiran_urls : []

            return {
              id: row.id,
              judul: row.judul,
              nama_dokumen: row.nama_dokumen,
              tanggal: row.tanggal,
              tahun: row.tahun,
              created_by: row.created_by,
              pengaju_nama: displayUserName({
                displayName: row.pengaju_display_name,
                namaLengkap: row.pengaju_nama_lengkap,
                email: row.pengaju_email,
              }),
              kegiatan_jenis_id: row.kegiatan_jenis_id,
              kegiatan_nama: row.kegiatan_nama ?? undefined,
              jumlah_lampiran: lampiranUrls.length,
              umur_hari: aging.umurHari,
              is_stale: aging.isStale,
            }
          })

          return Response.json({
            dokumen,
            is_ketua_tim: true,
            stale_count: staleCount,
            stale_days: NON_MATERIAL_STALE_DAYS,
          })
        } catch (error) {
          console.error('[API] /api/pembersihan-dokumen GET error:', error)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },
    },
  },
})
