import { beforeEach, describe, expect, it, vi } from 'vitest'

// D-28: Laporan Kegiatan (GET /api/laporan/kegiatan?scope=final) memuat dokumen
// tambahan KSBU dari kegiatan yang dipimpin, dan totalnya sama dengan Nominal
// Realisasi (GET /api/laporan/kinerja). Kedua handler ASLI dijalankan terhadap
// satu fixture in-memory (helpers/fake-laporan-db.ts), jadi filter server
// (kegiatan, status, komponen, dimusnahkan, periode) benar-benar diuji.

vi.mock('drizzle-orm', async (importActual) => ({
  ...(await importActual<typeof import('drizzle-orm')>()),
  ...(await import('./helpers/fake-laporan-db')).fakeOperators,
}))

vi.mock('#/db/client', async () => ({
  db: (await import('./helpers/fake-laporan-db')).fakeDb,
}))

const mocks = vi.hoisted(() => ({
  getLocalServerSession: vi.fn(),
  streamDocumentZip: vi.fn(),
}))

// SQL status efektif (subquery berkorelasi) dievaluasi fake db dengan aturan
// yang sama: status berkas penaung, atau AKTIF bila berkas masih terbuka /
// belum ada. SQL aslinya diuji terhadap Postgres di
// tests/integration/manual-arsip-effective-status.test.ts.
vi.mock('#/lib/archive/manual-arsip-effective-status', async () => {
  const { berkasArsip, berkasArsipItem, manualArsip } = await import('#/db/schema/arsip')
  type Rec = Record<string, unknown>
  return {
    manualArsipEffectiveStatusArsip: {
      __fakeEval: (row: ReadonlyMap<object, Rec | null>, all: ReadonlyMap<object, Rec[]>) => {
        const manualId = row.get(manualArsip)?.id
        const item = (all.get(berkasArsipItem) ?? []).find((candidate) => candidate.manualArsipId === manualId)
        const berkas = (all.get(berkasArsip) ?? []).find((candidate) => candidate.id === item?.berkasId)
        return berkas?.statusArsip ?? 'AKTIF'
      },
    },
  }
})

// Ekspor ZIP: tangkap entri yang direncanakan, jangan sentuh file system.
// Bagian dokumen alur (buildLaporanZipEntries) sudah diuji di export-zip.test.ts.
vi.mock('#/lib/export/document-zip', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/export/document-zip')>()),
  streamDocumentZip: mocks.streamDocumentZip,
}))
vi.mock('#/lib/export/laporan-zip-entries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/export/laporan-zip-entries')>()),
  buildLaporanZipEntries: async (rows: Array<{ id: string }>) =>
    rows.map((row) => ({ folderPath: `workflow-${row.id}`, files: [] })),
}))

vi.mock('#/lib/auth/local-server-auth', () => ({
  getLocalServerSession: mocks.getLocalServerSession,
  hasLocalRole: (session: { roles: string[] }, role: string) => session.roles.includes(role),
  hasAnyLocalRole: (session: { roles: string[] }, roles: string[]) =>
    roles.some((role) => session.roles.includes(role)),
}))

import { berkasArsip, berkasArsipItem, manualArsip, manualArsipAttachment } from '#/db/schema/arsip'
import { users } from '#/db/schema/auth'
import { dokumenTransaksi } from '#/db/schema/dokumen'
import { ketuaTimAssignments, masterFungsi, masterKegiatan, masterKomponen } from '#/db/schema/master'
import { countedNominalRealisasi } from '#/lib/laporan/kegiatan-scope'
import { totalNominal, type LaporanKinerjaRow } from '#/lib/laporan/monitoring-rows'
import { isTanggalInPeriode, resolvePeriodeRange } from '#/lib/laporan/periode'
import { Route as KegiatanRoute } from '#/routes/api/laporan/kegiatan'
import { Route as KegiatanExportZipRoute } from '#/routes/api/laporan/kegiatan.export-zip'
import { Route as KinerjaRoute } from '#/routes/api/laporan/kinerja'
import { setFakeTables } from './helpers/fake-laporan-db'

