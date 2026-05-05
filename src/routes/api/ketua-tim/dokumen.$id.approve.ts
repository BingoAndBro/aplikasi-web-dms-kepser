import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'
import { transition } from '#/lib/fsm'
import { updateDokumenStatus, insertLog } from '#/lib/dokumen-helpers'

function createAuthClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// POST /api/ketua-tim/dokumen/[id]/approve
// Approves a Non-Material document, moving it to COMPLETED
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ketua-tim/dokumen/$id/approve')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const authClient = createAuthClient(request)
        const session = await getServerSession(authClient)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Check if user is chairman of the kegiatan this document belongs to
        const { data: dok } = await authClient
          .from('dokumen_transaksi')
          .select('id, kegiatan_jenis_id, status, is_non_material')
          .eq('id', params.id)
          .single()

        if (!dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        // Only allow approve for Non-Material documents in IN_KETUA_TIM_APPROVAL
        if (!dok.is_non_material) {
          return Response.json({ error: 'Dokumen ini bukan dokumen Non-Material' }, { status: 400 })
        }

        if (dok.status !== 'IN_KETUA_TIM_APPROVAL') {
          return Response.json({
            error: 'Dokumen sudah tidak dalam tahap persetujuan Ketua Tim',
          }, { status: 400 })
        }

        // Check if user is assigned as chairman for this kegiatan
        const { data: assignment } = await authClient
          .from('ketua_tim_assignments')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('kegiatan_id', dok.kegiatan_jenis_id)
          .single()

        if (!assignment) {
          return Response.json({
            error: 'Anda bukan Ketua Tim yang ditunjuk untuk kegiatan ini',
          }, { status: 403 })
        }

        // FSM transition: IN_KETUA_TIM_APPROVAL → COMPLETED
        const result = transition(dok.status as any, 'APPROVE', 'KETUA_TIM')
        if (!result.success) {
          return Response.json({ error: result.error ?? 'Transisi gagal' }, { status: 400 })
        }

        // Update status using admin client
        const admin = createAdminClient()
        const updateErr = await updateDokumenStatus(admin, params.id, {
          status: result.newStatus,
          currentStep: result.newCurrentStep,
          revisionTarget: result.newRevisionTarget,
        })
        if (updateErr.error) {
          return Response.json({ error: updateErr.error }, { status: 500 })
        }

        // Insert log
        await insertLog(admin, {
          dokumenId: params.id,
          userId: session.user.id,
          aksi: 'KETUA_TIM_APPROVE',
          stepUrutan: result.stepUrutan ?? 1,
        })

        return Response.json({
          success: true,
          message: 'Dokumen Non-Material disetujui dan ditandai selesai',
        })
      },
    },
  },
})
