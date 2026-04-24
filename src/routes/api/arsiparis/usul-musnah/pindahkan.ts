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
// POST /api/arsiparis/usul-musnah/pindahkan
// Pindahkan arsip dari INAKTIF ke USUL_MUSNAH
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/usul-musnah/pindahkan')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await supabase.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('ARSIPARIS')) return Response.json({ error: 'Akses ditolak' }, { status: 403 })

        const body = await request.json().catch(() => null)
        if (!body) return Response.json({ error: 'Body tidak valid' }, { status: 400 })

        const parsed = z.object({
          arsip_id: z.string().uuid('ID arsip tidak valid'),
          catatan: z.string().optional(),
        }).safeParse(body)
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })

        const { arsip_id, catatan } = parsed.data

        const { data: arsip, error: arsipError } = await supabase
          .from('arsip')
          .select('id, dokumen_id, status_arsip')
          .eq('id', arsip_id)
          .single()

        if (arsipError || !arsip) return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })
        if (arsip.status_arsip !== 'INAKTIF') return Response.json({ error: 'Arsip tidak bisa dipindahkan dari tahap ini' }, { status: 400 })

        const { data: existing } = await supabase
          .from('arsip_usul_musnah')
          .select('id')
          .eq('arsip_id', arsip_id)
          .single()

        if (existing) return Response.json({ error: 'Arsip sudah dalam tahap usul musnah' }, { status: 400 })

        const { error: insertError } = await supabase.from('arsip_usul_musnah').insert({
          arsip_id,
          status: 'MENUNGGU',
          catatan: catatan ?? null,
          diusulkan_oleh: session.user.id,
        })
        if (insertError) {
          console.error('[usul-musnah-pindahkan] insert error:', insertError)
          return Response.json({ error: 'Gagal memindahkan arsip' }, { status: 500 })
        }

        const { error: updateError } = await supabase
          .from('arsip')
          .update({ status_arsip: 'USUL_MUSNAH' })
          .eq('id', arsip_id)

        if (updateError) {
          console.error('[usul-musnah-pindahkan] update error:', updateError)
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