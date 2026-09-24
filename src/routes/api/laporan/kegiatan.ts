import { createFileRoute } from '@tanstack/react-router'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '#/db/client'
import { users } from '#/db/schema/auth'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  ketuaTimAssignments,
  masterDetailPermintaan,
  masterFungsi,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
  masterKomponen,
} from '#/db/schema/master'
import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import { parseLampiranUrls } from '#/lib/dokumen'

function normalizeNumericValue(value: string | number | null): number | null {
  if (value === null) return null
  if (typeof value === 'number') return value

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
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
// GET /api/laporan/kegiatan - Semua dokumen dari kegiatan yang dipimpin user
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/laporan/kegiatan')({
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
            return Response.json({ dokumen: [], isKetuaTim: false })
          }

          const kegiatanIds = assignments.map((assignment) => assignment.kegiatan_id)

          const rows = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              fungsi_id: dokumenTransaksi.fungsiId,
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              is_ketua_tim: dokumenTransaksi.isKetuaTim,
              status: dokumenTransaksi.status,
              current_step: dokumenTransaksi.currentStep,
              revision_target: dokumenTransaksi.revisionTarget,
              revision_notes: dokumenTransaksi.revisionNotes,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
              tahun: dokumenTransaksi.tahun,
              tanggal: dokumenTransaksi.tanggal,
              created_by: dokumenTransaksi.createdBy,
              nominal_realisasi: dokumenTransaksi.nominalRealisasi,
              is_non_material: dokumenTransaksi.isNonMaterial,
              nama_dokumen: dokumenTransaksi.namaDokumen,
              keterangan_detail: dokumenTransaksi.keteranganDetail,
              created_at: dokumenTransaksi.createdAt,
              updated_at: dokumenTransaksi.updatedAt,
              lampiran_dibersihkan_at: dokumenTransaksi.lampiranDibersihkanAt,
              lampiran_dibersihkan_alasan: dokumenTransaksi.lampiranDibersihkanAlasan,
              komponen_id: dokumenTransaksi.komponenId,
              komponen_nama: masterKomponen.nama,
              jenis_permintaan_id: dokumenTransaksi.jenisPermintaanId,
              kategori_permintaan_id: dokumenTransaksi.kategoriPermintaanId,
              detail_permintaan_id: dokumenTransaksi.detailPermintaanId,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
              jenis_permintaan_nama: masterJenisPermintaan.nama,
              kategori_permintaan_nama: masterKategoriPermintaan.nama,
              detail_permintaan_nama: masterDetailPermintaan.nama,
              pengaju_display_name: users.displayName,
              pengaju_nama_lengkap: users.namaLengkap,
              pengaju_username: users.username,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .leftJoin(masterKomponen, eq(dokumenTransaksi.komponenId, masterKomponen.id))
            .leftJoin(masterJenisPermintaan, eq(dokumenTransaksi.jenisPermintaanId, masterJenisPermintaan.id))
            .leftJoin(masterKategoriPermintaan, eq(dokumenTransaksi.kategoriPermintaanId, masterKategoriPermintaan.id))
            .leftJoin(masterDetailPermintaan, eq(dokumenTransaksi.detailPermintaanId, masterDetailPermintaan.id))
            .leftJoin(users, eq(dokumenTransaksi.createdBy, users.id))
            .where(and(
              inArray(dokumenTransaksi.kegiatanJenisId, kegiatanIds),
              inArray(dokumenTransaksi.status, ['COMPLETED', 'TERSIMPAN']),
            ))

          return Response.json({
            dokumen: rows.map((row) => ({
              id: row.id,
              judul: row.judul,
              fungsi_id: row.fungsi_id,
              kegiatan_jenis_id: row.kegiatan_jenis_id,
              is_ketua_tim: row.is_ketua_tim,
              status: row.status,
              current_step: row.current_step,
              revision_target: row.revision_target,
              revision_notes: row.revision_notes,
              lampiran_urls: parseLampiranUrls(row.lampiran_urls),
              tahun: row.tahun,
              tanggal: row.tanggal,
              created_by: row.created_by,
              nominal_realisasi: normalizeNumericValue(row.nominal_realisasi),
              is_non_material: row.is_non_material ?? false,
              nama_dokumen: row.nama_dokumen ?? null,
              keterangan_detail: row.keterangan_detail ?? null,
              created_at: row.created_at,
              updated_at: row.updated_at,
              lampiran_dibersihkan_at: row.lampiran_dibersihkan_at,
              lampiran_dibersihkan_alasan: row.lampiran_dibersihkan_alasan,
              komponen_id: row.komponen_id ?? null,
              komponen_nama: row.komponen_nama ?? undefined,
              jenis_permintaan_id: row.jenis_permintaan_id,
              kategori_permintaan_id: row.kategori_permintaan_id,
              detail_permintaan_id: row.detail_permintaan_id,
              fungsi_nama: row.fungsi_nama ?? undefined,
              kegiatan_nama: row.kegiatan_nama ?? undefined,
              jenis_permintaan_nama: row.jenis_permintaan_nama ?? undefined,
              kategori_permintaan_nama: row.kategori_permintaan_nama ?? undefined,
              detail_permintaan_nama: row.detail_permintaan_nama ?? undefined,
              leaf_node_nama: row.is_non_material
                ? (row.nama_dokumen ?? '')
                : (row.detail_permintaan_nama
                  ?? row.kategori_permintaan_nama
                  ?? row.jenis_permintaan_nama
                  ?? row.komponen_nama
                  ?? row.kegiatan_nama
                  ?? ''),
              pengaju_id: row.created_by,
              pengaju_nama: displayUserName({
                displayName: row.pengaju_display_name,
                namaLengkap: row.pengaju_nama_lengkap,
                username: row.pengaju_username,
              }),
            })),
            isKetuaTim: true,
          })
        } catch (err) {
          console.error('[laporan/kegiatan] GET local query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },
    },
  },
})
