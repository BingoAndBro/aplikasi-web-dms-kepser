import { describe, expect, it, vi } from 'vitest'

import type { LocalServerSession } from '#/lib/auth/local-server-auth'
import {
  createLocalSubmitActorFromSession,
  executeLocalSubmitWritePlan,
  prepareLocalSubmitWriteBridge,
  resolveLocalSubmitLeafName,
  type LocalSubmitBridgeRepository,
  type LocalSubmitBridgeTransaction,
  type LocalSubmitCreatedDocument,
  type LocalSubmitDocumentCreatePayload,
  type LocalSubmitPayload,
  type LocalSubmitStatusUpdatePayload,
} from '#/lib/dokumen/local-submit-write-bridge'
import type { LampiranUrl } from '#/lib/dokumen/types'

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const SESSION_ID = '22222222-2222-4222-8222-222222222222'
const FUNGSI_ID = '33333333-3333-4333-8333-333333333333'
const KEGIATAN_ID = '44444444-4444-4444-8444-444444444444'
const JENIS_ID = '55555555-5555-4555-8555-555555555555'
const KATEGORI_ID = '66666666-6666-4666-8666-666666666666'
const DETAIL_ID = '77777777-7777-4777-8777-777777777777'
const JENIS_DOKUMEN_ID = '88888888-8888-4888-8888-888888888888'
const DOKUMEN_ID = '99999999-9999-4999-8999-999999999999'
const REQUIRED_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const REQUIRED_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const KOMPONEN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NOW = new Date('2026-05-16T10:00:00.000Z')

