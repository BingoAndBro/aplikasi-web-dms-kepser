import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'
import { approveDokumenSchema } from '#/lib/schemas/dokumen'
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
// POST /api/ppk/dokumen/[id]/approve
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/ppk/dokumen/$id/approve')({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const authClient = createAuthClient(request)
        const session = await getServerSession(authClient)

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

        // Parse body (empty schema)
        let body: unknown = {}
        try {
          body = await request.json()
        } catch {
          // empty body is fine
        }
        const parsed = approveDokumenSchema.safeParse(body)
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
        const result = transition(dok.status, 'APPROVE', 'PPK')
        if (!result.success) {
          return Response.json({ error: result.error ?? 'Transisi gagal' }, { status: 400 })
        }

        // Update status
        const updateErr = await updateDokumenStatus(admin, params.id, {
          status: result.newStatus,
          currentStep: result.newCurrentStep,
          revisionTarget: result.newRevisionTarget,
        })
        if (updateErr.error) {
          return Response.json({ error: updateErr.error }, { status: 500 })
        }

        // Insert log (menggunakan user ID dari sesi — bukan admin impersonate)
        await insertLog(admin, {
          dokumenId: params.id,
          userId: session.user.id,
          aksi: 'PPK_APPROVE',
          stepUrutan: result.stepUrutan ?? 2,
        })

        return Response.json({
          success: true,
          message: 'Dokumen diteruskan ke Bendahara',
        })
      },
    },
  },
})