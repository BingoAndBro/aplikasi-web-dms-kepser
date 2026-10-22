import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { DRIVE_GALAT_KATEGORI_VALUES } from '#/db/schema/app/drive-job'
import {
  DRIVE_ALASAN_TIDAK_TERSEDIA,
  DRIVE_PERINGATAN_PUBLIK,
  DRIVE_PESAN_GALAT,
  buildDriveFolderName,
} from '#/lib/google-drive/shared'

describe('buildDriveFolderName', () => {
  it('memakai tanggal pembuatan di zona Asia/Jakarta', () => {
    expect(buildDriveFolderName('Laporan Okt', new Date('2026-10-21T20:00:00.000Z'))).toBe('Laporan Okt (2026-10-22)')
    expect(buildDriveFolderName('Laporan Okt', new Date('2026-10-21T16:59:59.000Z'))).toBe('Laporan Okt (2026-10-21)')
  })

  it('menyanitasi karakter / \\ : * ? " < > | dari judul', () => {
    const name = buildDriveFolderName('Rapat 1/2: "Anggaran" <a|b> *?\\', new Date('2026-10-01T00:00:00.000Z'))
    expect(name.replace(/ \(2026-10-01\)$/, '')).not.toMatch(/[/\\:*?"<>|]/)
    expect(name.endsWith(' (2026-10-01)')).toBe(true)
    expect(name.startsWith('Rapat 1-2- -Anggaran-')).toBe(true)
  })

  it('memotong judul menjadi 150 karakter dan memberi nama bawaan bila judul kosong', () => {
    const name = buildDriveFolderName('a'.repeat(400), new Date('2026-10-01T00:00:00.000Z'))
    expect(name).toBe(`${'a'.repeat(150)} (2026-10-01)`)
    expect(buildDriveFolderName('   ', new Date('2026-10-01T00:00:00.000Z'))).toBe('Tautan Laporan (2026-10-01)')
  })
})

describe('teks dan pesan Drive', () => {
  it('memuat tiga alasan tidak tersedia sesuai SPEC 10.1', () => {
    expect(DRIVE_ALASAN_TIDAK_TERSEDIA).toEqual({
      BELUM_DIKONFIGURASI: 'Fitur Google Drive belum dikonfigurasi',
      BELUM_ADA_AKUN: 'Belum ada akun Google Drive terhubung — hubungi Admin',
      PERLU_HUBUNG_ULANG: 'Akun Google Drive perlu dihubungkan ulang — hubungi Admin',
    })
  })

  it('memuat peringatan publik persis SPEC 10.1', () => {
    expect(DRIVE_PERINGATAN_PUBLIK).toBe(
      'Siapa saja yang memegang link Google Drive dapat melihat dan mengunduh dokumen tanpa login. '
      + 'Salinan dihapus dari Drive saat tautan dicabut atau berkas dimusnahkan.',
    )
  })

  it('punya pesan untuk setiap kategori galat', () => {
    expect(Object.keys(DRIVE_PESAN_GALAT).sort()).toEqual([...DRIVE_GALAT_KATEGORI_VALUES].sort())
    expect(DRIVE_PESAN_GALAT.KUOTA_PENUH).toBe('Kuota Google Drive penuh')
    expect(DRIVE_PESAN_GALAT.TIDAK_DITEMUKAN).toBe('Folder di Drive tidak ditemukan — cabut lalu buat tautan baru')
    for (const pesan of Object.values(DRIVE_PESAN_GALAT)) expect(pesan.length).toBeLessThanOrEqual(200)
  })
})

describe('shared.ts aman diimpor klien', () => {
  it('tidak mengimpor modul server dan hanya impor tipe dari skema', () => {
    const source = readFileSync('src/lib/google-drive/shared.ts', 'utf8')
    const imports = [...source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)'/gms)]
    expect(imports.length).toBeGreaterThan(0)
    for (const [statement, typeOnly, path] of imports) {
      expect(path).not.toMatch(/^node:|^#\/db\/client|^#\/lib\/google-drive\/(config|token-crypto|drive-client|jobs)/)
      if (path.startsWith('#/db/')) expect(typeOnly, statement).toBeTruthy()
    }
    expect(source).not.toContain('process.env')
  })
})
