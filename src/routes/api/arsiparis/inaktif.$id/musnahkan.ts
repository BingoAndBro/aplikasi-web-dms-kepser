import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'
import { insertLog } from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// POST /api/arsiparis/inaktif/[id]/musnahkan
// Usulkan arsip untuk dimusnahkan (INAKTIF → USUL_MUSNAH)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/inaktif/$id/musnahkan')({
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
        if (arsip.status_arsip !== 'INAKTIF') return Response.json({ error: 'Arsip bukan dalam status inaktif' }, { status: 400 })

        // Check if already has usul musnah record
        const { data: existing } = await supabase
          .from('arsip_usul_musnah')
          .select('id')
          .eq('arsip_id', arsip.id)
          .maybeSingle()

        if (existing) return Response.json({ error: 'Arsip sudah diusulkan untuk dimusnahkan' }, { status: 400 })

        // Create usul musnah record
        const { error: insertError } = await supabase.from('arsip_usul_musnah').insert({
          arsip_id: arsip.id,
          status: 'MENUNGGU',
          diusulkan_oleh: session.user.id,
          catatan: catatan,
        })

        if (insertError) {
          console.error('[inaktif-musnahkan] insert error:', insertError)
          return Response.json({ error: 'Gagal mengusulkan pemusnahan' }, { status: 500 })
        }

        // Update arsip status
        const { error: updateError } = await supabase
          .from('arsip')
          .update({ status_arsip: 'USUL_MUSNAH' })
          .eq('id', arsip.id)

        if (updateError) {
          console.error('[inaktif-musnahkan] update arsip error:', updateError)
          return Response.json({ error: 'Gagal memperbarui status arsip' }, { status: 500 })
        }

        await insertLog(supabase, {
          dokumenId: arsip.dokumen_id,
          userId: session.user.id,
          aksi: 'PINDAHKAN_USUL_MUSNAH',
          catatan: catatan ?? null,
          stepUrutan: null,
        })

        return Response.json({ success: true, message: 'Arsip diusulkan untuk dimusnahkan' })
      },
    },
  },
})
