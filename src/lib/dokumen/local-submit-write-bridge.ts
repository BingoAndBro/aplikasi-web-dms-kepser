// Server-only module. Do not import from client components.
// Additional guardrails:
// - Treat this as helper foundation only, not submit route migration.
// - Prefer pure payload builders and repository-interface-shaped helpers over live DB execution.
// - Do not execute helper functions against a real database in this phase.
// - If Drizzle/local schema mapping is unclear, stop and document the blocker instead of guessing.
// - Do not weaken FSM/status/audit behavior to fit the bridge.
import { transition } from '#/lib/fsm'
import type { LocalServerSession } from '#/lib/auth/local-server-auth'
import { DOC_STATUS, FSM_ACTIONS } from '#/lib/constants/document-status'
import { ROLES, type RoleName } from '#/lib/constants/roles'
import type { TransitionResult } from '#/lib/types/fsm'
import type { LampiranUrl } from './types'

export type LocalSubmitActor = {
  userId: string
  username: string
  displayName: string
  roles: RoleName[]
  activeRole: RoleName
  sessionId: string
}

export type LocalSubmitActorIssueCode =
  | 'unauthenticated'
  | 'actor-not-pegawai-compatible'
  | 'admin-only-not-allowed'

export type LocalSubmitBridgeIssueCode =
  | LocalSubmitActorIssueCode
  | 'empty-attachments'
  | 'kegiatan-not-found'
  | 'ketua-tim-assignment-missing'
  | 'required-attachments-missing'
  | 'transition-failed'

export type LocalSubmitBridgeIssue = {
  code: LocalSubmitBridgeIssueCode
  message: string
  missingRequiredNames?: string[]
}

export type LocalSubmitActorResult =
  | { ok: true; actor: LocalSubmitActor }
  | { ok: false; issue: LocalSubmitBridgeIssue }

export type LocalSubmitPayload = {
  fungsiId: string
  kegiatanJenisId: string
  isKetuaTim: boolean
  tahun: number
  tanggal: string
  lampiranUrls: LampiranUrl[]
  nominal_realisasi?: number | null
  is_non_material?: boolean
  namaDokumen?: string
  keteranganDetail?: string
  komponenId?: string
  jenisPermintaanId?: string
  kategoriPermintaanId?: string
  detailPermintaanId?: string
}

export type LocalSubmitKegiatan = {
  id: string
  nama: string
  fungsiId?: string | null
}

export type LocalSubmitRequiredKelengkapan = {
  id: string
  namaDokumen: string
  required: boolean
}

export type LocalSubmitNameRow = {
  id: string
  nama: string
}

export type LocalSubmitRequiredKelengkapanRead = {
  kegiatanId: string
  isKetuaTim: boolean
  komponenId?: string | null
  jenisPermintaanId?: string | null
  kategoriPermintaanId?: string | null
  detailPermintaanId?: string | null
}

export type LocalSubmitKetuaTimAssignmentRead = {
  userId: string
  kegiatanId: string
}

export type LocalSubmitBridgeRepository = {
  getKegiatanById(kegiatanId: string): Promise<LocalSubmitKegiatan | null>
  getRequiredKelengkapan(
    input: LocalSubmitRequiredKelengkapanRead,
  ): Promise<LocalSubmitRequiredKelengkapan[]>
  getKomponenById(id: string): Promise<LocalSubmitNameRow | null>
  getJenisPermintaanById(id: string): Promise<LocalSubmitNameRow | null>
  getKategoriPermintaanById(id: string): Promise<LocalSubmitNameRow | null>
  getDetailPermintaanById(id: string): Promise<LocalSubmitNameRow | null>
  hasKetuaTimAssignment(input: LocalSubmitKetuaTimAssignmentRead): Promise<boolean>
  withSubmitWriteTransaction<T>(
    operation: (tx: LocalSubmitBridgeTransaction) => Promise<T>,
  ): Promise<T>
}

export type LocalSubmitDocumentCreatePayload = {
  judul: string
  fungsiId: string
  kegiatanJenisId: string
  isKetuaTim: boolean
  tahun: number
  tanggal: string
  lampiranUrls: LampiranUrl[]
  createdBy: string
  status: 'DRAFT'
  currentStep: null
  revisionTarget: null
  revisionNotes: null
  nominalRealisasi: number
  isNonMaterial: boolean
  namaDokumen: string | null
  keteranganDetail: string | null
  komponenId: string | null
  jenisPermintaanId: string | null
  kategoriPermintaanId: string | null
  detailPermintaanId: string | null
}

