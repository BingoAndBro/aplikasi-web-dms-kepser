import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession as getSession } from '#/lib/auth'
import { insertLog } from '#/lib/dokumen-helpers'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// POST /api/arsiparis/usul-musnah/putuskan
// Decide usul musnah: SETUJUI (→ DELETE arsip + storage) atau TOLAK (→ INAKTIF)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/usul-musnah/putuskan')({
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
          musnah_id: z.string().uuid('ID musnah tidak valid'),
          aksi: z.enum(['SETUJUI', 'TOLAK'], { errorMap: () => ({ message: 'Aksi harus SETUJUI atau TOLAK' }) }),
          catatan: z.string().optional(),
        }).safeParse(body)
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })

        const { musnah_id, aksi, catatan } = parsed.data

        const { data: musnah, error: musnahError } = await supabase
          .from('arsip_usul_musnah')
          .select('id, arsip_id, status')
          .eq('id', musnah_id)
          .single()

        if (musnahError || !musnah) return Response.json({ error: 'Usul musnah tidak ditemukan' }, { status: 404 })
        if (musnah.status !== 'MENUNGGU') return Response.json({ error: 'Usul musnah sudah diputuskan' }, { status: 400 })

        const { data: arsip, error: arsipError } = await supabase
          .from('arsip')
          .select('id, dokumen_id')
          .eq('id', musnah.arsip_id)
          .single()

        if (arsipError || !arsip) return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })

        // Update musnah record
        const { error: updateMusnahError } = await supabase
          .from('arsip_usul_musnah')
          .update({
            status: aksi,
            decided_by: session.user.id,
            decided_at: new Date().toISOString(),
            catatan: catatan ?? null,
          })
          .eq('id', musnah_id)

        if (updateMusnahError) {
          console.error('[usul-musnah-putuskan] update musnah error:', updateMusnahError)
          return Response.json({ error: 'Gagal memperbarui usul musnah' }, { status: 500 })
        }

        if (aksi === 'TOLAK') {
          // Kembalikan ke INAKTIF
          const { error: updateArsipError } = await supabase
            .from('arsip')
            .update({ status_arsip: 'INAKTIF' })
            .eq('id', arsip.id)

          if (updateArsipError) {
            console.error('[usul-musnah-putuskan] update arsip error:', updateArsipError)
            return Response.json({ error: 'Gagal memperbarui status arsip' }, { status: 500 })
          }

          await insertLog(supabase, {
            dokumenId: arsip.dokumen_id,
            userId: session.user.id,
            aksi: 'USUL_MUSNAH_TOLAK',
            catatan: catatan ?? null,
            stepUrutan: null,
          })

          return Response.json({ success: true, message: 'Pemusnahan ditolak — arsip tetap inaktif' })
        }

        // SETUJUI — hapus arsip + file storage
        const { data: dok } = await supabase
          .from('dokumen_transaksi')
          .select('lampiran_urls')
          .eq('id', arsip.dokumen_id)
          .single()

        let lampiranUrls: LampiranUrl[] = []
        if (dok?.lampiran_urls) {
          lampiranUrls = typeof dok.lampiran_urls === 'string' ? JSON.parse(dok.lampiran_urls) : dok.lampiran_urls
        }

        // Delete storage files
        const supabaseAdmin = createAdminClient()
        for (const lamp of lampiranUrls) {
          try {
            const pathParts = lamp.url.split('/')
            const bucketAndPath = pathParts.slice(pathParts.indexOf('dokumen-lampiran') + 1).join('/')
            await supabaseAdmin.storage.from('dokumen-lampiran').remove([bucketAndPath])
          } catch (e) {
            console.warn('[usul-musnah-putuskan] file deletion warning:', e)
          }
        }

        // Delete arsip record
        const { error: deleteArsipError } = await supabase.from('arsip').delete().eq('id', arsip.id)
        if (deleteArsipError) {
          console.error('[usul-musnah-putuskan] delete arsip error:', deleteArsipError)
          return Response.json({ error: 'Gagal menghapus arsip' }, { status: 500 })
        }

        // Delete musnah record
        await supabase.from('arsip_usul_musnah').delete().eq('id', musnah_id)

        await insertLog(supabase, {
          dokumenId: arsip.dokumen_id,
          userId: session.user.id,
          aksi: 'USUL_MUSNAH_SETUJUI',
          catatan: catatan ?? null,
          stepUrutan: null,
        })

        return Response.json({ success: true, message: 'Arsip berhasil dimusnahkan' })
      },
    },
  },
})