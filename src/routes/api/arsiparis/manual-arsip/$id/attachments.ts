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

export const Route = createFileRoute('/api/arsiparis/manual-arsip/$id/attachments')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const sameOriginError = requireSameOrigin(request)
        if (sameOriginError) return sameOriginError

        const sessionOrResponse = await requireManualArsipApiSession(request)
        if (sessionOrResponse instanceof Response) return sessionOrResponse

        if (!isUuid(params.id)) {
          return Response.json({ error: 'Arsip manual tidak ditemukan' }, { status: 404 })
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

        try {
          const attachments = await uploadManualArsipAttachments(
            params.id,
            sessionOrResponse.user.id,
            files,
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
          return Response.json({ error: 'Gagal mengunggah lampiran arsip manual' }, { status: 500 })
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
      return Response.json({ error: 'Ukuran file maksimal 10MB' }, { status: 400 })
    case 'invalid-file-type':
      return Response.json({ error: 'Tipe file tidak diizinkan. Gunakan PDF atau gambar.' }, { status: 400 })
    case 'invalid-file-name':
    case 'invalid-manual-arsip-id':
    case 'invalid-owner-id':
      return Response.json({ error: 'File lampiran tidak valid' }, { status: 400 })
    case 'target-exists':
    case 'write-failed':
      return Response.json({ error: 'Gagal mengunggah lampiran arsip manual' }, { status: 500 })
  }
}