type GetHandler = (args: { request: Request }) => Promise<Response>
const handler = (route: unknown) =>
  (route as { options: { server: { handlers: { GET: GetHandler } } } }).options.server.handlers.GET
const kegiatanGet = handler(KegiatanRoute)
const kinerjaGet = handler(KinerjaRoute)
const exportZipHandlers = (KegiatanExportZipRoute as unknown as {
  options: { server: { handlers: { POST: GetHandler; GET: GetHandler } } }
}).options.server.handlers
const exportZipPost = exportZipHandlers.POST
const exportZipGet = exportZipHandlers.GET

const KETUA_TIM = 'aaaaaaaa-0000-4000-8000-000000000001'
const OTHER_KETUA_TIM = 'aaaaaaaa-0000-4000-8000-000000000002'
const PPK_USER = 'aaaaaaaa-0000-4000-8000-000000000003'
const KSBU_USER = 'aaaaaaaa-0000-4000-8000-000000000004'
const FUNGSI = 'bbbbbbbb-0000-4000-8000-000000000001'
const K1 = 'cccccccc-0000-4000-8000-000000000001' // dipimpin KETUA_TIM
const K2 = 'cccccccc-0000-4000-8000-000000000002' // dipimpin OTHER_KETUA_TIM
const C1 = 'dddddddd-0000-4000-8000-000000000001'
const C2 = 'dddddddd-0000-4000-8000-000000000002'
const B_DESTROYED = 'eeeeeeee-0000-4000-8000-000000000001'
const B_ACTIVE = 'eeeeeeee-0000-4000-8000-000000000002'
const B_INAKTIF = 'eeeeeeee-0000-4000-8000-000000000003'

// TW3 2026 = 2026-07-01 .. 2026-09-30.
const TW3_2026 = resolvePeriodeRange({ mode: 'TRIWULAN', tahun: 2026, triwulan: 3 })

function dokumen(id: string, overrides: Record<string, unknown>) {
  return {
    id,
    judul: `Dokumen ${id}`,
    fungsiId: FUNGSI,
    kegiatanJenisId: K1,
    isKetuaTim: false,
    status: 'COMPLETED',
    currentStep: null,
    revisionTarget: null,
    revisionNotes: null,
    lampiranUrls: [],
    tahun: 2026,
    tanggal: '2026-08-01',
    createdBy: PPK_USER,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    nominalRealisasi: '0',
    isNonMaterial: false,
    komponenId: C1,
    ...overrides,
  }
}

function manual(id: string, overrides: Record<string, unknown>) {
  return {
    id,
    nama: `Manual ${id}`,
    tanggal: '2026-08-10',
    keterangan: 'Dokumen tambahan',
    fungsiId: FUNGSI,
    kegiatanId: K1,
    komponenId: C1,
    createdBy: KSBU_USER,
    createdAt: new Date('2026-08-10T00:00:00.000Z'),
    updatedAt: new Date('2026-08-10T00:00:00.000Z'),
    ...overrides,
  }
}

type Extra = {
  dokumen?: Record<string, unknown>[]
  manual?: Record<string, unknown>[]
  attachments?: Record<string, unknown>[]
  items?: Record<string, unknown>[]
}

