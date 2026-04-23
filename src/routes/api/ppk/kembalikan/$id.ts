import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'
import { transition } from '#/lib/fsm'
import { updateDokumenStatus, insertLog } from '#/lib/dokumen-helpers'

function createAuthClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// POST /api/ppk/kembalikan/[id] — Return document to Pegawai
// Transitions from NEED_REVISION (target=PPK) back to Pegawai for revision
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ppk/kembalikan/$id')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        console.log('[API/ppk/kembalikan/:id] POST START id:', params.id)
        const authClient = createAuthClient(request)
        const session = await getServerSession(authClient)
        console.log('[API/ppk/kembalikan/:id] session user:', session?.user?.id)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const { data: rolesData } = await authClient.from('user_roles').select('role:roles(nama)').eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('PPK')) return Response.json({ error: 'Akses ditolak — bukan PPK' }, { status: 403 })

        const admin = createAdminClient()
        const { data: dok, error } = await admin
          .from('dokumen_transaksi')
          .select('id, status, revision_target')
          .eq('id', params.id)
          .single()

        if (error || !dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        console.log('[API/ppk/kembalikan/:id] dok status:', dok.status, 'target:', dok.revision_target)
        if (dok.status !== 'NEED_REVISION' || dok.revision_target !== 'PPK') {
          return Response.json({ error: 'Dokumen ini tidak dalam status revisi PPK' }, { status: 400 })
        }

        // FSM transition: NEED_REVISION:KEMBALIKAN with target=USER
        // Returns document to Pegawai for revision (from revision page)
        const result = transition(dok.status, 'KEMBALIKAN', 'PPK', 'USER')
        console.log('[API/ppk/kembalikan/:id] FSM result:', result.success ? 'success' : result.error)
        if (!result.success) return Response.json({ error: result.error || 'Transisi gagal' }, { status: 400 })

        // Update status - document goes back to Pegawai
        const updateErr = await updateDokumenStatus(admin, params.id, {
          status: result.newStatus,
          currentStep: result.newCurrentStep,
          revisionTarget: result.newRevisionTarget,
          revisionNotes: 'Dikembalikan ke pegawai oleh PPK',
        })

        if (updateErr.error) {
          console.error('[API/ppk/kembalikan/:id] update error:', updateErr.error)
          return Response.json({ error: updateErr.error }, { status: 500 })
        }

        await insertLog(admin, {
          dokumenId: params.id,
          userId: session.user.id,
          aksi: 'PPK_KEMBALIKAN',
          catatan: 'Dikembalikan ke pegawai oleh PPK',
          stepUrutan: result.stepUrutan ?? 1,
        })

        console.log('[API/ppk/kembalikan/:id] POST SUCCESS')
        return Response.json({ success: true })
      },
    },
  },
})