import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { users } from '#/db/schema/auth'
import { arsip } from '#/db/schema/arsip'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  masterDetailPermintaan,
  masterFungsi,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
} from '#/db/schema/master'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function parseLampiranSnapshot(value: unknown): LampiranUrl[] {
  if (!value) return []
  if (Array.isArray(value)) return value as LampiranUrl[]
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as LampiranUrl[] : []
  } catch {
    return []
  }
}

function displayUserName(user: {
  displayName: string | null
  namaLengkap: string | null
  email: string | null
} | null): string {
  return user?.displayName
    ?? user?.namaLengkap
    ?? user?.email
    ?? '\u2014'
}

// ---------------------------------------------------------------------------
// GET /api/arsiparis/aktif/[id] - detail arsip aktif
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/aktif/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const session = await getLocalServerSession(request)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        if (!hasLocalRole(session, 'ARSIPARIS')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        if (!isUuid(params.id)) return Response.json({ error: 'Arsip aktif tidak ditemukan' }, { status: 404 })

        try {
          const rows = await db
            .select({
              arsip_id: arsip.id,
              nomor_surat: arsip.nomorSurat,
              klasifikasi: arsip.klasifikasi,
              retensi_aktif: arsip.retensiAktif,
              retensi_inaktif: arsip.retensiInaktif,
              masa_aktif_berakhir: arsip.masaAktifBerakhir,
              masa_inaktif_berakhir: arsip.masaInaktifBerakhir,
              status_arsip: arsip.statusArsip,
              archived_at: arsip.archivedAt,
              archived_by: arsip.archivedBy,
              catatan_arsiparis: arsip.catatanArsiparis,
              lampiran_snapshot: arsip.lampiranSnapshot,
              archived_by_display_name: users.displayName,
              archived_by_nama_lengkap: users.namaLengkap,
              archived_by_email: users.email,
              dokumen_id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              fungsi_id: dokumenTransaksi.fungsiId,
              fungsi_nama: masterFungsi.nama,
              kegiatan_id: dokumenTransaksi.kegiatanJenisId,
              kegiatan_nama: masterKegiatan.nama,
              jenis_permintaan_nama: masterJenisPermintaan.nama,
              kategori_permintaan_nama: masterKategoriPermintaan.nama,
              detail_permintaan_nama: masterDetailPermintaan.nama,
              tahun: dokumenTransaksi.tahun,
            })
            .from(arsip)
            .innerJoin(dokumenTransaksi, eq(arsip.dokumenId, dokumenTransaksi.id))
            .leftJoin(users, eq(arsip.archivedBy, users.id))
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .leftJoin(masterJenisPermintaan, eq(dokumenTransaksi.jenisPermintaanId, masterJenisPermintaan.id))
            .leftJoin(masterKategoriPermintaan, eq(dokumenTransaksi.kategoriPermintaanId, masterKategoriPermintaan.id))
            .leftJoin(masterDetailPermintaan, eq(dokumenTransaksi.detailPermintaanId, masterDetailPermintaan.id))
            .where(and(
              eq(arsip.id, params.id),
              eq(arsip.statusArsip, 'AKTIF'),
            ))
            .limit(1)

          const row = rows[0]
          if (!row) return Response.json({ error: 'Arsip aktif tidak ditemukan' }, { status: 404 })

          return Response.json({
            arsip: {
              id: row.arsip_id,
              nomor_surat: row.nomor_surat ?? '\u2014',
              klasifikasi: row.klasifikasi ?? '\u2014',
              retensi_aktif: row.retensi_aktif ?? '\u2014',
              retensi_inaktif: row.retensi_inaktif ?? '\u2014',
              masa_aktif_berakhir: row.masa_aktif_berakhir,
              masa_inaktif_berakhir: row.masa_inaktif_berakhir,
              status_arsip: row.status_arsip,
              archived_at: row.archived_at,
              archived_by: row.archived_by,
              archived_by_nama: displayUserName({
                displayName: row.archived_by_display_name,
                namaLengkap: row.archived_by_nama_lengkap,
                email: row.archived_by_email,
              }),
              catatan_arsiparis: row.catatan_arsiparis,
              dokumen_id: row.dokumen_id,
              dokumen: {
                id: row.dokumen_id,
                judul: row.judul,
                fungsi: { id: row.fungsi_id ?? '', nama: row.fungsi_nama ?? '\u2014' },
                kegiatan: { id: row.kegiatan_id ?? '', nama: row.kegiatan_nama ?? '\u2014' },
                jenis_permintaan: row.jenis_permintaan_nama ?? '\u2014',
                kategori_permintaan: row.kategori_permintaan_nama ?? '\u2014',
                detail_permintaan: row.detail_permintaan_nama ?? '\u2014',
                tahun: row.tahun,
                lampiran_urls: parseLampiranSnapshot(row.lampiran_snapshot),
              },
            },
          })
        } catch (err) {
          console.error('[aktif/:id] GET local query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
      },
    },
  },
})
