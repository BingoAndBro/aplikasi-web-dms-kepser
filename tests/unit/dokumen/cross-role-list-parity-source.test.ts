import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflowPrimitives = readFileSync('src/components/workflow/PpkPpspmPagePrimitives.tsx', 'utf8')
const statusBadgeSource = readFileSync('src/components/ui/StatusBadge.tsx', 'utf8')
const pegawaiDokumen = readFileSync('src/routes/pegawai/dokumen/index.tsx', 'utf8')
const pegawaiRevisi = readFileSync('src/routes/pegawai/revisi.tsx', 'utf8')
const ppkInbox = readFileSync('src/routes/ppk/inbox.tsx', 'utf8')
const ppkTervalidasi = readFileSync('src/routes/ppk/tervalidasi.tsx', 'utf8')
const ppkDitolak = readFileSync('src/routes/ppk/ditolak.tsx', 'utf8')
const ppkRevisi = readFileSync('src/routes/ppk/revisi.tsx', 'utf8')
const ppspmInbox = readFileSync('src/routes/ppspm/inbox.tsx', 'utf8')
const ppspmSelesai = readFileSync('src/routes/ppspm/selesai.tsx', 'utf8')
const ppspmDitolak = readFileSync('src/routes/ppspm/ditolak.tsx', 'utf8')

