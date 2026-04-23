import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getSession } from '#/lib/auth'
import { rejectDokumenSchema } from '#/lib/schemas/dokumen'
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
// POST /api/ppk/dokumen/[id]/reject
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ppk/dokumen/$id/reject')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const authClient = createAuthClient(request)
        const session = await getSession(authClient)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Role check
        const { data: rolesData } = await authClient
          .from('user_roles')
          .select('role:roles(nama)')
          .eq('user_id', session.user.id)

        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        if (!roleNames.includes('PPK')) {
          return Response.json({ error: 'Akses ditolak — bukan PPK' }, { status: 403 })
        }

        // Parse body
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = rejectDokumenSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: parsed.error.flatten(),
          }, { status: 400 })
        }

        // Fetch dokumen via admin client (bypass RLS)
        const admin = createAdminClient()
        const { data: dok, error: dokError } = await admin
          .from('dokumen_transaksi')
          .select('id, status')
          .eq('id', params.id)
          .single()

        if (dokError || !dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        // Status check
        if (dok.status !== 'IN_PPK_VALIDATION') {
          return Response.json({
            error: 'Dokumen sudah tidak dalam tahap validasi PPK',
          }, { status: 400 })
        }

        // FSM transition
        const result = transition(dok.status, 'REJECT', 'PPK', 'USER')
        if (!result.success) {
          return Response.json({ error: result.error ?? 'Transisi gagal' }, { status: 400 })
        }

        // Update status with catatan
        const updateErr = await updateDokumenStatus(admin, params.id, {
          status: result.newStatus,
          currentStep: result.newCurrentStep,
          revisionTarget: result.newRevisionTarget,
          revisionNotes: parsed.data.catatan,
        })
        if (updateErr.error) {
          return Response.json({ error: updateErr.error }, { status: 500 })
        }

        // Insert log
        await insertLog(admin, {
          dokumenId: params.id,
          userId: session.user.id,
          aksi: 'PPK_REJECT',
          catatan: parsed.data.catatan,
          stepUrutan: result.stepUrutan ?? 1,
        })

        return Response.json({
          success: true,
          message: 'Dokumen dikembalikan ke pegawai',
        })
      },
    },
  },
})