describe('local submit write bridge helper foundation', () => {
  it('derives a local submit actor and fails closed for incompatible actors', () => {
    expect(createLocalSubmitActorFromSession(null)).toEqual({
      ok: false,
      issue: {
        code: 'unauthenticated',
        message: 'Local submit actor requires an authenticated local session.',
      },
    })

    expect(createLocalSubmitActorFromSession(session({ roles: ['ADMIN'], activeRole: 'ADMIN' })))
      .toEqual({
        ok: false,
        issue: {
          code: 'admin-only-not-allowed',
          message: 'ADMIN-only accounts are not valid submit actors.',
        },
      })

    expect(createLocalSubmitActorFromSession(session({ roles: ['PPK'], activeRole: 'PPK' })))
      .toEqual({
        ok: false,
        issue: {
          code: 'actor-not-pegawai-compatible',
          message: 'Local submit actor must have PEGAWAI compatibility.',
        },
      })

    const result = createLocalSubmitActorFromSession(session({
      roles: ['PEGAWAI', 'PPK'],
      activeRole: 'PEGAWAI',
      userName: 'Pegawai Lokal',
    }))

    expect(result).toEqual({
      ok: true,
      actor: {
        userId: ACTOR_ID,
        username: 'pegawai.local',
        displayName: 'Pegawai Lokal',
        roles: ['PEGAWAI', 'PPK'],
        activeRole: 'PEGAWAI',
        sessionId: SESSION_ID,
      },
    })
  })

  it('prepares material submit master-data, document, transition, and audit shapes', async () => {
    const repository = createRepository()
    const actor = expectActor(createLocalSubmitActorFromSession(session()))

    const result = await prepareLocalSubmitWriteBridge({
      actor,
      payload: materialPayload(),
      repository,
      now: () => NOW,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.issue.message)

    expect(repository.calls).toEqual([
      ['getKegiatanById', KEGIATAN_ID],
      ['getRequiredKelengkapan', {
        kegiatanId: KEGIATAN_ID,
        isKetuaTim: true,
        komponenId: KOMPONEN_ID,
        jenisPermintaanId: JENIS_ID,
        kategoriPermintaanId: KATEGORI_ID,
        detailPermintaanId: DETAIL_ID,
      }],
      ['hasKetuaTimAssignment', { userId: ACTOR_ID, kegiatanId: KEGIATAN_ID }],
      ['getDetailPermintaanById', DETAIL_ID],
    ])
    expect(result.plan.leafName).toBe('Dev Detail')
    expect(result.plan.documentCreatePayload).toMatchObject({
      judul: 'Dev Detail 2026 Pegawai Local',
      fungsiId: FUNGSI_ID,
      kegiatanJenisId: KEGIATAN_ID,
      isKetuaTim: true,
      createdBy: ACTOR_ID,
      status: 'DRAFT',
      currentStep: null,
      revisionTarget: null,
      revisionNotes: null,
      nominalRealisasi: 125000,
      isNonMaterial: false,
      komponenId: KOMPONEN_ID,
      jenisPermintaanId: JENIS_ID,
      kategoriPermintaanId: KATEGORI_ID,
      detailPermintaanId: DETAIL_ID,
    })
    expect(result.plan.transitionPlan).toMatchObject({
      auditAction: 'SUBMIT',
      result: {
        success: true,
        newStatus: 'IN_PPK_VALIDATION',
        newCurrentStep: 'PPK',
        newRevisionTarget: null,
        stepUrutan: 1,
      },
    })
    expect(result.plan.statusUpdatePayload).toEqual({
      status: 'IN_PPK_VALIDATION',
      currentStep: 'PPK',
      revisionTarget: null,
      revisionNotes: null,
      updatedAt: NOW.toISOString(),
    })
    expect(result.plan.auditPayload).toEqual({
      userId: ACTOR_ID,
      aksi: 'SUBMIT',
      catatan: null,
      stepUrutan: 1,
    })
    expect(result.plan.transactionSteps).toEqual([
      'create-draft',
      'update-status',
      'append-audit-log',
    ])
    expectNoSensitiveOrPhysicalData(result.plan)
  })

  it('prepares non-material shortcut without required kelengkapan reads when no chain is supplied', async () => {
    const repository = createRepository()
    const actor = expectActor(createLocalSubmitActorFromSession(session()))

    const result = await prepareLocalSubmitWriteBridge({
      actor,
      payload: {
        ...materialPayload(),
        isKetuaTim: false,
        is_non_material: true,
        nominal_realisasi: null,
        jenisDokumenId: JENIS_DOKUMEN_ID,
        namaDokumen: 'Dev Non-Material',
        keteranganDetail: 'Catatan non-material',
        komponenId: undefined,
        jenisPermintaanId: undefined,
        kategoriPermintaanId: undefined,
        detailPermintaanId: undefined,
      },
      repository,
      now: () => NOW,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.issue.message)

    expect(repository.calls).toEqual([
      ['getKegiatanById', KEGIATAN_ID],
    ])
    expect(result.plan.leafName).toBe('Dev Non-Material')
    expect(result.plan.documentCreatePayload).toMatchObject({
      judul: 'Dev Non-Material 2026 Pegawai Local',
      nominalRealisasi: 0,
      isNonMaterial: true,
      jenisDokumenId: JENIS_DOKUMEN_ID,
      namaDokumen: 'Dev Non-Material',
      keteranganDetail: 'Catatan non-material',
      komponenId: null,
      jenisPermintaanId: null,
      kategoriPermintaanId: null,
      detailPermintaanId: null,
    })
    expect(result.plan.transitionPlan).toMatchObject({
      auditAction: 'STORE',
      result: {
        success: true,
        newStatus: 'TERSIMPAN',
        newCurrentStep: null,
        newRevisionTarget: null,
        stepUrutan: 1,
      },
    })
  })

  it('fails preparation before write payload creation for required lampiran and Ketua Tim violations', async () => {
    const actor = expectActor(createLocalSubmitActorFromSession(session()))

    const missingLampiranRepo = createRepository()
    const missingLampiran = await prepareLocalSubmitWriteBridge({
      actor,
      payload: {
        ...materialPayload(),
        lampiranUrls: [lampiran(REQUIRED_A_ID)],
      },
      repository: missingLampiranRepo,
      now: () => NOW,
    })

    expect(missingLampiran).toEqual({
      ok: false,
      issue: {
        code: 'required-attachments-missing',
        message: 'Lampiran wajib belum lengkap: Form Permintaan',
        missingRequiredNames: ['Form Permintaan'],
      },
    })
    expect(missingLampiranRepo.txCalls).toEqual([])

    const ketuaRepo = createRepository({ assignedKetuaTim: false })
    const ketuaResult = await prepareLocalSubmitWriteBridge({
      actor,
      payload: materialPayload(),
      repository: ketuaRepo,
      now: () => NOW,
    })

    expect(ketuaResult).toEqual({
      ok: false,
      issue: {
        code: 'ketua-tim-assignment-missing',
        message: 'Anda bukan Ketua Tim yang ditunjuk untuk kegiatan ini.',
      },
    })
    expect(ketuaRepo.txCalls).toEqual([])
  })

  it('resolves material leaf names by detail, kategori, jenis, then fallback', async () => {
    const repository = createRepository({
      detailName: null,
      kategoriName: 'Kategori Fallback',
      jenisName: 'Jenis Fallback',
    })

    await expect(resolveLocalSubmitLeafName(repository, {
      detailPermintaanId: DETAIL_ID,
      kategoriPermintaanId: KATEGORI_ID,
      jenisPermintaanId: JENIS_ID,
    }, 'Kegiatan Fallback')).resolves.toBe('Kategori Fallback')

    const jenisRepository = createRepository({
      detailName: null,
      kategoriName: null,
      jenisName: 'Jenis Fallback',
    })

    await expect(resolveLocalSubmitLeafName(jenisRepository, {
      detailPermintaanId: DETAIL_ID,
      kategoriPermintaanId: KATEGORI_ID,
      jenisPermintaanId: JENIS_ID,
    }, 'Kegiatan Fallback')).resolves.toBe('Jenis Fallback')

    const komponenRepository = createRepository({
      detailName: null,
      kategoriName: null,
      jenisName: null,
      komponenName: 'Komponen Fallback',
    })

    await expect(resolveLocalSubmitLeafName(komponenRepository, {
      detailPermintaanId: DETAIL_ID,
      kategoriPermintaanId: KATEGORI_ID,
      jenisPermintaanId: JENIS_ID,
      komponenId: KOMPONEN_ID,
    }, 'Kegiatan Fallback')).resolves.toBe('Komponen Fallback')

    const fallbackRepository = createRepository({
      detailName: null,
      kategoriName: null,
      jenisName: null,
      komponenName: null,
    })

    await expect(resolveLocalSubmitLeafName(fallbackRepository, {
      detailPermintaanId: DETAIL_ID,
      kategoriPermintaanId: KATEGORI_ID,
      jenisPermintaanId: JENIS_ID,
      komponenId: KOMPONEN_ID,
    }, 'Kegiatan Fallback')).resolves.toBe('Kegiatan Fallback')
  })

  it('executes create, status update, and append-only audit inside the repository transaction boundary', async () => {
    const repository = createRepository()
    const actor = expectActor(createLocalSubmitActorFromSession(session()))
    const prepared = await prepareLocalSubmitWriteBridge({
      actor,
      payload: materialPayload(),
      repository,
      now: () => NOW,
    })
    if (!prepared.ok) throw new Error(prepared.issue.message)

    const result = await executeLocalSubmitWritePlan(repository, prepared.plan)

    expect(repository.txCalls).toEqual([
      ['begin'],
      ['createDokumen', prepared.plan.documentCreatePayload],
      ['updateDokumenStatus', {
        dokumenId: DOKUMEN_ID,
        ...prepared.plan.statusUpdatePayload,
      }],
      ['appendLog', {
        dokumenId: DOKUMEN_ID,
        ...prepared.plan.auditPayload,
      }],
      ['commit'],
    ])
    expect(result.dokumen).toMatchObject({
      id: DOKUMEN_ID,
      status: 'IN_PPK_VALIDATION',
      current_step: 'PPK',
      revision_target: null,
      revision_notes: null,
      updated_at: NOW.toISOString(),
    })
    expect(result.auditPayload).toEqual({
      dokumenId: DOKUMEN_ID,
      userId: ACTOR_ID,
      aksi: 'SUBMIT',
      catatan: null,
      stepUrutan: 1,
    })
    expectNoSensitiveOrPhysicalData(result)
  })

  it('keeps write failures transaction-scoped and does not append audit after status failure', async () => {
    const repository = createRepository({ failStatusUpdate: true })
    const actor = expectActor(createLocalSubmitActorFromSession(session()))
    const prepared = await prepareLocalSubmitWriteBridge({
      actor,
      payload: materialPayload(),
      repository,
      now: () => NOW,
    })
    if (!prepared.ok) throw new Error(prepared.issue.message)

    await expect(executeLocalSubmitWritePlan(repository, prepared.plan))
      .rejects.toThrow('status update failed')

    expect(repository.txCalls).toEqual([
      ['begin'],
      ['createDokumen', prepared.plan.documentCreatePayload],
      ['updateDokumenStatus', {
        dokumenId: DOKUMEN_ID,
        ...prepared.plan.statusUpdatePayload,
      }],
      ['rollback'],
    ])
  })
})

function materialPayload(): LocalSubmitPayload {
  return {
    fungsiId: FUNGSI_ID,
    kegiatanJenisId: KEGIATAN_ID,
    isKetuaTim: true,
    tahun: 2026,
    tanggal: '2026-05-16',
    lampiranUrls: [
      lampiran(REQUIRED_A_ID),
      lampiran(REQUIRED_B_ID),
    ],
    nominal_realisasi: 125000,
    is_non_material: false,
    komponenId: KOMPONEN_ID,
    jenisPermintaanId: JENIS_ID,
    kategoriPermintaanId: KATEGORI_ID,
    detailPermintaanId: DETAIL_ID,
  }
}

function lampiran(kelengkapanId: string): LampiranUrl {
  return {
    kelengkapan_id: kelengkapanId,
    nama: kelengkapanId === REQUIRED_A_ID ? 'Surat Tugas' : 'Form Permintaan',
    url: `${ACTOR_ID}/temp-id/${kelengkapanId}.pdf`,
    uploaded_at: NOW.toISOString(),
  }
}

function session(overrides: Partial<LocalServerSession & { userName?: string }> = {}): LocalServerSession {
  const displayName = overrides.userName ?? 'Pegawai Local'

  return {
    user: {
      id: ACTOR_ID,
      username: 'pegawai.local',
      displayName,
    },
    userId: ACTOR_ID,
    roles: ['PEGAWAI'],
    activeRole: 'PEGAWAI',
    sessionId: SESSION_ID,
    ...overrides,
  }
}

function expectActor(result: ReturnType<typeof createLocalSubmitActorFromSession>) {
  if (!result.ok) throw new Error(result.issue.message)
  return result.actor
}

function createRepository(options: {
  assignedKetuaTim?: boolean
  detailName?: string | null
  kategoriName?: string | null
  jenisName?: string | null
  komponenName?: string | null
  failStatusUpdate?: boolean
} = {}) {
  const calls: unknown[] = []
  const txCalls: unknown[] = []

  const tx: LocalSubmitBridgeTransaction = {
    createDokumen: vi.fn(async (payload: LocalSubmitDocumentCreatePayload) => {
      txCalls.push(['createDokumen', payload])
      return createdDocumentFromPayload(payload)
    }),
    updateDokumenStatus: vi.fn(async (payload: LocalSubmitStatusUpdatePayload) => {
      txCalls.push(['updateDokumenStatus', payload])
      if (options.failStatusUpdate) {
        throw new Error('status update failed')
      }
    }),
    appendLog: vi.fn(async (payload) => {
      txCalls.push(['appendLog', payload])
    }),
  }

  const repository: LocalSubmitBridgeRepository & {
    calls: unknown[]
    txCalls: unknown[]
  } = {
    calls,
    txCalls,
    async getKegiatanById(kegiatanId) {
      calls.push(['getKegiatanById', kegiatanId])
      return { id: KEGIATAN_ID, nama: 'Dev Kegiatan', fungsiId: FUNGSI_ID }
    },
    async getRequiredKelengkapan(input) {
      calls.push(['getRequiredKelengkapan', input])
      return [
        { id: REQUIRED_A_ID, namaDokumen: 'Surat Tugas', required: true },
        { id: REQUIRED_B_ID, namaDokumen: 'Form Permintaan', required: true },
      ]
    },
    async getJenisDokumenById(id) {
      calls.push(['getJenisDokumenById', id])
      return { id, nama: 'Dev Non-Material' }
    },
    async getKomponenById(id) {
      calls.push(['getKomponenById', id])
      return options.komponenName === null ? null : { id, nama: options.komponenName ?? 'Dev Komponen' }
    },
    async getJenisPermintaanById(id) {
      calls.push(['getJenisPermintaanById', id])
      return options.jenisName === null ? null : { id, nama: options.jenisName ?? 'Dev Material' }
    },
    async getKategoriPermintaanById(id) {
      calls.push(['getKategoriPermintaanById', id])
      return options.kategoriName === null ? null : { id, nama: options.kategoriName ?? 'Dev Kategori' }
    },
    async getDetailPermintaanById(id) {
      calls.push(['getDetailPermintaanById', id])
      return options.detailName === null ? null : { id, nama: options.detailName ?? 'Dev Detail' }
    },
    async hasKetuaTimAssignment(input) {
      calls.push(['hasKetuaTimAssignment', input])
      return options.assignedKetuaTim ?? true
    },
    async withSubmitWriteTransaction(operation) {
      txCalls.push(['begin'])
      try {
        const result = await operation(tx)
        txCalls.push(['commit'])
        return result
      } catch (error) {
        txCalls.push(['rollback'])
        throw error
      }
    },
  }

  return repository
}

function createdDocumentFromPayload(
  payload: LocalSubmitDocumentCreatePayload,
): LocalSubmitCreatedDocument {
  return {
    id: DOKUMEN_ID,
    judul: payload.judul,
    fungsi_id: payload.fungsiId,
    kegiatan_jenis_id: payload.kegiatanJenisId,
    is_ketua_tim: payload.isKetuaTim,
    status: payload.status,
    current_step: payload.currentStep,
    revision_target: payload.revisionTarget,
    revision_notes: payload.revisionNotes,
    lampiran_urls: payload.lampiranUrls,
    tahun: payload.tahun,
    tanggal: payload.tanggal,
    created_by: payload.createdBy,
    nominal_realisasi: payload.nominalRealisasi,
    is_non_material: payload.isNonMaterial,
    jenis_dokumen_id: payload.jenisDokumenId,
    nama_dokumen: payload.namaDokumen,
    keterangan_detail: payload.keteranganDetail,
    komponen_id: payload.komponenId,
    jenis_permintaan_id: payload.jenisPermintaanId,
    kategori_permintaan_id: payload.kategoriPermintaanId,
    detail_permintaan_id: payload.detailPermintaanId,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    fungsi_nama: 'Dev Fungsi',
    kegiatan_nama: 'Dev Kegiatan',
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