export type LocalSubmitStatusUpdatePayload = {
  dokumenId: string
  status: string
  currentStep: string | null
  revisionTarget: string | null
  revisionNotes: null
  updatedAt: string
}

export type LocalSubmitAuditPayload = {
  dokumenId: string
  userId: string
  aksi: 'SUBMIT' | 'STORE'
  catatan: null
  stepUrutan: number | null
}

export type LocalSubmitCreatedDocument = {
  id: string
  judul: string
  fungsi_id: string
  kegiatan_jenis_id: string
  is_ketua_tim: boolean
  status: string
  current_step: string | null
  revision_target: string | null
  revision_notes: string | null
  lampiran_urls: LampiranUrl[]
  tahun: number
  tanggal: string
  created_by: string
  nominal_realisasi: number | null
  is_non_material: boolean
  nama_dokumen: string | null
  keterangan_detail: string | null
  komponen_id: string | null
  jenis_permintaan_id: string | null
  kategori_permintaan_id: string | null
  detail_permintaan_id: string | null
  created_at: string
  updated_at: string
  fungsi_nama?: string
  kegiatan_nama?: string
  komponen_nama?: string
}

export type LocalSubmitBridgeTransaction = {
  createDokumen(
    payload: LocalSubmitDocumentCreatePayload,
  ): Promise<LocalSubmitCreatedDocument>
  updateDokumenStatus(payload: LocalSubmitStatusUpdatePayload): Promise<void>
  appendLog(payload: LocalSubmitAuditPayload): Promise<void>
}

export type LocalSubmitTransitionPlan = {
  result: TransitionResult
  auditAction: 'SUBMIT' | 'STORE'
}

export type LocalSubmitWritePlan = {
  actor: LocalSubmitActor
  kegiatan: LocalSubmitKegiatan
  leafName: string
  requiredKelengkapan: LocalSubmitRequiredKelengkapan[]
  documentCreatePayload: LocalSubmitDocumentCreatePayload
  transitionPlan: LocalSubmitTransitionPlan
  statusUpdatePayload: Omit<LocalSubmitStatusUpdatePayload, 'dokumenId'>
  auditPayload: Omit<LocalSubmitAuditPayload, 'dokumenId'>
  transactionSteps: readonly ['create-draft', 'update-status', 'append-audit-log']
}

export type LocalSubmitWritePreparationResult =
  | { ok: true; plan: LocalSubmitWritePlan }
  | { ok: false; issue: LocalSubmitBridgeIssue }

export type PrepareLocalSubmitWriteBridgeInput = {
  actor: LocalSubmitActor
  payload: LocalSubmitPayload
  repository: LocalSubmitBridgeRepository
  /**
   * Caller may pass storage-planned attachment metadata. This helper never
   * moves files and only persists logical metadata provided by the caller.
   */
  lampiranUrls?: LampiranUrl[]
  now?: () => Date
}

export type ExecuteLocalSubmitWriteResult = {
  dokumen: LocalSubmitCreatedDocument
  auditPayload: LocalSubmitAuditPayload
}

const TRANSACTION_STEPS = [
  'create-draft',
  'update-status',
  'append-audit-log',
] as const

export function createLocalSubmitActorFromSession(
  session: LocalServerSession | null,
): LocalSubmitActorResult {
  if (!session) {
    return fail('unauthenticated', 'Local submit actor requires an authenticated local session.')
  }

  if (!session.roles.includes(ROLES.PEGAWAI)) {
    if (session.roles.length === 1 && session.roles[0] === ROLES.ADMIN) {
      return fail('admin-only-not-allowed', 'ADMIN-only accounts are not valid submit actors.')
    }

    return fail(
      'actor-not-pegawai-compatible',
      'Local submit actor must have PEGAWAI compatibility.',
    )
  }

  return {
    ok: true,
    actor: {
      userId: session.userId,
      username: session.user.username,
      displayName: deriveLocalSubmitDisplayName(session),
      roles: session.roles,
      activeRole: session.activeRole,
      sessionId: session.sessionId,
    },
  }
}

