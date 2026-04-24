import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession as getSession } from '#/lib/auth'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/arsip/[id]/preview/[filename] — preview lampiran (inline)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsip/id/preview/filename')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: arsip, error } = await supabase
          .from('arsip')
          .select('dokumen_id')
          .eq('id', params.id)
          .single()

        if (error || !arsip) return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })

        const { data: dok } = await supabase
          .from('dokumen_transaksi')
          .select('lampiran_urls')
          .eq('id', arsip.dokumen_id)
          .single()

        if (!dok?.lampiran_urls) return Response.json({ error: 'Tidak ada lampiran' }, { status: 404 })

        const lampiranUrls = typeof dok.lampiran_urls === 'string' ? JSON.parse(dok.lampiran_urls) : dok.lampiran_urls

        // Find lampiran by filename (decode URI component)
        const decodedFilename = decodeURIComponent(params.filename)
        const lampiran = lampiranUrls.find((l: { nama: string; url: string }) => l.nama === decodedFilename || l.url.endsWith(decodedFilename))

        if (!lampiran) return Response.json({ error: 'File tidak ditemukan' }, { status: 404 })

        const supabaseAdmin = createAdminClient()
        const { data, error: signError } = await supabaseAdmin.storage
          .from('dokumen-lampiran')
          .createSignedUrl(lampiran.url, 900) // 15 minutes, inline

        if (signError || !data) {
          console.error('[arsip-preview] Signed URL error:', signError)
          return Response.json({ error: 'Gagal membuat link pratinjau' }, { status: 500 })
        }

        return Response.json({ signedUrl: data.signedUrl, filename: lampiran.nama })
      },
    },
  },
})