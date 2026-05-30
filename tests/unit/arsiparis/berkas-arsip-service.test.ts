import { describe, expect, it } from 'vitest'
import {
  addManualDocumentToOpenBerkas,
  addWorkflowDocumentToOpenBerkas,
  BerkasArsipServiceError,
  buildCloseBerkasPlan,
  closeBerkasArsip,
  getOrCreateOpenBerkasForKlasifikasi,
  transitionBerkasArchiveStatus,
  type BerkasArsipRepository,
} from '#/lib/archive/berkas-arsip-service'
import { BERKAS_ARCHIVE_STATUS } from '#/lib/constants/archive-status'

const ACTOR_ID = 'actor-user'
const KLASIFIKASI_ID = 'klasifikasi-belanja-barang'
const BERKAS_ID = 'berkas-belanja-barang-open'
const CLOSED_BERKAS_ID = 'berkas-belanja-barang-closed'
const DOKUMEN_ID = 'dokumen-workflow'
const MANUAL_ARSIP_ID = 'manual-dokumen'
const CANONICAL_ARSIP_ID = 'canonical-arsip'
type TestBerkasArchiveStatus = typeof BERKAS_ARCHIVE_STATUS[keyof typeof BERKAS_ARCHIVE_STATUS]

describe('berkas arsip service foundation', () => {
  it('creates an OPEN berkas from active master classification snapshots', async () => {
    const repository = createFakeRepository()

    const created = await getOrCreateOpenBerkasForKlasifikasi({
      klasifikasiId: KLASIFIKASI_ID,
      actorUserId: ACTOR_ID,
    }, { repository })

    expect(created).toMatchObject({
      klasifikasi_id: KLASIFIKASI_ID,
      klasifikasi_kode_snapshot: 'BB',
      klasifikasi_nama_snapshot: 'Belanja Barang',
      status_berkas: 'OPEN',
      created_by: ACTOR_ID,
    })
    expect(repository.calls).toContainEqual(['findBerkasByKlasifikasiId', KLASIFIKASI_ID])
    expect(repository.calls).toContainEqual(['findActiveKlasifikasi', KLASIFIKASI_ID])
    expect(repository.calls).toContainEqual(['insertOpenBerkas', KLASIFIKASI_ID, 'BB', 'Belanja Barang'])
  })

  it('reuses an existing OPEN berkas for the selected jenis pembayaran', async () => {
    const repository = createFakeRepository({
      existingBerkasRows: [openBerkas()],
    })

    const berkas = await getOrCreateOpenBerkasForKlasifikasi({
      klasifikasiId: KLASIFIKASI_ID,
      actorUserId: ACTOR_ID,
    }, { repository })

    expect(berkas.id).toBe(BERKAS_ID)
    expect(repository.calls).toContainEqual(['findBerkasByKlasifikasiId', KLASIFIKASI_ID])
    expect(repository.calls.some(([name]) => name === 'insertOpenBerkas')).toBe(false)
  })

  it('rejects opening a second berkas when the jenis pembayaran already has a CLOSED berkas', async () => {
    const repository = createFakeRepository({
      existingBerkasRows: [closedBerkas()],
    })

    await expect(getOrCreateOpenBerkasForKlasifikasi({
      klasifikasiId: KLASIFIKASI_ID,
      actorUserId: ACTOR_ID,
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_KLASIFIKASI_CLOSED',
      message: 'Berkas untuk Jenis Pembayaran ini sudah ditutup',
    })

    expect(repository.calls.some(([name]) => name === 'insertOpenBerkas')).toBe(false)
  })

  it('rejects anomalous multiple OPEN berkas rows for one jenis pembayaran', async () => {
    const repository = createFakeRepository({
      existingBerkasRows: [openBerkas(), openBerkas({ id: 'berkas-open-lain' })],
    })

    await expect(getOrCreateOpenBerkasForKlasifikasi({
      klasifikasiId: KLASIFIKASI_ID,
      actorUserId: ACTOR_ID,
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_KLASIFIKASI_CONFLICT',
    })

    expect(repository.calls.some(([name]) => name === 'insertOpenBerkas')).toBe(false)
  })

  it('recovers get-or-create when concurrent open-folder creation hits a unique conflict', async () => {
    const repository = createFakeRepository({
      insertOpenBerkasError: Object.assign(new Error('unique conflict'), { code: '23505' }),
      openAfterConflict: true,
    })

    const berkas = await getOrCreateOpenBerkasForKlasifikasi({
      klasifikasiId: KLASIFIKASI_ID,
      actorUserId: ACTOR_ID,
    }, { repository })

    expect(berkas.id).toBe(BERKAS_ID)
    expect(repository.calls.filter(([name]) => name === 'findBerkasByKlasifikasiId')).toHaveLength(3)
  })

  it('rejects adding a workflow document to a CLOSED berkas', async () => {
    const repository = createFakeRepository()

    await expect(addWorkflowDocumentToOpenBerkas({
      berkasId: CLOSED_BERKAS_ID,
      dokumenId: DOKUMEN_ID,
      actorUserId: ACTOR_ID,
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_CLOSED',
    })

    expect(repository.calls).not.toContainEqual(['insertBerkasItem'])
  })

  it('adds a manual document only to an OPEN matching berkas when no canonical bridge exists', async () => {
    const repository = createFakeRepository({ manualCanonicalArsipId: null })

    const item = await addManualDocumentToOpenBerkas({
      berkasId: BERKAS_ID,
      manualArsipId: MANUAL_ARSIP_ID,
      actorUserId: ACTOR_ID,
    }, { repository })

    expect(item).toMatchObject({
      source_type: 'MANUAL',
      manual_arsip_id: MANUAL_ARSIP_ID,
      dokumen_id: null,
      canonical_arsip_id: null,
      added_by: ACTOR_ID,
    })
  })

  it('preserves an existing old manual canonical bridge id when present', async () => {
    const repository = createFakeRepository({ manualCanonicalArsipId: CANONICAL_ARSIP_ID })

    const item = await addManualDocumentToOpenBerkas({
      berkasId: BERKAS_ID,
      manualArsipId: MANUAL_ARSIP_ID,
      actorUserId: ACTOR_ID,
    }, { repository })

    expect(item).toMatchObject({
      source_type: 'MANUAL',
      manual_arsip_id: MANUAL_ARSIP_ID,
      canonical_arsip_id: CANONICAL_ARSIP_ID,
    })
  })

  it('rejects source items whose selected jenis pembayaran does not match the target berkas', async () => {
    const repository = createFakeRepository({
      workflowKlasifikasiId: 'klasifikasi-lain',
    })

    await expect(addWorkflowDocumentToOpenBerkas({
      berkasId: BERKAS_ID,
      dokumenId: DOKUMEN_ID,
      actorUserId: ACTOR_ID,
    }, { repository })).rejects.toMatchObject({
      code: 'SOURCE_KLASIFIKASI_MISMATCH',
    })

    expect(repository.calls).not.toContainEqual(['insertBerkasItem'])
  })

  it('maps duplicate source assignment to a safe conflict error', async () => {
    const repository = createFakeRepository({
      insertBerkasItemError: Object.assign(new Error('unique conflict'), { code: '23505' }),
    })

    await expect(addWorkflowDocumentToOpenBerkas({
      berkasId: BERKAS_ID,
      dokumenId: DOKUMEN_ID,
      actorUserId: ACTOR_ID,
    }, { repository })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Dokumen sudah terhubung ke berkas',
    })
  })

  it('does not hide non-unique add-item failures', async () => {
    const repository = createFakeRepository({
      insertBerkasItemError: Object.assign(new Error('database unavailable'), { code: '08006' }),
    })

    await expect(addWorkflowDocumentToOpenBerkas({
      berkasId: BERKAS_ID,
      dokumenId: DOKUMEN_ID,
      actorUserId: ACTOR_ID,
    }, { repository })).rejects.toMatchObject({
      message: 'database unavailable',
    })
  })

  it('rejects closing an empty berkas', async () => {
    const repository = createFakeRepository({ itemCount: 0 })

    await expect(closeBerkasArsip({
      berkasId: BERKAS_ID,
      actorUserId: ACTOR_ID,
      metadata: validCloseMetadata(),
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_EMPTY',
    })
  })

  it('rejects closing an already CLOSED berkas', async () => {
    const repository = createFakeRepository()

    await expect(closeBerkasArsip({
      berkasId: CLOSED_BERKAS_ID,
      actorUserId: ACTOR_ID,
      metadata: validCloseMetadata(),
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_NOT_OPEN',
    })
  })

  it('computes close-folder retention dates from closed_at', () => {
    const plan = buildCloseBerkasPlan({
      nomor_spm: 'SPM-001/2026',
      retensi_aktif: '1 Tahun',
      retensi_inaktif: '3 Tahun',
      closed_at: '2026-05-29',
    })

    expect(plan).toMatchObject({
      nomorSpm: 'SPM-001/2026',
      retensiAktif: '1 Tahun',
      retensiInaktif: '3 Tahun',
      closedAtDateOnly: '2026-05-29',
      masaAktifBerakhir: '2027-05-29',
      masaInaktifBerakhir: '2030-05-29',
    })
    expect(plan.closedAt.toISOString()).toBe('2026-05-29T00:00:00.000Z')
  })

  it('closes a non-empty OPEN berkas without source item or canonical archive mutation', async () => {
    const repository = createFakeRepository({ itemCount: 2 })

    const closed = await closeBerkasArsip({
      berkasId: BERKAS_ID,
      actorUserId: ACTOR_ID,
      metadata: validCloseMetadata(),
    }, { repository })

    expect(closed).toMatchObject({
      status_berkas: 'CLOSED',
      status_arsip: 'AKTIF',
      nomor_spm: 'SPM-001/2026',
      retensi_aktif: '1 Tahun',
      retensi_inaktif: '3 Tahun',
      masa_aktif_berakhir: '2027-05-29',
      masa_inaktif_berakhir: '2030-05-29',
      closed_by: ACTOR_ID,
    })
    expect(repository.calls).toContainEqual(['closeOpenBerkas', BERKAS_ID, ACTOR_ID])
    expect(repository.calls.some(([name]) => name === 'insertBerkasItem')).toBe(false)
  })

  it('rejects invalid close-folder metadata', () => {
    expect(() => buildCloseBerkasPlan({
      nomor_spm: '',
      retensi_aktif: '1 Tahun',
      retensi_inaktif: '3 Tahun',
    })).toThrow(BerkasArsipServiceError)
  })

  it('moves CLOSED AKTIF berkas to INAKTIF without item, source, or storage mutation', async () => {
    const repository = createFakeRepository()

    const updated = await transitionBerkasArchiveStatus({
      berkasId: CLOSED_BERKAS_ID,
      actorUserId: ACTOR_ID,
      action: 'mark_inactive',
    }, { repository })

    expect(updated.status_arsip).toBe('INAKTIF')
    expect(repository.calls).toContainEqual([
      'updateBerkasArchiveStatus',
      CLOSED_BERKAS_ID,
      'AKTIF',
      'INAKTIF',
    ])
    expect(repository.calls.some(([name]) => name === 'insertBerkasItem')).toBe(false)
    expect(repository.calls.some(([name]) => String(name).toLowerCase().includes('delete'))).toBe(false)
    expect(repository.calls.some(([name]) => String(name).toLowerCase().includes('storage'))).toBe(false)
  })

  it('moves CLOSED INAKTIF berkas to USUL_MUSNAH', async () => {
    const repository = createFakeRepository({
      closedStatusArsip: BERKAS_ARCHIVE_STATUS.INAKTIF,
    })

    const updated = await transitionBerkasArchiveStatus({
      berkasId: CLOSED_BERKAS_ID,
      actorUserId: ACTOR_ID,
      action: 'propose_destruction',
    }, { repository })

    expect(updated.status_arsip).toBe('USUL_MUSNAH')
    expect(repository.calls).toContainEqual([
      'updateBerkasArchiveStatus',
      CLOSED_BERKAS_ID,
      'INAKTIF',
      'USUL_MUSNAH',
    ])
  })

  it('moves CLOSED USUL_MUSNAH berkas to DIMUSNAHKAN as status-only', async () => {
    const repository = createFakeRepository({
      closedStatusArsip: BERKAS_ARCHIVE_STATUS.USUL_MUSNAH,
    })

    const updated = await transitionBerkasArchiveStatus({
      berkasId: CLOSED_BERKAS_ID,
      actorUserId: ACTOR_ID,
      action: 'approve_destruction',
    }, { repository })

    expect(updated.status_arsip).toBe('DIMUSNAHKAN')
    expect(repository.calls).toContainEqual([
      'updateBerkasArchiveStatus',
      CLOSED_BERKAS_ID,
      'USUL_MUSNAH',
      'DIMUSNAHKAN',
    ])
    expect(repository.calls.some(([name]) => String(name).toLowerCase().includes('delete'))).toBe(false)
  })

  it('rejects OPEN/null lifecycle transitions', async () => {
    const repository = createFakeRepository()

    await expect(transitionBerkasArchiveStatus({
      berkasId: BERKAS_ID,
      actorUserId: ACTOR_ID,
      action: 'mark_inactive',
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_LIFECYCLE_NOT_FINAL',
    })

    expect(repository.calls.some(([name]) => name === 'updateBerkasArchiveStatus')).toBe(false)
  })

  it('rejects CLOSED/null transitional lifecycle rows', async () => {
    const repository = createFakeRepository({ closedStatusArsip: null })

    await expect(transitionBerkasArchiveStatus({
      berkasId: CLOSED_BERKAS_ID,
      actorUserId: ACTOR_ID,
      action: 'mark_inactive',
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_LIFECYCLE_UNKNOWN',
    })

    expect(repository.calls.some(([name]) => name === 'updateBerkasArchiveStatus')).toBe(false)
  })

  it('rejects invalid lifecycle jumps', async () => {
    const repository = createFakeRepository()

    await expect(transitionBerkasArchiveStatus({
      berkasId: CLOSED_BERKAS_ID,
      actorUserId: ACTOR_ID,
      action: 'propose_destruction',
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_LIFECYCLE_INVALID',
    })

    expect(repository.calls.some(([name]) => name === 'updateBerkasArchiveStatus')).toBe(false)
  })

  it('rejects terminal DIMUSNAHKAN lifecycle transitions', async () => {
    const repository = createFakeRepository({
      closedStatusArsip: BERKAS_ARCHIVE_STATUS.DIMUSNAHKAN,
    })

    await expect(transitionBerkasArchiveStatus({
      berkasId: CLOSED_BERKAS_ID,
      actorUserId: ACTOR_ID,
      action: 'mark_inactive',
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_LIFECYCLE_INVALID',
    })
  })
})

function validCloseMetadata() {
  return {
    nomor_spm: 'SPM-001/2026',
    retensi_aktif: '1 Tahun',
    retensi_inaktif: '3 Tahun',
    closed_at: '2026-05-29',
  }
}

function createFakeRepository(options: {
  itemCount?: number
  workflowKlasifikasiId?: string | null
  manualKlasifikasiId?: string | null
  manualCanonicalArsipId?: string | null
  existingBerkasRows?: ReturnType<typeof baseBerkas>[]
  insertOpenBerkasError?: unknown
  insertBerkasItemError?: unknown
  openAfterConflict?: boolean
  closedStatusArsip?: TestBerkasArchiveStatus | null
} = {}): BerkasArsipRepository & { calls: unknown[][] } {
  const calls: unknown[][] = []
  let openLookupCount = 0

  return {
    calls,
    async findActiveKlasifikasi(id) {
      calls.push(['findActiveKlasifikasi', id])
      if (id !== KLASIFIKASI_ID) return null
      return {
        id,
        kode: 'BB',
        nama: 'Belanja Barang',
      }
    },
    async findOpenBerkasByKlasifikasiId(klasifikasiId) {
      calls.push(['findOpenBerkasByKlasifikasiId', klasifikasiId])
      openLookupCount += 1
      if (options.openAfterConflict && openLookupCount > 1) {
        return openBerkas()
      }
      return null
    },
    async findBerkasByKlasifikasiId(klasifikasiId) {
      calls.push(['findBerkasByKlasifikasiId', klasifikasiId])
      openLookupCount += 1
      if (options.existingBerkasRows) return options.existingBerkasRows
      if (options.openAfterConflict && openLookupCount > 2) return [openBerkas()]
      return []
    },
    async insertOpenBerkas(input) {
      calls.push([
        'insertOpenBerkas',
        input.klasifikasi.id,
        input.klasifikasi.kode,
        input.klasifikasi.nama,
      ])
      if (options.insertOpenBerkasError) throw options.insertOpenBerkasError
      return openBerkas({
        id: 'berkas-created',
        createdBy: input.actorUserId,
        klasifikasiKodeSnapshot: input.klasifikasi.kode,
        klasifikasiNamaSnapshot: input.klasifikasi.nama,
      })
    },
    async findBerkasById(id) {
      calls.push(['findBerkasById', id])
      if (id === BERKAS_ID) return openBerkas()
      if (id === CLOSED_BERKAS_ID) {
        const statusArsip = Object.prototype.hasOwnProperty.call(options, 'closedStatusArsip')
          ? options.closedStatusArsip
          : BERKAS_ARCHIVE_STATUS.AKTIF
        return closedBerkas({ statusArsip })
      }
      return null
    },
    async findWorkflowSource(dokumenId) {
      calls.push(['findWorkflowSource', dokumenId])
      if (dokumenId !== DOKUMEN_ID) return null
      return {
        id: dokumenId,
        klasifikasiId: options.workflowKlasifikasiId ?? KLASIFIKASI_ID,
        canonicalArsipId: CANONICAL_ARSIP_ID,
      }
    },
    async findManualSource(manualArsipId) {
      calls.push(['findManualSource', manualArsipId])
      if (manualArsipId !== MANUAL_ARSIP_ID) return null
      return {
        id: manualArsipId,
        klasifikasiId: options.manualKlasifikasiId ?? KLASIFIKASI_ID,
        canonicalArsipId: Object.prototype.hasOwnProperty.call(options, 'manualCanonicalArsipId')
          ? options.manualCanonicalArsipId ?? null
          : CANONICAL_ARSIP_ID,
      }
    },
    async insertBerkasItem(input) {
      calls.push(['insertBerkasItem', input.berkasId, input.sourceType])
      if (options.insertBerkasItemError) throw options.insertBerkasItemError
      return {
        id: 'berkas-item',
        berkasId: input.berkasId,
        sourceType: input.sourceType,
        dokumenId: input.dokumenId,
        manualArsipId: input.manualArsipId,
        canonicalArsipId: input.canonicalArsipId,
        addedBy: input.actorUserId,
      }
    },
    async countBerkasItems(berkasId) {
      calls.push(['countBerkasItems', berkasId])
      return options.itemCount ?? 1
    },
    async closeOpenBerkas(input) {
      calls.push(['closeOpenBerkas', input.berkasId, input.actorUserId])
      return {
        ...openBerkas(),
        statusBerkas: 'CLOSED',
        statusArsip: BERKAS_ARCHIVE_STATUS.AKTIF,
        nomorSpm: input.plan.nomorSpm,
        retensiAktif: input.plan.retensiAktif,
        retensiInaktif: input.plan.retensiInaktif,
        masaAktifBerakhir: input.plan.masaAktifBerakhir,
        masaInaktifBerakhir: input.plan.masaInaktifBerakhir,
        closedAt: input.plan.closedAt,
        closedBy: input.actorUserId,
      }
    },
    async updateBerkasArchiveStatus(input) {
      calls.push([
        'updateBerkasArchiveStatus',
        input.berkasId,
        input.currentStatusArsip,
        input.nextStatusArsip,
      ])
      return {
        ...closedBerkas({ statusArsip: input.nextStatusArsip }),
        updatedAt: new Date('2026-05-30T00:00:00.000Z'),
      }
    },
  }
}

function openBerkas(overrides: Partial<ReturnType<typeof baseBerkas>> = {}) {
  return {
    ...baseBerkas(),
    ...overrides,
  }
}

function closedBerkas(
  overrides: Partial<ReturnType<typeof baseBerkas>> & { statusArsip?: TestBerkasArchiveStatus | null } = {},
) {
  return {
    ...baseBerkas(),
    id: CLOSED_BERKAS_ID,
    statusBerkas: 'CLOSED' as const,
    statusArsip: BERKAS_ARCHIVE_STATUS.AKTIF,
    nomorSpm: 'SPM-CLOSED',
    retensiAktif: '1 Tahun',
    retensiInaktif: '3 Tahun',
    masaAktifBerakhir: '2027-05-29',
    masaInaktifBerakhir: '2030-05-29',
    closedAt: new Date('2026-05-29T00:00:00.000Z'),
    closedBy: ACTOR_ID,
    ...overrides,
  }
}

function baseBerkas() {
  return {
    id: BERKAS_ID,
    klasifikasiId: KLASIFIKASI_ID,
    klasifikasiKodeSnapshot: 'BB',
    klasifikasiNamaSnapshot: 'Belanja Barang',
    statusBerkas: 'OPEN' as const,
    statusArsip: null,
    nomorSpm: null,
    retensiAktif: null,
    retensiInaktif: null,
    masaAktifBerakhir: null,
    masaInaktifBerakhir: null,
    closedAt: null,
    closedBy: null,
    createdBy: ACTOR_ID,
  }
}
