import { createFileRoute } from '@tanstack/react-router'
import { PageLayout } from '#/components/dashboard/PageLayout'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { ActivityLog } from '#/components/dokumen/ActivityLog'
import {
  FileText,
  Download,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
  Trophy,
} from 'lucide-react'
import { cn } from '#/lib/utils'
import type { LampiranUrl } from '#/lib/dokumen-helpers'

export const Route = createFileRoute('/ketua-tim/dokumen/$id/')({
  component: KetuaTimDokumenDetailPage,
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
  lampiran_urls: LampiranUrl[]
  tahun: number
  tanggal: string
  created_by: string
  created_at: string
  updated_at: string
  is_non_material: boolean
  jenis_dokumen_id: string | null
  keterangan_detail: string | null
}

function formatDate(dateStr: string): string {
  try { return new Date(dateStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return dateStr }
}

function formatDateTime(dateStr: string): string {
  try { return new Date(dateStr).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return dateStr }
}

function KetuaTimDokumenDetailPage() {
  const { id } = Route.useParams()
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
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && previewingIdx !== null) closePreview() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [previewingIdx])

  async function fetchData() {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/dokumen/${id}`, { credentials: 'include' })
      if (!res.ok) {
        const json = await res.json()
        setFetchError(json.error ?? 'Dokumen tidak dapat diakses')
        setLoading(false)
        return
      }
      const json = await res.json()
      setDokumen(json.dokumen)
    } catch {
      setFetchError('Terjadi kesalahan saat mengambil data')
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove() {
    if (!confirm('Yakin ingin menyetujui dokumen Non-Material ini?')) return
    setActionLoading('approve')
    try {
      const res = await fetch(`/api/ketua-tim/dokumen/${id}/approve`, { method: 'POST', credentials: 'include' })
      const json = await res.json()
      if (!res.ok) { alert(json.error ?? 'Gagal') ; return }
      window.location.href = '/ketua-tim/inbox'
    } catch { alert('Terjadi kesalahan') } finally { setActionLoading(null) }
  }

  async function handleReject() {
    if (rejectCatatan.trim().length < 10) { setRejectError('Min. 10 karakter'); return }
    setActionLoading('reject')
    try {
      const res = await fetch(`/api/ketua-tim/dokumen/${id}/reject`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ catatan: rejectCatatan.trim() }) })
      const json = await res.json()
      if (!res.ok) { setRejectError(json.error ?? 'Gagal') ; return }
      window.location.href = '/ketua-tim/inbox'
    } catch { setRejectError('Terjadi kesalahan') } finally { setActionLoading(null) }
  }

  async function handlePreview(index: number) {
    setPreviewingIdx(index); setPreviewUrl(null); setPreviewLoading(true); setPreviewError(null)
    try {
      const res = await fetch(`/api/dokumen/${id}/preview/${index}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) { setPreviewError(json.error ?? 'Terjadi kesalahan'); setPreviewLoading(false); return }
      if (json.signedUrl) { setPreviewUrl(json.signedUrl); setPreviewFilename(json.filename ?? `lampiran-${index + 1}`) }
    } catch { setPreviewError('Terjadi kesalahan') }
    finally { setPreviewLoading(false) }
  }

  function closePreview() { setPreviewingIdx(null); setPreviewUrl(null); setPreviewFilename('') }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-primary" />
    </div>
  )

  if (fetchError || !dokumen) return (
    <div className="text-center py-20">
      <AlertTriangle size={32} className="text-error mx-auto mb-3" />
      <p className="text-sm text-on-surface-variant">{fetchError ?? 'Dokumen tidak ditemukan'}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={() => window.location.href = '/ketua-tim/inbox'}>Kembali ke Inbox</Button>
    </div>
  )

  return (
    <PageLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest mb-2">
          <Trophy size={12} />
          <Link to="/ketua-tim/inbox" className="hover:text-primary">Ketua Tim</Link>
          <FileText size={10} />
          <span className="text-primary">Dokumen Non-Material</span>
        </div>

        {/* Preview Modal */}
        {previewingIdx !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) closePreview() }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/30 shrink-0">
                <FileText size={16} className="text-primary shrink-0" />
                <p className="text-sm font-semibold text-on-surface truncate flex-1">{previewFilename}</p>
                <span className="text-[10px] text-outline hidden sm:block">ESC</span>
                <button onClick={closePreview} className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-surface-container-low transition-colors shrink-0"><X size={16} /></button>
              </div>
              <div className="flex-1 overflow-auto bg-surface-container-low/30">
                {previewLoading ? <div className="flex items-center justify-center h-48"><Loader2 size={22} className="animate-spin text-primary" /></div>
                 : previewUrl ? <iframe src={previewUrl} className="w-full h-[calc(70vh-96px)] border-0" title={previewFilename} />
                 : <div className="flex items-center justify-center h-48">
                     {previewError ? (
                       <div className="text-center px-4">
                         <p className="text-sm text-error font-semibold">File tidak tersedia</p>
                         <p className="text-xs text-on-surface-variant mt-1">{previewError}</p>
                       </div>
                     ) : (
                       <p className="text-sm text-on-surface-variant">Gagal memuat pratinjau.</p>
                     )}
                   </div>}
              </div>
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {rejectOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) { setRejectOpen(false); setRejectCatatan(''); setRejectError(null) } }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/30">
                <AlertTriangle size={18} className="text-error shrink-0" />
                <p className="font-semibold text-on-surface">Kembalikan Dokumen</p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">Catatan Revisi <span className="text-error">*</span></label>
                  <textarea value={rejectCatatan} onChange={e => { setRejectCatatan(e.target.value); setRejectError(null) }} placeholder="Jelaskan mengapa dokumen dikembalikan dan apa yang perlu diperbaiki..." rows={4} className={cn('w-full px-3 py-2 border rounded-lg text-sm text-foreground bg-white outline-none focus:ring-1 focus:ring-ring resize-none', rejectError ? 'border-error' : 'border-border')} />
                  <p className="text-[10px] text-outline mt-1">{rejectCatatan.length}/2000 karakter (min. 10)</p>
                  {rejectError && <p className="text-[10px] text-error mt-1">{rejectError}</p>}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => { setRejectOpen(false); setRejectCatatan(''); setRejectError(null) }} disabled={!!actionLoading}>Batal</Button>
                  <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={!!actionLoading}>
                    {actionLoading === 'reject' ? <Loader2 size={14} className="animate-spin" /> : 'Kembalikan'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <h2 className="font-headline text-xl font-extrabold text-on-surface">{dokumen.judul}</h2>

        {/* Simple workflow badge */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-4 shadow-sm">
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <Trophy size={16} className="text-blue-600" />
              <span className="text-sm font-semibold text-blue-700">Menunggu Persetujuan Anda</span>
            </div>
          </div>
        </div>

        {/* Revision notes alert */}
        {dokumen.status === 'NEED_REVISION' && dokumen.revision_notes && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-700 mb-1">Catatan Revisi</p>
              <p className="text-xs text-amber-700">{dokumen.revision_notes}</p>
            </div>
          </div>
        )}

        {/* Document details */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-4">Detail Dokumen</p>
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Fungsi</p><p className="text-sm font-semibold text-on-surface">{dokumen.fungsi_nama ?? '—'}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Kegiatan</p><p className="text-sm font-semibold text-on-surface">{dokumen.kegiatan_nama ?? '—'}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tahun</p><p className="text-sm font-semibold text-on-surface">{dokumen.tahun}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Tanggal</p><p className="text-sm font-semibold text-on-surface">{formatDate(dokumen.tanggal)}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Peran Pengaju</p><p className="text-sm font-semibold text-on-surface">{dokumen.is_ketua_tim ? 'Ketua Tim' : 'Anggota'}</p></div>
            <div><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Diajukan</p><p className="text-sm font-semibold text-on-surface">{formatDate(dokumen.created_at)}</p></div>
            {dokumen.keterangan_detail && (
              <div className="col-span-2"><p className="text-[10px] text-outline uppercase tracking-wider font-semibold mb-1">Keterangan Detail</p><p className="text-sm text-on-surface">{dokumen.keterangan_detail}</p></div>
            )}
          </div>
        </div>

        {/* Lampiran */}
        <div className="bg-white rounded-xl border border-outline-variant/30 p-5 shadow-sm">
          <p className="text-xs font-bold text-outline uppercase tracking-widest mb-3">Lampiran ({dokumen.lampiran_urls.length})</p>
          {dokumen.lampiran_urls.length === 0 ? (
            <p className="text-xs text-on-surface-variant text-center py-4">Belum ada lampiran.</p>
          ) : (
            <div className="space-y-2">
              {dokumen.lampiran_urls.map((lamp, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-surface-container-low/20 rounded-lg">
                  <FileText size={16} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0"><p className="text-xs font-medium text-on-surface truncate">{lamp.nama}</p><p className="text-[10px] text-outline">{formatDateTime(lamp.uploaded_at)}</p></div>
                  <Button size="icon-xs" variant="ghost" onClick={() => handlePreview(i)} disabled={previewingIdx === i} aria-label="Pratinjau">{previewingIdx === i ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}</Button>
                  <Button size="icon-xs" variant="ghost" onClick={() => { fetch(`/api/dokumen/${id}/download/${i}`, { credentials: 'include' }).then(r => r.json()).then(d => { if (d.signedUrl) window.open(d.signedUrl, '_blank'); else if (d.error) alert(d.error) }).catch(() => alert('Gagal download')) }} aria-label="Download"><Download size={14} /></Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity log */}
        <ActivityLog dokumenId={dokumen.id} />

        {/* Action buttons */}
        <div className="flex gap-3">
          <Link to="/ketua-tim/inbox"><Button variant="outline" size="sm" className="gap-1.5">Kembali</Button></Link>
          {dokumen.status === 'IN_KETUA_TIM_APPROVAL' && (
            <><Button variant="destructive" size="sm" className="gap-1.5" onClick={() => { setRejectCatatan(''); setRejectError(null); setRejectOpen(true) }} disabled={!!actionLoading}>{actionLoading === 'reject' ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}Kembalikan</Button>
          <Button size="sm" className="gap-1.5 flex-1" onClick={handleApprove} disabled={!!actionLoading}>{actionLoading === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Setujui</Button></>
          )}
        </div>
      </div>
    </PageLayout>
  )
}
