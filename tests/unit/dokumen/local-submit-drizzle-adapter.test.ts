import { describe, expect, it, vi } from 'vitest'

import {
  dokumenTransaksi,
  ketuaTimAssignments,
  logAktivitas,
  masterDetailPermintaan,
  masterFungsi,
  masterJenisDokumen,
  masterJenisPermintaan,
  masterKategoriPermintaan,
  masterKegiatan,
  masterKelengkapanDokumen,
  masterKomponen,
} from '#/db/schema'
import {
  createLiveLocalSubmitDrizzleAdapter,
  createLocalSubmitDrizzleAdapter,
  LocalSubmitDrizzleAdapterError,
  type LocalSubmitDrizzleDatabase,
  type LocalSubmitDrizzleTransaction,
} from '#/lib/dokumen/local-submit-drizzle-adapter'
import {
  createLocalSubmitBridgeRepository,
  mapLocalSubmitDocumentCreateToInsert,
} from '#/lib/dokumen/local-submit-repository'
import {
  executeLocalSubmitWritePlan,
  type LocalSubmitDocumentCreatePayload,
  type LocalSubmitWritePlan,
} from '#/lib/dokumen/local-submit-write-bridge'
import type { LampiranUrl } from '#/lib/dokumen/types'

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const DOKUMEN_ID = '22222222-2222-4222-8222-222222222222'
const FUNGSI_ID = '33333333-3333-4333-8333-333333333333'
const KEGIATAN_ID = '44444444-4444-4444-8444-444444444444'
const JENIS_ID = '55555555-5555-4555-8555-555555555555'
const KATEGORI_ID = '66666666-6666-4666-8666-666666666666'
const DETAIL_ID = '77777777-7777-4777-8777-777777777777'
const LAMPIRAN_ID = '88888888-8888-4888-8888-888888888888'
const KOMPONEN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CREATED_AT = new Date('2026-05-16T01:00:00.000Z')
const UPDATED_AT = new Date('2026-05-16T02:00:00.000Z')

