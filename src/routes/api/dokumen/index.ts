import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'
import { createDokumenSchema } from '#/lib/schemas/dokumen'
import {
  getDokumenByUser,
  createDokumen,
} from '#/lib/dokumen-helpers'

// ---------------------------------------------------------------------------
// Helper: create Supabase client with cookie
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
// GET /api/dokumen — List dokumen for current user
// POST /api/dokumen — Create DRAFT dokumen
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const supabase = createClient(request)
        const session = await getSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const list = await getDokumenByUser(supabase, session.user.id)
        return Response.json({ dokumen: list })
      },

      POST: async ({ request }: { request: Request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = createDokumenSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: parsed.error.flatten(),
          }, { status: 400 })
        }

        const supabase = createClient(request)
        const session = await getSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Fetch kegiatan name for judul auto-generation
        const { data: kegiatan } = await supabase
          .from('master_kegiatan')
          .select('nama')
          .eq('id', parsed.data.kegiatanJenisId)
          .single()

        if (!kegiatan) {
          return Response.json({ error: 'Kegiatan tidak ditemukan' }, { status: 400 })
        }

        // Fetch user display name
        const userName =
          session.user.user_metadata?.nama_lengkap as string | undefined
          || session.user.user_metadata?.user_name as string | undefined
          || session.user.email?.split('@')[0]
          || 'Unknown'

        // Judul: [Kegiatan] [Tahun] [Nama Pegawai]
        const judul = `${kegiatan.nama} ${parsed.data.tahun} ${userName}`

        const result = await createDokumen(supabase, {
          judul,
          fungsiId: parsed.data.fungsiId,
          kegiatanJenisId: parsed.data.kegiatanJenisId,
          isKetuaTim: parsed.data.isKetuaTim,
          tahun: parsed.data.tahun,
          tanggal: parsed.data.tanggal,
          lampiranUrls: parsed.data.lampiranUrls,
          createdBy: session.user.id,
        })

        if (result.error) {
          return Response.json({ error: result.error }, { status: 500 })
        }

        return Response.json({ dokumen: result.data }, { status: 201 })
      },
    },
  },
})
