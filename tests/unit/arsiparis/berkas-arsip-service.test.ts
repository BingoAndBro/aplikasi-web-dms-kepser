import { describe, expect, it } from 'vitest'
import {
  addManualDocumentToOpenBerkas,
  addWorkflowDocumentToOpenBerkas,
  BerkasArsipServiceError,
  buildCloseBerkasPlan,
  closeBerkasArsip,
  getOrCreateOpenBerkasForKlasifikasi,
  transitionBerkasArchiveStatus,
  updateActiveBerkasMetadata,
  type BerkasArsipRepository,
} from '#/lib/archive/berkas-arsip-service'
import { BERKAS_ARCHIVE_STATUS } from '#/lib/constants/archive-status'

const ACTOR_ID = 'actor-user'
const KLASIFIKASI_ID = 'klasifikasi-belanja-barang'
const BERKAS_ID = 'berkas-belanja-barang-open'
const CLOSED_BERKAS_ID = 'berkas-belanja-barang-closed'
const DOKUMEN_ID = 'dokumen-workflow'
const MANUAL_ARSIP_ID = 'manual-dokumen'
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
    expect(repository.calls).toContainEqual(['findKlasifikasiForOperationalSelection', KLASIFIKASI_ID])
    expect(repository.calls).toContainEqual(['findBerkasByKlasifikasiId', KLASIFIKASI_ID])
    expect(repository.calls).toContainEqual(['insertOpenBerkas', KLASIFIKASI_ID, 'BB', 'Belanja Barang'])
    expect(repository.calls).toContainEqual([
      'appendBerkasActivity',
      'berkas-created',
      'BERKAS_DIBUKA',
      ACTOR_ID,
      null,
      null,
      null,
    ])
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
    expect(repository.calls).toContainEqual(['findKlasifikasiForOperationalSelection', KLASIFIKASI_ID])
    expect(repository.calls).toContainEqual(['findBerkasByKlasifikasiId', KLASIFIKASI_ID])
    expect(repository.calls.some(([name]) => name === 'insertOpenBerkas')).toBe(false)
  })

  it('rejects an existing OPEN berkas when its classification is no longer an operational leaf', async () => {
    const repository = createFakeRepository({
      existingBerkasRows: [openBerkas()],
      klasifikasiHasChildren: true,
    })

    await expect(getOrCreateOpenBerkasForKlasifikasi({
      klasifikasiId: KLASIFIKASI_ID,
      actorUserId: ACTOR_ID,
    }, { repository })).rejects.toMatchObject({
      code: 'KLASIFIKASI_PARENT',
      message: 'Klasifikasi induk tidak dapat dipilih sebagai Cara Pembayaran. Pilih Pilihan Akhir.',
    })

    expect(repository.calls).toContainEqual(['findKlasifikasiForOperationalSelection', KLASIFIKASI_ID])
    expect(repository.calls.some(([name]) => name === 'findBerkasByKlasifikasiId')).toBe(false)
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
      message: 'Berkas untuk Cara Pembayaran ini sudah ditutup',
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
    expect(repository.calls.filter(([name]) => name === 'findBerkasByKlasifikasiId')).toHaveLength(2)
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
    const repository = createFakeRepository()

    const item = await addManualDocumentToOpenBerkas({
      berkasId: BERKAS_ID,
      manualArsipId: MANUAL_ARSIP_ID,
      actorUserId: ACTOR_ID,
    }, { repository })

    expect(item).toMatchObject({
      source_type: 'MANUAL',
      manual_arsip_id: MANUAL_ARSIP_ID,
      dokumen_id: null,
      added_by: ACTOR_ID,
    })
    expect(repository.calls).toContainEqual([
      'appendBerkasActivity',
      BERKAS_ID,
      'DOKUMEN_MANUAL_DITAMBAHKAN',
      ACTOR_ID,
      'MANUAL',
      null,
      MANUAL_ARSIP_ID,
    ])
  })

  it('appends a Persetujuan classification event after workflow document insertion', async () => {
    const repository = createFakeRepository()

    const item = await addWorkflowDocumentToOpenBerkas({
      berkasId: BERKAS_ID,
      dokumenId: DOKUMEN_ID,
      actorUserId: ACTOR_ID,
    }, { repository })

    expect(item).toMatchObject({
      source_type: 'WORKFLOW',
      dokumen_id: DOKUMEN_ID,
      manual_arsip_id: null,
    })
    expect(repository.calls).toContainEqual([
      'appendBerkasActivity',
      BERKAS_ID,
      'DOKUMEN_PERSETUJUAN_DIKLASIFIKASIKAN',
      ACTOR_ID,
      'WORKFLOW',
      DOKUMEN_ID,
      null,
    ])
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

  it('rejects workflow sources without an authoritative jenis pembayaran', async () => {
    const repository = createFakeRepository({
      workflowKlasifikasiId: null,
    })

    await expect(addWorkflowDocumentToOpenBerkas({
      berkasId: BERKAS_ID,
      dokumenId: DOKUMEN_ID,
      actorUserId: ACTOR_ID,
    }, { repository })).rejects.toMatchObject({
      code: 'SOURCE_KLASIFIKASI_UNAVAILABLE',
      message: 'Jenis pembayaran dokumen belum tersedia untuk validasi berkas',
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

  it('computes a single berkas due date from closed_at + masa simpan (RP-01)', () => {
    const plan = buildCloseBerkasPlan({
      nomor_spm: 'SPM-001/2026',
      retensi_aktif: '1 Tahun',
      closed_at: '2026-05-29',
    })

    expect(plan).toMatchObject({
      nomorSpm: 'SPM-001/2026',
      retensiAktif: '1 Tahun',
      retensiInaktif: null,
      closedAtDateOnly: '2026-05-29',
      masaAktifBerakhir: '2027-05-29',
      masaInaktifBerakhir: null,
    })
    expect(plan.closedAt.toISOString()).toBe('2026-05-29T00:00:00.000Z')
  })

  it('treats transformed null close dates as omitted close metadata', () => {
    const plan = buildCloseBerkasPlan({
      nomor_spm: 'SPM-001/2026',
      retensi_aktif: '1 Tahun',
      closed_at: null,
    }, new Date('2026-05-30T12:00:00.000Z'))

    expect(plan).toMatchObject({
      closedAtDateOnly: '2026-05-30',
      masaAktifBerakhir: '2027-05-30',
      masaInaktifBerakhir: null,
    })
    expect(plan.closedAt.toISOString()).toBe('2026-05-30T00:00:00.000Z')
  })

  it('maps "Permanen" masa simpan to the sentinel due date', () => {
    const plan = buildCloseBerkasPlan({
      nomor_spm: 'SPM-PERMANEN',
      retensi_aktif: 'Permanen',
      closed_at: '2026-05-29',
    })

    expect(plan.masaAktifBerakhir).toBe('9999-12-31')
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
      retensi_inaktif: null,
      masa_aktif_berakhir: '2027-05-29',
      masa_inaktif_berakhir: null,
      closed_by: ACTOR_ID,
    })
    expect(repository.calls).toContainEqual(['closeOpenBerkas', BERKAS_ID, ACTOR_ID])
    expect(repository.calls).toContainEqual([
      'appendBerkasActivity',
      BERKAS_ID,
      'BERKAS_DITUTUP',
      ACTOR_ID,
      null,
      null,
      null,
    ])
    expect(repository.calls.some(([name]) => name === 'insertBerkasItem')).toBe(false)
  })

  it('updates metadata only for CLOSED AKTIF berkas', async () => {
    const repository = createFakeRepository()

    const updated = await updateActiveBerkasMetadata({
      berkasId: CLOSED_BERKAS_ID,
      actorUserId: ACTOR_ID,
      metadata: {
        nomor_spm: 'SPM-EDIT-001',
        retensi_aktif: '3 Tahun',
        closed_at: '2026-06-01',
      },
    }, { repository })

    expect(updated).toMatchObject({
      id: CLOSED_BERKAS_ID,
      status_berkas: 'CLOSED',
      status_arsip: 'AKTIF',
      nomor_spm: 'SPM-EDIT-001',
      retensi_aktif: '3 Tahun',
      retensi_inaktif: null,
      masa_aktif_berakhir: '2029-05-29',
      masa_inaktif_berakhir: null,
      closed_at: '2026-05-29T00:00:00.000Z',
    })
    expect(repository.calls).toContainEqual(['updateActiveBerkasMetadata', CLOSED_BERKAS_ID])
    expect(repository.calls).toContainEqual([
      'appendBerkasActivity',
      CLOSED_BERKAS_ID,
      'METADATA_ARSIP_AKTIF_DIPERBARUI',
      ACTOR_ID,
      null,
      null,
      null,
    ])
    expect(repository.calls).toContainEqual([
      'updateActiveBerkasMetadataPlan',
      CLOSED_BERKAS_ID,
      '2026-05-29',
    ])
  })

  it('rejects active metadata edits for OPEN berkas', async () => {
    const repository = createFakeRepository()

    await expect(updateActiveBerkasMetadata({
      berkasId: BERKAS_ID,
      actorUserId: ACTOR_ID,
      metadata: {
        nomor_spm: 'SPM-EDIT-001',
        retensi_aktif: '3 Tahun',
      },
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_METADATA_NOT_EDITABLE',
    })

    expect(repository.calls.some(([name]) => name === 'updateActiveBerkasMetadata')).toBe(false)
  })

  it.each([
    BERKAS_ARCHIVE_STATUS.INAKTIF,
    BERKAS_ARCHIVE_STATUS.USUL_MUSNAH,
    BERKAS_ARCHIVE_STATUS.DIMUSNAHKAN,
  ] as const)('rejects active metadata edits after berkas status becomes %s', async (closedStatusArsip) => {
    const repository = createFakeRepository({ closedStatusArsip })

    await expect(updateActiveBerkasMetadata({
      berkasId: CLOSED_BERKAS_ID,
      actorUserId: ACTOR_ID,
      metadata: {
        nomor_spm: 'SPM-EDIT-001',
        retensi_aktif: '3 Tahun',
      },
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_METADATA_NOT_EDITABLE',
    })

    expect(repository.calls.some(([name]) => name === 'updateActiveBerkasMetadata')).toBe(false)
  })

  it('rejects invalid close-folder metadata', () => {
    expect(() => buildCloseBerkasPlan({
      nomor_spm: '',
      retensi_aktif: '1 Tahun',
    })).toThrow(BerkasArsipServiceError)
  })

  it('moves CLOSED AKTIF berkas straight to USUL_MUSNAH via propose_destruction (RP-01)', async () => {
    const repository = createFakeRepository()

    const updated = await transitionBerkasArchiveStatus({
      berkasId: CLOSED_BERKAS_ID,
      actorUserId: ACTOR_ID,
      action: 'propose_destruction',
    }, { repository })

    expect(updated.status_arsip).toBe('USUL_MUSNAH')
    expect(repository.calls).toContainEqual([
      'updateBerkasArchiveStatus',
      CLOSED_BERKAS_ID,
      'AKTIF',
      'USUL_MUSNAH',
    ])
    expect(repository.calls).toContainEqual([
      'appendBerkasActivity',
      CLOSED_BERKAS_ID,
      'BERKAS_DIPINDAHKAN_KE_USUL_MUSNAH',
      ACTOR_ID,
      null,
      null,
      null,
    ])
    expect(repository.calls.some(([name]) => name === 'insertBerkasItem')).toBe(false)
    expect(repository.calls.some(([name]) => String(name).toLowerCase().includes('delete'))).toBe(false)
    expect(repository.calls.some(([name]) => String(name).toLowerCase().includes('storage'))).toBe(false)
  })

  it('moves CLOSED USUL_MUSNAH berkas back to AKTIF via cancel_proposal, logging an existing event (RP-01)', async () => {
    const repository = createFakeRepository({
      closedStatusArsip: BERKAS_ARCHIVE_STATUS.USUL_MUSNAH,
    })

    const updated = await transitionBerkasArchiveStatus({
      berkasId: CLOSED_BERKAS_ID,
      actorUserId: ACTOR_ID,
      action: 'cancel_proposal',
    }, { repository })

    expect(updated.status_arsip).toBe('AKTIF')
    expect(repository.calls).toContainEqual([
      'updateBerkasArchiveStatus',
      CLOSED_BERKAS_ID,
      'USUL_MUSNAH',
      'AKTIF',
    ])
    expect(repository.calls).toContainEqual([
      'appendBerkasActivity',
      CLOSED_BERKAS_ID,
      'METADATA_ARSIP_AKTIF_DIPERBARUI',
      ACTOR_ID,
      null,
      null,
      null,
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
    expect(repository.calls).toContainEqual([
      'appendBerkasActivity',
      CLOSED_BERKAS_ID,
      'BERKAS_DIMUSNAHKAN',
      ACTOR_ID,
      null,
      null,
      null,
    ])
    expect(repository.calls.some(([name]) => String(name).toLowerCase().includes('delete'))).toBe(false)
  })

  it('rejects OPEN/null lifecycle transitions', async () => {
    const repository = createFakeRepository()

    await expect(transitionBerkasArchiveStatus({
      berkasId: BERKAS_ID,
      actorUserId: ACTOR_ID,
      action: 'propose_destruction',
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
      action: 'propose_destruction',
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_LIFECYCLE_UNKNOWN',
    })

    expect(repository.calls.some(([name]) => name === 'updateBerkasArchiveStatus')).toBe(false)
  })

  it('rejects invalid lifecycle jumps (cancel_proposal from AKTIF, approve from AKTIF)', async () => {
    const repository = createFakeRepository()

    await expect(transitionBerkasArchiveStatus({
      berkasId: CLOSED_BERKAS_ID,
      actorUserId: ACTOR_ID,
      action: 'cancel_proposal',
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_LIFECYCLE_INVALID',
    })

    await expect(transitionBerkasArchiveStatus({
      berkasId: CLOSED_BERKAS_ID,
      actorUserId: ACTOR_ID,
      action: 'approve_destruction',
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_LIFECYCLE_INVALID',
    })

    expect(repository.calls.some(([name]) => name === 'updateBerkasArchiveStatus')).toBe(false)
  })

  it('rejects propose_destruction when already USUL_MUSNAH', async () => {
    const repository = createFakeRepository({
      closedStatusArsip: BERKAS_ARCHIVE_STATUS.USUL_MUSNAH,
    })

    await expect(transitionBerkasArchiveStatus({
      berkasId: CLOSED_BERKAS_ID,
      actorUserId: ACTOR_ID,
      action: 'propose_destruction',
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_LIFECYCLE_INVALID',
    })
  })

  it('rejects terminal DIMUSNAHKAN lifecycle transitions', async () => {
    const repository = createFakeRepository({
      closedStatusArsip: BERKAS_ARCHIVE_STATUS.DIMUSNAHKAN,
    })

    await expect(transitionBerkasArchiveStatus({
      berkasId: CLOSED_BERKAS_ID,
      actorUserId: ACTOR_ID,
      action: 'cancel_proposal',
    }, { repository })).rejects.toMatchObject({
      code: 'BERKAS_LIFECYCLE_INVALID',
    })
  })
})

function validCloseMetadata() {
  return {
    nomor_spm: 'SPM-001/2026',
    retensi_aktif: '1 Tahun',
    closed_at: '2026-05-29',
  }
}

function createFakeRepository(options: {
  itemCount?: number
  workflowKlasifikasiId?: string | null
  manualKlasifikasiId?: string | null
  klasifikasiIsActive?: boolean
  klasifikasiHasChildren?: boolean
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
    async findKlasifikasiForOperationalSelection(id) {
      calls.push(['findKlasifikasiForOperationalSelection', id])
      if (id !== KLASIFIKASI_ID) return null
      return {
        id,
        kode: 'BB',
        nama: 'Belanja Barang',
        isActive: options.klasifikasiIsActive ?? true,
        hasChildren: options.klasifikasiHasChildren ?? false,
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
      if (options.openAfterConflict && openLookupCount > 1) return [openBerkas()]
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
        klasifikasiId: Object.prototype.hasOwnProperty.call(options, 'workflowKlasifikasiId')
          ? options.workflowKlasifikasiId ?? null
          : KLASIFIKASI_ID,
      }
    },
    async findManualSource(manualArsipId) {
      calls.push(['findManualSource', manualArsipId])
      if (manualArsipId !== MANUAL_ARSIP_ID) return null
      return {
        id: manualArsipId,
        klasifikasiId: options.manualKlasifikasiId ?? KLASIFIKASI_ID,
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
    async updateActiveBerkasMetadata(input) {
      calls.push(['updateActiveBerkasMetadata', input.berkasId])
      calls.push([
        'updateActiveBerkasMetadataPlan',
        input.berkasId,
        input.plan.retentionBaseDateOnly,
      ])
      return {
        ...closedBerkas(),
        nomorSpm: input.plan.nomorSpm,
        retensiAktif: input.plan.retensiAktif,
        retensiInaktif: input.plan.retensiInaktif,
        masaAktifBerakhir: input.plan.masaAktifBerakhir,
        masaInaktifBerakhir: input.plan.masaInaktifBerakhir,
        closedAt: closedBerkas().closedAt,
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
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
    async appendBerkasActivity(input) {
      calls.push([
        'appendBerkasActivity',
        input.berkasId,
        input.eventType,
        input.actorUserId,
        input.sourceType ?? null,
        input.workflowDocumentId ?? null,
        input.manualDocumentId ?? null,
      ])
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