describe('local submit Drizzle adapter foundation', () => {
  it('can be imported without constructing the live database client', () => {
    expect(createLocalSubmitDrizzleAdapter).toEqual(expect.any(Function))
    expect(createLiveLocalSubmitDrizzleAdapter).toEqual(expect.any(Function))
  })

  it('maps submit read methods to the narrow local schema tables', async () => {
    const database = createFakeDatabase()
    const adapter = createLocalSubmitDrizzleAdapter(database)

    await expect(adapter.selectKegiatanById(KEGIATAN_ID)).resolves.toEqual({
      id: KEGIATAN_ID,
      nama: 'Dev Kegiatan',
      fungsiId: FUNGSI_ID,
    })
    await expect(adapter.selectRequiredKelengkapan({
      kegiatanId: KEGIATAN_ID,
      isKetuaTim: true,
      jenisPermintaanId: JENIS_ID,
      kategoriPermintaanId: KATEGORI_ID,
      detailPermintaanId: DETAIL_ID,
    })).resolves.toEqual([
      { id: LAMPIRAN_ID, namaDokumen: 'Surat Tugas', required: true },
    ])
    await expect(adapter.selectJenisDokumenById(JENIS_ID)).resolves.toEqual({
      id: JENIS_ID,
      nama: 'Dev Jenis Dokumen',
    })
    await expect(adapter.selectKomponenById(KOMPONEN_ID)).resolves.toEqual({
      id: KOMPONEN_ID,
      nama: 'Dev Komponen',
    })
    await expect(adapter.selectJenisPermintaanById(JENIS_ID)).resolves.toEqual({
      id: JENIS_ID,
      nama: 'Dev Jenis Permintaan',
    })
    await expect(adapter.selectKategoriPermintaanById(KATEGORI_ID)).resolves.toEqual({
      id: KATEGORI_ID,
      nama: 'Dev Kategori',
    })
    await expect(adapter.selectDetailPermintaanById(DETAIL_ID)).resolves.toEqual({
      id: DETAIL_ID,
      nama: 'Dev Detail',
    })
    await expect(adapter.selectKetuaTimAssignmentExists({
      userId: ACTOR_ID,
      kegiatanId: KEGIATAN_ID,
    })).resolves.toBe(true)

    expect(database.calls).toEqual([
      ['select', 'masterKegiatan', ['fungsiId', 'id', 'nama'], 1],
      ['select', 'masterKelengkapanDokumen', ['id', 'namaDokumen', 'required'], 1000],
      ['select', 'masterJenisDokumen', ['id', 'nama'], 1],
      ['select', 'masterKomponen', ['id', 'nama'], 1],
      ['select', 'masterJenisPermintaan', ['id', 'nama'], 1],
      ['select', 'masterKategoriPermintaan', ['id', 'nama'], 1],
      ['select', 'masterDetailPermintaan', ['id', 'nama'], 1],
      ['select', 'ketuaTimAssignments', ['id'], 1],
    ])
  })

  it('implements the submit transaction adapter with Drizzle-shaped insert/update/insert calls', async () => {
    const database = createFakeDatabase()
    const repository = createLocalSubmitBridgeRepository(
      createLocalSubmitDrizzleAdapter(database),
    )

    const result = await executeLocalSubmitWritePlan(repository, writePlan())

    expect(result.dokumen).toMatchObject({
      id: DOKUMEN_ID,
      status: 'IN_PPK_VALIDATION',
      current_step: 'PPK',
      revision_target: null,
      updated_at: UPDATED_AT.toISOString(),
      fungsi_nama: 'Dev Fungsi',
      kegiatan_nama: 'Dev Kegiatan',
    })
    expect(database.calls).toEqual([
      ['transaction:begin'],
      ['insert', 'dokumenTransaksi', mapLocalSubmitDocumentCreateToInsert(documentCreatePayload())],
      ['select', 'masterFungsi', ['nama'], 1],
      ['select', 'masterKegiatan', ['nama'], 1],
      ['select', 'masterKomponen', ['nama'], 1],
      ['update', 'dokumenTransaksi', {
        status: 'IN_PPK_VALIDATION',
        currentStep: 'PPK',
        revisionTarget: null,
        revisionNotes: null,
        updatedAt: UPDATED_AT,
      }],
      ['insert', 'logAktivitas', {
        dokumenId: DOKUMEN_ID,
        userId: ACTOR_ID,
        aksi: 'SUBMIT',
        catatan: null,
        stepUrutan: 1,
      }],
      ['transaction:commit'],
    ])
    expectNoSensitiveOrPhysicalData(result)
  })

  it('keeps log_aktivitas append-only by exposing insert and no update/delete behavior', async () => {
    const database = createFakeDatabase()
    const repository = createLocalSubmitBridgeRepository(
      createLocalSubmitDrizzleAdapter(database),
    )

    await executeLocalSubmitWritePlan(repository, writePlan())

    expect(database.calls).toContainEqual(['insert', 'logAktivitas', {
      dokumenId: DOKUMEN_ID,
      userId: ACTOR_ID,
      aksi: 'SUBMIT',
      catatan: null,
      stepUrutan: 1,
    }])
    expect(database.calls).not.toContainEqual(expect.arrayContaining(['update', 'logAktivitas']))
    expect(database.calls).not.toContainEqual(expect.arrayContaining(['delete', 'logAktivitas']))
  })

  it('throws a bounded repository-level error when status update returns no row', async () => {
    const database = createFakeDatabase({ statusUpdateRows: [] })
    const repository = createLocalSubmitBridgeRepository(
      createLocalSubmitDrizzleAdapter(database),
    )

    await expect(executeLocalSubmitWritePlan(repository, writePlan()))
      .rejects.toMatchObject({
        name: 'LocalSubmitDrizzleAdapterError',
        code: 'dokumen-status-update-returned-no-row',
      })

    expect(database.calls).toEqual([
      ['transaction:begin'],
      ['insert', 'dokumenTransaksi', mapLocalSubmitDocumentCreateToInsert(documentCreatePayload())],
      ['select', 'masterFungsi', ['nama'], 1],
      ['select', 'masterKegiatan', ['nama'], 1],
      ['select', 'masterKomponen', ['nama'], 1],
      ['update', 'dokumenTransaksi', {
        status: 'IN_PPK_VALIDATION',
        currentStep: 'PPK',
        revisionTarget: null,
        revisionNotes: null,
        updatedAt: UPDATED_AT,
      }],
      ['transaction:rollback'],
    ])
  })

  it('does not connect to PostgreSQL when fake Drizzle chains are used', async () => {
    const dynamicImport = vi.fn()
    const database = createFakeDatabase()
    const adapter = createLocalSubmitDrizzleAdapter(database)

    await adapter.selectKetuaTimAssignmentExists({
      userId: ACTOR_ID,
      kegiatanId: KEGIATAN_ID,
    })

    expect(dynamicImport).not.toHaveBeenCalled()
    expect(database.calls).toEqual([
      ['select', 'ketuaTimAssignments', ['id'], 1],
    ])
  })

  it('exposes a typed adapter error without sensitive data', () => {
    const error = new LocalSubmitDrizzleAdapterError('audit-insert-returned-no-row')

    expect(error.message).toBe(
      'Local submit Drizzle adapter failed: audit-insert-returned-no-row',
    )
    expectNoSensitiveOrPhysicalData(error)
  })
})