function seed(extra: Extra = {}) {
  setFakeTables(new Map<object, Record<string, unknown>[]>([
    [manualArsipAttachment, extra.attachments ?? []],
    [users, [
      { id: KETUA_TIM, displayName: 'Ketua Tim', namaLengkap: null, username: 'kt' },
      { id: PPK_USER, displayName: 'Pegawai A', namaLengkap: null, username: 'pa' },
      { id: KSBU_USER, displayName: 'KSBU', namaLengkap: null, username: 'ksbu' },
    ]],
    [masterFungsi, [{ id: FUNGSI, nama: 'Fungsi Statistik' }]],
    [masterKegiatan, [{ id: K1, nama: 'Kegiatan Survei' }, { id: K2, nama: 'Kegiatan Lain' }]],
    [masterKomponen, [{ id: C1, nama: 'Honor' }, { id: C2, nama: 'Transport' }]],
    [ketuaTimAssignments, [
      { id: 'kt-1', userId: KETUA_TIM, kegiatanId: K1 },
      { id: 'kt-2', userId: OTHER_KETUA_TIM, kegiatanId: K2 },
    ]],
    [dokumenTransaksi, [
      dokumen('D1', { nominalRealisasi: '1000000.00' }),
      dokumen('D2-dimusnahkan', { nominalRealisasi: '500000.00', tanggal: '2026-08-05' }),
      dokumen('D3-nonmaterial', { status: 'TERSIMPAN', isNonMaterial: true, komponenId: null, nominalRealisasi: null }),
      dokumen('D4-tw2', { nominalRealisasi: '700000.00', tanggal: '2026-04-10' }),
      dokumen('D5-belum-final', { status: 'IN_PPK_VALIDATION', nominalRealisasi: '900000.00' }),
      dokumen('D6-k2', { kegiatanJenisId: K2, komponenId: C2, nominalRealisasi: '300000.00' }),
      dokumen('D7-tanpa-komponen', { komponenId: null, nominalRealisasi: '999.00' }),
      dokumen('D8-nonmaterial-dibersihkan', {
        status: 'TERSIMPAN',
        isNonMaterial: true,
        komponenId: null,
        nominalRealisasi: null,
        tanggal: '2026-08-03',
        lampiranDibersihkanAt: new Date('2026-09-01T00:00:00.000Z'),
        lampiranDibersihkanAlasan: 'PEMBERSIHAN_NON_MATERIAL',
      }),
      ...(extra.dokumen ?? []),
    ]],
    [manualArsip, [
      manual('M1', { nominalRealisasi: '250000.00' }),
      manual('M2-berkas-dimusnahkan', { nominalRealisasi: '400000.00', tanggal: '2026-08-11' }),
      manual('M3-berkas-inaktif', { nominalRealisasi: '150000.00', tanggal: '2026-08-12' }),
      manual('M4-k2', { kegiatanId: K2, komponenId: C2, nominalRealisasi: '600000.00' }),
      ...(extra.manual ?? []),
    ]],
    [berkasArsip, [
      { id: B_DESTROYED, statusArsip: 'DIMUSNAHKAN' },
      { id: B_ACTIVE, statusArsip: null },
      { id: B_INAKTIF, statusArsip: 'INAKTIF' },
    ]],
    [berkasArsipItem, [
      { id: 'i1', berkasId: B_DESTROYED, sourceType: 'WORKFLOW', dokumenId: 'D2-dimusnahkan', manualArsipId: null },
      // Pemusnahan berkas TIDAK mengubah manual_arsip.status_arsip (tetap AKTIF).
      { id: 'i2', berkasId: B_DESTROYED, sourceType: 'MANUAL', dokumenId: null, manualArsipId: 'M2-berkas-dimusnahkan' },
      // Berkas INAKTIF bukan dimusnahkan: dokumennya tetap dihitung.
      { id: 'i5', berkasId: B_INAKTIF, sourceType: 'MANUAL', dokumenId: null, manualArsipId: 'M3-berkas-inaktif' },
      ...(extra.items ?? []),
      { id: 'i3', berkasId: B_ACTIVE, sourceType: 'WORKFLOW', dokumenId: 'D1', manualArsipId: null },
      { id: 'i4', berkasId: B_ACTIVE, sourceType: 'MANUAL', dokumenId: null, manualArsipId: 'M1' },
    ]],
  ]))
}

function session(userId: string, roles: string[]) {
  return { user: { id: userId, username: 'u' }, userId, roles, activeRole: roles[0], sessionId: 's' }
}

type KegiatanRow = {
  id: string
  sumber: 'WORKFLOW' | 'MANUAL'
  berkas_dimusnahkan: boolean
  kegiatan_jenis_id: string
  status: string
  tanggal: string
  is_non_material: boolean
  nominal_realisasi: number | null
}

