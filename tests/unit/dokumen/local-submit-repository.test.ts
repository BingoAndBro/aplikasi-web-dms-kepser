import { describe, expect, it, vi } from 'vitest'

import {
  createLocalSubmitBridgeRepository,
  LOCAL_SUBMIT_SCHEMA_TABLES,
  mapLocalSubmitAuditToInsert,
  mapLocalSubmitDocumentCreateToInsert,
  mapLocalSubmitDokumenRowToCreatedDocument,
  mapLocalSubmitStatusUpdateToUpdate,
  type LocalSubmitDokumenInsert,
  type LocalSubmitDokumenRow,
  type LocalSubmitDokumenStatusUpdate,
  type LocalSubmitRepositoryAdapter,
  type LocalSubmitRepositoryTransactionAdapter,
} from '#/lib/dokumen/local-submit-repository'
import {
  executeLocalSubmitWritePlan,
  type LocalSubmitAuditPayload,
  type LocalSubmitDocumentCreatePayload,
  type LocalSubmitStatusUpdatePayload,
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

describe('local submit repository foundation', () => {
  it('documents the narrow submit schema responsibility surface', () => {
    expect(LOCAL_SUBMIT_SCHEMA_TABLES).toEqual({
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
    })
  })

  it('maps bridge payload names to local Drizzle-shaped document insert names', () => {
    expect(mapLocalSubmitDocumentCreateToInsert(documentCreatePayload())).toEqual({
      judul: 'Dev Detail 2026 Pegawai Local',
      fungsiId: FUNGSI_ID,
      kegiatanJenisId: KEGIATAN_ID,
      isKetuaTim: true,
      status: 'DRAFT',
      currentStep: null,
      revisionTarget: null,
      revisionNotes: null,
      lampiranUrls: [lampiran()],
      tahun: 2026,
      tanggal: '2026-05-16',
      createdBy: ACTOR_ID,
      nominalRealisasi: '125000.5',
      isNonMaterial: false,
      jenisDokumenId: null,
      namaDokumen: null,
      keteranganDetail: null,
      komponenId: KOMPONEN_ID,
      jenisPermintaanId: JENIS_ID,
      kategoriPermintaanId: KATEGORI_ID,
      detailPermintaanId: DETAIL_ID,
    })
  })

  it('maps status update and audit payloads to local update/insert shapes', () => {
    const statusUpdate: LocalSubmitStatusUpdatePayload = {
      dokumenId: DOKUMEN_ID,
      status: 'IN_PPK_VALIDATION',
      currentStep: 'PPK',
      revisionTarget: null,
      revisionNotes: null,
      updatedAt: UPDATED_AT.toISOString(),
    }

    expect(mapLocalSubmitStatusUpdateToUpdate(statusUpdate)).toEqual({
      dokumenId: DOKUMEN_ID,
      values: {
        status: 'IN_PPK_VALIDATION',
        currentStep: 'PPK',
        revisionTarget: null,
        revisionNotes: null,
        updatedAt: UPDATED_AT,
      },
    })

    const audit: LocalSubmitAuditPayload = {
      dokumenId: DOKUMEN_ID,
      userId: ACTOR_ID,
      aksi: 'SUBMIT',
      catatan: null,
      stepUrutan: 1,
    }

    expect(mapLocalSubmitAuditToInsert(audit)).toEqual({
      dokumenId: DOKUMEN_ID,
      userId: ACTOR_ID,
      aksi: 'SUBMIT',
      catatan: null,
      stepUrutan: 1,
    })
  })

  it('maps local Drizzle-like dokumen rows back to current response-compatible names', () => {
    expect(mapLocalSubmitDokumenRowToCreatedDocument(dokumenRow({
      nominalRealisasi: '125000.50',
    }))).toMatchObject({
      id: DOKUMEN_ID,
      judul: 'Dev Detail 2026 Pegawai Local',
      fungsi_id: FUNGSI_ID,
      kegiatan_jenis_id: KEGIATAN_ID,
      is_ketua_tim: true,
      status: 'DRAFT',
      current_step: null,
      revision_target: null,
      revision_notes: null,
      lampiran_urls: [lampiran()],
      tahun: 2026,
      tanggal: '2026-05-16',
      created_by: ACTOR_ID,
      nominal_realisasi: 125000.5,
      is_non_material: false,
      jenis_dokumen_id: null,
      keterangan_detail: null,
      jenis_permintaan_id: JENIS_ID,
      kategori_permintaan_id: KATEGORI_ID,
      detail_permintaan_id: DETAIL_ID,
      created_at: CREATED_AT.toISOString(),
      updated_at: UPDATED_AT.toISOString(),
      fungsi_nama: 'Dev Fungsi',
      kegiatan_nama: 'Dev Kegiatan',
    })
  })

  it('adapts master reads and write transaction operations through a fake adapter only', async () => {
    const adapter = createAdapter()
    const repository = createLocalSubmitBridgeRepository(adapter)

    await expect(repository.getKegiatanById(KEGIATAN_ID)).resolves.toEqual({
      id: KEGIATAN_ID,
      nama: 'Dev Kegiatan',
      fungsiId: FUNGSI_ID,
    })

    await expect(repository.getRequiredKelengkapan({
      kegiatanId: KEGIATAN_ID,
      isKetuaTim: true,
      jenisPermintaanId: JENIS_ID,
      kategoriPermintaanId: KATEGORI_ID,
      detailPermintaanId: DETAIL_ID,
    })).resolves.toEqual([
      { id: LAMPIRAN_ID, namaDokumen: 'Surat Tugas', required: true },
    ])

    await expect(repository.hasKetuaTimAssignment({
      userId: ACTOR_ID,
      kegiatanId: KEGIATAN_ID,
    })).resolves.toBe(true)

    const result = await executeLocalSubmitWritePlan(repository, writePlan())

    expect(result.dokumen).toMatchObject({
      id: DOKUMEN_ID,
      status: 'IN_PPK_VALIDATION',
      current_step: 'PPK',
      revision_target: null,
      updated_at: UPDATED_AT.toISOString(),
    })
    expect(adapter.calls).toEqual([
      ['selectKegiatanById', KEGIATAN_ID],
      ['selectRequiredKelengkapan', {
        kegiatanId: KEGIATAN_ID,
        isKetuaTim: true,
        jenisPermintaanId: JENIS_ID,
        kategoriPermintaanId: KATEGORI_ID,
        detailPermintaanId: DETAIL_ID,
      }],
      ['selectKetuaTimAssignmentExists', { userId: ACTOR_ID, kegiatanId: KEGIATAN_ID }],
      ['begin'],
      ['insertDokumen', mapLocalSubmitDocumentCreateToInsert(documentCreatePayload())],
      ['updateDokumenStatus', DOKUMEN_ID, {
        status: 'IN_PPK_VALIDATION',
        currentStep: 'PPK',
        revisionTarget: null,
        revisionNotes: null,
        updatedAt: UPDATED_AT,
      }],
      ['insertLog', {
        dokumenId: DOKUMEN_ID,
        userId: ACTOR_ID,
        aksi: 'SUBMIT',
        catatan: null,
        stepUrutan: 1,
      }],
      ['commit'],
    ])
    expectNoSensitiveOrPhysicalData(result)
  })
})

function createAdapter(): LocalSubmitRepositoryAdapter & { calls: unknown[] } {
  const calls: unknown[] = []
  const tx: LocalSubmitRepositoryTransactionAdapter = {
    insertDokumen: vi.fn(async (values: LocalSubmitDokumenInsert) => {
      calls.push(['insertDokumen', values])
      return dokumenRow({
        status: values.status,
        currentStep: values.currentStep,
        revisionTarget: values.revisionTarget,
        revisionNotes: values.revisionNotes,
        nominalRealisasi: values.nominalRealisasi,
      })
    }),
    updateDokumenStatus: vi.fn(async (
      dokumenId: string,
      values: LocalSubmitDokumenStatusUpdate,
    ) => {
      calls.push(['updateDokumenStatus', dokumenId, values])
    }),
    insertLog: vi.fn(async (values) => {
      calls.push(['insertLog', values])
    }),
  }

  return {
    calls,
    async selectKegiatanById(kegiatanId) {
      calls.push(['selectKegiatanById', kegiatanId])
      return { id: kegiatanId, nama: 'Dev Kegiatan', fungsiId: FUNGSI_ID }
    },
    async selectRequiredKelengkapan(input) {
      calls.push(['selectRequiredKelengkapan', input])
      return [{ id: LAMPIRAN_ID, namaDokumen: 'Surat Tugas', required: true }]
    },
    async selectJenisDokumenById(id) {
      calls.push(['selectJenisDokumenById', id])
      return { id, nama: 'Dev Non-Material' }
    },
    async selectKomponenById(id) {
      calls.push(['selectKomponenById', id])
      return { id, nama: 'Dev Komponen' }
    },
    async selectJenisPermintaanById(id) {
      calls.push(['selectJenisPermintaanById', id])
      return { id, nama: 'Dev Material' }
    },
    async selectKategoriPermintaanById(id) {
      calls.push(['selectKategoriPermintaanById', id])
      return { id, nama: 'Dev Kategori' }
    },
    async selectDetailPermintaanById(id) {
      calls.push(['selectDetailPermintaanById', id])
      return { id, nama: 'Dev Detail' }
    },
    async selectKetuaTimAssignmentExists(input) {
      calls.push(['selectKetuaTimAssignmentExists', input])
      return true
    },
    async withSubmitTransaction(operation) {
      calls.push(['begin'])
      try {
        const result = await operation(tx)
        calls.push(['commit'])
        return result
      } catch (error) {
        calls.push(['rollback'])
        throw error
      }
    },
  }
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

function dokumenRow(overrides: Partial<LocalSubmitDokumenRow> = {}): LocalSubmitDokumenRow {
  return {
    id: DOKUMEN_ID,
    judul: 'Dev Detail 2026 Pegawai Local',
    fungsiId: FUNGSI_ID,
    kegiatanJenisId: KEGIATAN_ID,
    isKetuaTim: true,
    status: 'DRAFT',
    currentStep: null,
    revisionTarget: null,
    revisionNotes: null,
    lampiranUrls: [lampiran()],
    tahun: 2026,
    tanggal: '2026-05-16',
    createdBy: ACTOR_ID,
    nominalRealisasi: '125000.5',
    isNonMaterial: false,
    jenisDokumenId: null,
    namaDokumen: null,
    keteranganDetail: null,
    komponenId: KOMPONEN_ID,
    jenisPermintaanId: JENIS_ID,
    kategoriPermintaanId: KATEGORI_ID,
    detailPermintaanId: DETAIL_ID,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    fungsiNama: 'Dev Fungsi',
    kegiatanNama: 'Dev Kegiatan',
    ...overrides,
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