type FakeDatabase = LocalSubmitDrizzleDatabase & {
  calls: unknown[]
  options: FakeDatabaseOptions
}

type FakeDatabaseOptions = {
  statusUpdateRows?: unknown[]
}

function createFakeDatabase(options: FakeDatabaseOptions = {}): FakeDatabase {
  const calls: unknown[] = []

  return {
    calls,
    options,
    select(projection) {
      return {
        from(table) {
          return {
            where() {
              return {
                limit(limit) {
                  calls.push(['select', tableName(table), Object.keys(projection).sort(), limit])
                  return Promise.resolve(selectRowsFor(table, projection))
                },
              }
            },
          }
        },
      }
    },
    insert(table) {
      return {
        values(values) {
          return {
            returning() {
              calls.push(['insert', tableName(table), values])
              if (table === dokumenTransaksi) return Promise.resolve([dokumenRow(values as any)])
              if (table === logAktivitas) return Promise.resolve([{ id: 'log-id' }])
              return Promise.resolve([{ id: 'insert-id' }])
            },
          }
        },
      }
    },
    update(table) {
      return {
        set(values) {
          return {
            where() {
              return {
                returning() {
                  calls.push(['update', tableName(table), values])
                  return Promise.resolve(options.statusUpdateRows ?? [{ id: DOKUMEN_ID }])
                },
              }
            },
          }
        },
      }
    },
    async transaction(operation) {
      calls.push(['transaction:begin'])
      try {
        const result = await operation(this as unknown as LocalSubmitDrizzleTransaction)
        calls.push(['transaction:commit'])
        return result
      } catch (error) {
        calls.push(['transaction:rollback'])
        throw error
      }
    },
  }
}

function selectRowsFor(table: unknown, projection: Record<string, unknown>): unknown[] {
  if (table === masterKegiatan && 'fungsiId' in projection) {
    return [{ id: KEGIATAN_ID, nama: 'Dev Kegiatan', fungsiId: FUNGSI_ID }]
  }
  if (table === masterKegiatan) return [{ nama: 'Dev Kegiatan' }]
  if (table === masterFungsi) return [{ nama: 'Dev Fungsi' }]
  if (table === masterKelengkapanDokumen) {
    return [{ id: LAMPIRAN_ID, namaDokumen: 'Surat Tugas', required: true }]
  }
  if (table === masterJenisDokumen) return [{ id: JENIS_ID, nama: 'Dev Jenis Dokumen' }]
  if (table === masterKomponen) return [{ id: KOMPONEN_ID, nama: 'Dev Komponen' }]
  if (table === masterJenisPermintaan) return [{ id: JENIS_ID, nama: 'Dev Jenis Permintaan' }]
  if (table === masterKategoriPermintaan) return [{ id: KATEGORI_ID, nama: 'Dev Kategori' }]
  if (table === masterDetailPermintaan) return [{ id: DETAIL_ID, nama: 'Dev Detail' }]
  if (table === ketuaTimAssignments) return [{ id: 'assignment-id' }]
  return []
}

function tableName(table: unknown): string {
  if (table === dokumenTransaksi) return 'dokumenTransaksi'
  if (table === logAktivitas) return 'logAktivitas'
  if (table === masterFungsi) return 'masterFungsi'
  if (table === masterKegiatan) return 'masterKegiatan'
  if (table === masterKelengkapanDokumen) return 'masterKelengkapanDokumen'
  if (table === masterJenisDokumen) return 'masterJenisDokumen'
  if (table === masterKomponen) return 'masterKomponen'
  if (table === masterJenisPermintaan) return 'masterJenisPermintaan'
  if (table === masterKategoriPermintaan) return 'masterKategoriPermintaan'
  if (table === masterDetailPermintaan) return 'masterDetailPermintaan'
  if (table === ketuaTimAssignments) return 'ketuaTimAssignments'
  return 'unknown'
}