async function fetchLaporanKegiatan(userId = KETUA_TIM, scope = 'final'): Promise<KegiatanRow[]> {
  mocks.getLocalServerSession.mockResolvedValue(session(userId, ['PEGAWAI']))
  const response = await kegiatanGet({ request: new Request(`http://localhost/api/laporan/kegiatan?scope=${scope}`) })
  expect(response.status).toBe(200)
  return (await response.json()).dokumen
}

describe('GET /api/laporan/kegiatan — dokumen tambahan KSBU (D-28)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    seed()
  })

  it('(1) Ketua Tim melihat dokumen tambahan KSBU dari kegiatan yang ia pimpin, ditandai sumber MANUAL', async () => {
    const rows = await fetchLaporanKegiatan()
    const m1 = rows.find((row) => row.id === 'M1')

    expect(m1).toMatchObject({
      sumber: 'MANUAL',
      status: 'COMPLETED',
      kegiatan_jenis_id: K1,
      tanggal: '2026-08-10',
      is_non_material: false,
      nominal_realisasi: 250000,
      berkas_dimusnahkan: false,
    })
    expect(rows.find((row) => row.id === 'D1')?.sumber).toBe('WORKFLOW')
  })

  it('(2) tidak memuat dokumen (alur maupun manual) dari kegiatan yang dipimpin orang lain — disaring di server', async () => {
    const ids = (await fetchLaporanKegiatan()).map((row) => row.id)

    expect(ids).not.toContain('M4-k2')
    expect(ids).not.toContain('D6-k2')

    const otherIds = (await fetchLaporanKegiatan(OTHER_KETUA_TIM)).map((row) => row.id)
    expect(otherIds.sort()).toEqual(['D6-k2', 'M4-k2'])
  })

  it('returns nothing for a Pegawai who leads no kegiatan', async () => {
    mocks.getLocalServerSession.mockResolvedValue(session(PPK_USER, ['PEGAWAI']))
    const response = await kegiatanGet({ request: new Request('http://localhost/api/laporan/kegiatan') })

    expect(await response.json()).toEqual({ dokumen: [], isKetuaTim: false })
  })

  it('(3) dokumen DIMUSNAHKAN tetap tampil dengan penanda, tetapi tidak masuk total', async () => {
    const rows = await fetchLaporanKegiatan()
    const flag = (id: string) => rows.find((row) => row.id === id)?.berkas_dimusnahkan

    // manual & alur: mengikuti status arsip berkas penaungnya
    expect(flag('M2-berkas-dimusnahkan')).toBe(true)
    expect(flag('M3-berkas-inaktif')).toBe(false)
    // dokumen alur di berkas DIMUSNAHKAN
    expect(flag('D2-dimusnahkan')).toBe(true)
    expect(flag('D1')).toBe(false)
    expect(flag('M1')).toBe(false)

    const destroyed = rows.filter((row) => row.berkas_dimusnahkan)
    expect(destroyed.map((row) => countedNominalRealisasi(row))).toEqual([0, 0])
  })

  it('tidak memuat dokumen material tanpa Komponen (data yatim), sama seperti Nominal Realisasi', async () => {
    const ids = (await fetchLaporanKegiatan()).map((row) => row.id)
    expect(ids).not.toContain('D7-tanpa-komponen')
    expect(ids).toContain('D3-nonmaterial')
  })

  it('scope=monitoring (Monitoring Dokumen Tim) tidak berubah: tanpa dokumen manual', async () => {
    const rows = await fetchLaporanKegiatan(KETUA_TIM, 'monitoring')

    expect(rows.some((row) => row.sumber === 'MANUAL')).toBe(false)
    expect(rows.map((row) => row.id)).toContain('D5-belum-final')
  })

  it('(5) total satu kegiatan dalam satu periode sama dengan Nominal Realisasi', async () => {
    // Laporan Kegiatan: periode disaring di klien dengan isTanggalInPeriode
    // pada `tanggal` (tanggal dokumen), total memakai countedNominalRealisasi.
    const kegiatanRows = (await fetchLaporanKegiatan())
      .filter((row) => row.kegiatan_jenis_id === K1 && isTanggalInPeriode(row.tanggal, TW3_2026))
    const laporanKegiatanTotal = kegiatanRows.reduce((sum, row) => sum + countedNominalRealisasi(row), 0)

    // Nominal Realisasi (PPK): periode dikirim ke server sebagai start_date/end_date.
    mocks.getLocalServerSession.mockResolvedValue(session(PPK_USER, ['PPK']))
    const response = await kinerjaGet({
      request: new Request(`http://localhost/api/laporan/kinerja?start_date=${TW3_2026.dari}&end_date=${TW3_2026.sampai}`),
    })
    expect(response.status).toBe(200)
    const nominalRows: Array<{ id: string; kegiatan_nama: string; nominal_realisasi: number | null }> =
      (await response.json()).dokumen
    const k1NominalRows = nominalRows.filter((row) => row.kegiatan_nama === 'Kegiatan Survei')
    const nominalRealisasiTotal = k1NominalRows.reduce((sum, row) => sum + (row.nominal_realisasi ?? 0), 0)

    // D1 (1.000.000) + M1 (250.000) + M3 (150.000, berkas INAKTIF tetap dihitung).
    // Tidak dihitung: D2/M2 (berkas dimusnahkan), D3/D8 (non-material),
    // D4 (TW2), D5 (belum final), D7 (tanpa komponen).
    expect(laporanKegiatanTotal).toBe(1_400_000)
    expect(nominalRealisasiTotal).toBe(laporanKegiatanTotal)

    // Selisih sah hanya pada JUMLAH BARIS: Laporan Kegiatan juga menampilkan
    // non-material dan dokumen dimusnahkan (tanpa nominal yang dihitung).
    expect(k1NominalRows.map((row) => row.id).sort()).toEqual(['D1', 'M1', 'M3-berkas-inaktif'])
    expect(kegiatanRows.map((row) => row.id).sort()).toEqual([
      'D1', 'D2-dimusnahkan', 'D3-nonmaterial', 'D8-nonmaterial-dibersihkan',
      'M1', 'M2-berkas-dimusnahkan', 'M3-berkas-inaktif',
    ])
  })

  it('Nominal Realisasi tidak menampilkan dokumen (alur maupun manual) di berkas DIMUSNAHKAN', async () => {
    mocks.getLocalServerSession.mockResolvedValue(session(PPK_USER, ['PPK']))
    const response = await kinerjaGet({ request: new Request('http://localhost/api/laporan/kinerja') })
    const ids = (await response.json()).dokumen.map((row: { id: string }) => row.id)

    expect(ids).toContain('M1')
    expect(ids).toContain('M3-berkas-inaktif')
    expect(ids).not.toContain('M2-berkas-dimusnahkan')
    expect(ids).not.toContain('D2-dimusnahkan')
  })
})

