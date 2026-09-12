import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()

function readSource(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

const SHARED_VIEW = 'src/components/kinerja/MonitoringRealisasiView.tsx'
const KINERJA_ROUTE = 'src/routes/penanggung-jawab-kinerja/laporan-kinerja.tsx'
const MONITORING_ROUTES = [
  'src/routes/ppk/monitoring-realisasi.tsx',
  'src/routes/bendahara/monitoring-realisasi.tsx',
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
    expect(source).toContain('Filter Lanjutan')
    expect(source).toContain('Mulai Dari Tanggal')
    expect(source).toContain('Sampai Tanggal')
    expect(source).toContain('rounded-[26px] border border-zinc-200/80 bg-[#FFFDF9]')
    expect(source).toContain('ChevronActionButton')
    expect(source).toContain('FungsiDetailCards')
    expect(source).toContain('Nama Fungsi')
    expect(source).toContain('Jumlah Kegiatan')
    expect(source).toContain('Total Dokumen Final')
    expect(source).toContain('Detail Metadata Dokumen')
    expect(source).toContain('KinerjaDocumentMetadataDialog')
  })

  it('keeps the periode selector and the komponen drilldown level', () => {
    const source = readSource(SHARED_VIEW)

    expect(source).toContain('PeriodeSelector')
    expect(source).toContain('KomponenList')
    expect(source).toContain('KomponenDetailView')
    expect(source).toContain('onSelectKomponen')
    expect(source).toContain('Triwulan')
    expect(source).toContain('Seluruh Periode')
    expect(source).toContain('Jumlah Komponen')
  })

  it('keeps realisasi monitoring metadata-only without document route or file actions', () => {
    for (const relativePath of [SHARED_VIEW, KINERJA_ROUTE, ...MONITORING_ROUTES]) {
      const source = readSource(relativePath)

      expect(source).not.toContain('to="/pegawai/dokumen/$id"')
      expect(source).not.toContain('/pegawai/dokumen/$id')
      expect(source).not.toContain('AttachmentViewer')
      expect(source).not.toContain('buildBerkasItemAttachmentFileUrl')
      expect(source).not.toContain('href={')
      expect(source).not.toContain('download')
      expect(source).not.toContain('preview')
      expect(source).not.toContain('lampiran')
      expect(source).not.toContain('signed')
      expect(source).not.toContain('token')
      expect(source).not.toContain('approve_destruction')
    }
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
})
