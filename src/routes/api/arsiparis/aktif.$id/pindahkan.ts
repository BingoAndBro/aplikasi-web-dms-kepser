import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'
import { insertLog } from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// POST /api/arsiparis/aktif/[id]/pindahkan
// Pindahkan arsip dari AKTIF ke INAKTIF
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/aktif/$id/pindahkan')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await supabase.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('ARSIPARIS')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const body = await request.json().catch(() => null)
        const catatan = body?.catatan ?? null

        const { data: arsip, error: arsipError } = await supabase
          .from('arsip')
          .select('id, dokumen_id, status_arsip')
          .eq('id', params.id)
          .single()

        if (arsipError || !arsip) return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })
        if (arsip.status_arsip !== 'AKTIF') return Response.json({ error: 'Arsip bukan dalam status aktif' }, { status: 400 })

        const { error: updateError } = await supabase
          .from('arsip')
          .update({ status_arsip: 'INAKTIF' })
          .eq('id', arsip.id)

        if (updateError) {
          console.error('[aktif-pindahkan] update error:', updateError)
          return Response.json({ error: 'Gagal memindahkan arsip' }, { status: 500 })
        }

        await insertLog(supabase, {
          dokumenId: arsip.dokumen_id,
          userId: session.user.id,
          aksi: 'PINDAHKAN_INAKTIF',
          catatan: catatan ?? null,
          stepUrutan: null,
        })

        return Response.json({ success: true, message: 'Arsip dipindahkan ke inaktif' })
      },
    },
  },
})
