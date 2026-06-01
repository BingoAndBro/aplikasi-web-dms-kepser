import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { ConfirmDialog } from '#/components/ui/ConfirmDialog'
import { ErrorState } from '#/components/ui/ErrorState'
import { LoadingState } from '#/components/ui/LoadingState'
import { StatusBadge } from '#/components/ui/StatusBadge'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { AttachmentViewer } from '#/components/dokumen/AttachmentViewer'
import {
  RevisionNotePanel,
  WorkflowFieldCard,
  WorkflowPageHeader,
  WorkflowPanel,
  WorkflowTimeline,
} from '#/components/workflow/PpkPpspmPagePrimitives'
import {
  FileText,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import { formatDate } from '#/lib/utils/format'
import { ApiError, apiMutation } from '#/lib/api-mutation'
import { apiFetch } from '#/lib/api-client'

export const Route = createFileRoute('/ppk/dokumen/$id/')({
  component: PpkDokumenDetailIndexPage,
})

type DokumenDetail = {
  id: string
  judul: string
  fungsi_id: string
  fungsi_nama: string
  kegiatan_jenis_id: string
  kegiatan_nama: string
  is_ketua_tim: boolean
  status: string
  current_step: string | null
  revision_target: string | null
  revision_notes: string | null
  lampiran_urls: any[]
  tahun: number
  tanggal: string
  created_by: string
  created_at: string
  updated_at: string
  nominal_realisasi: number | null
  is_non_material?: boolean
  jenis_permintaan_id?: string | null
  kategori_permintaan_id?: string | null
  detail_permintaan_id?: string | null
  jenis_permintaan_nama?: string
  kategori_permintaan_nama?: string
  detail_permintaan_nama?: string
  jenis_dokumen_nama?: string
  jenis_dokumen_id?: string | null
}

const WORKFLOW_STEPS = [
  { key: 'DRAFT', label: 'Draf' },
  { key: 'IN_PPK_VALIDATION', label: 'PPK' },
  { key: 'IN_BENDAHARA_APPROVAL', label: 'PPSPM' },
  { key: 'COMPLETED', label: 'Selesai' },
]

function getWorkflowIndex(status: string): number {
  if (status === 'NEED_REVISION') return -1
  return WORKFLOW_STEPS.findIndex(s => s.key === status)
}

function PpkDokumenDetailIndexPage() {
  const { id } = Route.useParams()
  const [dokumen, setDokumen] = useState<DokumenDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectCatatan, setRejectCatatan] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [id])

  async function fetchData() {
    setLoading(true)
    setFetchError(null)
    try {
      const json = await apiFetch<{ dokumen: DokumenDetail }>(`/ppk/dokumen/${id}`)
      setDokumen(json.dokumen)
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setFetchError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Dokumen tidak dapat diakses'
          : 'Dokumen tidak dapat diakses')
        return
      }

      setFetchError('Terjadi kesalahan saat mengambil data')
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove() {
    setActionLoading('approve')
    try {
      await apiMutation(`/api/ppk/dokumen/${id}/approve`, { method: 'POST' })
      window.location.href = '/ppk/inbox'
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        alert(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        return
      }

      alert('Terjadi kesalahan')
    } finally { setActionLoading(null) }
  }

  async function handleReject() {
    if (rejectCatatan.trim().length < 10) { setRejectError('Min. 10 karakter'); return }
    setActionLoading('reject')
    try {
      await apiMutation(`/api/ppk/dokumen/${id}/reject`, {
        method: 'POST',
        body: { catatan: rejectCatatan.trim() },
      })
      window.location.href = '/ppk/inbox'
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.payload
        setRejectError(payload && typeof payload === 'object' && 'error' in payload
          ? (payload as { error?: string }).error ?? 'Gagal'
          : 'Gagal')
        return
      }

      setRejectError('Terjadi kesalahan')
    } finally { setActionLoading(null) }
  }

  if (loading) return (
    <PageLayout>
      <LoadingState label="Memuat detail dokumen PPK" />
    </PageLayout>
  )

  if (fetchError || !dokumen) return (
    <PageLayout>
      <ErrorState
        title="Dokumen tidak dapat dibuka"
        description={fetchError ?? 'Dokumen tidak ditemukan'}
        variant="page"
        action={<Button variant="outline" size="sm" onClick={() => window.location.href = '/ppk/inbox'}>Kembali ke Inbox</Button>}
      />
    </PageLayout>
  )

  const workflowIdx = getWorkflowIndex(dokumen.status)

  return (
    <PageLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <ConfirmDialog
          open={approveOpen}
          onOpenChange={setApproveOpen}
          title="Validasi dokumen ini?"
          description="Dokumen akan diteruskan dari PPK ke PPSPM untuk tahap persetujuan. Pastikan lampiran dan nominal sudah sesuai sebelum melanjutkan."
          confirmLabel="Validasi ke PPSPM"
          cancelLabel="Batal"
          pending={actionLoading === 'approve'}
          onConfirm={handleApprove}
        />

        {rejectOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) { setRejectOpen(false); setRejectCatatan(''); setRejectError(null) } }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-orange-100">
                <AlertTriangle size={18} className="text-error shrink-0" />
                <p className="font-semibold text-on-surface">Tolak Dokumen</p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">Catatan Revisi <span className="text-error">*</span></label>
                  <textarea value={rejectCatatan} onChange={e => { setRejectCatatan(e.target.value); setRejectError(null) }} placeholder="Jelaskan mengapa dokumen ditolak dan apa yang perlu diperbaiki..." rows={4} className={cn('w-full px-3 py-2 border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring resize-none', rejectError ? 'border-error' : 'border-border')} />
                  <p className="text-[10px] text-outline mt-1">{rejectCatatan.length}/2000 karakter (min. 10)</p>
                  {rejectError && <p className="text-[10px] text-error mt-1">{rejectError}</p>}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => { setRejectOpen(false); setRejectCatatan(''); setRejectError(null) }} disabled={!!actionLoading}>Batal</Button>
                  <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={!!actionLoading}>
                    {actionLoading === 'reject' ? <Loader2 size={14} className="animate-spin" /> : 'Tolak Dokumen'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <WorkflowPageHeader
          eyebrow={
            <>
              <FileText size={12} />
              <Link to="/ppk" className="hover:text-orange-900">PPK</Link>
              <ChevronRight size={10} />
              <Link to="/ppk/inbox" className="hover:text-orange-900">Validasi</Link>
              <ChevronRight size={10} />
              <span>Detail Dokumen</span>
            </>
          }
          title={dokumen.judul}
          description="Tinjau metadata, alur, lampiran, dan riwayat aktivitas sebelum mengambil keputusan validasi PPK."
          actions={<StatusBadge status={dokumen.status} className="text-xs font-semibold" />}
        />

        <WorkflowTimeline
          steps={WORKFLOW_STEPS}
          status={dokumen.status}
          currentIndex={workflowIdx}
          revisionStepKey="IN_PPK_VALIDATION"
          revisionIcon={<AlertTriangle size={14} />}
        />

        {dokumen.status === 'NEED_REVISION' && dokumen.revision_notes && (
          <RevisionNotePanel title={`Catatan Revisi dari ${dokumen.revision_target === 'USER' ? 'PPK' : 'PPSPM'}`}>
            {dokumen.revision_notes}
          </RevisionNotePanel>
        )}

        <WorkflowPanel className="p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <WorkflowFieldCard label="Fungsi" value={dokumen.fungsi_nama ?? '-'} />
            <WorkflowFieldCard label="Kegiatan" value={dokumen.kegiatan_nama ?? '-'} />
            {dokumen.jenis_permintaan_id && (
              <WorkflowFieldCard label="Jenis Permintaan" value={dokumen.jenis_permintaan_nama ?? '-'} />
            )}
            {dokumen.kategori_permintaan_id && (
              <WorkflowFieldCard label="Kategori Permintaan" value={dokumen.kategori_permintaan_nama ?? '-'} />
            )}
            {dokumen.detail_permintaan_id && (
              <WorkflowFieldCard label="Detail Permintaan" value={dokumen.detail_permintaan_nama ?? '-'} />
            )}
            <WorkflowFieldCard label="Tahun" value={dokumen.tahun} />
            <WorkflowFieldCard label="Tanggal" value={formatDate(dokumen.tanggal)} />
            <WorkflowFieldCard label="Peran" value={dokumen.is_ketua_tim ? 'Ketua Tim' : 'Anggota'} />
            <WorkflowFieldCard label="Diajukan" value={formatDate(dokumen.created_at)} />
            {dokumen.nominal_realisasi !== null && dokumen.nominal_realisasi !== undefined && (
              <WorkflowFieldCard label="Nominal Realisasi" value={`Rp ${dokumen.nominal_realisasi.toLocaleString('id-ID')}`} />
            )}
          </div>
        </WorkflowPanel>

        <AttachmentViewer dokumen={dokumen as any} lampiranUrls={dokumen.lampiran_urls} apiType="ppk" />

        <ActivityLog dokumenId={dokumen.id} />

        <WorkflowPanel className="flex flex-col gap-3 sm:flex-row">
          <Link to="/ppk/inbox"><Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Kembali</Button></Link>
          {dokumen.status === 'IN_PPK_VALIDATION' && (
            <>
              <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => { setRejectCatatan(''); setRejectError(null); setRejectOpen(true) }} disabled={!!actionLoading}>
                {actionLoading === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                Tolak
              </Button>
              <Button size="sm" className="gap-1.5 sm:flex-1" onClick={() => setApproveOpen(true)} disabled={!!actionLoading}>
                {actionLoading === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Validasi ke PPSPM
              </Button>
            </>
          )}
          {dokumen.status === 'COMPLETED' && <Link to="/ppk/tervalidasi"><Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Tervalidasi</Button></Link>}
          {dokumen.status === 'NEED_REVISION' && dokumen.revision_target === 'PPK' && (
            <Link to="/ppk/revisi"><Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Daftar Revisi</Button></Link>
          )}
        </WorkflowPanel>
      </div>
    </PageLayout>
  )
}
