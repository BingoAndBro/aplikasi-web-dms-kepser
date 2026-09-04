import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = process.cwd()

function readSource(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

describe('role dashboard visual parity source guard', () => {
  it('keeps shared dashboard primitives aligned with prototype structure', () => {
    const source = readSource('src/components/dashboard/RoleDashboardPrimitives.tsx')

    expect(source).toContain('RoleDashboardHeader')
    expect(source).toContain('DashboardMetricCard')
    expect(source).toContain('DashboardSection')
    expect(source).toContain('DashboardActionRow')
    expect(source).toContain('DashboardQuickActions')
    expect(source).toContain('Aksi Cepat')
    expect(source).toContain('badge?: ReactNode')
    expect(source).toContain('nativeButton={false}')
    expect(source).toContain('render={<a href={actionHref} />}')
    expect(source).toContain('hover:-translate-y-2')
    expect(source).toContain('hover:scale-[1.018]')
    expect(source).toContain('group-hover:scale-110')
    expect(source).toContain('group-hover:rotate-[-4deg]')
    expect(source).toContain('toneClass.glow')
    expect(source).not.toContain('Rekan Aktif')
  })

  it('keeps Pegawai dashboard revision-focused and quick-action based', () => {
    const source = readSource('src/routes/pegawai.tsx')

    expect(source).toContain("apiFetch<{ dokumen?: PegawaiDashboardDocument[] }>('/dokumen')")
    expect(source).toContain('Dokumen Diajukan')
    expect(source).toContain('badge="Aktif"')
    expect(source).toContain('Perlu Revisi')
    expect(source).toContain('Dokumen Selesai')
    expect(source).toContain('Dokumen Tersimpan')
    expect(source).toContain('Perlu Tindakan')
    expect(source).toContain('Selesai')
    expect(source).toContain('Tersimpan')
    expect(source).toContain('Perlu Tindakan')
    expect(source).toContain('DashboardQuickActions')
    expect(source).not.toContain('Segera')
    expect(source).not.toContain('Draf/Berkas')
    expect(source).not.toContain('Rekan Aktif')
  })

  it('keeps PPK and PPSPM dashboards using existing workflow APIs for pending nominal', () => {
    const ppkSource = readSource('src/routes/ppk/index.tsx')
    const ppspmSource = readSource('src/routes/bendahara/index.tsx')

    expect(ppkSource).toContain("apiFetch<{ dokumen?: WorkflowDashboardItem[] }>('/ppk/inbox')")
    expect(ppkSource).toContain('Menunggu Validasi')
    expect(ppkSource).toContain('Sudah Divalidasi')
    expect(ppkSource).toContain('Dikembalikan untuk Revisi')
    expect(ppkSource).toContain('Total Nominal Menunggu')
    expect(ppkSource).toContain('badge="Nominal"')
    expect(ppkSource).toContain('valueClassName="font-mono text-zinc-950"')
    expect(ppkSource).toContain('formatPendingNominal(waiting)')
    expect(ppkSource).toContain("apiFetch<WorkflowDetailResponse>(`/ppk/dokumen/${item.id}`)")
    expect(ppkSource).toContain("return 'Rp 0'")
    expect(ppkSource).toContain('Perlu Tindakan')
    expect(ppkSource).toContain('DashboardQuickActions')
    expect(ppkSource).not.toContain('Bulan Ini')
    expect(ppkSource).not.toContain('Estimasi')
    expect(ppkSource).not.toContain('value="-"')

    expect(ppspmSource).toContain("apiFetch<{ dokumen?: WorkflowDashboardItem[] }>('/bendahara/inbox')")
    expect(ppspmSource).toContain('Dashboard PPSPM')
    expect(ppspmSource).toContain('Menunggu Persetujuan')
    expect(ppspmSource).toContain('Disetujui')
    expect(ppspmSource).toContain('Dikembalikan')
    expect(ppspmSource).toContain('Total Nominal Menunggu')
    expect(ppspmSource).toContain('badge="Nominal"')
    expect(ppspmSource).toContain('valueClassName="font-mono text-zinc-950"')
    expect(ppspmSource).toContain('formatPendingNominal(waiting)')
    expect(ppspmSource).toContain("apiFetch<WorkflowDetailResponse>(`/bendahara/dokumen/${item.id}`)")
    expect(ppspmSource).toContain('DashboardQuickActions')
    expect(ppspmSource).not.toContain('Prioritas')
    expect(ppspmSource).not.toContain('Estimasi')
    expect(ppspmSource).not.toContain('value="-"')
    expect(ppspmSource).not.toContain('Dashboard Bendahara')
  })

  it('keeps Kepala Sub Bagian Umum dashboard folder-first and action-list based', () => {
    const source = readSource('src/routes/arsiparis/index.tsx')

    expect(source).toContain('Dashboard Kepala Sub Bagian Umum')
    expect(source).toContain('Siap Diklasifikasikan')
    expect(source).toContain('Berkas Terbuka')
    expect(source).toContain('Berkas Tertutup')
    expect(source).toContain('Usul Pembersihan')
    // RP-01 de-arsip: kartu "Arsip Inaktif" dihapus; "Usul Musnah" -> "Usul Pembersihan".
    expect(source).not.toContain('Arsip Inaktif')
    expect(source).not.toContain('Usul Musnah')
    expect(source).toContain('Perlu Tindakan Kearsipan')
    expect(source).toContain('Daftar Dokumen Terbaru')
    expect(source).toContain("query: { status_berkas: 'OPEN' }")
    expect(source).toContain("query: { status_berkas: 'CLOSED', status_arsip: 'AKTIF' }")
    expect(source).toContain("query: { status_berkas: 'CLOSED', status_arsip: 'USUL_MUSNAH' }")
    expect(source).not.toContain("status_arsip: 'INAKTIF'")
    expect(source).not.toContain('label="Siap Diklasifikasikan"')
    expect(source).not.toContain('/arsiparis/aktif')
  })

  it('keeps Penanggung Jawab Kinerja dashboard metadata-only', () => {
    const source = readSource('src/routes/penanggung-jawab-kinerja/index.tsx')

    expect(source).toContain("apiFetch<LaporanKinerjaResponse>('/laporan/kinerja')")
    expect(source).toContain('Dashboard Penanggung Jawab Kinerja')
    expect(source).toContain('Total Dokumen Final')
    expect(source).toContain('Total Nominal Realisasi')
    expect(source).toContain('badge="Final"')
    expect(source).toContain('badge="Realisasi"')
    expect(source).toContain('badge="Diarsipkan"')
    expect(source).toContain('valueClassName="font-mono text-zinc-950"')
    expect(source).toContain('Dokumen Final Terbaru')
    expect(source).toContain('DashboardQuickActions')
    expect(source).not.toContain('Verified')
    expect(source).not.toContain('Terhitung')
    expect(source).not.toContain('redirect')
    expect(source).not.toContain('download')
    expect(source).not.toContain('preview')
    expect(source).not.toContain('lampiran')
  })

  it('keeps Admin dashboard local to configuration data and defers Activity Log', () => {
    const source = readSource('src/routes/admin.index.tsx')
    const navigation = readSource('src/config/navigation.ts')

    expect(source).toContain('Dashboard Admin Sistem')
    expect(source).toContain('Total User')
    expect(source).toContain('User Aktif')
    expect(source).toContain('Role Terpakai')
    expect(source).toContain('Total Kegiatan')
    expect(source).toContain('badge="Terdaftar"')
    expect(source).toContain('badge="Aktif"')
    expect(source).toContain('badge="Akses"')
    expect(source).toContain('badge="Konfigurasi"')
    expect(source).toContain('Aktivitas Admin Terbaru')
    expect(source).toContain('Activity Log global tetap belum diimplementasikan')
    expect(source).toContain('DashboardQuickActions')
    expect(source).not.toContain('/activity')
    expect(navigation).toContain("{ id: 'history', label: 'Activity Log', icon: History }")
  })

  it('keeps dashboard badge labels semantic and avoids confusing prototype placeholders', () => {
    const dashboardSources = [
      readSource('src/routes/pegawai.tsx'),
      readSource('src/routes/ppk/index.tsx'),
      readSource('src/routes/bendahara/index.tsx'),
      readSource('src/routes/arsiparis/index.tsx'),
      readSource('src/routes/penanggung-jawab-kinerja/index.tsx'),
      readSource('src/routes/admin.index.tsx'),
    ].join('\n')

    for (const confusingLabel of ['Segera', 'Bulan Ini', 'Draf/Berkas', 'Estimasi', 'Prioritas', 'Proses', 'Verified', 'Terhitung', 'Belum Arsip']) {
      expect(dashboardSources).not.toContain(confusingLabel)
    }
  })
})
