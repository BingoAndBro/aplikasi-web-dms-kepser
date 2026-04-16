import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'
import { approveDokumenSchema } from '#/lib/schemas/dokumen'
import { transition } from '#/lib/fsm'
import { updateDokumenStatus, insertLog } from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// POST /api/bendahara/dokumen/[id]/approve
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/bendahara/dokumen/$id/approve')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await supabase.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('BENDAHARA')) return Response.json({ error: 'Akses ditolak — bukan Bendahara' }, { status: 403 })

        let body: unknown = {}
        try { body = await request.json() } catch { /* empty ok */ }
        const parsed = approveDokumenSchema.safeParse(body)
        if (!parsed.success) return Response.json({ error: 'Validasi gagal' }, { status: 400 })

        const { data: dok, error: dokError } = await supabase.from('dokumen_transaksi').select('id, status').eq('id', params.id).single()
        if (dokError || !dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        if (dok.status !== 'IN_BENDAHARA_APPROVAL') return Response.json({ error: 'Dokumen sudah tidak dalam tahap persetujuan' }, { status: 400 })

        const result = transition(dok.status, 'APPROVE', 'BENDAHARA')
        if (!result.success) return Response.json({ error: result.error ?? 'Transisi gagal' }, { status: 400 })

        const updateErr = await updateDokumenStatus(supabase, params.id, {
          status: result.newStatus, currentStep: result.newCurrentStep, revisionTarget: result.newRevisionTarget,
        })
        if (updateErr.error) return Response.json({ error: updateErr.error }, { status: 500 })

        await insertLog(supabase, { dokumenId: params.id, userId: session.user.id, aksi: 'BENDAHARA_APPROVE', stepUrutan: result.stepUrutan ?? 2 })

        return Response.json({ success: true, message: 'Dokumen selesai, menunggu arsip dari Arsiparis' })
      },
    },
  },
})