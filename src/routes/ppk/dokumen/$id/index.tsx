import { createFileRoute } from '@tanstack/react-router'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import { AttachmentViewer } from '#/components/dokumen/AttachmentViewer'
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
  { key: 'IN_BENDAHARA_APPROVAL', label: 'Bendahara' },
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
    if (!confirm('Yakin ingin menyetujui dokumen ini?')) return
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
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-primary" />
    </div>
  )

  if (fetchError || !dokumen) return (
    <div className="text-center py-20">
      <AlertTriangle size={32} className="text-error mx-auto mb-3" />
      <p className="text-sm text-on-surface-variant">{fetchError ?? 'Dokumen tidak ditemukan'}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={() => window.location.href = '/ppk/inbox'}>Kembali ke Inbox</Button>
    </div>
  )

  const workflowIdx = getWorkflowIndex(dokumen.status)

  return (
    <PageLayout>
      <div className="max-w-3xl mx-auto">

      {/* Reject Modal */}
      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) { setRejectOpen(false); setRejectCatatan(''); setRejectError(null) } }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/30">
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

      <h2 className="font-headline text-xl font-extrabold text-on-surface">{dokumen.judul}</h2>

      <div className="bg-white rounded-xl border border-outline-variant/30 p-4 shadow-sm">
        <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Alur Dokumen</p>
        <div className="flex items-center gap-0">
          {WORKFLOW_STEPS.map((step, i) => {
            const isCurrent = step.key === dokumen.status
            const isPast = workflowIdx > i || dokumen.status === 'COMPLETED'
            const showAsRevision = dokumen.status === 'NEED_REVISION' && step.key === 'IN_PPK_VALIDATION'
            return (
              <div key={step.key} className="flex flex-col items-center flex-1 relative">
                {i < WORKFLOW_STEPS.length - 1 && <div className={cn('absolute top-4 -right-1/2 w-full h-0.5 z-0', isPast ? 'bg-primary' : 'bg-outline-variant')} />}
                <div className={cn('relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors', isCurrent || showAsRevision ? 'border-primary bg-primary text-white' : isPast ? 'border-primary bg-primary text-white' : 'border-outline-variant bg-background text-outline')}>
                  {showAsRevision ? <AlertTriangle size={14} /> : isPast && !isCurrent ? <CheckCircle2 size={14} /> : i + 1}
                </div>
                <span className={cn('mt-2 text-[10px] font-medium text-center', isCurrent || showAsRevision ? 'text-primary font-semibold' : isPast ? 'text-primary' : 'text-outline')}>{step.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {dokumen.status === 'NEED_REVISION' && dokumen.revision_notes && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-700 mb-1">Catatan Revisi dari {dokumen.revision_target === 'USER' ? 'PPK' : 'Bendahara'}</p>
            <p className="text-xs text-amber-700">{dokumen.revision_notes}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-4">
          <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Fungsi</p><p className="text-sm font-semibold text-on-surface">{dokumen.fungsi_nama ?? '—'}</p></div>
          <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kegiatan</p><p className="text-sm font-semibold text-on-surface">{dokumen.kegiatan_nama ?? '—'}</p></div>
          {dokumen.jenis_permintaan_id && (
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Jenis Permintaan</p><p className="text-sm font-semibold text-on-surface">{dokumen.jenis_permintaan_nama ?? '—'}</p></div>
          )}
          {dokumen.kategori_permintaan_id && (
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kategori Permintaan</p><p className="text-sm font-semibold text-on-surface">{dokumen.kategori_permintaan_nama ?? '—'}</p></div>
          )}
          {dokumen.detail_permintaan_id && (
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Detail Permintaan</p><p className="text-sm font-semibold text-on-surface">{dokumen.detail_permintaan_nama ?? '—'}</p></div>
          )}
          <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tahun</p><p className="text-sm font-semibold text-on-surface">{dokumen.tahun}</p></div>
          <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal</p><p className="text-sm font-semibold text-on-surface">{formatDate(dokumen.tanggal)}</p></div>
          <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Peran</p><p className="text-sm font-semibold text-on-surface">{dokumen.is_ketua_tim ? 'Ketua Tim' : 'Anggota'}</p></div>
          <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Diajukan</p><p className="text-sm font-semibold text-on-surface">{formatDate(dokumen.created_at)}</p></div>
          {dokumen.nominal_realisasi !== null && dokumen.nominal_realisasi !== undefined && (
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Nominal Realisasi</p><p className="text-sm font-semibold text-on-surface">Rp {dokumen.nominal_realisasi.toLocaleString('id-ID')}</p></div>
          )}
        </div>
      </div>

      {/* Lampiran */}
      <AttachmentViewer dokumen={dokumen as any} lampiranUrls={dokumen.lampiran_urls} apiType="ppk" />

      <ActivityLog dokumenId={dokumen.id} />

      <div className="flex gap-3">
        <Link to="/ppk/inbox"><Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Kembali</Button></Link>
        {dokumen.status === 'IN_PPK_VALIDATION' && (
          <><Button variant="destructive" size="sm" className="gap-1.5" onClick={() => { setRejectCatatan(''); setRejectError(null); setRejectOpen(true) }} disabled={!!actionLoading}>{actionLoading === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}Tolak</Button>
          <Button size="sm" className="gap-1.5 flex-1" onClick={handleApprove} disabled={!!actionLoading}>{actionLoading === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Setujui</Button></>
        )}
        {dokumen.status === 'COMPLETED' && <Link to="/ppk/tervalidasi"><Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Tervalidasi</Button></Link>}
        {dokumen.status === 'NEED_REVISION' && dokumen.revision_target === 'PPK' && (
          <Link to="/ppk/revisi"><Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Daftar Revisi</Button></Link>
        )}
      </div>
      </div>
    </PageLayout>
  )
}
