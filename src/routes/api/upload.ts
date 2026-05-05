import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'
import { createAdminClient } from '#/lib/supabase-admin'

// Allowed file types
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

const MAX_SIZE = 2 * 1024 * 1024 // 2MB

// ---------------------------------------------------------------------------
// POST /api/upload — Upload lampiran file to Supabase Storage
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/upload')({
  ssr: false,
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        // Auth check
        const cookieHeader = request.headers.get('cookie')
        const mockEvent = {
          request,
          cookie: { get: () => undefined, set: () => {}, delete: () => {} },
        } as any
        const supabase = createServerSupabaseClient(mockEvent, cookieHeader)
        const session = await getSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Parse FormData
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

        const kelengkapanId = formData.get('kelengkapan_id') as string | null
        const namaDokumen = formData.get('nama_dokumen') as string | null

        if (!kelengkapanId || !namaDokumen) {
          return Response.json({ error: 'kelengkapan_id dan nama_dokumen wajib diisi' }, { status: 400 })
        }

        // Validate kelengkapanId is a valid UUID or user-created document ID
        // UUID format for admin kelengkapan, or "user-custom-{uuid}" for user-created documents
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        const userDocRegex = /^user-custom-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (!uuidRegex.test(kelengkapanId) && !userDocRegex.test(kelengkapanId)) {
          return Response.json({ error: 'ID kelengkapan tidak valid' }, { status: 400 })
        }

        // Validate file type
        if (!ALLOWED_TYPES.includes(file.type)) {
          return Response.json({
            error: `Tipe file tidak diizinkan. Gunakan: PDF, DOC, DOCX, XLS, XLSX`,
          }, { status: 400 })
        }

        // Validate file size
        if (file.size > MAX_SIZE) {
          return Response.json({ error: 'Ukuran file maksimal 2MB' }, { status: 400 })
        }

        // Generate storage path: [user_id]/[kelengkapan_id]_[timestamp]_[filename]
        // dokumen_id is not required — storage path is independent of dokumen record
        // For user-created docs, kelengkapanId is "user-custom-{uuid}"
        const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const safeKelengkapanId = kelengkapanId.replace(/[^a-zA-Z0-9.-]/g, '_')
        const path = `${session.user.id}/${safeKelengkapanId}_${Date.now()}_${safeFilename}`

        // Read file as ArrayBuffer
        let fileContent: ArrayBuffer
        try {
          fileContent = await file.arrayBuffer()
        } catch {
          return Response.json({ error: 'Gagal membaca file' }, { status: 400 })
        }

        // Upload using admin client (service role — bypasses RLS for upload)
        const supabaseAdmin = createAdminClient()

        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from('dokumen-lampiran')
          .upload(path, fileContent, {
            contentType: file.type,
            upsert: false,
          })

        if (uploadError) {
          console.error('[upload] Storage error:', uploadError)
          return Response.json({ error: 'Gagal mengunggah file. Silakan coba lagi.' }, { status: 500 })
        }

        return Response.json({
          url: uploadData.path,
          nama: namaDokumen,
          kelengkapan_id: kelengkapanId,
          uploaded_at: new Date().toISOString(),
        }, { status: 201 })
      },
    },
  },
})
