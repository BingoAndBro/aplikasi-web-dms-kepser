import { createFileRoute } from '@tanstack/react-router'
import { createServerSupabaseClient } from '#/lib/supabase-server'
import { createAdminClient } from '#/lib/supabase-admin'
import { getServerSession } from '#/lib/auth'
import { getLocalServerSession } from '#/lib/auth/local-server-auth'
import { transition } from '#/lib/fsm'
import type { TransitionResult } from '#/lib/types/fsm'
import { ROLES } from '#/lib/constants/roles'
import { preflightSubmitFiles, type SubmitFilePreflightIssue } from '#/lib/dokumen/submit-file-preflight'
import { createSubmitDiskPreflightChecker } from '#/lib/dokumen/submit-disk-preflight-checker'
import {
  getKelengkapanRequired,
  createDokumen,
  updateDokumenStatus,
  insertLog,
  resolveLeafNodeName,
} from '#/lib/dokumen-helpers'
import { createAndSubmitDokumenSchema, validateNominalForMaterial } from '#/lib/schemas/dokumen'
import { buildSubmitMovePlan } from '#/lib/storage/submit-move-plan'
import { assertSafeLogicalStoragePath } from '#/lib/storage/local-storage-paths'

function createAuthClient(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  const mockEvent = {
    request,
    cookie: { get: () => undefined, set: () => {}, delete: () => {} },
  } as any
  return createServerSupabaseClient(mockEvent, cookieHeader)
}

function isLocalAuthDryRunRequest(request: Request): boolean {
  return new URL(request.url).searchParams.get('useLocalAuthDryRun') === 'true'
}

function isLocalPreflightDryRunRequest(request: Request): boolean {
  return new URL(request.url).searchParams.get('useLocalPreflightDryRun') === 'true'
}

async function handleLocalAuthDryRun(request: Request): Promise<Response> {
  const localSession = await getLocalServerSession(request)

  if (!localSession?.userId || !localSession.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!localSession.roles.includes(ROLES.PEGAWAI)) {
    return Response.json({ error: 'Akses ditolak' }, { status: 403 })
  }

  return Response.json({
    dryRun: true,
    boundary: 'local-auth',
    submitCompatible: true,
    writePathExecuted: false,
    filesystemMovementExecuted: false,
    message: 'Local auth boundary validated; submit write path was not executed.',
  }, { status: 200 })
}

async function handleLocalPreflightDryRun(
  request: Request,
  attachments: Array<{ url: string; [key: string]: unknown }>,
): Promise<Response> {
  const localSession = await getLocalServerSession(request)

  if (!localSession?.userId || !localSession.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!localSession.roles.includes(ROLES.PEGAWAI)) {
    return Response.json({ error: 'Akses ditolak' }, { status: 403 })
  }

  const movePlan = buildSubmitMovePlan({
    ownerUserId: localSession.userId,
    attachments,
  })
  const preflight = await preflightSubmitFiles({
    actorUserId: localSession.userId,
    movePlan,
    existenceChecker: createSubmitDiskPreflightChecker(),
  })

  if (!preflight.ok) {
    return Response.json({
      dryRun: true,
      boundary: 'local-preflight',
      submitCompatible: true,
      preflightOk: false,
      writePathExecuted: false,
      filesystemMovementExecuted: false,
      error: 'Local submit preflight failed; submit write path was not executed.',
      issues: preflight.issues.map(toSafePreflightIssue),
    }, { status: 400 })
  }

  return Response.json({
    dryRun: true,
    boundary: 'local-preflight',
    submitCompatible: true,
    preflightOk: true,
    writePathExecuted: false,
    filesystemMovementExecuted: false,
    message: 'Local submit preflight validated; submit write path was not executed.',
  }, { status: 200 })
}

function toSafePreflightIssue(issue: SubmitFilePreflightIssue) {
  return {
    code: issue.code,
    message: issue.message,
    index: issue.index,
    clientCategory: issue.clientCategory,
    sourceClassification: issue.sourceClassification,
    movePlanIssueCode: issue.movePlanIssueCode,
    checkKind: issue.checkKind,
    sourceLogicalPath: safeLogicalPathForResponse(issue.sourceLogicalPath),
    targetLogicalPath: safeLogicalPathForResponse(issue.targetLogicalPath),
  }
}

