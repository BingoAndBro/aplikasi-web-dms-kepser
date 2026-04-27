import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession as getSession } from '#/lib/auth'
import { getDokumenKegiatanByKetuaTim } from '#/lib/dokumen-helpers'
import type { DokumenLaporanRow } from '#/lib/dokumen-helpers'

// ---------------------------------------------------------------------------
// Helper: buat Supabase client dengan cookie
// ---------------------------------------------------------------------------

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// GET /api/laporan/kegiatan — Semua dokumen dari proyek yang dipimpin user
// Gunakan admin client karena perlu baca dokumen user lain (bypass RLS)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/laporan/kegiatan')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const admin = createAdminClient()
        const list = await getDokumenKegiatanByKetuaTim(admin, session.user.id)

        if (list.length === 0) {
          return Response.json({ dokumen: [], isKetuaTim: false })
        }

        // Enrich dengan nama pengaju — ambil user metadata via admin
        // Kumpulkan unique user IDs
        const userIds = [...new Set(list.map((d: DokumenLaporanRow) => d.created_by).filter(Boolean))]

        // Query user metadata dari tabel auth.users via admin
        // Supabase admin API: auth.admin.listUsers() tidak support filter,
        // gunakan raw query ke profiles jika ada, atau fallback ke email
        const userNameMap: Record<string, string> = {}
        if (userIds.length > 0) {
          // Coba ambil dari user_metadata via RPC atau profiles
          // Fallback: gunakan user_id sebagai key, nama dari session
          userNameMap[session.user.id] =
            (session.user.user_metadata?.nama_lengkap as string | undefined)
            || (session.user.user_metadata?.user_name as string | undefined)
            || session.user.email?.split('@')[0]
            || 'Unknown'

          // Untuk user lain, coba query auth.users via admin
          try {
            const { data: { users } } = await admin.auth.admin.listUsers({
              perPage: 1000,
            })
            for (const u of users) {
              userNameMap[u.id] =
                (u.user_metadata?.nama_lengkap as string | undefined)
                || (u.user_metadata?.user_name as string | undefined)
                || u.email?.split('@')[0]
                || 'Unknown'
            }
          } catch {
            // Silent fallback — nama pengaju mungkin tidak tersedia
          }
        }

        const enriched: DokumenLaporanRow[] = list.map((d: DokumenLaporanRow) => ({
          ...d,
          pengaju_nama: userNameMap[d.created_by] ?? 'Unknown',
        }))

        return Response.json({ dokumen: enriched, isKetuaTim: true })
      },
    },
  },
})
