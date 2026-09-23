import { createFileRoute } from '@tanstack/react-router'

import {
  listBerkasArsipFolders,
  listBerkasArsipFolderQuerySchema,
  type BerkasArsipFolderListItemDto,
  type BerkasArsipFolderListResult,
  type ListBerkasArsipFolderQuery,
} from '#/lib/archive/berkas-arsip-read-model'
import { requireBerkasArsipApiSession } from '#/lib/archive/berkas-arsip-api'

export const Route = createFileRoute('/api/kasubag/berkas/')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const sessionOrResponse = await requireBerkasArsipApiSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        const parsedQuery = parseFolderListQuery(request)
        if (parsedQuery instanceof Response) return parsedQuery

        try {
          const result = await listBerkasArsipFolders(parsedQuery)

          return Response.json(safeFolderListResult(result))
        } catch {
          console.error('[arsiparis/berkas] folder-first list query error')
          return Response.json({ error: 'Gagal mengambil daftar berkas' }, { status: 500 })
        }
      },
    },
  },
})

function parseFolderListQuery(request: Request): ListBerkasArsipFolderQuery | Response {
  const url = new URL(request.url)
  const query: Record<string, unknown> = {}

  const statusArsip = url.searchParams.get('status_arsip')
  if (statusArsip === 'null') query.status_arsip = null
  else if (statusArsip) query.status_arsip = statusArsip

  const statusBerkas = url.searchParams.get('status_berkas')
  if (statusBerkas) query.status_berkas = statusBerkas

  const klasifikasiId = url.searchParams.get('klasifikasi_id')
  if (klasifikasiId) query.klasifikasi_id = klasifikasiId

  const tahunAnggaran = url.searchParams.get('tahun_anggaran')
  if (tahunAnggaran) query.tahun_anggaran = Number(tahunAnggaran)

  const search = url.searchParams.get('search')
  if (search) query.search = search

  const limit = url.searchParams.get('limit')
  if (limit) query.limit = Number(limit)

  const offset = url.searchParams.get('offset')
  if (offset) query.offset = Number(offset)

  const parsed = listBerkasArsipFolderQuerySchema.safeParse(query)
  if (!parsed.success) {
    return Response.json({ error: 'Filter daftar berkas tidak valid' }, { status: 400 })
  }

  return parsed.data
}

function safeFolderListResult(result: BerkasArsipFolderListResult) {
  return {
    berkas: result.rows.map(safeFolderListRow),
    summary: result.summary,
  }
}

function safeFolderListRow(row: BerkasArsipFolderListItemDto) {
  return {
    berkas_id: row.berkas_id,
    klasifikasi_id: row.klasifikasi_id,
    tahun_anggaran: row.tahun_anggaran,
    klasifikasi_kode_snapshot: row.klasifikasi_kode_snapshot,
    klasifikasi_nama_snapshot: row.klasifikasi_nama_snapshot,
    status_berkas: row.status_berkas,
    status_arsip: row.status_arsip,
    nomor_spm: row.nomor_spm,
    retensi_aktif: row.retensi_aktif,
    retensi_inaktif: row.retensi_inaktif,
    masa_aktif_berakhir: row.masa_aktif_berakhir,
    masa_inaktif_berakhir: row.masa_inaktif_berakhir,
    closed_at: row.closed_at,
    umur_berkas: row.umur_berkas,
    jatuh_tempo: row.jatuh_tempo,
    tanggal_jatuh_tempo: row.tanggal_jatuh_tempo,
    item_count: row.item_count,
    workflow_item_count: row.workflow_item_count,
    manual_item_count: row.manual_item_count,
    total_nominal_realisasi: row.total_nominal_realisasi,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
