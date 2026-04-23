import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import {
  FileText, ChevronRight, Download, Eye, AlertTriangle,
  CheckCircle2, Loader2, X, Banknote,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

export const Route = createFileRoute('/bendahara/dokumen/$id')({ component: BendaharaDokumenDetailPage })

type DokumenDetail = {
  id: string; judul: string; fungsi_nama: string; kegiatan_nama: string
  is_ketua_tim: boolean; status: string; lampiran_urls: LampiranUrl[]
  tahun: number; tanggal: string; created_by: string; created_at: string
  revision_notes?: string
}

const WORKFLOW_STEPS = [
  { key: 'DRAFT', label: 'Draf' },
  { key: 'IN_PPK_VALIDATION', label: 'PPK' },
  { key: 'IN_BENDAHARA_APPROVAL', label: 'Bendahara' },
  { key: 'COMPLETED', label: 'Selesai' },
]
function getWorkflowIdx(status: string) { return WORKFLOW_STEPS.findIndex(s => s.key === status) }
function formatDate(str: string) { try { return new Date(str).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return str } }
function formatDateTime(str: string) { try { return new Date(str).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return str } }

function BendaharaDokumenDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const [dokumen, setDokumen] = useState<DokumenDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectCatatan, setRejectCatatan] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)
  const [previewingIdx, setPreviewingIdx] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFilename, setPreviewFilename] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => { fetchData() }, [id])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && previewingIdx !== null) closePreview() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [previewingIdx])

  async function fetchData() {
    setLoading(true)
    try {
      const res = await fetch(`/api/bendahara/dokumen/${id}`, { credentials: 'include' })
      if (!res.ok) { const json = await res.json(); setFetchError(json.error ?? 'Gagal'); setLoading(false); return }
      const json = await res.json()
      setDokumen(json.dokumen)
    } catch { setFetchError('Terjadi kesalahan') } finally { setLoading(false) }
  }

  async function handleApprove() {
    if (!confirm('Yakin ingin menyetujui pencairan dokumen ini?')) return
    setActionLoading('approve')
    try {
      const res = await fetch(`/api/bendahara/dokumen/${id}/approve`, { method: 'POST', credentials: 'include' })
      const json = await res.json()
      if (!res.ok) { alert(json.error ?? 'Gagal'); return }
      navigate({ to: '/bendahara/selesai' })
    } catch { alert('Terjadi kesalahan') } finally { setActionLoading(null) }
  }

  async function handleReject() {
    if (rejectCatatan.trim().length < 10) { setRejectError('Catatan minimal 10 karakter'); return }
    setActionLoading('reject')
    try {
      const res = await fetch(`/api/bendahara/dokumen/${id}/reject`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catatan: rejectCatatan.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setRejectError(json.error ?? 'Gagal'); return }
      navigate({ to: '/bendahara/ditolak' })
    } catch { setRejectError('Terjadi kesalahan') } finally { setActionLoading(null) }
  }

  async function handlePreview(idx: number) {
    setPreviewingIdx(idx); setPreviewUrl(null); setPreviewLoading(true)
    try {
      const res = await fetch(`/api/bendahara/dokumen/${id}/preview/${idx}`, { credentials: 'include' })
      const json = await res.json()
      if (json.signedUrl) { setPreviewUrl(json.signedUrl); setPreviewFilename(json.filename) }
    } catch { /* silent */ } finally { setPreviewLoading(false) }
  }
  function closePreview() { setPreviewingIdx(null); setPreviewUrl(null); setPreviewFilename('') }

  if (loading) return <PageLayout><div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-primary" /></div></PageLayout>
  if (fetchError) return <PageLayout><div className="text-center py-20"><AlertTriangle size={32} className="text-error mx-auto mb-3" /><p className="text-sm text-on-surface-variant">{fetchError}</p><Button variant="outline" size="sm" className="mt-4" onClick={() => navigate({ to: '/bendahara/inbox' })}>Kembali</Button></div></PageLayout>
  if (!dokumen) return <PageLayout><div className="text-center py-20"><AlertTriangle size={32} className="text-error mx-auto mb-3" /><p className="text-sm text-on-surface-variant">Dokumen tidak ditemukan atau tidak dalam tahap persetujuan</p><Button variant="outline" size="sm" className="mt-4" onClick={() => navigate({ to: '/bendahara/inbox' })}>Kembali ke Inbox</Button></div></PageLayout>

  const workflowIdx = getWorkflowIdx(dokumen.status)

  return (
    <PageLayout>
      {previewingIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) closePreview() }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
            <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
              <FileText size={16} className="text-primary shrink-0" />
              <p className="text-sm font-semibold text-on-surface truncate flex-1">{previewFilename}</p>
              <span className="text-[10px] text-outline hidden sm:block">ESC</span>
              <button onClick={closePreview} className="w-7 h-7 rounded-full hover:bg-surface-container-low flex items-center justify-center"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-auto bg-surface-container-low/30">
              {previewLoading ? <div className="flex items-center justify-center h-48"><Loader2 size={22} className="animate-spin text-primary" /></div> :
               previewUrl ? <iframe src={previewUrl} className="w-full h-[calc(70vh-96px)] border-0" /> :
               <div className="flex items-center justify-center h-48"><p className="text-sm text-on-surface-variant">Gagal memuat pratinjau.</p></div>}
            </div>
          </div>
        </div>
      )}

      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) { setRejectOpen(false); setRejectCatatan(''); setRejectError(null) } }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl">
            <div className="flex items-center gap-3 px-5 py-4 border-b">
              <AlertTriangle size={18} className="text-error shrink-0" />
              <p className="font-semibold text-on-surface">Tolak Dokumen</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">Catatan Penolakan <span className="text-error">*</span></label>
                <textarea value={rejectCatatan} onChange={e => { setRejectCatatan(e.target.value); setRejectError(null) }} rows={4}
                  placeholder="Jelaskan mengapa dokumen ditolak..."
                  className={cn('w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-1 focus:ring-ring resize-none', rejectError ? 'border-error' : 'border-border')} />
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

      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
              <Banknote size={12} />
              <Link to="/bendahara" className="hover:text-primary">Bendahara</Link>
              <ChevronRight size={10} />
              <Link to="/bendahara/inbox" className="hover:text-primary">Persetujuan</Link>
              <ChevronRight size={10} />
              <span className="text-primary">Detail</span>
            </div>
            <h2 className="font-headline text-xl font-extrabold text-on-surface">{dokumen.judul}</h2>
          </div>
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs font-semibold shrink-0">
            Persetujuan Bendahara
          </Badge>
        </div>

        {/* Workflow */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-4 shadow-sm">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Alur Dokumen</p>
          <div className="flex items-center gap-0">
            {WORKFLOW_STEPS.map((step, i) => {
              const isCurrent = step.key === dokumen.status
              const isPast = workflowIdx > i || dokumen.status === 'COMPLETED'
              const showAsRevision = dokumen.status === 'NEED_REVISION' && step.key === 'IN_BENDAHARA_APPROVAL'
              return (
                <div key={step.key} className="flex flex-col items-center flex-1 relative">
                  {i < WORKFLOW_STEPS.length - 1 && <div className={cn('absolute top-4 -right-1/2 w-full h-0.5 z-0', isPast ? 'bg-primary' : 'bg-outline-variant')} />}
                  <div className={cn('relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2', isCurrent || showAsRevision ? 'border-primary bg-primary text-white' : isPast ? 'border-primary bg-primary text-white' : 'border-outline-variant bg-background text-outline')}>
                    {showAsRevision ? <AlertTriangle size={14} /> : isPast && !isCurrent ? <CheckCircle2 size={14} /> : i + 1}
                  </div>
                  <span className={cn('mt-2 text-[10px] font-medium text-center', isCurrent || showAsRevision ? 'text-primary font-semibold' : isPast ? 'text-primary' : 'text-outline')}>{step.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Revision Notes Banner */}
        {dokumen.status === 'NEED_REVISION' && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-700 mb-1">Catatan Revisi dari Bendahara</p>
              <p className="text-xs text-amber-700">{dokumen.revision_notes || 'Tidak ada catatan'}</p>
            </div>
          </div>
        )}

        {/* Info Grid */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Fungsi</p><p className="text-sm font-semibold text-on-surface">{dokumen.fungsi_nama ?? '—'}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kegiatan</p><p className="text-sm font-semibold text-on-surface">{dokumen.kegiatan_nama ?? '—'}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tahun</p><p className="text-sm font-semibold text-on-surface">{dokumen.tahun}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal</p><p className="text-sm font-semibold text-on-surface">{formatDate(dokumen.tanggal)}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Peran</p><p className="text-sm font-semibold text-on-surface">{dokumen.is_ketua_tim ? 'Ketua Tim' : 'Anggota'}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Diajukan</p><p className="text-sm font-semibold text-on-surface">{formatDate(dokumen.created_at)}</p></div>
          </div>
        </div>

        {/* Lampiran */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Lampiran ({dokumen.lampiran_urls.length})</p>
          {dokumen.lampiran_urls.length === 0 ? <p className="text-xs text-center py-4 text-on-surface-variant">Belum ada lampiran.</p> :
           <div className="space-y-2">{dokumen.lampiran_urls.map((lamp, i) => (
             <div key={i} className="flex items-center gap-3 p-3 bg-surface-container-low/20 rounded-lg">
               <FileText size={16} className="text-primary shrink-0" />
               <div className="flex-1 min-w-0"><p className="text-xs font-medium text-on-surface truncate">{lamp.nama}</p><p className="text-[10px] text-outline">{formatDateTime(lamp.uploaded_at)}</p></div>
               <Button size="icon-xs" variant="ghost" onClick={() => handlePreview(i)}><Eye size={14} /></Button>
               <Button size="icon-xs" variant="ghost" onClick={() => { fetch(`/api/dokumen/${id}/download/${i}`, { credentials: 'include' }).then(r => r.json()).then(d => d.signedUrl && window.open(d.signedUrl, '_blank')).catch(() => alert('Gagal download')) }}><Download size={14} /></Button>
             </div>
           ))}</div>}
        </div>

        {/* Activity Log */}
        <ActivityLog dokumenId={id} />

        {/* Actions - Only show buttons for IN_BENDAHARA_APPROVAL status */}
        {dokumen.status === 'IN_BENDAHARA_APPROVAL' && (
          <div className="flex gap-3">
            <Link to="/bendahara/inbox"><Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Kembali</Button></Link>
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => { setRejectCatatan(''); setRejectError(null); setRejectOpen(true) }} disabled={!!actionLoading}>
              {actionLoading === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}Tolak
            </Button>
            <Button size="sm" className="gap-1.5 flex-1" onClick={handleApprove} disabled={!!actionLoading}>
              {actionLoading === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Setujui Pencairan
            </Button>
          </div>
        )}
        {dokumen.status === 'COMPLETED' && (
          <div className="flex gap-3">
            <Link to="/bendahara/selesai"><Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Kembali</Button></Link>
          </div>
        )}
        {dokumen.status === 'NEED_REVISION' && (
          <div className="flex gap-3">
            <Link to="/bendahara/ditolak"><Button variant="outline" size="sm" className="gap-1.5"><ChevronRight size={14} className="rotate-180" />Kembali</Button></Link>
          </div>
        )}
      </div>
    </PageLayout>
  )
}