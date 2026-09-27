// Server-only module. Do not import from client components.
// RESUBMIT (Pegawai) and RESUBMIT_PPK (PPK) re-run the same content rules as
// the initial SUBMIT: nominal > 0 for Material documents, at least one
// lampiran, and the exact six-column required-kelengkapan match. All three
// rules come from the submit path itself (validateNominalForMaterial,
// checkLampiranNotEmpty, checkRequiredKelengkapan) — no copies.
//
// D-12 policy: dokumen.isKetuaTim here is the value the server already locked
// in at SUBMIT time (prepareLocalSubmitWriteBridge resolves it from the
// Ketua Tim assignment, ignoring the client's claim). RESUBMIT does NOT call
// hasKetuaTimAssignment again — the repository type below deliberately picks
// only 'getRequiredKelengkapan', so it cannot re-check the assignment even by
// accident. If the Ketua Tim roster for the kegiatan changes after submit,
// this document keeps the checklist it was submitted under until its
// kegiatanId itself changes (see PATCH /api/dokumen/$id, which recomputes
// isKetuaTim only then). This is a deliberate design choice, not a gap.
import { validateNominalForMaterial } from '#/lib/schemas/dokumen'
import {
  checkLampiranNotEmpty,
  checkRequiredKelengkapan,
  type LocalSubmitBridgeRepository,
} from './local-submit-write-bridge'
import { createLocalSubmitBridgeRepository } from './local-submit-repository'
import { createLiveLocalSubmitDrizzleAdapter } from './local-submit-drizzle-adapter'
import type { LampiranUrl } from './types'

export type ResubmitRequirementDokumen = {
  isNonMaterial: boolean
  kegiatanId: string
  isKetuaTim: boolean
  komponenId: string | null
  jenisPermintaanId: string | null
  kategoriPermintaanId: string | null
  detailPermintaanId: string | null
}

export type ResubmitRequirementResult =
  | { ok: true }
  | { ok: false; error: string; missingRequiredNames?: string[] }

export async function validateResubmitRequirements({
  dokumen,
  lampiranUrls,
  nominalRealisasi,
  repository,
}: {
  dokumen: ResubmitRequirementDokumen
  /** Lampiran the document will carry after the resubmit. */
  lampiranUrls: LampiranUrl[]
  /** Nominal the document will carry after the resubmit. */
  nominalRealisasi: number | string | null | undefined
  repository?: Pick<LocalSubmitBridgeRepository, 'getRequiredKelengkapan'>
}): Promise<ResubmitRequirementResult> {
  const nominal = validateNominalForMaterial(dokumen.isNonMaterial, toNominalNumber(nominalRealisasi))
  if (!nominal.valid) {
    return { ok: false, error: nominal.error ?? 'Nominal realisasi tidak valid' }
  }

  const lampiranCheck = checkLampiranNotEmpty(lampiranUrls)
  if (!lampiranCheck.ok) {
    return { ok: false, error: lampiranCheck.error }
  }

  const kelengkapanRepository = repository
    ?? createLocalSubmitBridgeRepository(await createLiveLocalSubmitDrizzleAdapter())

  const kelengkapan = await checkRequiredKelengkapan(kelengkapanRepository, {
    isNonMaterial: dokumen.isNonMaterial,
    kegiatanId: dokumen.kegiatanId,
    isKetuaTim: dokumen.isKetuaTim,
    komponenId: dokumen.komponenId,
    jenisPermintaanId: dokumen.jenisPermintaanId,
    kategoriPermintaanId: dokumen.kategoriPermintaanId,
    detailPermintaanId: dokumen.detailPermintaanId,
  }, lampiranUrls)

  if (!kelengkapan.ok) {
    return {
      ok: false,
      error: kelengkapan.issue.message,
      missingRequiredNames: kelengkapan.issue.missingRequiredNames,
    }
  }

  return { ok: true }
}

// nominal_realisasi is a NUMERIC column, so stored values arrive as strings.
function toNominalNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return value

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
