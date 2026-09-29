import { createFileRoute } from '@tanstack/react-router'
import type { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'

import { db } from '#/db/client'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import {
  ketuaTimAssignments,
  masterDetailPermintaan,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
  masterKomponen,
} from '#/db/schema/master'
import { getLocalServerSession, type LocalServerSession } from '#/lib/auth/local-server-auth'
import { parseLampiranUrls } from '#/lib/dokumen'
import type { DokumenRow } from '#/lib/dokumen/types'
import {
  buildLaporanExportZipFilename,
  buildLaporanZipEntries,
  buildManualArsipZipEntries,
  loadManualArsipExportRows,
  resolveKegiatanFilenamePart,
} from '#/lib/export/laporan-zip-entries'
import { DocumentZipTooManyEntriesError, streamDocumentZip } from '#/lib/export/document-zip'
import { kegiatanExportZipRequestSchema } from '#/lib/schemas/export'
import { LAPORAN_KEGIATAN_SCOPE_STATUSES } from '#/lib/laporan/kegiatan-scope'
import { requireSameOrigin } from '#/lib/security/same-origin'
import {
  DOWNLOAD_TICKET_EXPIRED_MESSAGE,
  consumeDownloadTicket,
  createDownloadTicket,
} from '#/lib/export/download-ticket'

const EXPORT_MAX_DOCUMENTS = 500

export const Route = createFileRoute('/api/laporan/kegiatan/export-zip')({
  ssr: false,
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const session = await getLocalServerSession(request)
        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const parsed = kegiatanExportZipRequestSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.issues[0]?.message ?? 'Daftar dokumen tidak valid' },
            { status: 400 },
          )
        }

        const requestedCount = parsed.data.dokumen_ids.length + parsed.data.manual_arsip_ids.length
        if (requestedCount > EXPORT_MAX_DOCUMENTS) {
          return Response.json({
            error: `Filter menghasilkan ${requestedCount} dokumen. Maksimal ${EXPORT_MAX_DOCUMENTS} per ekspor — persempit periode atau kegiatan.`,
          }, { status: 413 })
        }

        // D-31: mode tiket — lihat src/lib/export/download-ticket.ts.
        if (new URL(request.url).searchParams.get('mode') === 'ticket') {
          const ticket = createDownloadTicket({ userId: session.user.id, kind: 'laporan-kegiatan', payload: parsed.data })
          const downloadUrl = new URL(request.url)
          downloadUrl.search = ''
          downloadUrl.searchParams.set('ticket', ticket)
          return Response.json({ download_url: `${downloadUrl.pathname}${downloadUrl.search}` })
        }

        return createKegiatanExportZipResponse(session, parsed.data)
      },
      // D-31: unduhan bawaan browser lewat tiket sekali pakai dari POST ?mode=ticket.
      // Tanpa cek same-origin: navigasi GET tidak mengirim Origin; perlindungannya
      // adalah tiket acak yang terikat ke pengguna sesi ini.
      GET: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)
        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const token = new URL(request.url).searchParams.get('ticket') ?? ''
        const payload = token
          ? consumeDownloadTicket({ token, userId: session.user.id, kind: 'laporan-kegiatan' })
          : null
        const parsed = kegiatanExportZipRequestSchema.safeParse(payload)
        if (!parsed.success) {
          return Response.json({ error: DOWNLOAD_TICKET_EXPIRED_MESSAGE }, { status: 410 })
        }

        return createKegiatanExportZipResponse(session, parsed.data)
      },
    },
  },
})

