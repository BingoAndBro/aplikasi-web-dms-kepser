import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()

function readSource(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

const SHARED_VIEW = 'src/components/kinerja/MonitoringRealisasiView.tsx'
const PERIODE_SELECTOR = 'src/components/laporan/PeriodeSelector.tsx'
const KINERJA_ROUTE = 'src/routes/penanggung-jawab-kinerja/laporan-kinerja.tsx'
const MONITORING_ROUTES = [
  'src/routes/ppk/monitoring-realisasi.tsx',
  'src/routes/ppspm/monitoring-realisasi.tsx',
]

describe('laporan kinerja visual parity source guard', () => {
  it('keeps laporan kinerja function-first with same-route drilldown', () => {
    const route = readSource(KINERJA_ROUTE)
    const view = readSource(SHARED_VIEW)

    // The thin route wrapper still owns the route contract.
    expect(route).toContain('validateSearch')
    expect(route).toContain('fungsiId: z.string().optional()')
    expect(route).toContain('kegiatanId: z.string().optional()')
    expect(route).toContain('Route.useSearch()')
    expect(route).toContain('MonitoringRealisasiView')

    // The shared view owns the function-first drilldown implementation.
    expect(view).toContain("apiFetch<LaporanKinerjaResponse>('/laporan/kinerja'")
    expect(view).toContain('buildFungsiRows')
    expect(view).toContain('buildKegiatanRows')
    expect(view).toContain('FungsiList')
    expect(view).toContain('KegiatanList')
    expect(view).toContain('KegiatanDocumentView')
    expect(view).toContain('onSelectFungsi')
    expect(view).toContain('onSelectKegiatan')
    expect(view).not.toContain('window.history')
  })

  it('keeps required report controls and approved chevron-style actions', () => {
    const source = readSource(SHARED_VIEW)

    expect(source).toContain('Terakhir diperbarui')
    expect(source).toContain('Nominal terbesar')
    expect(source).toContain('Dokumen terbanyak')
    expect(source).toContain('Nama A-Z')
    // Toolbar bersama; filter dokumen (pembuat & status) langsung di baris toolbar.
    expect(source).toContain('<FilterToolbar')
    expect(source).toContain('<PembuatFilterSelect')
    expect(source).toContain('label="Status"')
    // Rentang tanggal Kustom ada di PeriodeSelector bersama.
    expect(readSource(PERIODE_SELECTOR)).toContain('Mulai Dari Tanggal')
    expect(readSource(PERIODE_SELECTOR)).toContain('Sampai Tanggal')
    expect(source).toContain('rounded-[26px] border border-zinc-200/80 bg-bg-surface')
    expect(source).toContain('ChevronActionButton')
    expect(source).toContain('FungsiDetailCards')
    expect(source).toContain('Nama Fungsi')
    expect(source).toContain('Jumlah Kegiatan')
    expect(source).toContain('Total Dokumen Final')
    expect(source).toContain('<DokumenDetailDialog')
    expect(source).toContain('<ManualArsipDetailDialog')
    // D-27: catatan cakupan di header mengikuti scope, bukan teks material-only lama.
    expect(source).toContain("scope === 'laporan_kinerja' ? LAPORAN_KINERJA_SCOPE_NOTE : MONITORING_SCOPE_NOTE")
    expect(source).not.toContain('Hanya dokumen material berstatus Selesai')
  })

  it('keeps the periode selector and the komponen drilldown level', () => {
    const source = readSource(SHARED_VIEW)
    const periodeSelector = readSource(PERIODE_SELECTOR)

    expect(source).toContain('PeriodeSelector')
    expect(source).toContain('KomponenList')
    expect(source).toContain('KomponenDetailView')
    expect(source).toContain('onSelectKomponen')
    expect(source).toContain('Seluruh Periode')
    expect(periodeSelector).toContain("label: 'Bulanan'")
    expect(periodeSelector).toContain("label: 'Triwulan'")
    expect(periodeSelector).toContain("label: 'Seluruh Periode'")
    expect(source).toContain('Jumlah Komponen')
  })

  // Lampiran dibuka lewat dialog detail bersama (DokumenDetailDialog untuk
  // dokumen alur, ManualArsipDetailDialog untuk dokumen manual KSBU) — bukan
  // lewat link ke halaman dokumen pegawai atau URL file mentah di view ini.
  it('opens realisasi documents through the shared detail dialogs, never a raw route or file URL', () => {
    for (const relativePath of [SHARED_VIEW, KINERJA_ROUTE, ...MONITORING_ROUTES]) {
      const source = readSource(relativePath)

      expect(source).not.toContain('to="/pegawai/dokumen/$id"')
      expect(source).not.toContain('/pegawai/dokumen/$id')
      expect(source).not.toContain('buildBerkasItemAttachmentFileUrl')
      expect(source).not.toContain('href={')
      expect(source).not.toContain('signed')
      expect(source).not.toContain('token')
      expect(source).not.toContain('approve_destruction')
    }

    const view = readSource(SHARED_VIEW)
    expect(view).toContain("selectedDocument?.sumber === 'WORKFLOW'")
    expect(view).toContain("selectedDocument?.sumber === 'MANUAL'")
  })

  it('serves manual KSBU lampiran through the read-only laporan endpoint', () => {
    const dialog = readSource('src/components/arsip/ManualArsipDetailDialog.tsx')

    expect(dialog).toContain("'/api/laporan/manual-arsip'")
    expect(dialog).toContain('`/laporan/manual-arsip/${encodeURIComponent(dokumenId)}`')
    expect(dialog).not.toContain('/api/kasubag/')
    expect(dialog).toContain('<ManualArsipAttachmentViewer')
  })

  it('renders manual KSBU lampiran with the same item and action styling as AttachmentViewer', () => {
    const viewer = readSource('src/components/arsip/ManualArsipAttachmentViewer.tsx')
    const workflowViewer = readSource('src/components/dokumen/AttachmentViewer.tsx')

    for (const snippet of [
      "'h-8 rounded-xl border border-zinc-200/70 bg-bg-surface px-2.5'",
      'flex min-h-16 items-center gap-3 rounded-2xl border border-brand-border bg-bg-surface px-4 py-3',
      'Mode pratinjau dokumen',
    ]) {
      expect(workflowViewer).toContain(snippet)
      expect(viewer).toContain(snippet)
    }
    expect(viewer).toContain('Unduh')
  })

  it('wires the PPK and PPSPM monitoring pages to the shared realisasi view', () => {
    for (const relativePath of MONITORING_ROUTES) {
      const source = readSource(relativePath)

      expect(source).toContain('MonitoringRealisasiView')
      expect(source).toContain('validateSearch')
      expect(source).toContain('Route.useSearch()')
      expect(source).toContain('Monitoring Nominal Realisasi')
    }
  })

  it('keeps laporan kegiatan column label cleanup', () => {
    const source = readSource('src/routes/pegawai/laporan/kegiatan.tsx')

    expect(source).toContain('Jumlah Dokumen')
    expect(source).not.toContain('<TableHead className={TABLE_HEAD_CLASS}>Dokumen</TableHead>')
  })

  // T-5 / D-26: manual KSBU documents must be visibly labelled, not blended
  // in silently with documents that went through PPK/PPSPM approval.
  it('labels manual KSBU documents distinctly in the shared realisasi view', () => {
    const source = readSource(SHARED_VIEW)

    expect(source).toContain("row.sumber === 'MANUAL'")
    expect(source).toContain('Penambahan Dokumen (KSBU)')
    expect(readSource('src/components/arsip/ManualArsipDetailDialog.tsx'))
      .toContain('label="Sumber" value="Penambahan Dokumen (KSBU)"')
  })
})
