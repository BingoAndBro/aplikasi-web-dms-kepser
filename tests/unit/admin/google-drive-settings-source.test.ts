import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Source guard bagian "Google Drive" di Admin → Pengaturan (SPEC 10.3). Pola sama dengan
// source guard UI lain: repo belum punya renderer DOM untuk komponen dengan efek/fetch.
const source = readFileSync('src/components/admin/GoogleDriveSettings.tsx', 'utf8')
const page = readFileSync('src/routes/admin.settings.tsx', 'utf8')

describe('admin.settings.tsx memasang GoogleDriveSettings', () => {
  it('merender <GoogleDriveSettings /> di luar dialog konfirmasi tema', () => {
    expect(page).toContain("import { GoogleDriveSettings } from '#/components/admin/GoogleDriveSettings'")
    expect(page).toContain('<GoogleDriveSettings />')
    const dialogStart = page.indexOf('<AdminConfirmationDialog')
    expect(page.indexOf('<GoogleDriveSettings />')).toBeLessThan(dialogStart)
  })
})

describe('GoogleDriveSettings', () => {
  it('memuat delapan teks kunci SPEC 10.3', () => {
    for (const teks of [
      'Hubungkan akun Google',
      'Ganti akun',
      'Putuskan',
      'Hubungkan ulang',
      'Putuskan permanen',
      'Tempel alamat dari tab yang gagal dimuat',
      'Perlu dihapus manual di Drive',
      'Coba lagi penghapusan yang gagal',
    ]) {
      expect(source).toContain(teks)
    }
  })

  it('memakai konstanta GOOGLE_DRIVE_API untuk setiap endpoint (tanpa path ajaib)', () => {
    expect(source).toContain('apiFetch<GoogleDriveAdminResponse>(GOOGLE_DRIVE_API.ADMIN)')
    expect(source).toContain('GOOGLE_DRIVE_API.MULAI_HUBUNG')
    expect(source).toContain('GOOGLE_DRIVE_API.HUBUNGKAN')
    expect(source).toContain('GOOGLE_DRIVE_API.putuskan(')
    expect(source).toContain('GOOGLE_DRIVE_API.COBA_LAGI_PENGHAPUSAN')
    expect(source).not.toMatch(/['"`]\/(api\/)?admin\/google-drive/)
  })

  it('langkah 1 membuka halaman login Google di tab baru dengan noopener', () => {
    expect(source).toContain('Buka halaman login Google')
    expect(source).toContain("window.open(auth_url, '_blank', 'noopener,noreferrer')")
    expect(source).toContain('http://127.0.0.1:53682')
  })

  it('mengirim mode yang benar untuk Hubungkan, Ganti, dan Hubungkan ulang', () => {
    expect(source).toContain("mode: 'HUBUNGKAN'")
    expect(source).toContain("mode: 'GANTI'")
    expect(source).toContain("mode: 'HUBUNGKAN_ULANG', akunId: akun.id")
    expect(source).toContain('akun_id: panel.akunId')
  })

  it('putuskan wajib konfirmasi dan menyebut jumlah tautan aktif', () => {
    expect(source).toContain('body: { konfirmasi: true }')
    expect(source).toContain('jumlah_tautan_aktif')
    expect(source).toContain('harus dihapus manual di Google Drive')
  })

  it('tanpa konfigurasi menampilkan nama tiga variabel env saja', () => {
    for (const nama of ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'DMS_DRIVE_TOKEN_KEY']) {
      expect(source).toContain(nama)
    }
    expect(source).toContain('!data.dikonfigurasi')
  })

  it('tidak memanggil logout maupun endpoint settings (aksi Drive tidak memaksa keluar)', () => {
    expect(source).not.toContain('/auth/logout')
    expect(source).not.toContain('/settings/')
    expect(source).not.toContain('ROUTES.LOGIN')
  })

  it('tidak merender nama file, daftar dokumen, token, atau ID file Drive', () => {
    expect(source).not.toMatch(/nama_file|namaFile|dokumen_id|drive_file_id|drive_folder_id|refresh_token|refreshToken|client_secret|clientSecret|token_enc|access_token/)
    expect(source).toContain('item.judul_tautan')
    expect(source).toContain('item.nama_folder')
    expect(source).toContain('item.email_akun')
    expect(source).toContain('DRIVE_PESAN_GALAT[item.kategori]')
  })

  it('HAPUS_TAUTAN (jumlah_file null) ditampilkan sebagai seluruh folder', () => {
    expect(source).toContain('item.jumlah_file === null')
    expect(source).toContain('Seluruh folder')
  })

  it('memakai LoadingState saat memuat dan tombol muat ulang saat galat', () => {
    expect(source).toContain('<LoadingState')
    expect(source).toContain('Muat ulang')
  })
})