export async function prepareLocalSubmitWriteBridge({
  actor,
  payload,
  repository,
  lampiranUrls = payload.lampiranUrls,
  now = () => new Date(),
}: PrepareLocalSubmitWriteBridgeInput): Promise<LocalSubmitWritePreparationResult> {
  if (lampiranUrls.length === 0) {
    return fail('empty-attachments', 'Minimal upload satu lampiran sebelum mengajukan dokumen')
  }

  const kegiatan = await repository.getKegiatanById(payload.kegiatanJenisId)
  if (!kegiatan) {
    return fail('kegiatan-not-found', 'Kegiatan tidak ditemukan')
  }

  let requiredKelengkapan: LocalSubmitRequiredKelengkapan[] = []
  if (shouldReadRequiredKelengkapan(payload)) {
    requiredKelengkapan = await repository.getRequiredKelengkapan({
      kegiatanId: payload.kegiatanJenisId,
      isKetuaTim: payload.isKetuaTim,
      komponenId: payload.komponenId ?? null,
      jenisPermintaanId: payload.jenisPermintaanId ?? null,
      kategoriPermintaanId: payload.kategoriPermintaanId ?? null,
      detailPermintaanId: payload.detailPermintaanId ?? null,
    })

    const missingRequiredNames = getMissingRequiredKelengkapanNames(
      requiredKelengkapan,
      lampiranUrls,
    )

    if (missingRequiredNames.length > 0) {
      return {
        ok: false,
        issue: {
          code: 'required-attachments-missing',
          message: `Lampiran wajib belum lengkap: ${missingRequiredNames.join(', ')}`,
          missingRequiredNames,
        },
      }
    }
  }

  if (payload.isKetuaTim) {
    const isAssigned = await repository.hasKetuaTimAssignment({
      userId: actor.userId,
      kegiatanId: payload.kegiatanJenisId,
    })

    if (!isAssigned) {
      return fail(
        'ketua-tim-assignment-missing',
        'Anda bukan Ketua Tim yang ditunjuk untuk kegiatan ini.',
      )
    }
  }

  const leafName = await resolveLocalSubmitLeafName(repository, payload, kegiatan.nama)
  const transitionPlan = buildLocalSubmitTransitionPlan(Boolean(payload.is_non_material))

  if (!transitionPlan.result.success) {
    return fail(
      'transition-failed',
      transitionPlan.result.error ?? 'Transisi status gagal',
    )
  }

  const documentCreatePayload = buildLocalSubmitDocumentCreatePayload({
    actor,
    payload,
    kegiatan,
    leafName,
    lampiranUrls,
  })
  const updatedAt = now().toISOString()

  return {
    ok: true,
    plan: {
      actor,
      kegiatan,
      leafName,
      requiredKelengkapan,
      documentCreatePayload,
      transitionPlan,
      statusUpdatePayload: {
        status: transitionPlan.result.newStatus,
        currentStep: transitionPlan.result.newCurrentStep,
        revisionTarget: transitionPlan.result.newRevisionTarget,
        revisionNotes: null,
        updatedAt,
      },
      auditPayload: {
        userId: actor.userId,
        aksi: transitionPlan.auditAction,
        catatan: null,
        stepUrutan: transitionPlan.result.stepUrutan,
      },
      transactionSteps: TRANSACTION_STEPS,
    },
  }
}

export async function executeLocalSubmitWritePlan(
  repository: LocalSubmitBridgeRepository,
  plan: LocalSubmitWritePlan,
): Promise<ExecuteLocalSubmitWriteResult> {
  return repository.withSubmitWriteTransaction(async (tx) => {
    const created = await tx.createDokumen(plan.documentCreatePayload)

    const statusUpdatePayload: LocalSubmitStatusUpdatePayload = {
      dokumenId: created.id,
      ...plan.statusUpdatePayload,
    }
    await tx.updateDokumenStatus(statusUpdatePayload)

    const auditPayload: LocalSubmitAuditPayload = {
      dokumenId: created.id,
      ...plan.auditPayload,
    }
    await tx.appendLog(auditPayload)

    return {
      dokumen: {
        ...created,
        status: statusUpdatePayload.status,
        current_step: statusUpdatePayload.currentStep,
        revision_target: statusUpdatePayload.revisionTarget,
        revision_notes: statusUpdatePayload.revisionNotes,
        updated_at: statusUpdatePayload.updatedAt,
      },
      auditPayload,
    }
  })
}

