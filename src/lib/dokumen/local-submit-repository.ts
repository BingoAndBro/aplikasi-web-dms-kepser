// Server-only module. Do not import from client components.
// Phase 6F.3 foundation only: schema-aware mapping and injected-adapter shape,
// not live Drizzle execution or submit route wiring.
import type {
  LocalSubmitAuditPayload,
  LocalSubmitBridgeRepository,
  LocalSubmitBridgeTransaction,
  LocalSubmitCreatedDocument,
  LocalSubmitDocumentCreatePayload,
  LocalSubmitKegiatan,
  LocalSubmitKetuaTimAssignmentRead,
  LocalSubmitNameRow,
  LocalSubmitRequiredKelengkapan,
  LocalSubmitRequiredKelengkapanRead,
  LocalSubmitStatusUpdatePayload,
} from './local-submit-write-bridge'
import type { LampiranUrl } from './types'

export const LOCAL_SUBMIT_SCHEMA_TABLES = {
  kegiatan: 'master.master_kegiatan',
  komponen: 'master.master_komponen',
  kelengkapan: 'master.master_kelengkapan_dokumen',
  jenisDokumen: 'master.master_jenis_dokumen',
  jenisPermintaan: 'master.master_jenis_permintaan',
  kategoriPermintaan: 'master.master_kategori_permintaan',
  detailPermintaan: 'master.master_detail_permintaan',
  ketuaTimAssignments: 'master.ketua_tim_assignments',
  dokumenTransaksi: 'dokumen.dokumen_transaksi',
  logAktivitas: 'dokumen.log_aktivitas',
} as const

export type LocalSubmitKegiatanRow = {
  id: string
  nama: string
  fungsiId?: string | null
}

export type LocalSubmitKelengkapanRow = {
  id: string
  namaDokumen: string
  required: boolean
}

export type LocalSubmitNameLookupRow = {
  id: string
  nama: string
}

export type LocalSubmitDokumenInsert = {
  judul: string
  fungsiId: string
  kegiatanJenisId: string
  isKetuaTim: boolean
  status: 'DRAFT'
  currentStep: null
  revisionTarget: null
  revisionNotes: null
  lampiranUrls: LampiranUrl[]
  tahun: number
  tanggal: string
  createdBy: string
  nominalRealisasi: string
  isNonMaterial: boolean
  jenisDokumenId: string | null
  namaDokumen: string | null
  keteranganDetail: string | null
  komponenId: string | null
  jenisPermintaanId: string | null
  kategoriPermintaanId: string | null
  detailPermintaanId: string | null
}

export type LocalSubmitDokumenStatusUpdate = {
  status: string
  currentStep: string | null
  revisionTarget: string | null
  revisionNotes: null
  updatedAt: Date
}

export type LocalSubmitLogInsert = {
  dokumenId: string
  userId: string
  aksi: 'SUBMIT' | 'STORE'
  catatan: null
  stepUrutan: number | null
}

export type LocalSubmitDokumenRow = {
  id: string
  judul: string
  fungsiId: string
  kegiatanJenisId: string
  isKetuaTim: boolean
  status: string
  currentStep: string | null
  revisionTarget: string | null
  revisionNotes: string | null
  lampiranUrls: LampiranUrl[]
  tahun: number
  tanggal: string
  createdBy: string
  nominalRealisasi: string | number | null
  isNonMaterial: boolean
  jenisDokumenId: string | null
  namaDokumen: string | null
  keteranganDetail: string | null
  komponenId: string | null
  jenisPermintaanId: string | null
  kategoriPermintaanId: string | null
  detailPermintaanId: string | null
  createdAt: Date | string
  updatedAt: Date | string
  fungsiNama?: string
  kegiatanNama?: string
  komponenNama?: string
  jenisDokumenNama?: string
}