async function createKegiatanExportZipResponse(
  session: LocalServerSession,
  data: z.infer<typeof kegiatanExportZipRequestSchema>,
): Promise<Response> {
  const scope = data.scope ?? 'final'
  const isMonitoring = scope === 'monitoring'
  // Ekspor dari Monitoring Dokumen Tim bisa memuat dokumen yang belum final;
  // tandai di nama file & daftar isi supaya tidak tercampur dengan arsip final.
  const sourceDescription = isMonitoring
    ? 'Monitoring Dokumen Tim (filter aktif klien) - TERMASUK DOKUMEN YANG MASIH DIPROSES, BELUM FINAL'
    : 'Laporan Kegiatan (filter aktif klien)'
  const filenamePrefix = isMonitoring ? 'Monitoring_Dokumen_Tim' : 'Laporan_Kegiatan'

  try {
    const assignments = await db
      .select({ kegiatan_id: ketuaTimAssignments.kegiatanId })
      .from(ketuaTimAssignments)
      .where(eq(ketuaTimAssignments.userId, session.user.id))

    // Not a Ketua Tim for any kegiatan: mirror GET /api/laporan/kegiatan's
    // existing behavior (empty result, not 403) so assignment status is
    // not leaked through a different status code.
    if (assignments.length === 0) {
      const response = await streamDocumentZip([], {
        requesterLabel: session.user.displayName ?? session.user.username,
        requesterRole: 'PEGAWAI',
        sourceDescription,
        filename: buildLaporanExportZipFilename(filenamePrefix, 'Kegiatan'),
      })

      return response
    }

    const kegiatanIds = assignments.map(assignment => assignment.kegiatan_id)

    const rawRows = data.dokumen_ids.length === 0 ? [] : await db
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
        komponen_id: dokumenTransaksi.komponenId,
        komponen_nama: masterKomponen.nama,
        jenis_permintaan_id: dokumenTransaksi.jenisPermintaanId,
        kategori_permintaan_id: dokumenTransaksi.kategoriPermintaanId,
        detail_permintaan_id: dokumenTransaksi.detailPermintaanId,
        kegiatan_nama: masterKegiatan.nama,
        jenis_permintaan_nama: masterJenisPermintaan.nama,
        kategori_permintaan_nama: masterKategoriPermintaan.nama,
        detail_permintaan_nama: masterDetailPermintaan.nama,
      })
      .from(dokumenTransaksi)
      .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
      .leftJoin(masterKomponen, eq(dokumenTransaksi.komponenId, masterKomponen.id))
      .leftJoin(masterJenisPermintaan, eq(dokumenTransaksi.jenisPermintaanId, masterJenisPermintaan.id))
      .leftJoin(masterKategoriPermintaan, eq(dokumenTransaksi.kategoriPermintaanId, masterKategoriPermintaan.id))
      .leftJoin(masterDetailPermintaan, eq(dokumenTransaksi.detailPermintaanId, masterDetailPermintaan.id))
      .where(and(
        inArray(dokumenTransaksi.id, data.dokumen_ids),
        inArray(dokumenTransaksi.kegiatanJenisId, kegiatanIds),
        inArray(dokumenTransaksi.status, [...LAPORAN_KEGIATAN_SCOPE_STATUSES[scope]]),
      ))

    const rows: DokumenRow[] = rawRows.map(row => ({
      ...row,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      lampiran_urls: parseLampiranUrls(row.lampiran_urls),
      nominal_realisasi: normalizeNumericValue(row.nominal_realisasi),
      is_non_material: row.is_non_material ?? false,
      nama_dokumen: row.nama_dokumen ?? null,
      keterangan_detail: row.keterangan_detail ?? null,
      kegiatan_nama: row.kegiatan_nama ?? undefined,
      komponen_id: row.komponen_id ?? null,
      komponen_nama: row.komponen_nama ?? undefined,
      jenis_permintaan_nama: row.jenis_permintaan_nama ?? undefined,
      kategori_permintaan_nama: row.kategori_permintaan_nama ?? undefined,
      detail_permintaan_nama: row.detail_permintaan_nama ?? undefined,
    }))

    // D-29: dokumen tambahan KSBU dari kegiatan yang dipimpin (disaring di
    // server). Schema menolak manual_arsip_ids untuk scope=monitoring.
    const manualRows = await loadManualArsipExportRows({
      manualArsipIds: data.manual_arsip_ids,
      kegiatanIds,
    })

    const entries = [
      ...await buildLaporanZipEntries(rows),
      ...await buildManualArsipZipEntries(manualRows),
    ]

    const response = await streamDocumentZip(entries, {
      requesterLabel: session.user.displayName ?? session.user.username,
      requesterRole: 'PEGAWAI',
      sourceDescription,
      filename: buildLaporanExportZipFilename(
        filenamePrefix,
        resolveKegiatanFilenamePart([...rows, ...manualRows]),
      ),
    })

    console.info('[laporan/kegiatan.export-zip] export completed', {
      actor: session.user.id,
      scope,
      documentCount: rows.length,
      manualDocumentCount: manualRows.length,
    })

    return response
  } catch (error) {
    if (error instanceof DocumentZipTooManyEntriesError) {
      return Response.json({ error: error.message }, { status: 413 })
    }

    console.error('[laporan/kegiatan.export-zip] zip stream error')
    return Response.json({ error: 'Gagal membuat ekspor ZIP' }, { status: 500 })
  }
}

function normalizeNumericValue(value: string | number | null): number | null {
  if (value === null) return null
  if (typeof value === 'number') return value

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
