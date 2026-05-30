import { createFileRoute } from '@tanstack/react-router'

import {
  getBerkasArsipDetail,
  type BerkasArsipDetailDto,
  type BerkasArsipDetailItemDto,
} from '#/lib/archive/berkas-arsip-read-model'
import {
  parseBerkasIdParam,
  requireBerkasArsipApiSession,
} from '#/lib/archive/berkas-arsip-api'

export const Route = createFileRoute('/api/arsiparis/berkas/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sessionOrResponse = await requireBerkasArsipApiSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        const berkasId = parseBerkasIdParam(params.id)
        if (berkasId instanceof Response) return berkasId

        try {
          const result = await getBerkasArsipDetail(berkasId)
          if (result.status === 'not_found') {
            return Response.json({ error: 'Berkas tidak ditemukan' }, { status: 404 })
          }

          return Response.json({ berkas: safeBerkasDetail(result.detail) })
        } catch {
          console.error('[arsiparis/berkas/:id] folder-first detail query error')
          return Response.json({ error: 'Gagal mengambil detail berkas arsip' }, { status: 500 })
        }
      },
    },
  },
})

function safeBerkasDetail(detail: BerkasArsipDetailDto) {
  return {
    berkas_id: detail.berkas_id,
    klasifikasi_id: detail.klasifikasi_id,
    klasifikasi_kode_snapshot: detail.klasifikasi_kode_snapshot,
    klasifikasi_nama_snapshot: detail.klasifikasi_nama_snapshot,
    status_berkas: detail.status_berkas,
    status_arsip: detail.status_arsip,
    nomor_spm: detail.nomor_spm,
    retensi_aktif: detail.retensi_aktif,
    retensi_inaktif: detail.retensi_inaktif,
    masa_aktif_berakhir: detail.masa_aktif_berakhir,
    masa_inaktif_berakhir: detail.masa_inaktif_berakhir,
    closed_at: detail.closed_at,
    item_count: detail.item_count,
    workflow_item_count: detail.workflow_item_count,
    manual_item_count: detail.manual_item_count,
    total_nominal_realisasi: detail.total_nominal_realisasi,
    created_at: detail.created_at,
    updated_at: detail.updated_at,
    warnings: detail.warnings,
    items: detail.items.map(safeBerkasDetailItem),
  }
}

function safeBerkasDetailItem(item: BerkasArsipDetailItemDto, index: number) {
  return {
    item_key: `item-${index + 1}`,
    item_file_key: item.item_id,
    source_type: item.source_type,
    source_title: item.source_title,
    source_date: item.source_date,
    source_nominal_realisasi: item.source_nominal_realisasi,
    source_created_by_display_name: item.source_created_by_display_name,
    attachment_count: item.attachment_count,
    attachments: item.attachments,
    has_attachments: item.has_attachments,
    workflow: item.workflow,
    manual: item.manual,
    warnings: item.warnings,
  }
}
