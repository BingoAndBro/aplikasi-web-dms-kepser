// Server-only module. Do not import from client components.
// RESUBMIT (Pegawai) and RESUBMIT_PPK (PPK) re-run the same content rules as
// the initial SUBMIT: nominal > 0 for Material documents and the exact
// six-column required-kelengkapan match. Both rules come from the submit path
// itself (validateNominalForMaterial, checkRequiredKelengkapan) — no copies.
import { validateNominalForMaterial } from '#/lib/schemas/dokumen'
import {
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