export type LocalSubmitRepositoryTransactionAdapter = {
  insertDokumen(values: LocalSubmitDokumenInsert): Promise<LocalSubmitDokumenRow>
  updateDokumenStatus(
    dokumenId: string,
    values: LocalSubmitDokumenStatusUpdate,
  ): Promise<void>
  insertLog(values: LocalSubmitLogInsert): Promise<void>
}

export type LocalSubmitRepositoryAdapter = {
  selectKegiatanById(kegiatanId: string): Promise<LocalSubmitKegiatanRow | null>
  selectRequiredKelengkapan(
    input: LocalSubmitRequiredKelengkapanRead,
  ): Promise<LocalSubmitKelengkapanRow[]>
  selectJenisDokumenById(id: string): Promise<LocalSubmitNameLookupRow | null>
  selectKomponenById(id: string): Promise<LocalSubmitNameLookupRow | null>
  selectJenisPermintaanById(id: string): Promise<LocalSubmitNameLookupRow | null>
  selectKategoriPermintaanById(id: string): Promise<LocalSubmitNameLookupRow | null>
  selectDetailPermintaanById(id: string): Promise<LocalSubmitNameLookupRow | null>
  selectKetuaTimAssignmentExists(input: LocalSubmitKetuaTimAssignmentRead): Promise<boolean>
  withSubmitTransaction<T>(
    operation: (tx: LocalSubmitRepositoryTransactionAdapter) => Promise<T>,
  ): Promise<T>
}

export function createLocalSubmitBridgeRepository(
  adapter: LocalSubmitRepositoryAdapter,
): LocalSubmitBridgeRepository {
  return {
    async getKegiatanById(kegiatanId) {
      return mapLocalSubmitKegiatanRow(await adapter.selectKegiatanById(kegiatanId))
    },
    async getRequiredKelengkapan(input) {
      const rows = await adapter.selectRequiredKelengkapan(input)
      return rows.map(mapLocalSubmitKelengkapanRow)
    },
    async getJenisDokumenById(id) {
      return mapLocalSubmitNameRow(await adapter.selectJenisDokumenById(id))
    },
    async getKomponenById(id) {
      return mapLocalSubmitNameRow(await adapter.selectKomponenById(id))
    },
    async getJenisPermintaanById(id) {
      return mapLocalSubmitNameRow(await adapter.selectJenisPermintaanById(id))
    },
    async getKategoriPermintaanById(id) {
      return mapLocalSubmitNameRow(await adapter.selectKategoriPermintaanById(id))
    },
    async getDetailPermintaanById(id) {
      return mapLocalSubmitNameRow(await adapter.selectDetailPermintaanById(id))
    },
    async hasKetuaTimAssignment(input) {
      return adapter.selectKetuaTimAssignmentExists(input)
    },
    async withSubmitWriteTransaction(operation) {
      return adapter.withSubmitTransaction((tx) => operation(createBridgeTransaction(tx)))
    },
  }
}

export function mapLocalSubmitDocumentCreateToInsert(
  payload: LocalSubmitDocumentCreatePayload,
): LocalSubmitDokumenInsert {
  return {
    judul: payload.judul,
    fungsiId: payload.fungsiId,
    kegiatanJenisId: payload.kegiatanJenisId,
    isKetuaTim: payload.isKetuaTim,
    status: payload.status,
    currentStep: payload.currentStep,
    revisionTarget: payload.revisionTarget,
    revisionNotes: payload.revisionNotes,
    lampiranUrls: payload.lampiranUrls,
    tahun: payload.tahun,
    tanggal: payload.tanggal,
    createdBy: payload.createdBy,
    nominalRealisasi: payload.nominalRealisasi.toString(),
    isNonMaterial: payload.isNonMaterial,
    jenisDokumenId: payload.jenisDokumenId,
    namaDokumen: payload.namaDokumen,
    keteranganDetail: payload.keteranganDetail,
    komponenId: payload.komponenId,
    jenisPermintaanId: payload.jenisPermintaanId,
    kategoriPermintaanId: payload.kategoriPermintaanId,
    detailPermintaanId: payload.detailPermintaanId,
  }
}

