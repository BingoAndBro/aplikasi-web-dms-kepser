import { createFileRoute } from '@tanstack/react-router'

import {
  parseBerkasIdParam,
  requireBerkasArsipApiSession,
} from '#/lib/archive/berkas-arsip-api'
import { resolveBerkasArsipItemAttachments } from '#/lib/archive/berkas-arsip-file-access'
import { getBerkasArsipDetail, type BerkasArsipDetailItemDto } from '#/lib/archive/berkas-arsip-read-model'
import {
  ARCHIVE_SOURCE_TYPE,
  BERKAS_ARCHIVE_STATUS,
  BERKAS_STATUS,
} from '#/lib/constants/archive-status'
import {
  buildBerkasParentFolderName,
  buildManualDocumentFolderName,
  buildWorkflowDocumentFolderName,
  DocumentZipTooManyEntriesError,
  streamDocumentZip,
  type DocumentZipEntry,
} from '#/lib/export/document-zip'
import { sanitizeStoragePathSegment } from '#/lib/storage/local-storage-paths'

const EXPORT_MAX_ITEMS = 500

export const Route = createFileRoute('/api/kasubag/berkas/$id/export-zip')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sessionOrResponse = await requireBerkasArsipApiSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        const berkasId = parseBerkasIdParam(params.id)
        if (berkasId instanceof Response) return berkasId

        let result
        try {
          result = await getBerkasArsipDetail(berkasId)
        } catch {
          console.error('[arsiparis/berkas/:id/export-zip] detail query error')
          return Response.json({ error: 'Gagal menyiapkan ekspor ZIP' }, { status: 500 })
        }

        if (result.status === 'not_found') {
          return Response.json({ error: 'Berkas tidak ditemukan' }, { status: 404 })
        }

        const { detail } = result

        if (detail.status_arsip === BERKAS_ARCHIVE_STATUS.DIMUSNAHKAN) {
          return Response.json({ error: 'Data file sudah dimusnahkan' }, { status: 410 })
        }

        if (detail.status_berkas !== BERKAS_STATUS.CLOSED) {
          return Response.json({ error: 'Berkas belum ditutup, tidak bisa diekspor' }, { status: 409 })
        }

        if (detail.items.length > EXPORT_MAX_ITEMS) {
          return Response.json({
            error: `Berkas ini memiliki ${detail.items.length} dokumen. Maksimal ${EXPORT_MAX_ITEMS} per ekspor.`,
          }, { status: 413 })
        }

        const parentFolderName = buildBerkasParentFolderName({
          nomorSpm: detail.nomor_spm,
          klasifikasiNama: detail.klasifikasi_nama_snapshot,
        })

        const entries: DocumentZipEntry[] = []
        for (const item of detail.items) {
          const attachmentsResult = await resolveBerkasArsipItemAttachments(berkasId, item.item_id)
          const files = attachmentsResult.ok
            ? attachmentsResult.attachments.map(attachment => ({
              namaAman: attachment.namaAman,
              logicalPath: attachment.logicalPath,
            }))
            : []

          entries.push({
            folderPath: `${parentFolderName}/${buildItemDocumentFolderName(item)}`,
            files,
          })
        }

        try {
          const response = await streamDocumentZip(entries, {
            requesterLabel: sessionOrResponse.user.displayName ?? sessionOrResponse.user.username,
            requesterRole: 'KEPALA_SUB_BAGIAN_UMUM',
            sourceDescription: `Nomor SPM ${detail.nomor_spm ?? '(tanpa nomor SPM)'}`,
            filename: buildBerkasExportZipFilename(detail.nomor_spm),
          })

          console.info('[arsiparis/berkas/:id/export-zip] export completed', {
            berkasId,
            actor: sessionOrResponse.user.id,
            itemCount: detail.items.length,
          })

          return response
        } catch (error) {
          if (error instanceof DocumentZipTooManyEntriesError) {
            return Response.json({ error: error.message }, { status: 413 })
          }

          console.error('[arsiparis/berkas/:id/export-zip] zip stream error')
          return Response.json({ error: 'Gagal membuat ekspor ZIP' }, { status: 500 })
        }
      },
    },
  },
})

function buildItemDocumentFolderName(item: BerkasArsipDetailItemDto): string {
  if (item.source_type === ARCHIVE_SOURCE_TYPE.WORKFLOW) {
    return buildWorkflowDocumentFolderName({
      id: item.item_id,
      judul: item.source_title,
      tanggal: item.source_date ?? item.item_added_at ?? '',
    })
  }

  return buildManualDocumentFolderName({ id: item.item_id, judul: item.source_title })
}

function buildBerkasExportZipFilename(nomorSpm: string | null): string {
  const nomorPart = nomorSpm?.trim() ? safeSegment(nomorSpm) : 'Tanpa_Nomor_SPM'
  const datePart = new Date().toISOString().slice(0, 10)

  return `Berkas_${nomorPart}_${datePart}.zip`
}

function safeSegment(value: string): string {
  try {
    return sanitizeStoragePathSegment(value)
  } catch {
    return 'Berkas'
  }
}
