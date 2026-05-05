import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession as getSession } from '#/lib/auth'
import { transition } from '#/lib/fsm'
import type { TransitionResult } from '#/lib/types/fsm'
import type { FSMAction } from '#/lib/types/fsm'
import {
  getDokumenById,
  updateDokumenStatus,
  insertLog,
  getKelengkapanRequired,
} from '#/lib/dokumen-helpers'

function createClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

// ---------------------------------------------------------------------------
// POST /api/dokumen/[id]/submit — Submit or Resubmit dokumen
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/api/dokumen/$id/submit')({
  ssr: false,
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: Record<string, string> }) => {
        console.log('[API/dokumen/:id/submit] START id:', params.id)
        const supabase = createClient(request)
        const session = await getSession(supabase)
        console.log('[API/dokumen/:id/submit] session user:', session?.user?.id)

        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const dok = await getDokumenById(supabase, params.id)

        if (!dok) {
          return Response.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 })
        }

        if (dok.created_by !== session.user.id) {
          return Response.json({ error: 'Anda tidak memiliki akses' }, { status: 403 })
        }

        let transitionResult: TransitionResult
        let aksi: string

        if (dok.status === 'DRAFT') {
          // Validate: all required lampiran must be uploaded
          const requiredItems = await getKelengkapanRequired(
            supabase,
            dok.kegiatan_jenis_id,
            dok.is_ketua_tim
          )
          const uploadedIds = dok.lampiran_urls.map(l => l.kelengkapan_id)
          const missing = requiredItems.filter(r => r.required && !uploadedIds.includes(r.id))

          if (missing.length > 0) {
            return Response.json({
              error: `Lampiran wajib belum lengkap: ${missing.map(m => m.nama_dokumen).join(', ')}`,
            }, { status: 400 })
          }

          // Validate lampiran_urls is not empty
          if (dok.lampiran_urls.length === 0) {
            return Response.json({
              error: 'Minimal upload satu lampiran sebelum mengajukan dokumen',
            }, { status: 400 })
          }

          transitionResult = transition(dok.status, 'SUBMIT', 'PEGAWAI')
          aksi = 'SUBMIT'
        } else if (dok.status === 'NEED_REVISION' && dok.revision_target === 'USER') {
          // Check if Non-Material document (is_non_material flag or lack of chain fields)
          const isNonMaterial = dok.is_non_material === true ||
            (dok.is_non_material === undefined && !dok.jenis_permintaan_id && !dok.kategori_permintaan_id && !dok.detail_permintaan_id)
          console.log('[API/dokumen/:id/submit] isNonMaterial check:', { is_non_material: dok.is_non_material, isNonMaterial, chainFields: { jenis: dok.jenis_permintaan_id, kategori: dok.kategori_permintaan_id, detail: dok.detail_permintaan_id } })

          if (isNonMaterial) {
            transitionResult = transition(dok.status, 'RESUBMIT_NON_MATERIAL', 'PEGAWAI', dok.revision_target)
            aksi = 'RESUBMIT_NON_MATERIAL'
          } else {
            transitionResult = transition(dok.status, 'RESUBMIT', 'PEGAWAI', dok.revision_target)
            aksi = 'RESUBMIT'
          }
        } else {
          return Response.json({
            error: 'Dokumen tidak bisa disubmit dalam status ini',
          }, { status: 400 })
        }

        if (!transitionResult.success) {
          console.log('[API/dokumen/:id/submit] FSM transition failed:', transitionResult.error)
          return Response.json({ error: transitionResult.error || 'Transisi status gagal' }, { status: 400 })
        }
        console.log('[API/dokumen/:id/submit] FSM transition success:', { aksi, newStatus: transitionResult.newStatus, newStep: transitionResult.newCurrentStep })

        // Admin client for UPDATE operations (bypass RLS)
        const admin = createAdminClient()

        // Update status via FSM result
        const updateRes = await updateDokumenStatus(admin, params.id, {
          status: transitionResult.newStatus,
          currentStep: transitionResult.newCurrentStep,
          revisionTarget: transitionResult.newRevisionTarget,
        })

        if (updateRes.error) {
          return Response.json({ error: updateRes.error }, { status: 500 })
        }

        // Insert log — append-only
        const logRes = await insertLog(admin, {
          dokumenId: params.id,
          userId: session.user.id,
          aksi,
          stepUrutan: transitionResult.stepUrutan,
        })

        if (logRes.error) {
          // Non-fatal: dokumen was updated but log failed — log the error but return success
          console.error('[submit] Log insert failed:', logRes.error)
        }

        return Response.json({ success: true })
      },
    },
  },
})
