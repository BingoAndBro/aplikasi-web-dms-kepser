import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  LAPORAN_STATUS_FILTER_OPTIONS,
  laporanStatusLabel,
  matchesLaporanStatus,
} from '#/lib/laporan/status-laporan'

// D-30: di halaman laporan status final ditampilkan sebagai jenis dokumen,
// dan ketiga halaman laporan punya filter Status (Material / Non-Material).

describe('status-laporan', () => {
  it('labels COMPLETED as Material and TERSIMPAN as Non-Material', () => {
    expect(laporanStatusLabel('COMPLETED')).toBe('Material')
    expect(laporanStatusLabel('TERSIMPAN')).toBe('Non-Material')
    expect(LAPORAN_STATUS_FILTER_OPTIONS).toEqual([
      { id: 'COMPLETED', nama: 'Material' },
      { id: 'TERSIMPAN', nama: 'Non-Material' },
    ])
  })

  it('matches every status when no filter is chosen, otherwise only the chosen one', () => {
    expect(matchesLaporanStatus('COMPLETED', undefined)).toBe(true)
    expect(matchesLaporanStatus('TERSIMPAN', undefined)).toBe(true)
    expect(matchesLaporanStatus('COMPLETED', 'COMPLETED')).toBe(true)
    expect(matchesLaporanStatus('TERSIMPAN', 'COMPLETED')).toBe(false)
    expect(matchesLaporanStatus('COMPLETED', 'TERSIMPAN')).toBe(false)
  })
})

describe('report pages wire the Status filter and Material/Non-Material labels', () => {
  it.each([
    'src/routes/pegawai/laporan/saya.tsx',
    'src/routes/pegawai/laporan/kegiatan.tsx',
  ])('%s filters by status and relabels its badge', (path) => {
    const source = readFileSync(path, 'utf8')

    expect(source).toContain('matchesLaporanStatus(d.status, statusFilter)')
    expect(source).toContain('options={[...LAPORAN_STATUS_FILTER_OPTIONS]}')
    expect(source).toContain("label: laporanStatusLabel('COMPLETED')")
    expect(source).toContain("label: laporanStatusLabel('TERSIMPAN')")
    expect(source).not.toContain("label: 'Selesai'")
    expect(source).not.toContain("label: 'Tersimpan'")
  })

  it('Laporan Kegiatan shows the Status filter on both the kegiatan list and the kegiatan detail', () => {
    const source = readFileSync('src/routes/pegawai/laporan/kegiatan.tsx', 'utf8')

    expect(source.match(/<LaporanStatusFilterField value=\{statusFilter\} onChange=\{onStatusFilterChange\} \/>/g)).toHaveLength(2)
  })

  it('Laporan Kinerja stops at Kegiatan, relabels status, and shows the File Dibersihkan badge', () => {
    const source = readFileSync('src/components/kinerja/MonitoringRealisasiView.tsx', 'utf8')

    expect(source).toContain("const stopAtKegiatan = scope === 'laporan_kinerja'")
    expect(source).toMatch(/selectedKegiatan && !stopAtKegiatan && !selectedKomponen && \(\r?\n\s*<KomponenDetailView/)
    expect(source).toContain('const STATUS_FILTER_OPTIONS = [...LAPORAN_STATUS_FILTER_OPTIONS]')
    expect(source).toContain('<ReportStatusBadge status={row.status} />')
    expect(source).not.toContain('<StatusBadge status={row.status} />')
    expect(source.match(/lampiranDibersihkanAlasan=\{row\.lampiran_dibersihkan_alasan\}/g)).toHaveLength(2)
  })
})
