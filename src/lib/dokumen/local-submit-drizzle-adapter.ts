// Server-only module. Do not import from client components.
// Additional guardrails for Phase 6F.4:
// - Treat this as live Drizzle adapter foundation only, not submit route migration.
// - Do not import this module from src/routes/** in this phase.
// - Do not execute database work at module import time.
// - Keep filesystem movement, storage helpers, HTTP responses, and Supabase calls out of this adapter.
// - Preserve append-only log_aktivitas behavior by exposing insert-only audit behavior.
import { and, eq, isNull, type Column, type SQL } from 'drizzle-orm'

import {
  dokumenTransaksi,
  ketuaTimAssignments,
  logAktivitas,
  masterFungsi,
  masterDetailPermintaan,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
  masterKelengkapanDokumen,
  masterKomponen,
} from '#/db/schema'
import type {
  LocalSubmitDokumenRow,
  LocalSubmitKegiatanRow,
  LocalSubmitKelengkapanRow,
  LocalSubmitNameLookupRow,
  LocalSubmitRepositoryAdapter,
  LocalSubmitRepositoryTransactionAdapter,
} from './local-submit-repository'
import type {
  LocalSubmitKetuaTimAssignmentRead,
  LocalSubmitRequiredKelengkapanRead,
} from './local-submit-write-bridge'
import type { LampiranUrl } from './types'

export type LocalSubmitDrizzleDatabase = {
  select(projection: Record<string, unknown>): DrizzleSelectFrom
  insert(table: unknown): DrizzleInsertValues
  update(table: unknown): DrizzleUpdateSet
  transaction<T>(operation: (tx: LocalSubmitDrizzleTransaction) => Promise<T>): Promise<T>
}

export type LocalSubmitDrizzleTransaction = Omit<LocalSubmitDrizzleDatabase, 'transaction'>

export type LocalSubmitDrizzleAdapterErrorCode =
  | 'dokumen-insert-returned-no-row'
  | 'dokumen-status-update-returned-no-row'
  | 'audit-insert-returned-no-row'

export class LocalSubmitDrizzleAdapterError extends Error {
  constructor(readonly code: LocalSubmitDrizzleAdapterErrorCode) {
    super(`Local submit Drizzle adapter failed: ${code}`)
    this.name = 'LocalSubmitDrizzleAdapterError'
  }
}

type DrizzleSelectFrom = {
  from(table: unknown): DrizzleSelectWhere
}

type DrizzleSelectWhere = {
  where(condition: unknown): DrizzleSelectLimit
}

type DrizzleSelectLimit = {
  limit(limit: number): Promise<unknown[]>
}

type DrizzleInsertValues = {
  values(values: unknown): DrizzleReturning
}

type DrizzleUpdateSet = {
  set(values: unknown): DrizzleUpdateWhere
}

type DrizzleUpdateWhere = {
  where(condition: unknown): DrizzleReturning
}

type DrizzleReturning = {
  returning(projection?: Record<string, unknown>): Promise<unknown[]>
}

export function createLocalSubmitDrizzleAdapter(
  database: LocalSubmitDrizzleDatabase,
): LocalSubmitRepositoryAdapter {
  return createAdapterForDatabase(database)
}

export async function createLiveLocalSubmitDrizzleAdapter(): Promise<LocalSubmitRepositoryAdapter> {
  const { db } = await import('#/db/client')
  return createLocalSubmitDrizzleAdapter(db as unknown as LocalSubmitDrizzleDatabase)
}

function createAdapterForDatabase(
  database: LocalSubmitDrizzleDatabase,
): LocalSubmitRepositoryAdapter {
  return {
    async selectKegiatanById(kegiatanId) {
      const [row] = await database
        .select({
          id: masterKegiatan.id,
          nama: masterKegiatan.nama,
          fungsiId: masterKegiatan.fungsiId,
        })
        .from(masterKegiatan)
        .where(eq(masterKegiatan.id, kegiatanId))
        .limit(1)

      return (row as LocalSubmitKegiatanRow | undefined) ?? null
    },

    async selectRequiredKelengkapan(input) {
      return selectRequiredKelengkapan(database, input)
    },

    async selectKomponenById(id) {
      return selectNameById(database, masterKomponen, id)
    },

    async selectJenisPermintaanById(id) {
      return selectNameById(database, masterJenisPermintaan, id)
    },

    async selectKategoriPermintaanById(id) {
      return selectNameById(database, masterKategoriPermintaan, id)
    },

    async selectDetailPermintaanById(id) {
      return selectNameById(database, masterDetailPermintaan, id)
    },

    async selectKetuaTimAssignmentExists(input) {
      const [row] = await database
        .select({ id: ketuaTimAssignments.id })
        .from(ketuaTimAssignments)
        .where(and(
          eq(ketuaTimAssignments.userId, input.userId),
          eq(ketuaTimAssignments.kegiatanId, input.kegiatanId),
        ))
        .limit(1)

      return Boolean(row)
    },

    async withSubmitTransaction(operation) {
      return database.transaction((tx) => {
        const transactionAdapter = createTransactionAdapter(tx)
        return operation(transactionAdapter)
      })
    },
  }
}

