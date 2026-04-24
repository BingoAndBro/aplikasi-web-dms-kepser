import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession as getSession } from '#/lib/auth'
import { rejectDokumenSchema } from '#/lib/schemas/dokumen'
import { transition } from '#/lib/fsm'
import { updateDokumenStatus, insertLog } from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// POST /api/bendahara/dokumen/[id]/reject
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/bendahara/dokumen/$id/reject')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await supabase.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('BENDAHARA')) return Response.json({ error: 'Akses ditolak — bukan Bendahara' }, { status: 403 })

        let body: unknown
        try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
        const parsed = rejectDokumenSchema.safeParse(body)
        if (!parsed.success) return Response.json({ error: 'Validasi gagal', details: parsed.error.flatten() }, { status: 400 })

        const { data: dok, error: dokError } = await supabase.from('dokumen_transaksi').select('id, status').eq('id', params.id).single()
        if (dokError || !dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        // Idempotency: jika dokumen tidak dalam tahap Bendahara, block. Jika masih di IN_BENDAHARA_APPROVAL, ijinkan (karena bisa resubmit dan harus bisa tolak lagi).
        if (dok.status !== 'IN_BENDAHARA_APPROVAL') {
          const { data: existing } = await supabase.from('log_aktivitas')
            .select('id').eq('dokumen_id', params.id)
            .in('aksi', ['BENDAHARA_APPROVE', 'BENDAHARA_REJECT']).single()
          if (existing) return Response.json({ error: 'Dokumen sudah pernah diaksi oleh Bendahara' }, { status: 400 })
          return Response.json({ error: 'Dokumen sudah tidak dalam tahap persetujuan' }, { status: 400 })
        }

        const result = transition(dok.status, 'REJECT', 'BENDAHARA', 'PPK')
        if (!result.success) return Response.json({ error: result.error ?? 'Transisi gagal' }, { status: 400 })

        // Use admin client to bypass RLS for UPDATE
        const admin = createAdminClient()
        const updateErr = await updateDokumenStatus(admin, params.id, {
          status: result.newStatus, currentStep: result.newCurrentStep, revisionTarget: result.newRevisionTarget, revisionNotes: parsed.data.catatan,
        })
        if (updateErr.error) return Response.json({ error: updateErr.error }, { status: 500 })

        await insertLog(admin, { dokumenId: params.id, userId: session.user.id, aksi: 'BENDAHARA_REJECT', catatan: parsed.data.catatan, stepUrutan: result.stepUrutan ?? 1 })

        return Response.json({ success: true, message: 'Dokumen dikembalikan ke PPK', redirectTo: '/bendahara/ditolak' })
      },
    },
  },
})