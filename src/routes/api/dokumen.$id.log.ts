import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'

function createAuthClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = { request, cookie: { get: () => undefined, set: () => {}, delete: () => {} } } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/dokumen/[id]/log — Get activity log for a dokumen
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/$id/log')({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        const authClient = createAuthClient(request)
        const session = await getServerSession(authClient)
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const admin = createAdminClient()

        // Get dokumen to check ownership/role
        const { data: dok, error: dokError } = await admin
          .from('dokumen_transaksi')
          .select('id, created_by')
          .eq('id', params.id)
          .single()

        if (dokError || !dok) return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })

        // Check access: owner or approver role
        const isOwner = dok.created_by === session.user.id
        const { data: rolesData } = await authClient
          .from('user_roles')
          .select('role:roles(nama)')
          .eq('user_id', session.user.id)
        const roleNames = rolesData?.map((r: any) => r.role?.nama).filter(Boolean) ?? []
        const isApprover = roleNames.length > 0

        if (!isOwner && !isApprover) {
          return Response.json({ error: 'Anda tidak memiliki akses ke log dokumen ini' }, { status: 403 })
        }

        // Get activity logs without joining a non-existent profiles table
        const { data: logs, error: logError } = await admin
          .from('log_aktivitas')
          .select(`
            id,
            aksi,
            catatan,
            step_urutan,
            timestamp,
            user_id
          `)
          .eq('dokumen_id', params.id)
          .order('timestamp', { ascending: true })

        if (logError) {
          console.error('[API/dokumen/:id/log] error:', logError)
          return Response.json({ error: 'Gagal mengambil log aktivitas' }, { status: 500 })
        }

        // Fetch user data from auth.users (Admin)
        const uniqueUserIds = [...new Set((logs ?? []).map((l: any) => l.user_id))]
        const usersMap = new Map<string, any>()
        
        for (const uid of uniqueUserIds) {
          const { data: { user } } = await admin.auth.admin.getUserById(uid)
          if (user) {
            usersMap.set(uid, user)
          }
        }

        // Format the response
        const formattedLogs = (logs ?? []).map((log: any) => {
          const user = usersMap.get(log.user_id)
          return {
            id: log.id,
            aksi: log.aksi,
            catatan: log.catatan,
            stepUrutan: log.step_urutan,
            createdAt: log.timestamp,
            userId: log.user_id,
            userNama: user?.user_metadata?.nama_lengkap || user?.user_metadata?.name || user?.email || 'Unknown',
            userEmail: user?.email ?? '',
          }
        })

        return Response.json({ logs: formattedLogs })
      },
    },
  },
})