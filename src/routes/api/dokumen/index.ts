import { createFileRoute } from '@tanstack/react-router'
import { desc, eq } from 'drizzle-orm'
import { db } from '#/db/client'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { masterFungsi, masterKegiatan } from '#/db/schema/master'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'
import { getLocalServerSession, hasLocalRole } from '#/lib/auth/local-server-auth'
import { createDokumenSchema } from '#/lib/schemas/dokumen'
import {
  createDokumen,
} from '#/lib/dokumen-helpers'
import { parseDokumenWithNames } from '#/lib/dokumen'

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
        const session = await getLocalServerSession(request)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!hasLocalRole(session, 'PEGAWAI')) {
          return Response.json({ error: 'Akses ditolak' }, { status: 403 })
        }

        try {
          const rows = await db
            .select({
              id: dokumenTransaksi.id,
              judul: dokumenTransaksi.judul,
              fungsi_id: dokumenTransaksi.fungsiId,
              kegiatan_jenis_id: dokumenTransaksi.kegiatanJenisId,
              is_ketua_tim: dokumenTransaksi.isKetuaTim,
              status: dokumenTransaksi.status,
              current_step: dokumenTransaksi.currentStep,
              revision_target: dokumenTransaksi.revisionTarget,
              revision_notes: dokumenTransaksi.revisionNotes,
              lampiran_urls: dokumenTransaksi.lampiranUrls,
              tahun: dokumenTransaksi.tahun,
              tanggal: dokumenTransaksi.tanggal,
              created_by: dokumenTransaksi.createdBy,
              nominal_realisasi: dokumenTransaksi.nominalRealisasi,
              is_non_material: dokumenTransaksi.isNonMaterial,
              jenis_dokumen_id: dokumenTransaksi.jenisDokumenId,
              keterangan_detail: dokumenTransaksi.keteranganDetail,
              created_at: dokumenTransaksi.createdAt,
              updated_at: dokumenTransaksi.updatedAt,
              fungsi_nama: masterFungsi.nama,
              kegiatan_nama: masterKegiatan.nama,
            })
            .from(dokumenTransaksi)
            .leftJoin(masterFungsi, eq(dokumenTransaksi.fungsiId, masterFungsi.id))
            .leftJoin(masterKegiatan, eq(dokumenTransaksi.kegiatanJenisId, masterKegiatan.id))
            .where(eq(dokumenTransaksi.createdBy, session.user.id))
            .orderBy(desc(dokumenTransaksi.createdAt))

          return Response.json({
            dokumen: rows.map((row) => parseDokumenWithNames(row, {}, {})),
          })
        } catch (err) {
          console.error('[dokumen/index] GET local query error:', err)
          return Response.json({ error: 'Gagal mengambil data' }, { status: 500 })
        }
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
