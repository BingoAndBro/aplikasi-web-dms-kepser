import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DriveRiwayatStatus } from '#/components/laporan/BagikanTautan'

import { DRIVE_ALASAN_TIDAK_TERSEDIA, DRIVE_PERINGATAN_PUBLIK } from '#/lib/google-drive/shared'
import type { TautanListItem } from '#/lib/laporan/tautan-shared'

// Source guard UI Google Drive di dialog Bagikan Tautan + Riwayat Tautan (SPEC 10.1–10.2).
// Repo belum punya renderer DOM untuk komponen ini; pola sama dengan tautan-wiring-source.test.ts.
const source = readFileSync('src/components/laporan/BagikanTautan.tsx', 'utf8')

describe('Dialog Bagikan Tautan — pilihan Google Drive', () => {
  it('menampilkan tiga pilihan akses dalam sm:grid-cols-3 dengan kartu Google Drive', () => {
    expect(source).toContain('role="radiogroup"')
    expect(source).toContain('sm:grid-cols-3')
    expect(source).not.toContain('sm:grid-cols-2')
    expect(source).toContain('onSelect={() => setAkses(TAUTAN_AKSES.DRIVE)}')
    expect(source).toContain('title="Google Drive"')
    expect(source).toContain('Bisa dibuka dari internet lewat link Google Drive')
  })

  it('memakai konstanta peringatan Drive (teks persis SPEC 10.1)', () => {
    expect(DRIVE_PERINGATAN_PUBLIK).toBe(
      'Siapa saja yang memegang link Google Drive dapat melihat dan mengunduh dokumen tanpa login. '
      + 'Salinan dihapus dari Drive saat tautan dicabut atau berkas dimusnahkan.',
    )
    expect(source).toContain('{DRIVE_PERINGATAN_PUBLIK}')
    expect(source).toContain('akses === TAUTAN_AKSES.DRIVE && (')
  })

  it('memuat status Drive dari GOOGLE_DRIVE_API.STATUS dan memakai pesan alasan bersama', () => {
    expect(source).toContain('apiFetch<GoogleDriveStatusResponse>(GOOGLE_DRIVE_API.STATUS)')
    expect(source).toContain('DRIVE_ALASAN_TIDAK_TERSEDIA[')
    expect(source).toContain('Status Google Drive tidak dapat dimuat')
    // Tiga alasan SPEC 10.1 datang dari konstanta bersama, bukan ditulis ulang di komponen.
    expect(Object.keys(DRIVE_ALASAN_TIDAK_TERSEDIA).sort()).toEqual(['BELUM_ADA_AKUN', 'BELUM_DIKONFIGURASI', 'PERLU_HUBUNG_ULANG'])
    for (const pesan of Object.values(DRIVE_ALASAN_TIDAK_TERSEDIA)) {
      expect(source).not.toContain(pesan)
    }
  })

  it('menonaktifkan kartu Drive (aria-disabled + disabled) bila tidak tersedia', () => {
    expect(source).toContain('aria-disabled={disabled}')
    expect(source).toContain('disabled={disabled}')
    expect(source).toContain('disabled={!driveTersedia}')
    expect(source).toContain('hint={driveHint}')
  })

  it('mengembalikan akses ke Terbatas setiap kali dialog dibuka', () => {
    expect(source).toContain('useState<LaporanTautanAkses>(TAUTAN_AKSES.LOGIN)')
    expect(source).toContain('setAkses(TAUTAN_AKSES.LOGIN)')
  })

  it('memakai kode alasan pada 409 untuk menandai kartu Drive tidak tersedia', () => {
    expect(source).toContain('err.status !== 409')
    expect(source).toContain("'kode' in payload")
    expect(source).toContain('Object.hasOwn(DRIVE_ALASAN_TIDAK_TERSEDIA, payload.kode)')
  })

  it('menampilkan progres unggah dan polling 3000 ms yang dibersihkan', () => {
    expect(source).toContain('Sedang diunggah ke Google Drive (')
    expect(source).toContain('DRIVE_POLL_DIALOG_MS = 3000')
    expect(source).toContain('setTimeout(')
    expect(source).toContain('clearTimeout(')
    expect(source).toContain('Unggahan tetap berjalan bila dialog ditutup')
  })

  it('SIAP memakai label tombol Drive, GAGAL dan tertunda akun punya teks sendiri', () => {
    expect(source).toContain('copyLabel="Salin link Drive"')
    expect(source).toContain('openLabel="Buka di Drive"')
    expect(source).toContain('Lihat Riwayat Tautan untuk mencoba lagi')
    expect(source).toContain('Tertunda: akun Drive perlu dihubungkan ulang')
  })
})