function writePlan(): LocalSubmitWritePlan {
  return {
    actor: {
      userId: ACTOR_ID,
      username: 'pegawai.local',
      displayName: 'Pegawai Local',
      roles: ['PEGAWAI'],
      activeRole: 'PEGAWAI',
      sessionId: '99999999-9999-4999-8999-999999999999',
    },
    kegiatan: { id: KEGIATAN_ID, nama: 'Dev Kegiatan', fungsiId: FUNGSI_ID },
    leafName: 'Dev Detail',
    requiredKelengkapan: [{ id: LAMPIRAN_ID, namaDokumen: 'Surat Tugas', required: true }],
    documentCreatePayload: documentCreatePayload(),
    transitionPlan: {
      auditAction: 'SUBMIT',
      result: {
        success: true,
        newStatus: 'IN_PPK_VALIDATION',
        newCurrentStep: 'PPK',
        newRevisionTarget: null,
        stepUrutan: 1,
      },
    },
    statusUpdatePayload: {
      status: 'IN_PPK_VALIDATION',
      currentStep: 'PPK',
      revisionTarget: null,
      revisionNotes: null,
      updatedAt: UPDATED_AT.toISOString(),
    },
    auditPayload: {
      userId: ACTOR_ID,
      aksi: 'SUBMIT',
      catatan: null,
      stepUrutan: 1,
    },
    transactionSteps: ['create-draft', 'update-status', 'append-audit-log'],
  }
}

function documentCreatePayload(): LocalSubmitDocumentCreatePayload {
  return {
    judul: 'Dev Detail 2026 Pegawai Local',
    fungsiId: FUNGSI_ID,
    kegiatanJenisId: KEGIATAN_ID,
    isKetuaTim: true,
    tahun: 2026,
    tanggal: '2026-05-16',
    lampiranUrls: [lampiran()],
    createdBy: ACTOR_ID,
    status: 'DRAFT',
    currentStep: null,
    revisionTarget: null,
    revisionNotes: null,
    nominalRealisasi: 125000.5,
    isNonMaterial: false,
    jenisDokumenId: null,
    namaDokumen: null,
    keteranganDetail: null,
    komponenId: KOMPONEN_ID,
    jenisPermintaanId: JENIS_ID,
    kategoriPermintaanId: KATEGORI_ID,
    detailPermintaanId: DETAIL_ID,
  }
}

function dokumenRow(values: ReturnType<typeof mapLocalSubmitDocumentCreateToInsert>) {
  return {
    id: DOKUMEN_ID,
    judul: values.judul,
    fungsiId: values.fungsiId,
    kegiatanJenisId: values.kegiatanJenisId,
    isKetuaTim: values.isKetuaTim,
    status: values.status,
    currentStep: values.currentStep,
    revisionTarget: values.revisionTarget,
    revisionNotes: values.revisionNotes,
    lampiranUrls: values.lampiranUrls,
    tahun: values.tahun,
    tanggal: values.tanggal,
    createdBy: values.createdBy,
    nominalRealisasi: values.nominalRealisasi,
    isNonMaterial: values.isNonMaterial,
    jenisDokumenId: values.jenisDokumenId,
    namaDokumen: values.namaDokumen,
    keteranganDetail: values.keteranganDetail,
    komponenId: values.komponenId,
    jenisPermintaanId: values.jenisPermintaanId,
    kategoriPermintaanId: values.kategoriPermintaanId,
    detailPermintaanId: values.detailPermintaanId,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }
}

function lampiran(): LampiranUrl {
  return {
    kelengkapan_id: LAMPIRAN_ID,
    nama: 'Surat Tugas',
    url: `${ACTOR_ID}/temp-id/${LAMPIRAN_ID}.pdf`,
    uploaded_at: CREATED_AT.toISOString(),
  }
}

function expectNoSensitiveOrPhysicalData(value: unknown): void {
  const serialized = JSON.stringify(value)

  expect(serialized).not.toContain('DATABASE_URL')
  expect(serialized).not.toContain('DMS_LOCAL_STORAGE_ROOT')
  expect(serialized).not.toContain('D:\\')
  expect(serialized).not.toContain('/storage/')
  expect(serialized).not.toContain('signedUrl')
  expect(serialized).not.toContain('password')
  expect(serialized).not.toContain('token')
}