function safeLogicalPathForResponse(logicalPath: string | null): string | null {
  if (!logicalPath) return null

  try {
    return assertSafeLogicalStoragePath(logicalPath) === logicalPath
      ? logicalPath
      : null
  } catch {
    return null
  }
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

        if (isLocalAuthDryRunRequest(request)) {
          return handleLocalAuthDryRun(request)
        }

        if (isLocalPreflightDryRunRequest(request)) {
          return handleLocalPreflightDryRun(request, parsed.data.lampiranUrls)
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

        // Helper functions for renaming pending files
        function isPendingPath(url: string): boolean {
          const pathParts = url.split('/')
          const filenameWithExt = pathParts[pathParts.length - 1] || ''
          return /^\d{13}-[a-zA-Z0-9]+-.+$/.test(filenameWithExt)
        }

        function extractExtension(url: string): string {
          const filename = url.split('/').pop() || ''
          const parts = filename.split('.')
          return parts.length > 1 ? parts[parts.length - 1] : ''
        }

        // Build formal storage path
        function buildFormalPath(userId: string, dokId: string, ext: string): string {
          return `${userId}/${dokId}/${crypto.randomUUID()}.${ext}`
        }

        // Judul: [Leaf Node] [Tahun] [Nama Pegawai]
        const judul = `${leafName} ${parsed.data.tahun} ${userName}`

        // Pre-process lampiranUrls: rename pending files before create
        let processedLampirans = parsed.data.lampiranUrls
        for (let i = 0; i < processedLampirans.length; i++) {
          const lamp = processedLampirans[i]
          if (!lamp.url || !isPendingPath(lamp.url)) continue

          const oldPath = lamp.url
          const ext = extractExtension(oldPath)
          const newPath = buildFormalPath(session.user.id, 'temp-id', ext)

          console.log('[API/dokumen/submit] Renaming pending file:', oldPath, '->', newPath)
          const { error: moveError } = await admin.storage
            .from('dokumen-lampiran')
            .move(oldPath, newPath)

          if (moveError) {
            console.error('[API/dokumen/submit] Move failed:', oldPath, 'error:', moveError.message)
            return Response.json({
              error: `Gagal menyimpan perubahan: file "${oldPath}" gagal diproses. Silakan coba lagi.`,
              details: {
                failedPath: oldPath,
                newPath: newPath,
                reason: moveError.message,
              },
            }, { status: 500 })
          }

          processedLampirans[i] = { ...lamp, url: newPath }
          console.log('[API/dokumen/submit] Move success:', newPath)
        }

        const createResult = await createDokumen(supabase, {
          judul,
          fungsiId: parsed.data.fungsiId,
          kegiatanJenisId: parsed.data.kegiatanJenisId,
          isKetuaTim: parsed.data.isKetuaTim,
          tahun: parsed.data.tahun,
          tanggal: parsed.data.tanggal,
          lampiranUrls: processedLampirans,
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

        // FSM transition
        // Material: DRAFT → IN_PPK_VALIDATION
        // Non-Material: DRAFT → COMPLETED (langsung selesai)
        let transitionResult: TransitionResult
        if (parsed.data.is_non_material) {
          // Non-Material langsung tersimpan
          transitionResult = {
            success: true,
            newStatus: 'TERSIMPAN',
            newCurrentStep: null,
            newRevisionTarget: null,
            stepUrutan: 1,
          }
        } else {
          transitionResult = transition(dok.status as any, 'SUBMIT', 'PEGAWAI')
        }

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
        // update DRAFT → IN_PPK_VALIDATION akan gagal diam-diam via anon client.
        const updateRes = await updateDokumenStatus(admin, dok.id, {
          status: transitionResult.newStatus,
          currentStep: transitionResult.newCurrentStep,
          revisionTarget: transitionResult.newRevisionTarget,
        })

        if (updateRes.error) {
          return Response.json({ error: updateRes.error }, { status: 500 })
        }

        // Insert log — append-only
        // Non-Material uses STORE, Material uses SUBMIT
        await insertLog(admin, {
          dokumenId: dok.id,
          userId: session.user.id,
          aksi: parsed.data.is_non_material ? 'STORE' : 'SUBMIT',
          stepUrutan: transitionResult.stepUrutan,
        })

        return Response.json({ success: true, dokumen: updatedDok }, { status: 201 })
      },
    },
  },
})
