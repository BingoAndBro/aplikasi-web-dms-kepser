import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { getServerSession as getSession } from '#/lib/auth'
import { transition } from '#/lib/fsm'
import type { TransitionResult } from '#/lib/types/fsm'
import {
  getKelengkapanRequired,
  createDokumen,
  updateDokumenStatus,
  insertLog,
} from '#/lib/dokumen-helpers'
import { createDokumenSchema } from '#/lib/schemas/dokumen'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// POST /api/dokumen/submit — Combined create + submit in one request
// Used by the Ajukan Dokumen form (Section 05)
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/submit')({
  server: {
    handlers: {
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

        // Validate required lampiran
        const requiredItems = await getKelengkapanRequired(
          supabase,
          parsed.data.kegiatanJenisId,
          parsed.data.isKetuaTim
        )
        const uploadedIds = parsed.data.lampiranUrls.map(l => l.kelengkapan_id)
        const missing = requiredItems.filter(r => r.required && !uploadedIds.includes(r.id))

        if (missing.length > 0) {
          return Response.json({
            error: `Lampiran wajib belum lengkap: ${missing.map(m => m.nama_dokumen).join(', ')}`,
          }, { status: 400 })
        }

        if (parsed.data.lampiranUrls.length === 0) {
          return Response.json({
            error: 'Minimal upload satu lampiran sebelum mengajukan dokumen',
          }, { status: 400 })
        }

        // Fetch kegiatan name for judul
        const { data: kegiatan } = await supabase
          .from('master_kegiatan')
          .select('nama')
          .eq('id', parsed.data.kegiatanJenisId)
          .single()

        if (!kegiatan) {
          return Response.json({ error: 'Kegiatan tidak ditemukan' }, { status: 400 })
        }

        // User display name
        const userName =
          session.user.user_metadata?.nama_lengkap as string | undefined
          || session.user.user_metadata?.user_name as string | undefined
          || session.user.email?.split('@')[0]
          || 'Unknown'

        // Judul: [Kegiatan] [Tahun] [Nama Pegawai]
        const judul = `${kegiatan.nama} ${parsed.data.tahun} ${userName}`

        // Create DRAFT dokumen first
        const createResult = await createDokumen(supabase, {
          judul,
          fungsiId: parsed.data.fungsiId,
          kegiatanJenisId: parsed.data.kegiatanJenisId,
          isKetuaTim: parsed.data.isKetuaTim,
          tahun: parsed.data.tahun,
          tanggal: parsed.data.tanggal,
          lampiranUrls: parsed.data.lampiranUrls,
          createdBy: session.user.id,
        })

        if (createResult.error || !createResult.data) {
          return Response.json({ error: createResult.error || 'Gagal membuat dokumen' }, { status: 500 })
        }

        const dok = createResult.data

        // FSM transition: DRAFT → IN_PPK_VALIDATION
        const transitionResult: TransitionResult = transition(dok.status as any, 'SUBMIT', 'PEGAWAI')

        if (!transitionResult.success) {
          return Response.json({ error: transitionResult.error || 'Transisi status gagal' }, { status: 500 })
        }

        // Update status — merge returned fields into dok for response
        const updatedDok: typeof dok = {
          ...dok,
          status: transitionResult.newStatus,
          current_step: transitionResult.newCurrentStep,
          revision_target: transitionResult.newRevisionTarget,
          updated_at: new Date().toISOString(),
        }

        const updateRes = await updateDokumenStatus(supabase, dok.id, {
          status: transitionResult.newStatus,
          currentStep: transitionResult.newCurrentStep,
          revisionTarget: transitionResult.newRevisionTarget,
        })

        if (updateRes.error) {
          return Response.json({ error: updateRes.error }, { status: 500 })
        }

        // Insert log — append-only
        await insertLog(supabase, {
          dokumenId: dok.id,
          userId: session.user.id,
          aksi: 'SUBMIT',
          stepUrutan: transitionResult.stepUrutan,
        })

        return Response.json({ success: true, dokumen: updatedDok }, { status: 201 })
      },
    },
  },
})
