import { describe, expect, it } from 'vitest'

import { buildDriveDaftarIsiText, type DriveDaftarIsiFile } from '#/lib/google-drive/daftar-isi'

const DOC_A = '33333333-3333-4333-8333-333333333333'

function file(overrides: Partial<DriveDaftarIsiFile>): DriveDaftarIsiFile {
  return { labelDokumen: 'Dok A', namaFile: 'a.pdf', urutan: 0, status: 'TERUNGGAH', keteranganHapus: null, ...overrides }
}

const base = {
  judul: 'Bukti Dukung Q3',
  sumberLabel: 'Laporan Kegiatan',
  dibagikanOleh: 'Budi Santoso',
  diperbaruiPada: new Date('2026-10-22T03:05:00.000Z'),
}

describe('buildDriveDaftarIsiText', () => {
  it('judul, meta (WIB), dokumen dikelompokkan per label urut `urutan`, dan dokumen tanpa lampiran', () => {
    const text = buildDriveDaftarIsiText({
      ...base,
      files: [
        file({ labelDokumen: 'Dok B', namaFile: 'b1.pdf', urutan: 2 }),
        file({ labelDokumen: 'Dok A', namaFile: 'a2.pdf', urutan: 1 }),
        file({ labelDokumen: 'Dok A', namaFile: 'a1.pdf', urutan: 0 }),
      ],
      dilewati: [{ label: 'Dok C', alasan: 'tanpa lampiran tersedia' }],
    })

    expect(text).toBe([
      'DAFTAR ISI TAUTAN GOOGLE DRIVE',
      'Judul: Bukti Dukung Q3',
      'Sumber: Laporan Kegiatan',
      'Dibagikan oleh: Budi Santoso',
      'Diperbarui: 2026-10-22 10:05 WIB',
      '',
      'Dokumen (2):',
      '',
      'Dok A',
      '- a1.pdf',
      '- a2.pdf',
      '',
      'Dok B',
      '- b1.pdf',
      '',
      'Dokumen tanpa lampiran tersedia (1):',
      '- Dok C - tanpa lampiran tersedia',
      '',
    ].join('\n'))
  })

  it('menandai tidak tersedia, dimusnahkan, dibersihkan, dan dihapus pemiliknya', () => {
    const text = buildDriveDaftarIsiText({
      ...base,
      files: [
        file({ namaFile: 'ada.pdf', urutan: 0 }),
        file({ namaFile: 'hilang.pdf', urutan: 1, status: 'DILEWATI' }),
        file({ namaFile: 'musnah.pdf', urutan: 2, status: 'DIHAPUS', keteranganHapus: 'DIMUSNAHKAN' }),
        file({ namaFile: 'musnah-proses.pdf', urutan: 3, status: 'MENGHAPUS', keteranganHapus: 'DIMUSNAHKAN' }),
        file({ namaFile: 'bersih.pdf', urutan: 4, status: 'DILEWATI', keteranganHapus: 'DIBERSIHKAN' }),
        file({ namaFile: 'pemilik.pdf', urutan: 5, status: 'DIHAPUS', keteranganHapus: 'DIHAPUS_PEMILIK' }),
        file({ namaFile: 'belum.pdf', urutan: 6, status: 'MENUNGGU' }),
      ],
      dilewati: [],
    })

    expect(text).toContain('- ada.pdf\n')
    expect(text).toContain('- hilang.pdf (tidak tersedia)\n')
    expect(text).toContain('- musnah.pdf (telah dimusnahkan)\n')
    expect(text).toContain('- musnah-proses.pdf (telah dimusnahkan)\n')
    expect(text).toContain('- bersih.pdf (telah dibersihkan)\n')
    expect(text).toContain('- pemilik.pdf (telah dihapus pemiliknya)\n')
    expect(text).toContain('- belum.pdf (tidak tersedia)\n')
    expect(text).toContain('Dokumen tanpa lampiran tersedia (0):\n(tidak ada)\n')
  })

  it('tanpa file sama sekali -> "(tidak ada)" di bagian dokumen', () => {
    const text = buildDriveDaftarIsiText({ ...base, files: [], dilewati: [{ label: 'X', alasan: 'y' }] })
    expect(text).toContain('Dokumen (0):\n(tidak ada)\n')
  })

  it('teks bebas dibersihkan dari baris baru dan karakter kontrol; tidak memuat path, id, atau token', () => {
    const text = buildDriveDaftarIsiText({
      ...base,
      judul: 'Judul\r\nSUMBER: palsu\u0007',
      dibagikanOleh: null,
      files: [file({ labelDokumen: `2026-10-01_Rapat_${DOC_A.slice(0, 8)}`, namaFile: 'a.pdf' })],
      dilewati: [],
    })
    expect(text).toContain('Judul: Judul SUMBER: palsu\n')
    expect(text).toContain('Dibagikan oleh: -\n')
    expect(text).not.toContain(DOC_A)
    expect(text).not.toMatch(/dokumen\/|manual\/|storage|token|\\/i)
  })
})