describe('Riwayat Tautan — status Google Drive', () => {
  it('memuat semua teks status SPEC 10.2', () => {
    for (const teks of [
      'Mengunggah ',
      'Google Drive · Siap',
      'Gagal: ',
      'Coba lagi',
      'Salin link Drive',
      'Buka di Drive',
      'Tertunda: akun Drive perlu dihubungkan ulang',
      'Dicabut · menghapus dari Drive…',
      'Dicabut · terhapus dari Drive',
    ]) {
      expect(source).toContain(teks)
    }
  })

  it('coba lagi memanggil TAUTAN_API.cobaLagi lalu memuat ulang daftar', () => {
    expect(source).toContain('apiMutation(TAUTAN_API.cobaLagi(item.id))')
    expect(source).toMatch(/cobaLagi\(item\.id\)\)[\s\S]{0,800}await reload\(\)/)
  })

  it('konfirmasi cabut untuk DRIVE menyebut penghapusan salinan di Drive', () => {
    expect(source).toContain('Salinan di Google Drive akan dihapus permanen.')
  })

  it('polling 5000 ms hanya selama ada baris berproses, dan timer dibersihkan', () => {
    expect(source).toContain('RIWAYAT_POLL_MS = 5000')
    expect(source).toMatch(/MENUNGGU[\s\S]{0,80}MENGUNGGAH[\s\S]{0,80}MENGHAPUS/)
    expect(source).toContain('const reload = useCallback(')
  })

  it('tidak menampilkan path DMS maupun hitungan dibuka untuk tautan DRIVE', () => {
    expect(source).toContain('const isDrive = item.akses === TAUTAN_AKSES.DRIVE')
    expect(source).toContain('!isDrive && item.path')
    expect(source).toMatch(/isDrive \? '' : ` · dibuka \$\{item\.jumlah_akses\}×`/)
  })

  it('badge Google Drive memakai token tema info (tanpa warna arbitrary baru)', () => {
    expect(source).toContain('border-info-border bg-info-surface')
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('TautanUrlField menerima label tombol dan aria-label opsional', () => {
    expect(source).toMatch(/copyLabel = 'Salin'/)
    expect(source).toMatch(/openLabel = 'Buka'/)
    expect(source).toMatch(/ariaLabel = 'Alamat tautan'/)
  })
})

describe('DriveRiwayatStatus — render per status', () => {
  const base: TautanListItem = {
    id: '00000000-0000-4000-8000-000000000001',
    sumber: 'LAPORAN_SAYA',
    akses: 'DRIVE',
    judul: 'Tautan uji',
    keterangan: null,
    path: null,
    jumlah_dokumen: 3,
    jumlah_akses: 0,
    created_at: '2026-10-22T01:00:00.000Z',
    last_accessed_at: null,
    revoked_at: null,
    drive_status: 'MENGUNGGAH',
    drive_progres: { selesai: 12, total: 40 },
    drive_url: null,
    drive_galat: null,
    drive_tertunda_akun: false,
  }
  const render = (patch: Partial<TautanListItem>) => renderToStaticMarkup(createElement(DriveRiwayatStatus, { item: { ...base, ...patch } }))

  it('menampilkan teks yang benar untuk setiap status', () => {
    expect(render({})).toContain('Mengunggah 12/40')
    expect(render({ drive_status: 'MENUNGGU', drive_progres: null })).toContain('Mengunggah…')
    expect(render({ drive_status: 'SIAP', drive_url: 'https://drive.google.com/drive/folders/x' })).toContain('Google Drive · Siap')
    expect(render({ drive_status: 'GAGAL', drive_galat: 'Kuota Google Drive penuh' })).toContain('Gagal: Kuota Google Drive penuh')
    expect(render({ drive_tertunda_akun: true })).toContain('Tertunda: akun Drive perlu dihubungkan ulang')
    const dicabut = { revoked_at: '2026-10-22T02:00:00.000Z' }
    expect(render({ ...dicabut, drive_status: 'MENGHAPUS' })).toContain('Dicabut · menghapus dari Drive…')
    expect(render({ ...dicabut, drive_status: 'DIHAPUS' })).toContain('Dicabut · terhapus dari Drive')
  })

  it('tidak pernah merender URL (path DMS maupun link Drive)', () => {
    const html = render({ drive_status: 'SIAP', drive_url: 'https://drive.google.com/drive/folders/rahasia', path: '/tautan/abc' })
    expect(html).not.toContain('drive.google.com')
    expect(html).not.toContain('/tautan/')
  })
})
