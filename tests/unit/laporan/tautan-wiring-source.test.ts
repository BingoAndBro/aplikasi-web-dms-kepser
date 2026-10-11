import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readSource(relativePath: string) {
  return readFileSync(relativePath, 'utf8')
}

describe('Bagikan Tautan wiring', () => {
  it('is offered on Laporan Saya, Laporan Kegiatan and Laporan Kinerja with the matching sumber', () => {
    expect(readSource('src/routes/pegawai/laporan/saya.tsx')).toContain('sumber={TAUTAN_SUMBER.LAPORAN_SAYA}')

    const kegiatan = readSource('src/routes/pegawai/laporan/kegiatan.tsx')
    expect(kegiatan).toContain('sumber={TAUTAN_SUMBER.LAPORAN_KEGIATAN}')
    // Sama dengan ekspor ZIP: dokumen alur dan dokumen tambahan KSBU dipisah.
    expect(kegiatan).toContain('dokumenIds={exportDocumentIds}')
    expect(kegiatan).toContain('manualArsipIds={exportManualArsipIds}')

    const view = readSource('src/components/kinerja/MonitoringRealisasiView.tsx')
    expect(view).toContain('sumber={TAUTAN_SUMBER.LAPORAN_KINERJA}')
  })

  it('keeps the shared realisasi view from offering it on PPK/PPSPM Nominal Realisasi', () => {
    const view = readSource('src/components/kinerja/MonitoringRealisasiView.tsx')
    expect(view).toContain("const shareAction = scope === 'laporan_kinerja'")
  })

  it('does not force login on /tautan/ pages (public links), but keeps every other page behind login', () => {
    const layout = readSource('src/components/layout/AppLayout.tsx')

    expect(layout).toContain("pathname.startsWith('/tautan/')")
    expect(layout).toContain('!hasSession && !isLoginPage && !isTautanPage')
    // Pembuka tanpa akun mendapat tampilan polos, bukan sidebar aplikasi.
    expect(layout).toContain('if (!hasSession && isTautanPage)')
  })

  it('sends a logged-out visitor of a login-only tautan through login and back', () => {
    const page = readSource('src/routes/tautan.$token.tsx')

    expect(page).toContain('TAUTAN_LOGIN_REQUIRED_CODE')
    expect(page).toContain('buildLoginHref(ROUTES.LOGIN, window.location.pathname)')
    expect(readSource('src/routes/login.tsx')).toContain("sanitizeLoginNext(searchParams.get('next'))")
  })

  it('adds a per-lampiran "Tautan" button beside Preview/Unduh that opens the file directly in a new tab', () => {
    const page = readSource('src/routes/tautan.$token.tsx')
    const viewer = readSource('src/components/dokumen/StreamedAttachmentViewer.tsx')

    expect(page).toContain('linkHref: lampiran.link_path')
    expect(viewer).toContain('item.linkHref')
    expect(viewer).toContain('target="_blank"')
    expect(viewer).toContain('rel="noopener noreferrer"')
    expect(viewer).toMatch(/Tautan\s*<\/a>/)
  })

  it('makes the login-only access the default and public an explicit, warned choice', () => {
    const dialog = readSource('src/components/laporan/BagikanTautan.tsx')

    expect(dialog).toContain('useState<LaporanTautanAkses>(TAUTAN_AKSES.LOGIN)')
    expect(dialog).toContain('setAkses(TAUTAN_AKSES.LOGIN)') // direset tiap dialog dibuka
    expect(dialog).toContain('tanpa login dan tanpa jejak siapa yang membuka')
  })
})