// Same rule as the client checklist (KelengkapanChecklist.matchesCurrentSelection):
// a kelengkapan row applies only to its exact six-column combination, and an
// unselected level must match a NULL column.
export function buildRequiredKelengkapanCondition(
  input: LocalSubmitRequiredKelengkapanRead,
): SQL {
  const matchesNullable = (column: Column, value: string | null | undefined) =>
    value ? eq(column, value) : isNull(column)

  return and(
    eq(masterKelengkapanDokumen.kegiatanId, input.kegiatanId),
    eq(masterKelengkapanDokumen.isKetuaTim, input.isKetuaTim),
    matchesNullable(masterKelengkapanDokumen.komponenId, input.komponenId),
    matchesNullable(masterKelengkapanDokumen.jenisPermintaanId, input.jenisPermintaanId),
    matchesNullable(masterKelengkapanDokumen.kategoriPermintaanId, input.kategoriPermintaanId),
    matchesNullable(masterKelengkapanDokumen.detailPermintaanId, input.detailPermintaanId),
  ) as SQL
}

async function selectRequiredKelengkapan(
  database: LocalSubmitDrizzleDatabase,
  input: LocalSubmitRequiredKelengkapanRead,
): Promise<LocalSubmitKelengkapanRow[]> {
  const rows = await database
    .select({
      id: masterKelengkapanDokumen.id,
      namaDokumen: masterKelengkapanDokumen.namaDokumen,
      required: masterKelengkapanDokumen.required,
    })
    .from(masterKelengkapanDokumen)
    .where(buildRequiredKelengkapanCondition(input))
    .limit(1000)

  return rows as LocalSubmitKelengkapanRow[]
}

async function selectNameById(
  database: LocalSubmitDrizzleDatabase,
  table: any,
  id: string,
): Promise<LocalSubmitNameLookupRow | null> {
  const [row] = await database
    .select({
      id: table.id,
      nama: table.nama,
    })
    .from(table)
    .where(eq(table.id as never, id))
    .limit(1)

  return (row as LocalSubmitNameLookupRow | undefined) ?? null
}

function createTransactionAdapter(
  tx: LocalSubmitDrizzleTransaction,
): LocalSubmitRepositoryTransactionAdapter {
  return {
    async insertDokumen(values) {
      const [inserted] = await tx
        .insert(dokumenTransaksi)
        .values(values)
        .returning()

      if (!inserted) {
        throw new LocalSubmitDrizzleAdapterError('dokumen-insert-returned-no-row')
      }

      return enrichInsertedDokumenRow(tx, inserted as DrizzleDokumenRow)
    },

    async updateDokumenStatus(dokumenId, values) {
      const rows = await tx
        .update(dokumenTransaksi)
        .set(values)
        .where(eq(dokumenTransaksi.id, dokumenId))
        .returning({ id: dokumenTransaksi.id })

      if (rows.length === 0) {
        throw new LocalSubmitDrizzleAdapterError('dokumen-status-update-returned-no-row')
      }
    },

    async insertLog(values) {
      const rows = await tx
        .insert(logAktivitas)
        .values(values)
        .returning({ id: logAktivitas.id })

      if (rows.length === 0) {
        throw new LocalSubmitDrizzleAdapterError('audit-insert-returned-no-row')
      }
    },
  }
}

async function enrichInsertedDokumenRow(
  tx: LocalSubmitDrizzleTransaction,
  row: DrizzleDokumenRow,
): Promise<LocalSubmitDokumenRow> {
  const [fungsi] = await tx
    .select({ nama: masterFungsi.nama })
    .from(masterFungsi)
    .where(eq(masterFungsi.id, row.fungsiId))
    .limit(1)

  const [kegiatan] = await tx
    .select({ nama: masterKegiatan.nama })
    .from(masterKegiatan)
    .where(eq(masterKegiatan.id, row.kegiatanJenisId))
    .limit(1)

  let komponenNama: string | undefined
  if (row.komponenId) {
    const [komponen] = await tx
      .select({ nama: masterKomponen.nama })
      .from(masterKomponen)
      .where(eq(masterKomponen.id, row.komponenId))
      .limit(1)
    komponenNama = (komponen as { nama?: string } | undefined)?.nama
  }

  return {
    id: row.id,
    judul: row.judul,
    fungsiId: row.fungsiId,
    kegiatanJenisId: row.kegiatanJenisId,
    isKetuaTim: row.isKetuaTim,
    status: row.status,
    currentStep: row.currentStep,
    revisionTarget: row.revisionTarget,
    revisionNotes: row.revisionNotes,
    lampiranUrls: row.lampiranUrls,
    tahun: row.tahun,
    tanggal: row.tanggal,
    createdBy: row.createdBy,
    nominalRealisasi: row.nominalRealisasi,
    isNonMaterial: Boolean(row.isNonMaterial),
    namaDokumen: row.namaDokumen,
    keteranganDetail: row.keteranganDetail,
    komponenId: row.komponenId,
    jenisPermintaanId: row.jenisPermintaanId,
    kategoriPermintaanId: row.kategoriPermintaanId,
    detailPermintaanId: row.detailPermintaanId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    fungsiNama: (fungsi as { nama?: string } | undefined)?.nama,
    kegiatanNama: (kegiatan as { nama?: string } | undefined)?.nama,
    komponenNama,
  }
}

type DrizzleDokumenRow = Omit<
  LocalSubmitDokumenRow,
  'fungsiNama' | 'kegiatanNama' | 'komponenNama' | 'isNonMaterial'
> & {
  lampiranUrls: LampiranUrl[]
  isNonMaterial: boolean | null
}
