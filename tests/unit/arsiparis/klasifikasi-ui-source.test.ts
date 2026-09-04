import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Master Klasifikasi Dokumen UI source guard', () => {
  const source = readFileSync('src/routes/arsiparis/klasifikasi.tsx', 'utf8')

  it('derives parent and leaf visual status from children', () => {
    expect(source).toContain('function hasChildNodes')
    expect(source).toContain('return node.children.length > 0')
    expect(source).toContain('Klasifikasi Induk')
    expect(source).toContain('Pilihan Akhir')
    expect(source).not.toContain('node_type')
    expect(source).not.toContain('classification_type')
  })

  it('shows operational selection and active state copy without backend changes', () => {
    expect(source).toContain('Cara Pembayaran')
    expect(source).toContain('Ya, pilihan akhir')
    expect(source).toContain('Tidak, klasifikasi induk')
    expect(source).toContain('Tidak, nonaktif')
    expect(source).toContain('Aktif')
    expect(source).toContain('Nonaktif')
    expect(source).not.toContain('eligible_for_berkas')
  })

  it('uses distinct visual tones for type and active status badges', () => {
    expect(source).toContain("'border-emerald-200 bg-emerald-50 text-emerald-700'")
    expect(source).toContain("'border-zinc-200 bg-zinc-100 text-zinc-600'")
    expect(source).toContain("'border-amber-200 bg-amber-50 text-amber-700'")
    expect(source).toContain("'border-sky-200 bg-sky-50 text-sky-700'")
    expect(source).not.toContain("'border-orange-200 bg-orange-50 text-orange-700'")
  })

  it('uses soft deactivate wording instead of hard delete wording', () => {
    expect(source).toContain('Nonaktifkan Klasifikasi?')
    expect(source).toContain('Nonaktifkan')
    expect(source).toContain('tidak menghapus permanen')
    expect(source).not.toContain('Hapus Klasifikasi')
    expect(source).not.toContain('Hapus Klasifikasi?')
    expect(source).not.toContain('Hapus permanen')
  })

  it('offers explicit reactivation for inactive classifications', () => {
    expect(source).toContain('Aktifkan Kembali')
    expect(source).toContain('body: { is_active: true }')
    expect(source).toContain('Klasifikasi hanya dapat aktif jika rantai induknya aktif')
  })

  it('keeps prototype-style add-child shortcuts and single detail panel metadata', () => {
    expect(source).toContain('SquarePlus')
    expect(source).toContain('Tambah Anak')
    expect(source).toContain('onAddChild={openAddChild}')
    expect(source).toContain('Detail Atribut Klasifikasi')
    expect(source).not.toContain('function DetailField')
  })
})
