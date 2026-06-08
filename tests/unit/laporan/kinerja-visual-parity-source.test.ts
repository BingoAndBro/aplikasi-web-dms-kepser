import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()

function readSource(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

describe('laporan kinerja visual parity source guard', () => {
  it('keeps laporan kinerja function-first with same-route drilldown', () => {
    const source = readSource('src/routes/penanggung-jawab-kinerja/laporan-kinerja.tsx')

    expect(source).toContain("apiFetch<LaporanKinerjaResponse>('/laporan/kinerja')")
    expect(source).toContain('validateSearch')
    expect(source).toContain('fungsiId: z.string().optional()')
    expect(source).toContain('kegiatanId: z.string().optional()')
    expect(source).toContain('buildFungsiRows')
    expect(source).toContain('buildKegiatanRows')
    expect(source).toContain('FungsiList')
    expect(source).toContain('KegiatanList')
    expect(source).toContain('KegiatanDocumentView')
    expect(source).toContain('Route.useSearch()')
    expect(source).toContain('selectFungsi')
    expect(source).toContain('selectKegiatan')
    expect(source).not.toContain('window.history')
  })

  it('keeps required report controls and approved chevron-style actions', () => {
    const source = readSource('src/routes/penanggung-jawab-kinerja/laporan-kinerja.tsx')

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

  it('keeps laporan kinerja metadata-only without document route or file actions', () => {
    const source = readSource('src/routes/penanggung-jawab-kinerja/laporan-kinerja.tsx')

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
    expect(source).not.toContain('Semua Tahun')
    expect(source).not.toContain('detailFilter.tahun')
    expect(source).not.toContain('value.tahun')
    expect(source).not.toContain('yearOptions')
  })

  it('keeps laporan kegiatan column label cleanup', () => {
    const source = readSource('src/routes/pegawai/laporan/kegiatan.tsx')

    expect(source).toContain('Jumlah Dokumen')
    expect(source).not.toContain('<TableHead className={TABLE_HEAD_CLASS}>Dokumen</TableHead>')
  })
})
