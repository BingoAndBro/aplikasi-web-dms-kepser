import { createFileRoute } from '@tanstack/react-router'
import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import {
  createLocalUploadDescriptor,
  LocalUploadError,
  writeLocalUploadContent,
} from '#/lib/storage/local-upload'

// ---------------------------------------------------------------------------
// POST /api/upload - Upload lampiran file to local filesystem storage.
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/upload')({
  ssr: false,
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        let formData: FormData
        try {
          formData = await request.formData()
        } catch {
          return Response.json({ error: 'Invalid form data' }, { status: 400 })
        }

        const file = formData.get('file')
        if (!(file instanceof File)) {
          return Response.json({ error: 'File tidak ditemukan' }, { status: 400 })
        }

        const kelengkapanId = formData.get('kelengkapan_id')
        const namaDokumen = formData.get('nama_dokumen')

        if (
          typeof kelengkapanId !== 'string'
          || typeof namaDokumen !== 'string'
          || !kelengkapanId
          || !namaDokumen
        ) {
          return Response.json({ error: 'kelengkapan_id dan nama_dokumen wajib diisi' }, { status: 400 })
        }

        let descriptor: ReturnType<typeof createLocalUploadDescriptor>
        try {
          descriptor = createLocalUploadDescriptor({
            ownerUserId: session.userId,
            kelengkapanId,
            file: {
              name: file.name,
              type: file.type,
              size: file.size,
            },
          })
        } catch (error) {
          return localUploadErrorResponse(error)
        }

        let fileContent: ArrayBuffer
        try {
          fileContent = await file.arrayBuffer()
        } catch {
          return Response.json({ error: 'Gagal membaca file' }, { status: 400 })
        }

        try {
          await writeLocalUploadContent({
            logicalPath: descriptor.logicalPath,
            content: fileContent,
            expectedBytes: file.size,
          })
        } catch (error) {
          if (error instanceof LocalUploadError && error.code === 'invalid-content-size') {
            return Response.json({ error: 'Ukuran file maksimal 2MB' }, { status: 400 })
          }

          const code = error instanceof LocalUploadError ? error.code : 'unknown'
          console.error('[upload] Local storage write failed:', { code })
          return Response.json({ error: 'Gagal mengunggah file. Silakan coba lagi.' }, { status: 500 })
        }

        return Response.json({
          url: descriptor.logicalPath,
          nama: namaDokumen,
          kelengkapan_id: descriptor.kelengkapanId,
          uploaded_at: new Date().toISOString(),
        }, { status: 201 })
      },
    },
  },
})

function localUploadErrorResponse(error: unknown): Response {
  if (!(error instanceof LocalUploadError)) {
    return Response.json({ error: 'Gagal mengunggah file. Silakan coba lagi.' }, { status: 500 })
  }

  switch (error.code) {
    case 'invalid-kelengkapan-id':
      return Response.json({ error: 'ID kelengkapan tidak valid' }, { status: 400 })
    case 'invalid-file-size':
    case 'invalid-content-size':
      return Response.json({ error: 'Ukuran file maksimal 2MB' }, { status: 400 })
    case 'invalid-file-extension':
    case 'invalid-file-type':
      return Response.json({
        error: 'Tipe file tidak diizinkan. Gunakan: PDF, DOC, DOCX, XLS, XLSX',
      }, { status: 400 })
    case 'invalid-file-name':
    case 'invalid-owner-id':
    case 'invalid-timestamp':
      return Response.json({ error: 'File tidak valid' }, { status: 400 })
    case 'target-exists':
    case 'write-failed':
      return Response.json({ error: 'Gagal mengunggah file. Silakan coba lagi.' }, { status: 500 })
  }
}