describe('GET /api/laporan/kinerja?scope=laporan_kinerja — berkas dimusnahkan tetap tampil (D-29)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    seed()
  })

  it('menampilkan dokumen berkas dimusnahkan (dengan penanda, nominal tidak dihitung) dan non-material yang sudah dibersihkan', async () => {
    mocks.getLocalServerSession.mockResolvedValue(session(PPK_USER, ['PENANGGUNG_JAWAB_KINERJA']))
    const response = await kinerjaGet({
      request: new Request(`http://localhost/api/laporan/kinerja?scope=laporan_kinerja&start_date=${TW3_2026.dari}&end_date=${TW3_2026.sampai}`),
    })
    expect(response.status).toBe(200)
    const rows: LaporanKinerjaRow[] = (await response.json()).dokumen
    const k1 = rows.filter((row) => row.kegiatan_nama === 'Kegiatan Survei')
    const flag = (id: string) => k1.find((row) => row.id === id)?.berkas_dimusnahkan

    expect(flag('D2-dimusnahkan')).toBe(true)
    expect(flag('M2-berkas-dimusnahkan')).toBe(true)
    expect(flag('M3-berkas-inaktif')).toBe(false)
    expect(flag('D1')).toBe(false)
    expect(flag('M1')).toBe(false)
    // D-29: non-material yang lampirannya sudah dibersihkan tetap tampil (metadata disimpan).
    expect(flag('D8-nonmaterial-dibersihkan')).toBe(false)
    // D-30: badge "File Dibersihkan" butuh penanda pembersihan per baris.
    expect(k1.find((row) => row.id === 'D8-nonmaterial-dibersihkan')).toMatchObject({
      lampiran_dibersihkan_at: '2026-09-01T00:00:00.000Z',
      lampiran_dibersihkan_alasan: 'PEMBERSIHAN_NON_MATERIAL',
    })
    expect(k1.find((row) => row.id === 'D1')?.lampiran_dibersihkan_at).toBeNull()
    expect(k1.find((row) => row.id === 'M1')?.lampiran_dibersihkan_at).toBeNull()

    // Total sama dengan Nominal Realisasi dan Laporan Kegiatan: D1 + M1 + M3.
    expect(totalNominal(k1)).toBe(1_400_000)
  })
})

