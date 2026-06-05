import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflowPrimitives = readFileSync('src/components/workflow/PpkPpspmPagePrimitives.tsx', 'utf8')
const pegawaiDokumen = readFileSync('src/routes/pegawai/dokumen/index.tsx', 'utf8')
const pegawaiRevisi = readFileSync('src/routes/pegawai/revisi.tsx', 'utf8')
const ppkInbox = readFileSync('src/routes/ppk/inbox.tsx', 'utf8')
const ppkTervalidasi = readFileSync('src/routes/ppk/tervalidasi.tsx', 'utf8')
const ppkDitolak = readFileSync('src/routes/ppk/ditolak.tsx', 'utf8')
const ppkRevisi = readFileSync('src/routes/ppk/revisi.tsx', 'utf8')
const bendaharaInbox = readFileSync('src/routes/bendahara/inbox.tsx', 'utf8')
const bendaharaSelesai = readFileSync('src/routes/bendahara/selesai.tsx', 'utf8')
const bendaharaDitolak = readFileSync('src/routes/bendahara/ditolak.tsx', 'utf8')

describe('Phase 15L.3A cross-role document list visual parity source guard', () => {
  it('keeps workflow list primitives aligned with the approved warm compact list pattern', () => {
    expect(workflowPrimitives).toContain("ppk: 'border-orange-100 bg-[#FFF8F1] text-orange-800'")
    expect(workflowPrimitives).toContain("ppspm: 'border-orange-100 bg-[#FFF8F1] text-orange-800'")
    expect(workflowPrimitives).toContain("meta?: Array<{ label: ReactNode; value: ReactNode; wide?: boolean }>")
    expect(workflowPrimitives).toContain("item.wide && 'col-span-2'")
    expect(workflowPrimitives).toContain("border-t border-orange-100 pt-3")
    expect(workflowPrimitives).toContain('export function DocumentListStatusBadge')
    expect(workflowPrimitives).toContain("IN_PPK_VALIDATION: 'Validasi PPK'")
    expect(workflowPrimitives).toContain("IN_BENDAHARA_APPROVAL: 'Menunggu Persetujuan'")
    expect(workflowPrimitives).toContain("NEED_REVISION: 'Perlu Revisi'")
    expect(workflowPrimitives).not.toContain('bg-gradient-to-br')
  })

  it('aligns Pegawai document/revision mobile list actions and metadata cards', () => {
    expect(pegawaiDokumen).toContain('Dokumen Diajukan')
    expect(pegawaiDokumen).toContain('Dokumen Ditemukan')
    expect(pegawaiDokumen).toContain('max-w-[1280px] space-y-7 px-7 pt-6 sm:px-8 lg:px-10')
    expect(pegawaiDokumen).toContain('text-zinc-950 transition-colors group-hover:text-[#FF4D00]')
    expect(pegawaiDokumen).toContain('font-normal text-zinc-900')
    expect(pegawaiDokumen).toContain("className={mobile ? 'block w-full' : undefined}")
    expect(pegawaiDokumen).toContain("className={mobile ? 'w-full gap-1.5' : undefined}")
    expect(pegawaiDokumen).toContain("rounded-[26px] border border-zinc-200/80 bg-white")
    expect(pegawaiDokumen).toContain("rounded-xl border border-zinc-200/80 bg-[#FFFDF9] p-2.5")
    expect(pegawaiDokumen).toContain('className="group cursor-pointer border-zinc-100 transition-colors hover:bg-[#FFF8F1]/70"')
    expect(pegawaiDokumen).toContain('<ChevronRight size={14} />')

    expect(pegawaiRevisi).toContain("className={mobile ? 'block w-full' : undefined}")
    expect(pegawaiRevisi).toContain("className={mobile ? 'w-full gap-1.5' : undefined}")
    expect(pegawaiRevisi).toContain("rounded-xl border border-orange-100 bg-[#FFFDF9] p-2.5")
    expect(pegawaiRevisi).toContain('className="group cursor-pointer hover:bg-orange-50/50 transition-colors"')
  })

  it('keeps Pegawai Dokumen Diajukan prototype-grade refinement local and revision-safe', () => {
    expect(pegawaiDokumen).toContain('function PegawaiDocumentStatusBadge')
    expect(pegawaiDokumen).toContain('function getPegawaiStatusPresentation')
    expect(pegawaiDokumen).toContain("dok.status === 'NEED_REVISION' && dok.revision_target === 'USER'")
    expect(pegawaiDokumen).toContain("label: 'Perlu Revisi'")
    expect(pegawaiDokumen).toContain("dok.status === 'NEED_REVISION' && dok.revision_target === 'PPK'")
    expect(pegawaiDokumen).toContain("label: 'Dikembalikan ke PPK'")
    expect(pegawaiDokumen).toContain("className: 'border-orange-200/80 bg-orange-50/80 text-orange-700'")
    expect(pegawaiDokumen).toContain("navigate({ to: '/pegawai/dokumen/$id/revisi', params: { id: dok.id } })")
    expect(pegawaiDokumen).toContain("navigate({ to: '/pegawai/dokumen/$id', params: { id: dok.id } })")
    expect(pegawaiDokumen).toContain('Pantau status dan progres persetujuan dokumen tiket Anda yang sedang berjalan.')
    expect(pegawaiDokumen).toContain('placeholder="Cari dokumen..."')
    expect(pegawaiDokumen).toContain('Tanggal Ajuan')
    expect(pegawaiDokumen).not.toContain('PegawaiPageHeader')
    expect(pegawaiDokumen).not.toContain('PegawaiSearchPanel')
    expect(pegawaiDokumen).not.toContain('Dokumen Diajukan" if currently present')
  })

  it('keeps PPSPM inbox on the shared table component instead of a local raw table', () => {
    expect(bendaharaInbox).toContain("import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'")
    expect(bendaharaInbox).toContain('<Table>')
    expect(bendaharaInbox).toContain('<TableHeader>')
    expect(bendaharaInbox).toContain('<TableBody>')
    expect(bendaharaInbox).not.toContain('<table className="w-full text-xs">')
    expect(bendaharaInbox).toContain("value: d.kegiatan_nama ?? '-', wide: true")
    expect(bendaharaInbox).toContain('className="group cursor-pointer hover:bg-orange-50/60 transition-colors"')
  })

  it('uses row-level navigation and one chevron affordance across PPK/PPSPM lists', () => {
    for (const source of [ppkInbox, ppkTervalidasi, ppkDitolak, ppkRevisi, bendaharaInbox, bendaharaSelesai, bendaharaDitolak]) {
      expect(source).toContain('useNavigate')
      expect(source).toContain('cursor-pointer')
      expect(source).toContain('<ChevronRight size={14} />')
      expect(source).toContain('Buka Dokumen')
      expect(source).not.toContain('<TableHead className="text-center">Tahun</TableHead>')
      expect(source).not.toContain("{ label: 'Tahun'")
      expect(source).not.toContain('Lihat Detail')
      expect(source).not.toContain('Perbaiki Dokumen')
    }
  })

  it('keeps rejected PPK/PPSPM list context visible without adding workflow transitions', () => {
    expect(ppkDitolak).toContain('Ditolak PPK')
    expect(ppkDitolak).toContain('<TableHead className="text-center">Status</TableHead>')
    expect(ppkDitolak).toContain("value: truncate(d.revision_notes, 80), wide: true")
    expect(ppkDitolak).toContain('<DocumentListStatusBadge status="NEED_REVISION" label="Ditolak PPK" />')

    expect(bendaharaDitolak).toContain('Ditolak PPSPM')
    expect(bendaharaDitolak).toContain('<TableHead className="text-center">Status</TableHead>')
    expect(bendaharaDitolak).toContain("value: truncate(d.revision_notes, 80), wide: true")
    expect(bendaharaDitolak).toContain('<DocumentListStatusBadge status="NEED_REVISION" label="Ditolak PPSPM" />')
  })

  it('does not introduce forbidden legacy or backend surfaces in touched list sources', () => {
    const combined = [
      workflowPrimitives,
      pegawaiDokumen,
      pegawaiRevisi,
      ppkInbox,
      ppkTervalidasi,
      ppkDitolak,
      ppkRevisi,
      bendaharaInbox,
      bendaharaSelesai,
      bendaharaDitolak,
    ].join('\n')

    expect(combined).not.toContain('Cari Arsip')
    expect(combined).not.toContain('Laporan Klasifikasi')
    expect(combined).not.toContain('Nomor Surat')
    expect(combined).not.toContain('Simpan Draft')
    expect(combined).not.toContain('supabase')
    expect(combined).not.toContain('#/routes/api')
  })
})
