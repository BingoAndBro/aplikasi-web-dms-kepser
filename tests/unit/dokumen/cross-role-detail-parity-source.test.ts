import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pegawaiDetail = readFileSync('src/routes/pegawai/dokumen/$id/index.tsx', 'utf8')
const ppkDetail = readFileSync('src/routes/ppk/dokumen/$id/index.tsx', 'utf8')
const ppspmDetail = readFileSync('src/routes/ppspm/dokumen/$id.tsx', 'utf8')
const attachmentViewer = readFileSync('src/components/dokumen/AttachmentViewer.tsx', 'utf8')

describe('Phase 15L.3B cross-role document detail visual parity source guard', () => {
  it('keeps the three document detail pages on the same compact tabbed detail shell', () => {
    for (const source of [pegawaiDetail, ppkDetail, ppspmDetail]) {
      expect(source).toContain("const DETAIL_TABS = [")
      expect(source).toContain("key: 'metadata', label: 'Metadata Dokumen'")
      expect(source).toContain("key: 'lampiran', label: 'Lampiran'")
      expect(source).toContain("key: 'riwayat', label: 'Riwayat'")
      expect(source).toContain("useState<DetailTab>('metadata')")
      expect(source).toContain('max-w-[92rem] space-y-4')
      expect(source).toContain("xl:grid-cols-[minmax(0,1fr)_18rem]")
      expect(source).toContain('<AttachmentViewer')
      expect(source).toContain('<ActivityLog')
    }

    expect(pegawaiDetail).toContain('function MetadataDetailCard')
    expect(pegawaiDetail).not.toContain('Data Pertanggungjawaban Anggaran & Metadata Dokumen')
    expect(pegawaiDetail).toContain("rounded-t-[1.5rem] bg-gradient-to-r from-[#F97316] to-[#FB923C]")
    expect(pegawaiDetail).toContain("rounded-b-[1.5rem] border border-t-0 border-[#F1E5DA] bg-[#FFFDF9]")
    expect(pegawaiDetail).toContain("min-h-full bg-[#FFF9F4] px-4 py-4 sm:px-6 lg:px-7 lg:py-5")
    expect(pegawaiDetail).toContain("mx-auto max-w-[92rem] space-y-4")
    expect(pegawaiDetail).toContain('<WorkflowPanel')
    expect(pegawaiDetail).toContain('function RevisionNoteCard')
    expect(pegawaiDetail).toContain("return revisionTarget === 'PPK' ? 'PPSPM' : 'PPK'")
    expect(pegawaiDetail).toContain("return revisionTarget === 'PPK' ? 'IN_PPSPM_APPROVAL' : 'IN_PPK_VALIDATION'")

    for (const source of [ppkDetail, ppspmDetail]) {
      expect(source).toContain("rounded-t-[1.5rem] bg-gradient-to-r from-[#F97316] to-[#FB923C]")
      expect(source).toContain("rounded-b-[1.5rem] border border-t-0 border-[#F1E5DA]")
      expect(source).toContain('function MetadataDetailCard')
      expect(source).toContain('<MetadataDetailCard dokumen={dokumen} isNonMaterial={isNonMaterial} />')
      expect(source).toContain('function RoleStatusPanel')
      expect(source).toContain('Status Dokumen')
      expect(source).toContain('WORKFLOW_STEPS_NON_MATERIAL')
      expect(source).not.toContain('<WorkflowTimeline')
      expect(source).not.toContain('<WorkflowFieldCard')
    }
  })

  it('preserves role-specific fetch, mutation, preview, and navigation boundaries', () => {
    expect(pegawaiDetail).toContain("apiFetch<{ dokumen: DokumenDetail }>(`/dokumen/${id}`)")
    expect(pegawaiDetail).toContain("to=\"/pegawai/dokumen/$id/edit\"")
    expect(pegawaiDetail).toContain('<AttachmentViewer dokumen={dok as any} lampiranUrls={dok.lampiran_urls} />')
    expect(pegawaiDetail).toContain('Edit Dokumen')
    expect(pegawaiDetail).not.toContain("apiMutation(`/api/dokumen/${id}`,")
    expect(pegawaiDetail).not.toContain("to=\"/pegawai/dokumen/$id/revisi\"")
    expect(pegawaiDetail).not.toContain('Hapus')

    expect(ppkDetail).toContain("apiFetch<{ dokumen: DokumenDetail }>(`/ppk/dokumen/${id}`)")
    expect(ppkDetail).toContain("apiMutation(`/api/ppk/dokumen/${id}/approve`, { method: 'POST' })")
    expect(ppkDetail).toContain("apiMutation(`/api/ppk/dokumen/${id}/reject`,")
    expect(ppkDetail).toContain("body: { catatan: trimmed }")
    expect(ppkDetail).toContain('withReason={{')
    expect(ppkDetail).toContain('window.location.href = \'/ppk/inbox\'')
    expect(ppkDetail).toContain('window.history.back()')
    expect(ppkDetail).toContain('apiType="ppk"')

    expect(ppspmDetail).toContain("apiFetch<{ dokumen: DokumenDetail }>(`/ppspm/dokumen/${id}`)")
    expect(ppspmDetail).toContain("apiMutation(`/api/ppspm/dokumen/${id}/approve`, { method: 'POST' })")
    expect(ppspmDetail).toContain("apiMutation(`/api/ppspm/dokumen/${id}/reject`,")
    expect(ppspmDetail).toContain("body: { catatan: trimmed }")
    expect(ppspmDetail).toContain('withReason={{')
    expect(ppspmDetail).toContain("setActionResult({ documentId: id, title: dokumen?.judul ?? 'Dokumen', kind: 'approve' })")
    expect(ppspmDetail).toContain("setActionResult({ documentId: id, title: dokumen?.judul ?? 'Dokumen', kind: 'reject' })")
    expect(ppspmDetail).toContain('window.history.back()')
    expect(ppspmDetail).toContain('apiType="ppspm"')
  })

  it('keeps user-facing PPSPM terminology while preserving the internal ppspm namespace', () => {
    expect(ppspmDetail).toContain('PPSPM')
    expect(ppspmDetail).toContain("navigate({ to: '/ppspm/inbox' })")
    expect(ppspmDetail).not.toContain('Daftar Selesai')
    expect(ppspmDetail).not.toContain('Daftar Ditolak')
    expect(ppspmDetail).not.toContain('Tugas Ppspm')
    expect(ppspmDetail).not.toContain('Persetujuan Ppspm')
  })

  it('keeps detail rail actions ordered and uses browser history for return', () => {
    const ppkActionRail = ppkDetail.slice(ppkDetail.indexOf('<aside className="min-w-0 space-y-1.5'))
    const ppspmActionRail = ppspmDetail.slice(ppspmDetail.indexOf('<aside className="min-w-0 space-y-1.5'))

    expect(ppkActionRail.indexOf('Validasi ke PPSPM')).toBeGreaterThan(-1)
    expect(ppkActionRail.indexOf('Tolak')).toBeGreaterThan(ppkActionRail.indexOf('Validasi ke PPSPM'))
    expect(ppkActionRail.indexOf('Kembali')).toBeGreaterThan(ppkActionRail.indexOf('Tolak'))
    expect(ppkActionRail.indexOf('Kembali')).toBeGreaterThan(ppkActionRail.indexOf('Validasi ke PPSPM'))
    expect(ppkActionRail).not.toContain('Tervalidasi')
    expect(ppkActionRail).not.toContain('Daftar Revisi')

    expect(ppspmActionRail.indexOf('Setujui Dokumen')).toBeGreaterThan(-1)
    expect(ppspmActionRail.indexOf('Tolak')).toBeGreaterThan(ppspmActionRail.indexOf('Setujui Dokumen'))
    expect(ppspmActionRail.indexOf('Kembali')).toBeGreaterThan(ppspmActionRail.indexOf('Tolak'))
    expect(ppspmActionRail.indexOf('Kembali')).toBeGreaterThan(ppspmActionRail.indexOf('Setujui Dokumen'))
    expect(ppspmActionRail).not.toContain('Daftar Selesai')
    expect(ppspmActionRail).not.toContain('Daftar Ditolak')
    expect(ppkActionRail).toContain('onClick={handleBack}')
    expect(ppspmActionRail).toContain('onClick={handleBack}')
  })

  it('keeps attachment viewer route-safe while applying the approved soft surface tone', () => {
    expect(attachmentViewer).toContain("return `/api/dokumen/${dokumen.id}/preview/${idx}`")
    expect(attachmentViewer).toContain("return `/api/ppk/dokumen/${dokumen.id}/preview/${idx}`")
    expect(attachmentViewer).toContain("return `/api/ppspm/dokumen/${dokumen.id}/preview/${idx}`")
    expect(attachmentViewer).toContain("return `/api/dokumen/${dokumen.id}/download/${idx}`")
    expect(attachmentViewer).toContain("return `/api/ppk/dokumen/${dokumen.id}/download/${idx}`")
    expect(attachmentViewer).toContain("return `/api/ppspm/dokumen/${dokumen.id}/download/${idx}`")
    expect(attachmentViewer).toContain("bg-bg-surface")
    expect(attachmentViewer).toContain('Lampiran & Kelengkapan Wajib')
    expect(attachmentViewer).toContain('Dokumen Pendukung Tambahan')
    expect(attachmentViewer).toContain('Preview')
    expect(attachmentViewer).toContain('Unduh')
    expect(attachmentViewer).toContain('bg-black/85 backdrop-blur-sm')
    expect(attachmentViewer).not.toContain('DMS_LOCAL_STORAGE_ROOT')
    expect(attachmentViewer).not.toContain('document.cookie')
  })

  it('does not introduce backend, schema, package, archive-search, or prototype imports', () => {
    const combined = [pegawaiDetail, ppkDetail, ppspmDetail, attachmentViewer].join('\n')

    expect(combined).not.toContain('#/routes/api')
    expect(combined).not.toContain('drizzle')
    expect(combined).not.toContain('supabase')
    expect(combined).not.toContain('dms-ai-studio-final')
    expect(combined).not.toContain('Cari Arsip')
    expect(combined).not.toContain('Laporan Klasifikasi')
    expect(combined).not.toContain('Nomor Surat')
    expect(combined).not.toContain('Simpan Draft')
  })
})
