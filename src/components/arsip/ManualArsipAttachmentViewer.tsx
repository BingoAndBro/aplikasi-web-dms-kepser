/**
 * Penampil lampiran dokumen manual KSBU dengan tampilan yang sama persis dengan
 * AttachmentViewer (dokumen alur pengajuan). Kartu, tombol Preview/Unduh, toast,
 * dan modal pratinjau PDF ada di StreamedAttachmentViewer; bedanya hanya sumber
 * file -- endpoint manual_arsip yang langsung mengalirkan file (tanpa signed URL).
 *
 * Dipakai di: ManualArsipDetailDialog (Laporan Kinerja & Monitoring Nominal).
 */
import {
  buildManualArsipAttachmentFileUrl,
  type ManualArsipAttachmentApiBase,
  type ManualArsipAttachmentMetadata,
} from '#/components/arsip/ManualArsipAttachments'
import { StreamedAttachmentViewer } from '#/components/dokumen/StreamedAttachmentViewer'
import { formatDateTime } from '#/lib/storage-client'

type ManualAttachment = ManualArsipAttachmentMetadata & { original_filename?: string }

export function ManualArsipAttachmentViewer({
  apiBase,
  manualArsipId,
  attachments,
  fileUnavailable,
}: {
  apiBase: ManualArsipAttachmentApiBase
  manualArsipId: string
  attachments: ManualAttachment[]
  fileUnavailable: boolean
}) {
  return (
    <StreamedAttachmentViewer
      title="Dokumen Pendukung"
      description="Berkas pendukung yang diunggah Kepala Sub Bagian Umum saat menambahkan dokumen ini."
      unavailableMessage={fileUnavailable ? 'Data file sudah dimusnahkan' : null}
      items={attachments.map((attachment, index) => ({
        key: attachment.id,
        nama: attachment.judul_lampiran || `Lampiran ${index + 1}`,
        meta: `${fileFormat(attachment)}${attachment.created_at ? ` - ${formatDateTime(attachment.created_at)}` : ''}`,
        isPdf: attachment.content_type.trim().toLowerCase() === 'application/pdf',
        previewUrl: buildManualArsipAttachmentFileUrl(apiBase, manualArsipId, attachment.id, 'preview'),
        downloadUrl: buildManualArsipAttachmentFileUrl(apiBase, manualArsipId, attachment.id, 'download'),
        fallbackFilename: attachment.original_filename || attachment.judul_lampiran || 'lampiran',
      }))}
    />
  )
}

// Sama dengan getFileFormat di AttachmentViewer: ekstensi file dalam huruf besar.
function fileFormat(attachment: ManualAttachment): string {
  const source = attachment.original_filename || ''
  const extension = source.includes('.') ? source.split('.').pop() : ''
  if (extension) return extension.toUpperCase()
  return attachment.content_type.trim().toLowerCase() === 'application/pdf' ? 'PDF' : 'File'
}