describe('Phase 15L.3A cross-role document list visual parity source guard', () => {
  it('keeps workflow list primitives aligned with the approved warm compact list pattern', () => {
    // ppk/ppspm rendered byte-identical classes (tone was inert) — Fase 2 of the
    // tema-global plan collapsed it to one token-based constant, see WORKFLOW_PANEL_TONE_CLASS
    expect(workflowPrimitives).toContain("WORKFLOW_PANEL_TONE_CLASS = 'border-brand-border bg-brand-surface text-brand-text'")
    expect(workflowPrimitives).toContain("variant?: 'panel' | 'list'")
    expect(workflowPrimitives).toContain("export const WORKFLOW_TABLE_HEAD_CLASS")
    expect(workflowPrimitives).toContain('text-neutral-500')
    expect(workflowPrimitives).toContain('export function WorkflowDateCell')
    expect(workflowPrimitives).toContain('export function WorkflowActionButton')
    expect(workflowPrimitives).toContain('export function WorkflowStatusSelect')
    // Fase 3 (tema-global plan): search input / filter-select / table-shell colors
    // moved to shared token classes in src/lib/data-table-classes.ts — was raw hex
    // (bg-[#FFFDF9], border-zinc-200 etc), now a cn() call pulling from DATA_SEARCH_*
    // / DATA_FILTER_SELECT_* / DATA_TABLE_SHELL_* constants. Layout-only fragments
    // (radii, non-brand neutral text) are unchanged and still asserted verbatim.
    expect(workflowPrimitives).toContain("DATA_SEARCH_INPUT_TONE_CLASS")
    expect(workflowPrimitives).toContain("cn('h-10 w-full rounded-[20px] border pl-11 pr-4 text-sm font-medium', DATA_SEARCH_INPUT_TONE_CLASS)")
    expect(workflowPrimitives).toContain('min-w-[148px] rounded-[22px]')
    expect(workflowPrimitives).toContain('text-sm font-medium text-zinc-950')
    expect(workflowPrimitives).toContain("DATA_FILTER_SELECT_MENU_TONE_CLASS")
    expect(workflowPrimitives).toContain("cn('rounded-[18px] border p-2 shadow-[0_12px_32px_rgba(15,23,42,0.14)]', DATA_FILTER_SELECT_MENU_TONE_CLASS)")
    expect(workflowPrimitives).toContain("focus:bg-brand-surface focus:text-brand-text data-[selected]:bg-brand-surface data-[selected]:text-brand-text")
    expect(workflowPrimitives).toContain("meta?: Array<{ label: ReactNode; value: ReactNode; wide?: boolean }>")
    expect(workflowPrimitives).toContain("item.wide && 'col-span-2'")
    expect(workflowPrimitives).toContain("border-t border-zinc-100 pt-3")
    expect(workflowPrimitives).toContain("DATA_TABLE_SHELL_TONE_CLASS")
    expect(workflowPrimitives).toContain("'hidden overflow-hidden rounded-[26px] border md:block'")
    expect(workflowPrimitives).toContain('group-hover:bg-orange-50 group-hover:text-orange-600')
    expect(workflowPrimitives).toContain('export function DocumentListStatusBadge')
    // Labels/colors now come from the single source of truth (StatusBadge's
    // DOCUMENT_STATUS_BADGE_CONFIG) instead of a second, divergent map here —
    // list views ("Validasi PPK") and detail views ("Menunggu PPK") used to
    // show different text for the same status; "Menunggu PPK"/"Menunggu PPSPM"
    // won as the app-wide standard (tema-global Fase 2).
    expect(workflowPrimitives).toContain('DOCUMENT_STATUS_BADGE_CONFIG')
    expect(workflowPrimitives).not.toContain('documentListStatusLabel')
    expect(workflowPrimitives).not.toContain('documentListStatusClassName')
    expect(statusBadgeSource).toContain('IN_PPK_VALIDATION: { label: "Menunggu PPK"')
    expect(statusBadgeSource).toContain('IN_PPSPM_APPROVAL: { label: "Menunggu PPSPM"')
    expect(statusBadgeSource).toContain('NEED_REVISION: { label: "Perlu Revisi"')
    expect(workflowPrimitives).not.toContain('bg-gradient-to-br')
  })

  it('aligns Pegawai document/revision mobile list actions and metadata cards', () => {
    expect(pegawaiDokumen).toContain('Dokumen Diajukan')
    expect(pegawaiDokumen).toContain('WorkflowSearchPanel')
    expect(pegawaiDokumen).toContain('resultLabel={`Total ${filtered.length} Dokumen`}')
    expect(pegawaiDokumen).toContain('text-neutral-500')
    expect(pegawaiDokumen).toContain('max-w-[1280px] space-y-7 px-7 pt-6 sm:px-8 lg:px-10')
    expect(pegawaiDokumen).toContain('text-zinc-950 transition-colors group-hover:text-[#FF4D00]')
    expect(pegawaiDokumen).toContain('font-normal text-zinc-900')
    expect(pegawaiDokumen).toContain("className={mobile ? 'block w-full' : undefined}")
    expect(pegawaiDokumen).toContain("className={mobile ? 'w-full gap-1.5' : undefined}")
    expect(pegawaiDokumen).toContain("rounded-[26px] border border-zinc-200/80 bg-[#FFFDF9]")
    expect(pegawaiDokumen).toContain("rounded-xl border border-zinc-200/80 bg-[#FFFDF9] p-2.5")
    expect(pegawaiDokumen).toContain('className="group cursor-pointer border-zinc-100 bg-[#FFFDF9] transition-colors hover:bg-[#FFF8F1]/70"')
    expect(pegawaiDokumen).toContain('<ChevronRight size={14} />')

    expect(pegawaiRevisi).toContain("className={mobile ? 'block w-full' : undefined}")
    expect(pegawaiRevisi).toContain("className={mobile ? 'w-full gap-1.5' : undefined}")
    expect(pegawaiRevisi).toContain('WorkflowSearchPanel')
    expect(pegawaiRevisi).toContain('resultLabel={`Total ${filtered.length} Dokumen`}')
    expect(pegawaiRevisi).toContain('text-neutral-500')
    expect(pegawaiRevisi).toContain("rounded-xl border border-zinc-200/80 bg-[#FFFDF9] p-2.5")
    expect(pegawaiRevisi).toContain('className="group cursor-pointer border-zinc-100 bg-[#FFFDF9] transition-colors hover:bg-[#FFF8F1]/70"')
    expect(pegawaiRevisi).toContain('WorkflowDateCell')
    expect(pegawaiRevisi).toContain('WorkflowActionButton')
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
    expect(pegawaiDokumen).toContain("const WORKFLOW_SEARCH_PLACEHOLDER = 'Cari judul, fungsi, atau kegiatan...'")
    expect(pegawaiDokumen).toContain('Tanggal Ajuan')
    expect(pegawaiDokumen).not.toContain('PegawaiPageHeader')
    expect(pegawaiDokumen).not.toContain('PegawaiSearchPanel')
    expect(pegawaiDokumen).not.toContain('Dokumen Diajukan" if currently present')
  })

  it('keeps PPSPM inbox on the shared table component instead of a local raw table', () => {
    expect(ppspmInbox).toContain("import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'")
    expect(ppspmInbox).toContain('<Table className="text-left">')
    expect(ppspmInbox).toContain('<TableHeader>')
    expect(ppspmInbox).toContain('<TableBody className="divide-y divide-zinc-100 text-[13px]">')
    expect(ppspmInbox).not.toContain('<table className="w-full text-xs">')
    expect(ppspmInbox).toContain("value: d.kegiatan_nama ?? '-', wide: true")
    expect(ppspmInbox).toContain('variant="list"')
    expect(ppspmInbox).toContain('WorkflowDateCell')
    expect(ppspmInbox).toContain('WorkflowActionButton')
    expect(ppspmInbox).toContain('className="group cursor-pointer border-zinc-100 bg-[#FFFDF9] transition-colors hover:bg-[#FFF8F1]/70"')
  })

  it('uses row-level navigation and one chevron affordance across PPK/PPSPM lists', () => {
    for (const source of [ppkInbox, ppkTervalidasi, ppkDitolak, ppkRevisi, ppspmInbox, ppspmSelesai, ppspmDitolak]) {
      expect(source).toContain('useNavigate')
      expect(source).toContain('cursor-pointer')
      expect(source).toContain('WorkflowActionButton')
      expect(source).toContain('WorkflowDateCell')
      expect(source).toContain('WORKFLOW_TABLE_HEAD_CLASS')
      expect(source).toContain('variant="list"')
      expect(source).toContain('Buka Dokumen')
      expect(source).not.toContain('<TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Fungsi</TableHead>')
      expect(source).not.toContain('<TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Catatan</TableHead>')
      expect(source).not.toContain('<TableHead className="text-center">Tahun</TableHead>')
      expect(source).not.toContain("{ label: 'Tahun'")
      expect(source).not.toContain('Lihat Detail')
      expect(source).not.toContain('Perbaiki Dokumen')
    }
  })

  it('uses a neutral table header row while keeping body rows visually distinct', () => {
    for (const source of [
      pegawaiDokumen,
      pegawaiRevisi,
      ppkInbox,
      ppkTervalidasi,
      ppkDitolak,
      ppkRevisi,
      ppspmInbox,
      ppspmSelesai,
      ppspmDitolak,
    ]) {
      expect(source).toContain('border-neutral-200 bg-neutral-100 hover:bg-neutral-100')
      expect(source).not.toContain('bg-[#FFFCF8] hover:bg-[#FFFCF8]')
    }

    expect(workflowPrimitives).toContain('text-neutral-500')
    expect(pegawaiDokumen).toContain('text-neutral-500')
    expect(pegawaiRevisi).toContain('text-neutral-500')
  })

  it('keeps rejected PPK/PPSPM list context visible without adding workflow transitions', () => {
    expect(ppkDitolak).toContain('Ditolak PPK')
    expect(ppkDitolak).toContain('<TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Status</TableHead>')
    expect(ppkDitolak).toContain('<TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Tanggal Ajuan</TableHead>')
    expect(ppkDitolak).toContain("value: truncate(d.revision_notes, 80), wide: true")
    expect(ppkDitolak).toContain('<DocumentListStatusBadge status="NEED_REVISION" label="Ditolak PPK" />')

    expect(ppspmDitolak).toContain('Ditolak PPSPM')
    expect(ppspmDitolak).toContain('<TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Status</TableHead>')
    expect(ppspmDitolak).toContain('<TableHead className={WORKFLOW_TABLE_HEAD_CLASS}>Tanggal</TableHead>')
    expect(ppspmDitolak).toContain("value: truncate(d.revision_notes, 80), wide: true")
    expect(ppspmDitolak).toContain('<DocumentListStatusBadge status="NEED_REVISION" label="Ditolak PPSPM" />')
  })

  it('keeps workflow list search and result count consistent without redundant fixed-status filters', () => {
    const routesWithSearch = [
      pegawaiDokumen,
      pegawaiRevisi,
      ppkInbox,
      ppkTervalidasi,
      ppkDitolak,
      ppkRevisi,
      ppspmInbox,
      ppspmSelesai,
      ppspmDitolak,
    ]

    for (const source of routesWithSearch) {
      expect(source).toContain('Total')
      expect(source).toContain('Dokumen')
      expect(source).toContain('toLowerCase()')
      expect(source).not.toContain('dokumen ditemukan')
      expect(source).not.toContain('Dokumen Ditemukan')
    }

    for (const source of [ppkDitolak, ppkRevisi, ppspmSelesai, ppspmDitolak]) {
      expect(source).toContain('WorkflowSearchPanel')
      expect(source).not.toContain('Semua Status')
      expect(source).not.toContain('statusFilter')
    }

    for (const source of [pegawaiRevisi, ppkDitolak, ppkRevisi, ppspmDitolak]) {
      expect(source).toContain("const WORKFLOW_SEARCH_PLACEHOLDER = 'Cari judul, fungsi, kegiatan, atau catatan...'")
      expect(source).toContain('revision_notes ??')
    }

    for (const source of [pegawaiDokumen, ppkInbox, ppkTervalidasi, ppspmInbox, ppspmSelesai]) {
      expect(source).toContain("const WORKFLOW_SEARCH_PLACEHOLDER = 'Cari judul, fungsi, atau kegiatan...'")
    }

    expect(pegawaiDokumen).toContain("{ value: 'ALL', label: 'Semua Status' }")
    expect(pegawaiDokumen).toContain('WorkflowStatusSelect')
    expect(pegawaiDokumen).toContain('resultLabel={`Total ${filtered.length} Dokumen`}')
    expect(ppkTervalidasi).toContain("{ value: 'ALL', label: 'Semua Status' }")
    expect(ppkTervalidasi).toContain('statusFilter')
    expect(ppkTervalidasi).toContain('WorkflowStatusSelect')
    expect(ppkInbox).not.toContain('<option value="">Semua Fungsi</option>')
    expect(ppkInbox).not.toContain('type="date"')
    expect(ppkInbox).not.toContain('fungsiFilter')
    expect(ppkInbox).not.toContain('/master-fungsi')
    expect(ppspmInbox).not.toContain('<option value="">Semua Fungsi</option>')
    expect(ppspmInbox).not.toContain('fungsiFilter')
    expect(ppspmInbox).not.toContain('/master-fungsi')
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
      ppspmInbox,
      ppspmSelesai,
      ppspmDitolak,
    ].join('\n')

    expect(combined).not.toContain('Cari Arsip')
    expect(combined).not.toContain('Laporan Klasifikasi')
    expect(combined).not.toContain('Nomor Surat')
    expect(combined).not.toContain('Simpan Draft')
    expect(combined).not.toContain('supabase')
    expect(combined).not.toContain('#/routes/api')
  })
})
