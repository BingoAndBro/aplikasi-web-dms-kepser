import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// D-17: the Material/Non-Material value is the document's "Karakteristik";
// "Jenis Dokumen" was the removed master and must not label it.
describe('Karakteristik label', () => {
  it.each([
    'src/routes/pegawai/dokumen/$id/revisi.tsx',
    'src/routes/ppk/dokumen/$id/resubmit.tsx',
  ])('%s labels the success summary Karakteristik', (path) => {
    const source = readFileSync(path, 'utf8')
    expect(source).toContain('>Karakteristik</p>')
    expect(source).not.toContain('Jenis Dokumen')
  })

  it('aju.tsx confirmation text says karakteristik, not jenis dokumen', () => {
    const source = readFileSync('src/routes/pegawai/dokumen/aju.tsx', 'utf8')
    expect(source).toContain('Pastikan karakteristik, kegiatan')
    expect(source).not.toMatch(/jenis dokumen/i)
  })
})
