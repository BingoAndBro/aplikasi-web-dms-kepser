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
// POST /api/arsiparis/verifikasi-penyusutan/putuskan
// Decide verifikasi penyusutan: SETUJUI (→ INAKTIF) atau TOLAK (→ AKTIF)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/arsiparis/verifikasi-penyusutan/putuskan')({
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
          verifikasi_id: z.string().uuid('ID verifikasi tidak valid'),
          aksi: z.enum(['SETUJUI', 'TOLAK'], { errorMap: () => ({ message: 'Aksi harus SETUJUI atau TOLAK' }) }),
          catatan: z.string().optional(),
        }).safeParse(body)
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })

        const { verifikasi_id, aksi, catatan } = parsed.data

        // Verify verifikasi exists + status = MENUNGGU
        const { data: verifikasi, error: verError } = await supabase
          .from('arsip_verifikasi_penyusutan')
          .select('id, arsip_id, status')
          .eq('id', verifikasi_id)
          .single()

        if (verError || !verifikasi) return Response.json({ error: 'Verifikasi tidak ditemukan' }, { status: 404 })
        if (verifikasi.status !== 'MENUNGGU') return Response.json({ error: 'Verifikasi sudah diputuskan' }, { status: 400 })

        // Get arsip record
        const { data: arsip, error: arsipError } = await supabase
          .from('arsip')
          .select('id, dokumen_id')
          .eq('id', verifikasi.arsip_id)
          .single()

        if (arsipError || !arsip) return Response.json({ error: 'Arsip tidak ditemukan' }, { status: 404 })

        // Update verifikasi
        const { error: updateVerError } = await supabase
          .from('arsip_verifikasi_penyusutan')
          .update({
            status: aksi,
            decided_by: session.user.id,
            decided_at: new Date().toISOString(),
            catatan: catatan ?? null,
          })
          .eq('id', verifikasi_id)

        if (updateVerError) {
          console.error('[verifikasi-putuskan] update verifikasi error:', updateVerError)
          return Response.json({ error: 'Gagal memperbarui verifikasi' }, { status: 500 })
        }

        // Update arsip status
        const newStatus = aksi === 'SETUJUI' ? 'INAKTIF' : 'AKTIF'
        const { error: updateArsipError } = await supabase
          .from('arsip')
          .update({ status_arsip: newStatus })
          .eq('id', arsip.id)

        if (updateArsipError) {
          console.error('[verifikasi-putuskan] update arsip error:', updateArsipError)
          return Response.json({ error: 'Gagal memperbarui status arsip' }, { status: 500 })
        }

        // Log
        await insertLog(supabase, {
          dokumenId: arsip.dokumen_id,
          userId: session.user.id,
          aksi: aksi === 'SETUJUI' ? 'VERIFIKASI_PENYUSUTAN_SETUJUI' : 'VERIFIKASI_PENYUSUTAN_TOLAK',
          catatan: catatan ?? null,
          stepUrutan: null,
        })

        return Response.json({
          success: true,
          message: aksi === 'SETUJUI' ? 'Penyusutan disetujui — arsip menjadi inaktif' : 'Penyusutan ditolak — arsip tetap aktif',
        })
      },
    },
  },
})