describe('POST /api/laporan/kegiatan/export-zip — dokumen tambahan KSBU (D-29)', () => {
  // Skema ekspor mewajibkan UUID, jadi tes ini memakai baris tambahan ber-id UUID.
  const DOC_UUID = 'ffffffff-0000-4000-8000-000000000001'
  const MANUAL_K1 = 'ffffffff-0000-4000-8000-000000000011'
  const MANUAL_K1_DIMUSNAHKAN = 'ffffffff-0000-4000-8000-000000000012'
  const MANUAL_K2 = 'ffffffff-0000-4000-8000-000000000013'

  function attachment(id: string, manualArsipId: string, name: string, hour: number) {
    return {
      id,
      manualArsipId,
      logicalPath: `manual/${manualArsipId}/${name}`,
      originalFilename: name,
      judulLampiran: name.replace('.pdf', ''),
      contentType: 'application/pdf',
      createdAt: new Date(`2026-08-10T0${hour}:00:00.000Z`),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    seed({
      dokumen: [dokumen(DOC_UUID, { nominalRealisasi: '1.00' })],
      manual: [
        manual(MANUAL_K1, {}),
        manual(MANUAL_K1_DIMUSNAHKAN, {}),
        manual(MANUAL_K2, { kegiatanId: K2, komponenId: C2 }),
      ],
      attachments: [
        attachment('a1', MANUAL_K1, 'kuitansi.pdf', 1),
        attachment('a2', MANUAL_K1, 'bast.pdf', 2),
        attachment('a3', MANUAL_K2, 'rahasia.pdf', 1),
        attachment('a4', MANUAL_K1_DIMUSNAHKAN, 'lama.pdf', 1),
      ],
      items: [
        { id: 'i-x', berkasId: B_DESTROYED, sourceType: 'MANUAL', dokumenId: null, manualArsipId: MANUAL_K1_DIMUSNAHKAN },
      ],
    })
    mocks.getLocalServerSession.mockResolvedValue(session(KETUA_TIM, ['PEGAWAI']))
    mocks.streamDocumentZip.mockResolvedValue(new Response('zip', { status: 200 }))
  })

  function post(body: unknown) {
    return exportZipPost({
      request: new Request('http://localhost/api/laporan/kegiatan/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify(body),
      }),
    })
  }

  type Entry = { folderPath: string; files: Array<{ namaAman: string; logicalPath: string }>; skipReason?: string }
  const plannedEntries = (): Entry[] => mocks.streamDocumentZip.mock.calls[0][0]

  it('ikut mengekspor lampiran dokumen tambahan KSBU dari kegiatan yang dipimpin, dan mengabaikan kegiatan lain', async () => {
    const response = await post({ manual_arsip_ids: [MANUAL_K1, MANUAL_K2] })
    expect(response.status).toBe(200)

    const entries = plannedEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0].folderPath).toMatch(/^\[Manual\] /)
    expect(entries[0].files.map((file) => file.logicalPath)).toEqual([
      `manual/${MANUAL_K1}/kuitansi.pdf`,
      `manual/${MANUAL_K1}/bast.pdf`,
    ])
    expect(entries[0].files.every((file) => file.namaAman.length > 0)).toBe(true)
  })

  it('mencatat dokumen tambahan KSBU yang berkasnya dimusnahkan di daftar isi, tanpa file', async () => {
    await post({ manual_arsip_ids: [MANUAL_K1_DIMUSNAHKAN] })

    expect(plannedEntries()).toEqual([
      expect.objectContaining({ files: [], skipReason: 'berkas dimusnahkan, lampiran sudah dihapus' }),
    ])
  })

  it('menggabungkan dokumen alur dan dokumen tambahan KSBU dalam satu ZIP', async () => {
    await post({ dokumen_ids: [DOC_UUID], manual_arsip_ids: [MANUAL_K1] })

    expect(plannedEntries().map((entry) => entry.folderPath)).toEqual([
      `workflow-${DOC_UUID}`,
      expect.stringMatching(/^\[Manual\] /),
    ])
  })

  it('menolak manual_arsip_ids dari Monitoring Dokumen Tim dan permintaan tanpa dokumen (400)', async () => {
    expect((await post({ scope: 'monitoring', dokumen_ids: [DOC_UUID], manual_arsip_ids: [MANUAL_K1] })).status).toBe(400)
    expect((await post({ dokumen_ids: [], manual_arsip_ids: [] })).status).toBe(400)
    expect(mocks.streamDocumentZip).not.toHaveBeenCalled()
  })

  describe('D-31: unduhan bawaan browser lewat tiket', () => {
    function postTicket(body: unknown) {
      return exportZipPost({
        request: new Request('http://localhost/api/laporan/kegiatan/export-zip?mode=ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
          body: JSON.stringify(body),
        }),
      })
    }
    const get = (url: string) => exportZipGet({ request: new Request(`http://localhost${url}`) })

    it('POST ?mode=ticket memvalidasi lalu mengembalikan tautan GET, tanpa membuat ZIP', async () => {
      const response = await postTicket({ dokumen_ids: [DOC_UUID], manual_arsip_ids: [MANUAL_K1] })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.download_url).toMatch(/^\/api\/laporan\/kegiatan\/export-zip\?ticket=[\w-]{40,}$/)
      expect(mocks.streamDocumentZip).not.toHaveBeenCalled()
    })

    it('POST ?mode=ticket tetap mengembalikan error validasi (400) sebelum ada tiket', async () => {
      expect((await postTicket({ dokumen_ids: [], manual_arsip_ids: [] })).status).toBe(400)
    })

    it('GET dengan tiket membuat ZIP yang sama persis, sekali pakai', async () => {
      const { download_url } = await (await postTicket({ dokumen_ids: [DOC_UUID], manual_arsip_ids: [MANUAL_K1] })).json()

      const first = await get(download_url)
      expect(first.status).toBe(200)
      expect(plannedEntries().map((entry) => entry.folderPath)).toEqual([
        `workflow-${DOC_UUID}`,
        expect.stringMatching(/^\[Manual\] /),
      ])

      expect((await get(download_url)).status).toBe(410)
    })

    it('GET menolak tiket milik pengguna lain (410) dan tanpa sesi (401)', async () => {
      const { download_url } = await (await postTicket({ manual_arsip_ids: [MANUAL_K1] })).json()

      mocks.getLocalServerSession.mockResolvedValue(session(OTHER_KETUA_TIM, ['PEGAWAI']))
      expect((await get(download_url)).status).toBe(410)

      mocks.getLocalServerSession.mockResolvedValue(null)
      expect((await get(download_url)).status).toBe(401)
      expect(mocks.streamDocumentZip).not.toHaveBeenCalled()
    })
  })
})