function buildLocalSubmitDocumentCreatePayload({
  actor,
  payload,
  kegiatan,
  leafName,
  lampiranUrls,
}: {
  actor: LocalSubmitActor
  payload: LocalSubmitPayload
  kegiatan: LocalSubmitKegiatan
  leafName: string
  lampiranUrls: LampiranUrl[]
}): LocalSubmitDocumentCreatePayload {
  return {
    judul: `${leafName} ${payload.tahun} ${actor.displayName}`,
    fungsiId: payload.fungsiId,
    kegiatanJenisId: kegiatan.id,
    isKetuaTim: payload.isKetuaTim,
    tahun: payload.tahun,
    tanggal: payload.tanggal,
    lampiranUrls,
    createdBy: actor.userId,
    status: DOC_STATUS.DRAFT,
    currentStep: null,
    revisionTarget: null,
    revisionNotes: null,
    nominalRealisasi: payload.nominal_realisasi ?? 0,
    isNonMaterial: Boolean(payload.is_non_material),
    namaDokumen: payload.namaDokumen ?? null,
    keteranganDetail: payload.keteranganDetail ?? null,
    komponenId: payload.komponenId ?? null,
    jenisPermintaanId: payload.jenisPermintaanId ?? null,
    kategoriPermintaanId: payload.kategoriPermintaanId ?? null,
    detailPermintaanId: payload.detailPermintaanId ?? null,
  }
}

function buildLocalSubmitTransitionPlan(
  isNonMaterial: boolean,
): LocalSubmitTransitionPlan {
  if (isNonMaterial) {
    return {
      result: {
        success: true,
        newStatus: DOC_STATUS.TERSIMPAN,
        newCurrentStep: null,
        newRevisionTarget: null,
        stepUrutan: 1,
      },
      auditAction: 'STORE',
    }
  }

  return {
    result: transition(DOC_STATUS.DRAFT, FSM_ACTIONS.SUBMIT, ROLES.PEGAWAI),
    auditAction: 'SUBMIT',
  }
}

export async function resolveLocalSubmitLeafName(
  repository: Pick<
    LocalSubmitBridgeRepository,
    | 'getKomponenById'
    | 'getDetailPermintaanById'
    | 'getKategoriPermintaanById'
    | 'getJenisPermintaanById'
  >,
  payload: Pick<
    LocalSubmitPayload,
    | 'is_non_material'
    | 'namaDokumen'
    | 'komponenId'
    | 'detailPermintaanId'
    | 'kategoriPermintaanId'
    | 'jenisPermintaanId'
  >,
  fallback: string,
): Promise<string> {
  if (payload.is_non_material) {
    return payload.namaDokumen?.trim() || fallback
  }

  if (payload.detailPermintaanId) {
    const detail = await repository.getDetailPermintaanById(payload.detailPermintaanId)
    if (detail?.nama) return detail.nama
  }

  if (payload.kategoriPermintaanId) {
    const kategori = await repository.getKategoriPermintaanById(payload.kategoriPermintaanId)
    if (kategori?.nama) return kategori.nama
  }

  if (payload.jenisPermintaanId) {
    const jenis = await repository.getJenisPermintaanById(payload.jenisPermintaanId)
    if (jenis?.nama) return jenis.nama
  }

  if (payload.komponenId) {
    const komponen = await repository.getKomponenById(payload.komponenId)
    if (komponen?.nama) return komponen.nama
  }

  return fallback
}

function getMissingRequiredKelengkapanNames(
  requiredItems: LocalSubmitRequiredKelengkapan[],
  lampiranUrls: LampiranUrl[],
): string[] {
  const uploadedIds = new Set(lampiranUrls.map(lampiran => lampiran.kelengkapan_id))

  return requiredItems
    .filter(item => item.required && !uploadedIds.has(item.id))
    .map(item => item.namaDokumen)
}

function shouldReadRequiredKelengkapan(payload: LocalSubmitPayload): boolean {
  return !payload.is_non_material || Boolean(payload.jenisPermintaanId)
}

export function deriveLocalSubmitDisplayName(session: LocalServerSession): string {
  return session.user.displayName
    ?? session.user.username
    ?? 'Unknown'
}

function fail(
  code: LocalSubmitBridgeIssueCode,
  message: string,
): { ok: false; issue: LocalSubmitBridgeIssue } {
  return {
    ok: false,
    issue: { code, message },
  }
}