export function mapLocalSubmitStatusUpdateToUpdate(
  payload: LocalSubmitStatusUpdatePayload,
): {
  dokumenId: string
  values: LocalSubmitDokumenStatusUpdate
} {
  return {
    dokumenId: payload.dokumenId,
    values: {
      status: payload.status,
      currentStep: payload.currentStep,
      revisionTarget: payload.revisionTarget,
      revisionNotes: payload.revisionNotes,
      updatedAt: new Date(payload.updatedAt),
    },
  }
}

export function mapLocalSubmitAuditToInsert(
  payload: LocalSubmitAuditPayload,
): LocalSubmitLogInsert {
  return {
    dokumenId: payload.dokumenId,
    userId: payload.userId,
    aksi: payload.aksi,
    catatan: payload.catatan,
    stepUrutan: payload.stepUrutan,
  }
}

export function mapLocalSubmitDokumenRowToCreatedDocument(
  row: LocalSubmitDokumenRow,
): LocalSubmitCreatedDocument {
  return {
    id: row.id,
    judul: row.judul,
    fungsi_id: row.fungsiId,
    kegiatan_jenis_id: row.kegiatanJenisId,
    is_ketua_tim: row.isKetuaTim,
    status: row.status,
    current_step: row.currentStep,
    revision_target: row.revisionTarget,
    revision_notes: row.revisionNotes,
    lampiran_urls: row.lampiranUrls,
    tahun: row.tahun,
    tanggal: row.tanggal,
    created_by: row.createdBy,
    nominal_realisasi: normalizeNumericValue(row.nominalRealisasi),
    is_non_material: row.isNonMaterial,
    jenis_dokumen_id: row.jenisDokumenId,
    nama_dokumen: row.namaDokumen,
    keterangan_detail: row.keteranganDetail,
    komponen_id: row.komponenId,
    jenis_permintaan_id: row.jenisPermintaanId,
    kategori_permintaan_id: row.kategoriPermintaanId,
    detail_permintaan_id: row.detailPermintaanId,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
    fungsi_nama: row.fungsiNama,
    kegiatan_nama: row.kegiatanNama,
    komponen_nama: row.komponenNama,
    jenis_dokumen_nama: row.jenisDokumenNama,
  }
}

export function mapLocalSubmitKegiatanRow(
  row: LocalSubmitKegiatanRow | null,
): LocalSubmitKegiatan | null {
  if (!row) return null
  return {
    id: row.id,
    nama: row.nama,
    fungsiId: row.fungsiId ?? null,
  }
}

export function mapLocalSubmitKelengkapanRow(
  row: LocalSubmitKelengkapanRow,
): LocalSubmitRequiredKelengkapan {
  return {
    id: row.id,
    namaDokumen: row.namaDokumen,
    required: row.required,
  }
}

export function mapLocalSubmitNameRow(
  row: LocalSubmitNameLookupRow | null,
): LocalSubmitNameRow | null {
  if (!row) return null
  return {
    id: row.id,
    nama: row.nama,
  }
}

function createBridgeTransaction(
  tx: LocalSubmitRepositoryTransactionAdapter,
): LocalSubmitBridgeTransaction {
  return {
    async createDokumen(payload) {
      const inserted = await tx.insertDokumen(mapLocalSubmitDocumentCreateToInsert(payload))
      return mapLocalSubmitDokumenRowToCreatedDocument(inserted)
    },
    async updateDokumenStatus(payload) {
      const update = mapLocalSubmitStatusUpdateToUpdate(payload)
      await tx.updateDokumenStatus(update.dokumenId, update.values)
    },
    async appendLog(payload) {
      await tx.insertLog(mapLocalSubmitAuditToInsert(payload))
    },
  }
}

function normalizeNumericValue(value: string | number | null): number | null {
  if (value === null) return null
  if (typeof value === 'number') return value

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}
