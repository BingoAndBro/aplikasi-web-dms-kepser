import { createFileRoute } from '@tanstack/react-router'
import { requireSameOrigin } from '#/lib/security/same-origin'
import {
  ManualArsipApiError,
  isUuid,
  requireManualArsipApiSession,
  toSafeErrorLog,
  uploadManualArsipAttachments,
} from '#/lib/manual-arsip'
import {
  MANUAL_ARSIP_ATTACHMENT_FIELD_NAME,
  ManualArsipUploadError,
} from '#/lib/storage/manual-arsip-upload'
import {
  DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE,
  DOCUMENT_UPLOAD_INVALID_FILE_MESSAGE,
  DOCUMENT_UPLOAD_INVALID_FORMAT_MESSAGE,
  DOCUMENT_UPLOAD_TOO_LARGE_MESSAGE,
} from '#/lib/upload/document-upload-policy'

const MANUAL_ARSIP_ATTACHMENT_TITLE_FIELD_NAME = 'titles'
const MANUAL_ARSIP_ATTACHMENT_TITLE_MAX_LENGTH = 120

export const Route = createFileRoute('/api/kasubag/manual-arsip/$id/attachments')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const sessionOrResponse = await requireManualArsipApiSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Dokumen manual tidak ditemukan' }, { status: 404 })
        }

        let formData: FormData
        try {
          formData = await request.formData()
        } catch {
          return Response.json({ error: 'Form data tidak valid' }, { status: 400 })
        }

        const files = formData
          .getAll(MANUAL_ARSIP_ATTACHMENT_FIELD_NAME)
          .filter((value): value is File => value instanceof File)

        if (files.length === 0) {
          return Response.json({ error: 'Minimal satu file lampiran wajib diunggah' }, { status: 400 })
        }

        const titleEntries = formData.getAll(MANUAL_ARSIP_ATTACHMENT_TITLE_FIELD_NAME)
        if (titleEntries.some((value) => typeof value !== 'string')) {
          return Response.json({ error: 'Judul lampiran wajib diisi' }, { status: 400 })
        }

        const titles = titleEntries.map((value) => value.trim())

        if (titles.length !== files.length) {
          return Response.json({ error: 'Jumlah judul lampiran harus sesuai dengan jumlah file' }, { status: 400 })
        }

        if (titles.some((title) => title.length === 0)) {
          return Response.json({ error: 'Judul lampiran wajib diisi' }, { status: 400 })
        }

        if (titles.some((title) => title.length > MANUAL_ARSIP_ATTACHMENT_TITLE_MAX_LENGTH)) {
          return Response.json({ error: 'Judul lampiran maksimal 120 karakter' }, { status: 400 })
        }

        try {
          const attachments = await uploadManualArsipAttachments(
            params.id,
            sessionOrResponse.user.id,
            files,
            titles,
          )

          return Response.json({ attachments }, { status: 201 })
        } catch (err) {
          if (err instanceof ManualArsipApiError) {
            return Response.json({ error: err.message }, { status: err.status })
          }

          if (err instanceof ManualArsipUploadError) {
            return manualArsipUploadErrorResponse(err)
          }

          console.error('[arsiparis/manual-arsip/$id/attachments] POST local upload error:', toSafeErrorLog(err))
          return Response.json({ error: DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE }, { status: 500 })
        }
      },
    },
  },
})

function manualArsipUploadErrorResponse(error: ManualArsipUploadError): Response {
  switch (error.code) {
    case 'invalid-file-count':
      return Response.json({ error: 'Maksimal 5 file lampiran per unggahan' }, { status: 400 })
    case 'invalid-file-size':
    case 'invalid-content-size':
      return Response.json({ error: DOCUMENT_UPLOAD_TOO_LARGE_MESSAGE }, { status: 400 })
    case 'invalid-file-extension':
    case 'invalid-file-type':
      return Response.json({ error: DOCUMENT_UPLOAD_INVALID_FORMAT_MESSAGE }, { status: 400 })
    case 'invalid-file-empty':
    case 'invalid-file-name':
    case 'invalid-file-signature':
    case 'invalid-manual-arsip-id':
    case 'invalid-owner-id':
      return Response.json({ error: DOCUMENT_UPLOAD_INVALID_FILE_MESSAGE }, { status: 400 })
    case 'target-exists':
    case 'write-failed':
      return Response.json({ error: DOCUMENT_UPLOAD_GENERIC_FAILURE_MESSAGE }, { status: 500 })
  }
}
