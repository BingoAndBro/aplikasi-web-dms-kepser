import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'
import { transition } from '#/lib/fsm'
import type { TransitionResult } from '#/lib/types/fsm'
import {
  getKelengkapanRequired,
  createDokumen,
  updateDokumenStatus,
  insertLog,
  resolveLeafNodeName,
} from '#/lib/dokumen-helpers'
import { createAndSubmitDokumenSchema, validateNominalForMaterial } from '#/lib/schemas/dokumen'

function createAuthClient(request: Request) {
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
  ssr: false,
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const parsed = createAndSubmitDokumenSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({
            error: 'Validasi gagal',
            details: parsed.error.flatten(),
          }, { status: 400 })
        }

        // Validate nominal_realisasi for Material documents
        const nominalValidation = validateNominalForMaterial(
          parsed.data.is_non_material,
          parsed.data.nominal_realisasi
        )
        if (!nominalValidation.valid) {
          return Response.json({ error: nominalValidation.error }, { status: 400 })
        }

        const supabase = createAuthClient(request)
        const session = await getServerSession(supabase)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Validate required lampiran
        // For Non-Material, we might not have the chain, so only validate if chain is provided
        let requiredItems: any[] = []
        if (!parsed.data.is_non_material || parsed.data.jenisPermintaanId) {
          requiredItems = await getKelengkapanRequired(
            supabase,
            parsed.data.kegiatanJenisId,
            parsed.data.isKetuaTim,
            {
              jenisPermintaanId: parsed.data.jenisPermintaanId,
              kategoriPermintaanId: parsed.data.kategoriPermintaanId,
              detailPermintaanId: parsed.data.detailPermintaanId,
            }
          )
          const uploadedIds = parsed.data.lampiranUrls.map(l => l.kelengkapan_id)
          const missing = requiredItems.filter(r => r.required && !uploadedIds.includes(r.id))

          if (missing.length > 0) {
            return Response.json({
              error: `Lampiran wajib belum lengkap: ${missing.map(m => m.nama_dokumen).join(', ')}`,
            }, { status: 400 })
          }
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

        const admin = createAdminClient()

        // User display name
        const userName =
          session.user.user_metadata?.nama_lengkap as string | undefined
          || session.user.user_metadata?.user_name as string | undefined
          || session.user.email?.split('@')[0]
          || 'Unknown'

        // Validasi Ketua Tim:
        // Jika isKetuaTim = true, pastikan user ini memang chairman yang ditunjuk
        // untuk kegiatan ini di tabel ketua_tim_assignments.
        // Untuk Non-Material: check langsung by kegiatan_id
        // Untuk Material: check by kegiatan_id (no leaf-level check needed)
        if (parsed.data.isKetuaTim) {
          // Check if current user is the assigned chairman for this kegiatan
          const { data: chairmanAssignment } = await supabase
            .from('ketua_tim_assignments')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('kegiatan_id', parsed.data.kegiatanJenisId)
            .maybeSingle()

          if (!chairmanAssignment) {
            return Response.json({
              error: 'Anda bukan Ketua Tim yang ditunjuk untuk kegiatan ini.',
            }, { status: 403 })
          }
        }

        // Resolve nama Leaf Node untuk judul dokumen
        // For Non-Material: use jenis dokumen name; for Material: use permintaan chain
        let leafName: string
        if (parsed.data.is_non_material && parsed.data.jenisDokumenId) {
          const { data: jenisDokumen } = await supabase
            .from('master_jenis_dokumen')
            .select('nama')
            .eq('id', parsed.data.jenisDokumenId)
            .single()
          leafName = jenisDokumen?.nama ?? kegiatan.nama
        } else {
          leafName = await resolveLeafNodeName(supabase, {
            detailId: parsed.data.detailPermintaanId,
            kategoriId: parsed.data.kategoriPermintaanId,
            jenisId: parsed.data.jenisPermintaanId,
            fallback: kegiatan.nama,
          })
        }

        // Judul: [Leaf Node] [Tahun] [Nama Pegawai]
        const judul = `${leafName} ${parsed.data.tahun} ${userName}`
        const createResult = await createDokumen(supabase, {
          judul,
          fungsiId: parsed.data.fungsiId,
          kegiatanJenisId: parsed.data.kegiatanJenisId,
          isKetuaTim: parsed.data.isKetuaTim,
          tahun: parsed.data.tahun,
          tanggal: parsed.data.tanggal,
          lampiranUrls: parsed.data.lampiranUrls,
          createdBy: session.user.id,
          nominalRealisasi: parsed.data.nominal_realisasi ?? 0,
          isNonMaterial: parsed.data.is_non_material,
          jenisDokumenId: parsed.data.jenisDokumenId,
          keteranganDetail: parsed.data.keteranganDetail,
          jenisPermintaanId: parsed.data.jenisPermintaanId,
          kategoriPermintaanId: parsed.data.kategoriPermintaanId,
          detailPermintaanId: parsed.data.detailPermintaanId,
        })

        if (createResult.error || !createResult.data) {
          return Response.json({ error: createResult.error || 'Gagal membuat dokumen' }, { status: 500 })
        }

        const dok = createResult.data

        // FSM transition based on document type
        // Material: DRAFT → IN_PPK_VALIDATION
        // Non-Material: DRAFT → IN_KETUA_TIM_APPROVAL
        const action = parsed.data.is_non_material ? 'SUBMIT_NON_MATERIAL' : 'SUBMIT'
        const transitionResult: TransitionResult = transition(dok.status as any, action as any, 'PEGAWAI')

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

        // Gunakan admin client untuk update status — RLS policy pegawai
        // hanya mengizinkan UPDATE pada status NEED_REVISION, sehingga
        // update DRAFT → IN_PPK_VALIDATION atau IN_KETUA_TIM_APPROVAL akan gagal diam-diam via anon client.
        const updateRes = await updateDokumenStatus(admin, dok.id, {
          status: transitionResult.newStatus,
          currentStep: transitionResult.newCurrentStep,
          revisionTarget: transitionResult.newRevisionTarget,
        })

        if (updateRes.error) {
          return Response.json({ error: updateRes.error }, { status: 500 })
        }

        // Insert log — append-only (admin karena RLS log_insert hanya
        // check auth.uid() = user_id, namun di server session mungkin
        // tidak terpropagasi sempurna)
        await insertLog(admin, {
          dokumenId: dok.id,
          userId: session.user.id,
          aksi: parsed.data.is_non_material ? 'SUBMIT_NON_MATERIAL' : 'SUBMIT',
          stepUrutan: transitionResult.stepUrutan,
        })

        return Response.json({ success: true, dokumen: updatedDok }, { status: 201 })
      },
    },
  },
})
